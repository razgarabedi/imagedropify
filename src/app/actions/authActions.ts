
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
  countUsers, // Import countUsers
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
    const currentTotalUsers = await countUsers(); // Use Prisma to count users
    const isFirstUserAttempt = currentTotalUsers === 0;

    if (!isFirstUserAttempt) {
      return { success: false, error: 'New user registrations are currently disabled by the administrator.' };
    }
    // If no users exist, allow this signup (it will become admin)
  }

  const validation = signupSchema.safeParse({ email: rawEmail, password: rawPassword });

  if (!validation.success) {
    return {
      success: false,
      error: validation.error.errors.map((e) => e.message).join(', '),
    };
  }

  try {
    // findUserByEmail is already refactored to use Prisma
    // const existingUser = await findUserByEmail(validation.data.email);
    // createUser handles check for existing user with Prisma
    const newUser = await createUser(validation.data.email, validation.data.password);

    if (newUser.status === 'pending') {
      return {
        success: true,
        message: 'Signup successful! Your account is pending approval by an administrator.',
      };
    }

    const token = await createSessionToken({
      userId: newUser.id,
      email: newUser.email,
      role: newUser.role,
      status: newUser.status,
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
    // Check if the error is from Prisma due to unique constraint (email already exists)
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

    if (user.status === 'pending') {
      return { success: false, error: 'Account pending approval by administrator.' };
    }

    if (user.status === 'rejected') {
      return { success: false, error: 'Your account registration has been rejected or you are banned.' };
    }

    if (user.status !== 'approved') {
      return { success: false, error: 'Account not active or status unknown.' };
    }

    const token = await createSessionToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      status: user.status,
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
  
  // Fetch user from DB to ensure data is fresh and user exists/status is correct
  const userFromDb = await findUserById(payload.userId);
  if (!userFromDb) {
    console.log(`User ${payload.userId} not found in DB, invalidating session.`);
    cookieStore.delete('session_token');
    return null;
  }

  // Compare essential details from token with DB. Status is most critical.
  if (userFromDb.email === payload.email && userFromDb.role === payload.role && userFromDb.status === payload.status) {
    if (userFromDb.status === 'approved') {
      return userFromDb; // User is valid and approved
    } else {
      // User status in DB is not 'approved' (e.g., 'pending', 'rejected'), invalidate session
      console.log(`User ${payload.userId} status is ${userFromDb.status} in DB, invalidating session.`);
      cookieStore.delete('session_token');
      return null;
    }
  }

  // If there's a mismatch in other critical data (email, role) between token and DB, invalidate.
  console.log(`User ${payload.userId} data mismatch between token and DB, invalidating session.`);
  cookieStore.delete('session_token');
  return null;
}
