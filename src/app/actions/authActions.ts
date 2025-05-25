// src/app/actions/authActions.ts
'use server';

import { z } from 'zod';
import { cookies } from 'next/headers';
import {
  createUser,
  verifyPassword,
  createSessionToken,
  verifySessionToken as verifyTokenService,
  findUserById,
  countUsers,
} from '@/lib/auth/service';
import type { User } from '@/lib/auth/types';
import { getRegistrationsEnabled } from '@/lib/settingsService';

export interface AuthActionResponse {
  success: boolean;
  error?: string;
  user?: User;
  redirectTo?: string;
  message?: string;
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

  const rawEmail = typeof email === 'string' ? email : '';
  const rawPassword = typeof password === 'string' ? password : '';

  const registrationsAreEnabled = await getRegistrationsEnabled();
  if (!registrationsAreEnabled) {
    const currentTotalUsers = await countUsers();
    const isFirstUserAttempt = currentTotalUsers === 0;

    if (!isFirstUserAttempt) {
      return { success: false, error: 'New user registrations are currently disabled by the administrator.' };
    }
  }

  const validation = signupSchema.safeParse({ email: rawEmail, password: rawPassword });

  if (!validation.success) {
    return {
      success: false,
      error: validation.error.errors.map((e) => e.message).join(', '),
    };
  }

  try {
    const newUser = await createUser(validation.data.email, validation.data.password);

    // Check against capitalized status from Prisma enum
    if (newUser.status === 'Pending') {
      return {
        success: true,
        message: 'Signup successful! Your account is pending approval by an administrator.',
      };
    }

    const token = await createSessionToken({
      userId: newUser.id,
      email: newUser.email,
      role: newUser.role,
      status: newUser.status, // newUser.status is already capitalized here
    });
    const cookieStore = await cookies();
    cookieStore.set('session_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 60 * 2, 
      path: '/',
      sameSite: 'lax',
    });

    return { success: true, user: newUser, redirectTo: '/' };
  } catch (error: any) {
    console.error('Signup error:', error);
    if (error.code === 'P2002' && error.meta?.target?.includes('email')) {
        return { success: false, error: 'User with this email already exists.' };
    }
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

    // Check against capitalized status from Prisma enum
    if (user.status === 'Pending') {
      return { success: false, error: 'Account pending approval by administrator.' };
    }

    if (user.status === 'Rejected') {
      return { success: false, error: 'Your account registration has been rejected or you are banned.' };
    }

    if (user.status !== 'Approved') {
      return { success: false, error: 'Account not active or status unknown.' };
    }

    const token = await createSessionToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      status: user.status, // user.status is already capitalized here
    });
    const cookieStore = await cookies();
    cookieStore.set('session_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 60 * 2, 
      path: '/',
      sameSite: 'lax',
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
  if (!payload || !payload.userId || !payload.email || !payload.role || !payload.status) {
    cookieStore.delete('session_token');
    return null;
  }
  
  const userFromDb = await findUserById(payload.userId);
  if (!userFromDb) {
    console.log(`User ${payload.userId} not found in DB, invalidating session.`);
    cookieStore.delete('session_token');
    return null;
  }

  if (userFromDb.email === payload.email && userFromDb.role === payload.role && userFromDb.status === payload.status) {
    // Check against capitalized status from Prisma enum
    if (userFromDb.status === 'Approved') {
      return userFromDb; 
    } else {
      console.log(`User ${payload.userId} status is ${userFromDb.status} in DB, invalidating session.`);
      cookieStore.delete('session_token');
      return null;
    }
  }

  console.log(`User ${payload.userId} data mismatch between token and DB, invalidating session.`);
  cookieStore.delete('session_token');
  return null;
}
