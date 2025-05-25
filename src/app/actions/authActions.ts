
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
import { getRegistrationsEnabled } from '@/lib/settingsService'; // Import new service

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

  // Check if registrations are enabled
  const registrationsAreEnabled = await getRegistrationsEnabled();
  if (!registrationsAreEnabled) {
    // Check if there are any users. If not, allow the first admin registration.
    const users = await findUserByEmail(''); // A bit of a hack to check if any user exists by trying to find one with an empty email
    const isFirstUserAttempt = !users || (Array.isArray(users) && users.length === 0); // Adjust based on how readUsers/findUserByEmail behaves for no users
    
    // A more robust way to check if it's the very first user signup:
    // This requires readUsers to be callable or another method to check if users.json is empty/non-existent
    // For simplicity now, we assume if registrationsAreEnabled is false, it applies to all new signups
    // unless it's the very first user in an empty system.
    // The current logic in createUser handles first user as admin.
    // Let's refine this: if registrations are disabled, only proceed if NO users exist at all.
    
    // A simple way to check if any user exists - try to read users.json
    // This is a simplified check. A dedicated function like `countUsers()` would be better.
    let noUsersExist = false;
    try {
        const allUsers = await require('@/lib/auth/service').readUsers(); // Directly use readUsers if it doesn't cause issues
        if (!allUsers || allUsers.length === 0) {
            noUsersExist = true;
        }
    } catch (e) {
        // If readUsers throws (e.g. file not found), assume no users.
        noUsersExist = true;
    }

    if (!noUsersExist) {
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
    const existingUser = await findUserByEmail(validation.data.email);
    if (existingUser) {
      return { success: false, error: 'User with this email already exists.' };
    }

    const newUser = await createUser(validation.data.email, validation.data.password);
    
    if (newUser.status === 'pending') {
      return { 
        success: true, 
        message: 'Signup successful! Your account is pending approval by an administrator.' 
      };
    }
    
    const token = await createSessionToken({ 
      userId: newUser.id, 
      email: newUser.email, 
      role: newUser.role,
      status: newUser.status 
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
        status: user.status 
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

  const userFromDbRaw = await findUserById(payload.userId);
   if (!userFromDbRaw) {
      cookieStore.delete('session_token');
      return null;
   }
   
   const { password: _p, ...userFromDb } = userFromDbRaw;

  if (userFromDb.email === payload.email && userFromDb.role === payload.role && userFromDb.status === payload.status) {
     if (userFromDb.status === 'approved') {
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
