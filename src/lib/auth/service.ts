// src/lib/auth/service.ts
'use server';

import prisma from '@/lib/prisma';
import { v4 as uuidv4 } from 'uuid';
import type { User, SessionPayload, UserStatus, UserLimits, UserRole } from './types'; // Ensure UserRole is imported if needed
import bcrypt from 'bcryptjs';
import { cookies } from 'next/headers';
import path from 'path';
import fs from 'fs/promises';
import * as jose from 'jose';

const UPLOAD_DIR_BASE_PUBLIC = path.join(process.cwd(), 'public/uploads/users');
const JWT_SECRET_KEY = process.env.JWT_SECRET_KEY || 'your-super-secret-jwt-key-change-me';
const JWT_EXPIRATION_TIME = '2h'; 

if (JWT_SECRET_KEY === 'your-super-secret-jwt-key-change-me' && process.env.NODE_ENV === 'production') {
  console.warn(
    'CRITICAL SECURITY WARNING: JWT_SECRET_KEY is not set or is using the default insecure value in a production environment. ' +
    'Please set a strong, unique JWT_SECRET_KEY environment variable.'
  );
}
const secret = new TextEncoder().encode(JWT_SECRET_KEY);
const SALT_ROUNDS = 10;

function excludePassword(user: any): User {
  if (!user) return user;
  const { password, ...userWithoutPassword } = user;
  return userWithoutPassword as User;
}

export async function findUserByEmail(email: string): Promise<User | undefined> {
  const user = await prisma.user.findUnique({
    where: { email },
  });
  return user ? excludePassword(user) : undefined;
}

export async function findUserById(id: string): Promise<User | undefined> {
  const user = await prisma.user.findUnique({
    where: { id },
  });
  return user ? excludePassword(user) : undefined;
}

export async function createUser(email: string, passwordInput: string): Promise<User> {
  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    throw new Error('User with this email already exists.');
  }

  const hashedPassword = bcrypt.hashSync(passwordInput, SALT_ROUNDS);
  const totalUsers = await prisma.user.count();
  const isFirstUser = totalUsers === 0;

  const newUserRole: UserRole = isFirstUser ? 'Admin' : 'User'; // Use capitalized enum value
  const newUserStatus: UserStatus = isFirstUser ? 'Approved' : 'Pending'; // Use capitalized enum value

  const user = await prisma.user.create({
    data: {
      id: uuidv4(),
      email,
      password: hashedPassword,
      role: newUserRole,
      status: newUserStatus, // This will now be 'Admin' or 'User', 'Approved' or 'Pending'
      maxImages: null,
      maxSingleUploadSizeMB: null,
      maxTotalStorageMB: null,
    },
  });
  return excludePassword(user);
}

export async function verifyPassword(email: string, passwordAttempt: string): Promise<User | null> {
  const userWithPassword = await prisma.user.findUnique({
    where: { email },
  });

  if (!userWithPassword || !userWithPassword.password) {
    return null;
  }

  const isMatch = bcrypt.compareSync(passwordAttempt, userWithPassword.password);
  if (isMatch) {
    return excludePassword(userWithPassword);
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
    // Ensure the payload properties exist and are of the correct type
    if (payload && 
        typeof payload.userId === 'string' && 
        typeof payload.email === 'string' && 
        typeof payload.role === 'string' && // role is 'Admin' or 'User'
        typeof payload.status === 'string' // status is 'Pending', 'Approved', or 'Rejected'
       ) {
      return payload as SessionPayload;
    }
    console.error('Token payload missing required fields or incorrect types (userId, email, role, status)');
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
  const users = await prisma.user.findMany();
  return users.map(excludePassword);
}

export async function updateUserStatusService(userId: string, newStatus: UserStatus): Promise<User | null> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    console.error(`User with ID ${userId} not found for status update.`);
    return null;
  }

  // Ensure role is correctly typed if comparing directly (UserRole is 'Admin' | 'User')
  if (user.role === 'Admin' && newStatus !== 'Approved') {
    console.warn(`Attempt to change status of admin user ${userId} to '${newStatus}'. Admins must remain 'Approved'.`);
    if (user.status !== 'Approved') { 
        const fixedAdmin = await prisma.user.update({
            where: { id: userId },
            data: { status: 'Approved' }, // Ensure admin status is 'Approved'
        });
        return excludePassword(fixedAdmin);
    }
    return excludePassword(user); 
  }

  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: { status: newStatus }, // newStatus is already capitalized
  });
  return excludePassword(updatedUser);
}

export async function updateUserLimitsService(userId: string, limits: UserLimits): Promise<User | null> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    console.error(`User with ID ${userId} not found for limits update.`);
    return null;
  }
  
  const dataToUpdate: Partial<UserLimits> = {};
  if (limits.maxImages !== undefined) dataToUpdate.maxImages = limits.maxImages;
  if (limits.maxSingleUploadSizeMB !== undefined) dataToUpdate.maxSingleUploadSizeMB = limits.maxSingleUploadSizeMB;
  if (limits.maxTotalStorageMB !== undefined) dataToUpdate.maxTotalStorageMB = limits.maxTotalStorageMB;

  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: dataToUpdate,
  });
  return excludePassword(updatedUser);
}

export async function deleteUserAndRelatedDataService(userIdToDelete: string): Promise<boolean> {
  try {
    const userToDelete = await prisma.user.findUnique({ where: { id: userIdToDelete } });
    if (!userToDelete) {
        console.warn(`User with ID ${userIdToDelete} not found for deletion.`);
        return false;
    }
    if (userToDelete.role === 'Admin') {
        const adminCount = await prisma.user.count({ where: { role: 'Admin' } });
        if (adminCount <= 1) {
            console.error(`Cannot delete the last admin user (ID: ${userIdToDelete}).`);
            return false;
        }
    }

    await prisma.user.delete({
      where: { id: userIdToDelete },
    });
    console.log(`User ${userToDelete.email} (ID: ${userIdToDelete}) and their related data (folder shares) deleted from database.`);

    const userUploadDir = path.join(UPLOAD_DIR_BASE_PUBLIC, userIdToDelete);
    const resolvedUserUploadDir = path.resolve(userUploadDir);
    const resolvedUploadDirBase = path.resolve(UPLOAD_DIR_BASE_PUBLIC);

    if (!resolvedUserUploadDir.startsWith(resolvedUploadDirBase + path.sep) &&
        !resolvedUserUploadDir.startsWith(resolvedUploadDirBase + path.win32.sep) ||
        resolvedUserUploadDir === resolvedUploadDirBase) {
      console.error(`Security alert: Attempt to delete directory outside designated user uploads area. Path: ${userUploadDir}, UserID: ${userIdToDelete}`);
      return true; 
    }

    try {
      await fs.access(resolvedUserUploadDir);
      await fs.rm(resolvedUserUploadDir, { recursive: true, force: true });
      console.log(`User upload directory ${resolvedUserUploadDir} deleted successfully.`);
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        console.log(`User upload directory ${resolvedUserUploadDir} not found, nothing to delete.`);
      } else {
        console.error(`Error deleting user upload directory ${resolvedUserUploadDir}:`, error);
      }
    }
    return true;
  } catch (error) {
    console.error(`Error during user deletion process for ID ${userIdToDelete}:`, error);
    return false;
  }
}

export async function countUsers(): Promise<number> {
    return prisma.user.count();
}
