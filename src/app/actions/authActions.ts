'use server';

import { z } from 'zod';
import { cookies } from 'next/headers';
// import { redirect } from 'next/navigation'; // Not used directly, redirectTo in response
import {
  createUser,
  findUserByEmail,
  verifyPassword,
  createSessionToken,
  verifySessionToken as verifyTokenService,
} from '@/lib/auth/service';
import type { User } from '@/lib/auth/types';

export interface AuthActionResponse {
  success: boolean;
  error?: string;
  user?: User;
  redirectTo?: string;
}

const emailSchema = z.string().email({ message: 'Invalid email address.' });
const passwordSchema = z
  .string()
  .min(8, { message: 'Password must be at least 8 characters long.' });

const signupSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});

const loginSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});

export async function signupUserAction(
  prevState: AuthActionResponse,
  formData: FormData
): Promise<AuthActionResponse> {
  const email = formData.get('email');
  const password = formData.get('password');

  // Ensure values are strings for Zod parsing, or handle null if necessary
  const rawEmail = typeof email === 'string' ? email : '';
  const rawPassword = typeof password === 'string' ? password : '';

  const validation = signupSchema.safeParse({ email: rawEmail, password: rawPassword });

  if (!validation.success) {
    return {
      success: false,
      error: validation.error.errors.map((e) => e.message).join(', '),
    };
  }

  try {
    const existingUser = await findUserByEmail(validation.data.email);
    if (existingUser) {
      return { success: false, error: 'User with this email already exists.' };
    }

    const newUser = await createUser(validation.data.email, validation.data.password);
    
    const token = await createSessionToken({ userId: newUser.id, email: newUser.email });
    const cookieStore = await cookies();
    cookieStore.set('session_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 60 * 2, // 2 hours
      path: '/',
      sameSite: 'lax', // Added for security
    });

    return { success: true, user: newUser, redirectTo: '/' };
  } catch (error: any) {
    console.error('Signup error:', error);
    return { success: false, error: error.message || 'Signup failed. Please try again.' };
  }
}

export async function loginUserAction(
  prevState: AuthActionResponse,
  formData: FormData
): Promise<AuthActionResponse> {
  const email = formData.get('email');
  const password = formData.get('password');

  const rawEmail = typeof email === 'string' ? email : '';
  const rawPassword = typeof password === 'string' ? password : '';
  
  const validation = loginSchema.safeParse({ email: rawEmail, password: rawPassword });

  if (!validation.success) {
    return {
      success: false,
      error: validation.error.errors.map((e) => e.message).join(', '),
    };
  }

  try {
    const user = await verifyPassword(validation.data.email, validation.data.password);
    if (!user) {
      return { success: false, error: 'Invalid email or password.' };
    }

    const token = await createSessionToken({ userId: user.id, email: user.email });
    const cookieStore = await cookies();
    cookieStore.set('session_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 60 * 2, // 2 hours
      path: '/',
      sameSite: 'lax', // Added for security
    });
    
    return { success: true, user, redirectTo: '/' };
  } catch (error: any) {
    console.error('Login error:', error);
    return { success: false, error: error.message || 'Login failed. Please try again.' };
  }
}

export async function logoutUserAction(): Promise<AuthActionResponse> {
  try {
    const cookieStore = await cookies();
    cookieStore.delete('session_token');
    return { success: true, redirectTo: '/login' }; 
  } catch (error: any) {
    console.error('Logout error:', error);
    // Avoid exposing too much detail in error messages to the client for logout.
    return { success: false, error: 'Logout failed due to a server issue. Please try again.' };
  }
}


export async function getCurrentUserAction(): Promise<User | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get('session_token')?.value;

  if (!token) {
    return null;
  }

  const payload = await verifyTokenService(token);
  if (!payload || !payload.userId || !payload.email) {
    // Invalid token payload, clear cookie
    // No need to await cookies() again if cookieStore is already available and awaited
    cookieStore.delete('session_token');
    return null;
  }

  // Re-fetch user details from the user store (users.json)
  // This ensures the user still exists and data is up-to-date.
  const userFromDb = await findUserByEmail(payload.email);
  if (userFromDb && userFromDb.id === payload.userId) {
    return userFromDb;
  }
  
  // If user not found in DB, or ID mismatch, consider the session invalid
  // No need to await cookies() again if cookieStore is already available and awaited
  cookieStore.delete('session_token');
  return null;
}

