
// src/lib/auth/service.ts
'use server';

import prisma from '@/lib/prisma';
import { v4 as uuidv4 } from 'uuid';
import type { User, SessionPayload, UserStatus, UserLimits } from './types';
import bcrypt from 'bcryptjs';
import { cookies } from 'next/headers';
import path from 'path'; // Keep for UPLOAD_DIR_BASE_PUBLIC
import fs from 'fs/promises'; // Keep for deleting user upload directories
import * as jose from 'jose'; // Added import for jose

const UPLOAD_DIR_BASE_PUBLIC = path.join(process.cwd(), 'public/uploads/users');
const JWT_SECRET_KEY = process.env.JWT_SECRET_KEY || 'your-super-secret-jwt-key-change-me';
const JWT_EXPIRATION_TIME = '2h'; // Token expiration time

if (JWT_SECRET_KEY === 'your-super-secret-jwt-key-change-me' && process.env.NODE_ENV === 'production') {
  console.warn(
    'CRITICAL SECURITY WARNING: JWT_SECRET_KEY is not set or is using the default insecure value in a production environment. ' +
    'Please set a strong, unique JWT_SECRET_KEY environment variable.'
  );
}
const secret = new TextEncoder().encode(JWT_SECRET_KEY);
const SALT_ROUNDS = 10;

// Helper to exclude password from user object
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

  const newUserRole = isFirstUser ? 'Admin' : 'User';
  const newUserStatus: UserStatus = isFirstUser ? 'approved' : 'pending';

  const user = await prisma.user.create({
    data: {
      id: uuidv4(),
      email,
      password: hashedPassword,
      role: newUserRole,
      status: newUserStatus,
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
    return null; // User not found or password not set (should not happen with new users)
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
  const users = await prisma.user.findMany();
  return users.map(excludePassword);
}

export async function updateUserStatusService(userId: string, newStatus: UserStatus): Promise<User | null> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    console.error(`User with ID ${userId} not found for status update.`);
    return null;
  }

  if (user.role === 'Admin' && newStatus !== 'approved') {
    // For admins, their status should always remain 'approved'.
    // This check prevents an admin from accidentally having their status changed to something that would lock them out.
    // If an admin needs to be "banned", it implies a more severe action like account deletion or manual DB intervention.
    console.warn(`Attempt to change status of admin user ${userId} to '${newStatus}'. Admins must remain 'approved'.`);
    if (user.status !== 'approved') { // If admin somehow got into a non-approved state, fix it.
        const fixedAdmin = await prisma.user.update({
            where: { id: userId },
            data: { status: 'approved' },
        });
        return excludePassword(fixedAdmin);
    }
    return excludePassword(user); // Return the user as is, status unchanged if it was already 'approved'.
  }


  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: { status: newStatus },
  });
  return excludePassword(updatedUser);
}

export async function updateUserLimitsService(userId: string, limits: UserLimits): Promise<User | null> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    console.error(`User with ID ${userId} not found for limits update.`);
    return null;
  }
  
  // Prisma handles undefined fields as "do not update"
  // null means explicitly set to null in the DB
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
    // Prisma's `onDelete: Cascade` in schema for FolderShare.user handles related shares.
    // We need to find the user first to log their email before deletion for logging purposes.
    const userToDelete = await prisma.user.findUnique({ where: { id: userIdToDelete } });
    if (!userToDelete) {
        console.warn(`User with ID ${userIdToDelete} not found for deletion.`);
        return false;
    }
    if (userToDelete.role === 'Admin') {
        const adminCount = await prisma.user.count({ where: { role: 'Admin' } });
        if (adminCount <= 1) {
            console.error(`Cannot delete the last admin user (ID: ${userIdToDelete}).`);
            // throw new Error('Cannot delete the last admin user.'); // Or return false
            return false;
        }
    }


    await prisma.user.delete({
      where: { id: userIdToDelete },
    });
    console.log(`User ${userToDelete.email} (ID: ${userIdToDelete}) and their related data (folder shares) deleted from database.`);

    // Delete user's upload directory
    const userUploadDir = path.join(UPLOAD_DIR_BASE_PUBLIC, userIdToDelete);
    const resolvedUserUploadDir = path.resolve(userUploadDir);
    const resolvedUploadDirBase = path.resolve(UPLOAD_DIR_BASE_PUBLIC);

    if (!resolvedUserUploadDir.startsWith(resolvedUploadDirBase + path.sep) &&
        !resolvedUserUploadDir.startsWith(resolvedUploadDirBase + path.win32.sep) ||
        resolvedUserUploadDir === resolvedUploadDirBase) {
      console.error(`Security alert: Attempt to delete directory outside designated user uploads area. Path: ${userUploadDir}, UserID: ${userIdToDelete}`);
      return true; // User record was deleted from DB.
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
        // Decide if this failure should make the whole operation return false.
        // For now, if DB deletion was successful, we might consider it partially successful.
      }
    }
    return true;
  } catch (error) {
    console.error(`Error during user deletion process for ID ${userIdToDelete}:`, error);
    return false;
  }
}

// New function to count users, useful for the first user check
export async function countUsers(): Promise<number> {
    return prisma.user.count();
}
