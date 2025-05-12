// src/lib/auth/service.ts
// WARNING: This is a DEMO authentication service.
// It stores passwords in PLAIN TEXT in a JSON file.
// DO NOT USE THIS IN PRODUCTION.
// For production, use a proper database and password hashing (e.g., bcrypt).
'use server';

import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import type { User, SessionPayload } from './types';
import * as jose from 'jose';
import { cookies } from 'next/headers';

const USERS_FILE_PATH = path.join(process.cwd(), 'users.json');
const JWT_SECRET_KEY = process.env.JWT_SECRET_KEY || 'your-super-secret-jwt-key-change-me';
const JWT_EXPIRATION_TIME = '2h'; // Token expiration time

if (JWT_SECRET_KEY === 'your-super-secret-jwt-key-change-me' && process.env.NODE_ENV === 'production') {
  console.warn(
    'CRITICAL SECURITY WARNING: JWT_SECRET_KEY is not set or is using the default insecure value in a production environment. ' +
    'Please set a strong, unique JWT_SECRET_KEY environment variable.'
  );
}
const secret = new TextEncoder().encode(JWT_SECRET_KEY);

export async function readUsers(): Promise<User[]> {
  try {
    await fs.access(USERS_FILE_PATH);
    const data = await fs.readFile(USERS_FILE_PATH, 'utf-8');
    // Ensure roles are present, default to 'user' if missing for backward compatibility
    const usersFromFile = JSON.parse(data) as Array<Partial<User> & { password?: string }>;
    return usersFromFile.map(u => ({
      id: u.id!,
      email: u.email!,
      role: u.role || 'user',
      // Include password if present, for verifyPassword to use
      ...(u.password && { password: u.password }),
    })) as User[];
  } catch (error) {
    // If file doesn't exist or is invalid, return empty array
    return [];
  }
}

async function writeUsers(users: Array<User & { password?: string }>): Promise<void> {
  try {
    // When writing, we can choose to strip the password or keep it based on the demo's insecurity
    // For this demo, we keep the plain text password
    await fs.writeFile(USERS_FILE_PATH, JSON.stringify(users, null, 2), 'utf-8');
  } catch (error) {
    console.error("Failed to write users file:", error);
    throw new Error("Server error: Could not save user data.");
  }
}

export async function findUserByEmail(email: string): Promise<User | undefined> {
  const users = await readUsers();
  const user = users.find(user => user.email === email);
  if (user) {
    // Ensure the returned user object doesn't include the password directly
    const { password: _p, ...userWithoutPassword } = user as any;
    return userWithoutPassword as User;
  }
  return undefined;
}


export async function findUserById(id: string): Promise<User | undefined> {
  const users = await readUsers();
  const user = users.find(user => user.id === id);
   if (user) {
    // Ensure the returned user object doesn't include the password directly
    const { password: _p, ...userWithoutPassword } = user as any;
    return userWithoutPassword as User;
  }
  return undefined;
}


// WARNING: Plain text password storage. Insecure.
export async function createUser(email: string, password: string): Promise<User> {
  const users = await readUsers(); // Read users, potentially with passwords
  const existingUser = users.find(u => u.email === email);
  if (existingUser) {
    throw new Error('User with this email already exists.');
  }

  const newUser: User & { password?: string } = { 
    id: uuidv4(),
    email,
    role: 'user', // Default role for new users
    password: password, // Storing plain text password
  };

  users.push(newUser);
  
  await writeUsers(users);
  
  // Return user without password field for external use
  const { password: _p, ...userToReturn } = newUser;
  return userToReturn;
}

// WARNING: Plain text password check. Insecure.
export async function verifyPassword(email: string, passwordAttempt: string): Promise<User | null> {
  const users = await readUsers(); // Reads users with their stored passwords
  const userWithPassword = users.find(user => user.email === email) as (User & { password?: string }) | undefined;

  if (!userWithPassword || !userWithPassword.password) {
    return null; // User not found or password not stored
  }

  // Plain text comparison - INSECURE
  if (userWithPassword.password === passwordAttempt) {
    const { password: _p, ...userWithoutStoredPassword } = userWithPassword;
    return userWithoutStoredPassword as User; // Ensure correct User type is returned
  }
  
  return null;
}

export async function createSessionToken(payload: Omit<SessionPayload, 'exp' | 'iat'>): Promise<string> {
  return new jose.SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(JWT_EXPIRATION_TIME)
    .sign(secret);
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jose.jwtVerify(token, secret);
    return payload as SessionPayload;
  } catch (error: any) {
    if (error instanceof jose.errors.JOSEError) {
      console.error(`JOSE Error verifying token: ${error.code}`, error.message);
    } else {
      console.error('Unexpected error verifying token:', error);
    }
    return null;
  }
}

export async function getCurrentUserIdFromSession(): Promise<string | null> {
  const cookieStore = await cookies();
  if (!cookieStore.has('session_token')) {
    return null;
  }
  const token = cookieStore.get('session_token')?.value;
  if (!token) {
    return null;
  }
  const payload = await verifySessionToken(token);
  return payload?.userId || null;
}

export async function getAllUsersForAdmin(): Promise<User[]> {
  // This function assumes it's called by an admin-only action
  const users = await readUsers();
  // Return users without their passwords
  return users.map(u => {
    const { password: _p, ...userWithoutPassword } = u as any;
    return userWithoutPassword as User;
  });
}
