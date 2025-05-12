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

async function readUsers(): Promise<User[]> {
  try {
    await fs.access(USERS_FILE_PATH);
    const data = await fs.readFile(USERS_FILE_PATH, 'utf-8');
    return JSON.parse(data) as User[];
  } catch (error) {
    // If file doesn't exist or is invalid, return empty array
    return [];
  }
}

async function writeUsers(users: User[]): Promise<void> {
  try {
    await fs.writeFile(USERS_FILE_PATH, JSON.stringify(users, null, 2), 'utf-8');
  } catch (error) {
    console.error("Failed to write users file:", error);
    throw new Error("Server error: Could not save user data.");
  }
}

export async function findUserByEmail(email: string): Promise<User | undefined> {
  const users = await readUsers();
  return users.find(user => user.email === email);
}

// WARNING: Plain text password storage. Insecure.
export async function createUser(email: string, password: string): Promise<User> {
  const existingUser = await findUserByEmail(email);
  if (existingUser) {
    throw new Error('User with this email already exists.');
  }

  const users = await readUsers();
  const newUser: User & { passwordHash?: string } = { // Temporarily include password for storage
    id: uuidv4(),
    email,
  };

  // Storing password directly - INSECURE for demo.
  // In a real app, hash the password here:
  // newUser.passwordHash = await bcrypt.hash(password, 10);
  (newUser as any).password = password; // Storing plain text password

  users.push(newUser as User); // Cast back to User for type safety after adding password
  
  // Remove the temporary password field before saving to users.json if you were hashing
  // For this plain text demo, we'll store it.
  const usersToSave = users.map(u => {
    const { ...userWithoutPasswordHash } = u as any; // Or remove password if it was temporary
    return userWithoutPasswordHash;
  });

  await writeUsers(usersToSave);
  
  // Return user without password
  const { password: _p, ...userWithoutPassword } = newUser as any;
  return userWithoutPassword as User;
}

// WARNING: Plain text password check. Insecure.
export async function verifyPassword(email: string, passwordAttempt: string): Promise<User | null> {
  const users = await readUsers(); // Read all users with their stored passwords
  const userWithPassword = users.find(user => user.email === email) as (User & { password?: string }) | undefined;

  if (!userWithPassword || !userWithPassword.password) {
    return null; // User not found or password not stored
  }

  // Plain text comparison - INSECURE
  if (userWithPassword.password === passwordAttempt) {
    const { password: _p, ...userWithoutStoredPassword } = userWithPassword;
    return userWithoutStoredPassword;
  }
  
  // In a real app, compare hashed passwords:
  // if (user.passwordHash && await bcrypt.compare(passwordAttempt, user.passwordHash)) {
  //   const { passwordHash, ...userToReturn } = user;
  //   return userToReturn;
  // }
  return null;
}

export async function createSessionToken(payload: SessionPayload): Promise<string> {
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
    // Log the specific error for better debugging
    if (error instanceof jose.errors.JOSEError) {
      console.error(`JOSE Error verifying token: ${error.code}`, error.message, error.stack);
    } else {
      console.error('Unexpected error verifying token:', error);
    }
    return null;
  }
}

export async function getCurrentUserIdFromSession(): Promise<string | null> {
  const cookieStore = await cookies();
  // "Read" the cookie store by checking for the existence of the cookie first,
  // as recommended for Server Actions before using .get().
  // This check can be done after awaiting cookies()
  if (!cookieStore.has('session_token')) {
    return null;
  }
  const token = cookieStore.get('session_token')?.value;
  if (!token) {
    return null; // Should be caught by .has() but good for safety
  }
  const payload = await verifySessionToken(token);
  return payload?.userId || null;
}

