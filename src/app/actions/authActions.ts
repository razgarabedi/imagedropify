// src/app/actions/authActions.ts
'use server';

import { z } from 'zod';
import { cookies } from 'next/headers';
import {
  createUser,
  findUserByEmail,
  verifyPassword,
  createSessionToken,
  verifySessionToken as verifyTokenService,
  findUserById,
} from '@/lib/auth/service';
import type { User } from '@/lib/auth/types';

export interface AuthActionResponse {
  success: boolean;
  error?: string;
  user?: User;
  redirectTo?: string;
  message?: string; // Added for pending status message
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
    
    // If user status is pending, don't create session, return success with message
    if (newUser.status === 'pending') {
      return { 
        success: true, 
        message: 'Signup successful! Your account is pending approval by an administrator.' 
      };
    }
    
    // If user is approved (e.g., first user/admin), create session and redirect
    const token = await createSessionToken({ 
      userId: newUser.id, 
      email: newUser.email, 
      role: newUser.role,
      status: newUser.status // Include status in token
    });
    const cookieStore = await cookies();
    cookieStore.set('session_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 60 * 2, // 2 hours
      path: '/',
      sameSite: 'lax', 
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

    // Check user status before creating session
    if (user.status === 'pending') {
      return { success: false, error: 'Account pending approval by administrator.' };
    }
    
    if (user.status === 'rejected') {
      return { success: false, error: 'Your account registration has been rejected.' };
    }
    
    if (user.status !== 'approved') {
       return { success: false, error: 'Account not active or status unknown.' };
    }

    // User is approved, proceed with login
    const token = await createSessionToken({ 
        userId: user.id, 
        email: user.email, 
        role: user.role,
        status: user.status // Include status
    });
    const cookieStore = await cookies();
    cookieStore.set('session_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 60 * 2, // 2 hours
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
  // Validate status is present in payload now
  if (!payload || !payload.userId || !payload.email || !payload.role || !payload.status) {
    cookieStore.delete('session_token');
    return null;
  }

  // Re-fetch user details from the user store (users.json) for up-to-date info
  // Using findUserById which now returns password too, so we need to strip it if needed.
  const userFromDbRaw = await findUserById(payload.userId);
   if (!userFromDbRaw) {
      cookieStore.delete('session_token');
      return null;
   }
   
   // Destructure to remove password before comparison and return
   const { password: _p, ...userFromDb } = userFromDbRaw;

  // Check consistency between token and DB, including status
  if (userFromDb.email === payload.email && userFromDb.role === payload.role && userFromDb.status === payload.status) {
     // Also ensure the user status from DB is 'approved' to be considered truly logged in
     if (userFromDb.status === 'approved') {
        return userFromDb; // userFromDb already has role, status, and no password
     } else {
       // If status is not approved in DB, invalidate session
       console.log(`User ${payload.userId} status is ${userFromDb.status} in DB, invalidating session.`);
       cookieStore.delete('session_token');
       return null;
     }
  }
  
  // If inconsistency found, invalidate session
  console.log(`User ${payload.userId} data mismatch between token and DB, invalidating session.`);
  cookieStore.delete('session_token');
  return null;
}
