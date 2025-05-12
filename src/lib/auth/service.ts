// src/lib/auth/service.ts
// WARNING: This is a DEMO authentication service.
// It stores passwords in PLAIN TEXT in a JSON file.
// DO NOT USE THIS IN PRODUCTION.
// For production, use a proper database and password hashing (e.g., bcrypt).
'use server';

import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import type { User, SessionPayload, UserStatus } from './types';
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

export async function readUsers(): Promise<Array<User & { password?: string }>> {
  try {
    await fs.access(USERS_FILE_PATH);
    const data = await fs.readFile(USERS_FILE_PATH, 'utf-8');
    // Ensure roles and status are present, default if missing
    const usersFromFile = JSON.parse(data) as Array<Partial<User> & { password?: string }>;
    return usersFromFile.map(u => ({
      id: u.id!,
      email: u.email!,
      role: u.role || 'user',
      status: u.status || 'approved', // Default old users to approved
      ...(u.password && { password: u.password }),
    })) as Array<User & { password?: string }>;
  } catch (error) {
    // If file doesn't exist or is invalid, return empty array
    return [];
  }
}

async function writeUsers(users: Array<User & { password?: string }>): Promise<void> {
  try {
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
    const { password: _p, ...userWithoutPassword } = user;
    return userWithoutPassword as User;
  }
  return undefined;
}


export async function findUserById(id: string): Promise<(User & { password?: string }) | undefined> {
  const users = await readUsers();
  return users.find(user => user.id === id);
}


// WARNING: Plain text password storage. Insecure.
export async function createUser(email: string, password: string): Promise<User> {
  const allUsers = await readUsers(); 
  const existingUser = allUsers.find(u => u.email === email);
  if (existingUser) {
    throw new Error('User with this email already exists.');
  }

  const isFirstUser = allUsers.length === 0;
  const newUserRole = isFirstUser ? 'admin' : 'user'; 
  const newUserStatus: UserStatus = isFirstUser ? 'approved' : 'pending'; // First user is approved, others pending

  const newUser: User & { password?: string } = { 
    id: uuidv4(),
    email,
    role: newUserRole, 
    status: newUserStatus, // Set initial status
    password: password, // Storing plain text password
  };

  allUsers.push(newUser);
  
  await writeUsers(allUsers);
  
  // Return user without password field for external use
  const { password: _p, ...userToReturn } = newUser;
  return userToReturn;
}

// WARNING: Plain text password check. Insecure.
export async function verifyPassword(email: string, passwordAttempt: string): Promise<User | null> {
  const users = await readUsers(); 
  const userWithPassword = users.find(user => user.email === email);

  if (!userWithPassword || !userWithPassword.password) {
    return null; // User not found or password not stored
  }

  // Plain text comparison - INSECURE
  if (userWithPassword.password === passwordAttempt) {
    const { password: _p, ...userWithoutStoredPassword } = userWithPassword;
    return userWithoutStoredPassword as User; // Return user with status
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
    // Ensure status is included in the validated payload
    if (payload && typeof payload.userId === 'string' && typeof payload.email === 'string' && typeof payload.role === 'string' && typeof payload.status === 'string') {
       return payload as SessionPayload;
    }
    console.error('Token payload missing required fields (userId, email, role, status)');
    return null;
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
    const { password: _p, ...userWithoutPassword } = u;
    return userWithoutPassword as User;
  });
}

// New function to update user status
export async function updateUserStatus(userId: string, newStatus: UserStatus): Promise<User | null> {
  const allUsers = await readUsers();
  const userIndex = allUsers.findIndex(u => u.id === userId);

  if (userIndex === -1) {
    console.error(`User with ID ${userId} not found for status update.`);
    return null; // User not found
  }

  // Prevent changing admin status this way for safety
  if (allUsers[userIndex].role === 'admin' && allUsers[userIndex].status !== 'approved') {
     console.warn(`Attempted to change status of admin user ${userId} via updateUserStatus. This is generally disallowed.`);
     // For this demo, let's allow changing admin status if needed, but log a warning.
     // In a real app, this might require a different mechanism or stricter checks.
  }
  
  // Update the status
  allUsers[userIndex].status = newStatus;

  // Write the updated list back to the file
  await writeUsers(allUsers);

  // Return the updated user data (without password)
  const { password: _p, ...updatedUser } = allUsers[userIndex];
  return updatedUser;
}
