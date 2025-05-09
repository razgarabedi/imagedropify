// src/lib/auth/actions.ts
'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createUser, verifyPassword, createSessionToken, verifySessionToken, findUserByEmail } from './service';
import type { User, SessionPayload } from './types';

const loginSchema = z.object({
  email: z.string().email({ message: "Invalid email address." }),
  password: z.string().min(6, { message: "Password must be at least 6 characters." }),
});

const signupSchema = z.object({
  email: z.string().email({ message: "Invalid email address." }),
  password: z.string().min(6, { message: "Password must be at least 6 characters." }),
});

export interface AuthActionResponse {
  success: boolean;
  user?: User;
  error?: string;
  redirectTo?: string;
}

export async function loginUserAction(formData: FormData): Promise<AuthActionResponse> {
  const emailValue = formData.get('email');
  const passwordValue = formData.get('password');

  const dataToValidate = {
    email: typeof emailValue === 'string' ? emailValue : undefined,
    password: typeof passwordValue === 'string' ? passwordValue : undefined,
  };

  const validation = loginSchema.safeParse(dataToValidate);
  if (!validation.success) {
    return { success: false, error: validation.error.errors.map(e => e.message).join(', ') };
  }

  const { email, password } = validation.data;

  try {
    const user = await verifyPassword(email, password);
    if (!user) {
      return { success: false, error: 'Invalid email or password.' };
    }

    const sessionPayload: SessionPayload = { userId: user.id, email: user.email };
    const token = await createSessionToken(sessionPayload);

    cookies().set('session_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 60 * 2, // 2 hours
      path: '/',
      sameSite: 'lax',
    });

    return { success: true, user, redirectTo: '/' };
  } catch (error: any) {
    console.error('Login error:', error);
    return { success: false, error: error.message || 'An unexpected error occurred during login.' };
  }
}

export async function signupUserAction(formData: FormData): Promise<AuthActionResponse> {
  const emailValue = formData.get('email');
  const passwordValue = formData.get('password');

  const dataToValidate = {
    email: typeof emailValue === 'string' ? emailValue : undefined,
    password: typeof passwordValue === 'string' ? passwordValue : undefined,
  };
  
  const validation = signupSchema.safeParse(dataToValidate);
  if (!validation.success) {
    return { success: false, error: validation.error.errors.map(e => e.message).join(', ') };
  }
  const { email, password } = validation.data;

  try {
    const existingUser = await findUserByEmail(email);
    if (existingUser) {
        return { success: false, error: 'This email is already in use. Try logging in.' };
    }

    const user = await createUser(email, password);
    
    const sessionPayload: SessionPayload = { userId: user.id, email: user.email };
    const token = await createSessionToken(sessionPayload);

    cookies().set('session_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 60 * 2, // 2 hours
      path: '/',
      sameSite: 'lax',
    });

    return { success: true, user, redirectTo: '/' };
  } catch (error: any) {
    console.error('Signup error:', error);
    return { success: false, error: error.message || 'An unexpected error occurred during signup.' };
  }
}

export async function logoutUserAction(): Promise<void> {
  cookies().delete('session_token');
  redirect('/login');
}

export async function getCurrentUserAction(): Promise<User | null> {
  const cookieStore = cookies();
  const token = cookieStore.get('session_token')?.value;

  if (!token) {
    return null;
  }

  const payload = await verifySessionToken(token);
  if (!payload) {
    // Invalid or expired token, clear it
    cookies().delete('session_token');
    return null;
  }

  // Optionally, you could re-fetch user details from your user store here
  // if the JWT payload is minimal and you need more info.
  // For now, the payload is sufficient.
  return { id: payload.userId, email: payload.email };
}
