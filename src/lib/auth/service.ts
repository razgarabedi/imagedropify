// src/lib/auth/service.ts
// WARNING: This is a DEMO authentication service.
// It stores passwords in PLAIN TEXT in a JSON file.
// DO NOT USE THIS IN PRODUCTION.
// For production, use a proper database and password hashing (e.g., bcrypt).
'use server';

import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import type { User, SessionPayload, UserStatus, UserLimits } from './types'; // Added UserLimits
import * as jose from 'jose';
import { cookies } from 'next/headers';

const USERS_FILE_PATH = path.join(process.cwd(), 'users.json');
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

// Type for internal user representation including password
type UserWithPassword = User & { password?: string };

export async function readUsers(): Promise<UserWithPassword[]> {
  try {
    await fs.access(USERS_FILE_PATH);
    const data = await fs.readFile(USERS_FILE_PATH, 'utf-8');
    const usersFromFile = JSON.parse(data) as Array<Partial<UserWithPassword>>;

    // Ensure roles, status, and limits are present, default if missing
    return usersFromFile.map(u => ({
      id: u.id!,
      email: u.email!,
      password: u.password, // Keep password internal
      role: u.role || 'user',
      status: u.status || 'approved', // Default old users to approved
      // Default limits to null (meaning no specific limit) if not present
      maxImages: u.maxImages === undefined ? null : u.maxImages,
      maxSingleUploadSizeMB: u.maxSingleUploadSizeMB === undefined ? null : u.maxSingleUploadSizeMB,
      maxTotalStorageMB: u.maxTotalStorageMB === undefined ? null : u.maxTotalStorageMB,
    })) as UserWithPassword[];
  } catch (error) {
    // If file doesn't exist or is invalid, return empty array
    return [];
  }
}

async function writeUsers(users: UserWithPassword[]): Promise<void> {
  try {
    // Ensure optional fields are preserved even if null
    const dataToWrite = JSON.stringify(users, (key, value) => {
       // Keep null values for limit fields
      if (['maxImages', 'maxSingleUploadSizeMB', 'maxTotalStorageMB'].includes(key) && value === undefined) {
         return null;
      }
      return value;
    }, 2);
    await fs.writeFile(USERS_FILE_PATH, dataToWrite, 'utf-8');
  } catch (error) {
    console.error("Failed to write users file:", error);
    throw new Error("Server error: Could not save user data.");
  }
}

// Returns user details without password
export async function findUserByEmail(email: string): Promise<User | undefined> {
  const users = await readUsers();
  const user = users.find(u => u.email === email);
  if (user) {
    const { password: _p, ...userWithoutPassword } = user;
    return userWithoutPassword as User; // Cast as User (without password)
  }
  return undefined;
}


// Returns user details, optionally including password if needed internally
export async function findUserById(id: string, includePassword = false): Promise<UserWithPassword | User | undefined> {
  const users = await readUsers();
  const user = users.find(user => user.id === id);
  if (user) {
      if (includePassword) {
          return user;
      } else {
          const { password: _p, ...userWithoutPassword } = user;
          return userWithoutPassword as User;
      }
  }
  return undefined;
}


// WARNING: Plain text password storage. Insecure.
// Returns user details without password
export async function createUser(email: string, password: string): Promise<User> {
  const allUsers = await readUsers();
  const existingUser = allUsers.find(u => u.email === email);
  if (existingUser) {
    throw new Error('User with this email already exists.');
  }

  const isFirstUser = allUsers.length === 0;
  const newUserRole = isFirstUser ? 'admin' : 'user';
  const newUserStatus: UserStatus = isFirstUser ? 'approved' : 'pending'; // First user is approved, others pending

  const newUser: UserWithPassword = {
    id: uuidv4(),
    email,
    password: password, // Storing plain text password
    role: newUserRole,
    status: newUserStatus, // Set initial status
    // Initialize limits to null (no specific limit)
    maxImages: null,
    maxSingleUploadSizeMB: null,
    maxTotalStorageMB: null,
  };

  allUsers.push(newUser);

  await writeUsers(allUsers);

  // Return user without password field for external use
  const { password: _p, ...userToReturn } = newUser;
  return userToReturn;
}

// WARNING: Plain text password check. Insecure.
// Returns user details without password on success
export async function verifyPassword(email: string, passwordAttempt: string): Promise<User | null> {
  const users = await readUsers();
  const userWithPassword = users.find(user => user.email === email);

  if (!userWithPassword || !userWithPassword.password) {
    return null; // User not found or password not stored
  }

  // Plain text comparison - INSECURE
  if (userWithPassword.password === passwordAttempt) {
    const { password: _p, ...userWithoutStoredPassword } = userWithPassword;
    return userWithoutStoredPassword as User; // Return user with status and limits, without password
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
    return userWithoutPassword as User; // Return full User object including limits
  });
}

// Function to update user status
// Returns updated user details without password
export async function updateUserStatusService(userId: string, newStatus: UserStatus): Promise<User | null> {
  const allUsers = await readUsers();
  const userIndex = allUsers.findIndex(u => u.id === userId);

  if (userIndex === -1) {
    console.error(`User with ID ${userId} not found for status update.`);
    return null; // User not found
  }

  // If trying to change the status of an admin user (other than to 'approved' if they were somehow not)
  if (allUsers[userIndex].role === 'admin' && newStatus !== 'approved') {
     // An admin's status should generally remain 'approved'.
     // Changing an admin's status to 'pending' or 'rejected' could lock them out.
     // For this demo, we'll log a warning. In a real app, this might be disallowed or require special handling.
     console.warn(`Attempt to change status of admin user ${userId} to '${newStatus}'. This is usually not recommended.`);
     // Optionally prevent the change: return null or throw an error
     // throw new Error("Cannot change status of an admin user.");
  }

  // Update the status
  allUsers[userIndex].status = newStatus;

  // Write the updated list back to the file
  await writeUsers(allUsers);

  // Return the updated user data (without password)
  const { password: _p, ...updatedUser } = allUsers[userIndex];
  return updatedUser;
}

// Function to update user-specific limits
// Returns updated user details without password
export async function updateUserLimitsService(userId: string, limits: UserLimits): Promise<User | null> {
    const allUsers = await readUsers();
    const userIndex = allUsers.findIndex(u => u.id === userId);

    if (userIndex === -1) {
        console.error(`User with ID ${userId} not found for limits update.`);
        return null; // User not found
    }

    // Update only the provided limits. Use null to remove a specific limit.
    const currentUser = allUsers[userIndex];
    const updatedLimits: Partial<UserWithPassword> = {};

    if (limits.maxImages !== undefined) {
        updatedLimits.maxImages = limits.maxImages; // Can be number or null
    }
    if (limits.maxSingleUploadSizeMB !== undefined) {
        updatedLimits.maxSingleUploadSizeMB = limits.maxSingleUploadSizeMB; // Can be number or null
    }
    if (limits.maxTotalStorageMB !== undefined) {
        updatedLimits.maxTotalStorageMB = limits.maxTotalStorageMB; // Can be number or null
    }

    // Merge updates with existing user data
    allUsers[userIndex] = { ...currentUser, ...updatedLimits };

    // Write the updated list back to the file
    await writeUsers(allUsers);

    // Return the updated user data (without password)
    const { password: _p, ...updatedUser } = allUsers[userIndex];
    return updatedUser;
}


// New function to delete a user and their related data
export async function deleteUserAndRelatedData(userIdToDelete: string): Promise<boolean> {
  let allUsers = await readUsers();
  const userIndex = allUsers.findIndex(u => u.id === userIdToDelete);

  if (userIndex === -1) {
    console.warn(`User with ID ${userIdToDelete} not found for deletion.`);
    return false; // User not found
  }

  // Remove user from the array
  const deletedUser = allUsers.splice(userIndex, 1)[0];
  await writeUsers(allUsers);
  console.log(`User ${deletedUser.email} (ID: ${userIdToDelete}) removed from users.json.`);

  // Delete user's upload directory
  const userUploadDir = path.join(UPLOAD_DIR_BASE_PUBLIC, userIdToDelete);
  const resolvedUserUploadDir = path.resolve(userUploadDir);
  const resolvedUploadDirBase = path.resolve(UPLOAD_DIR_BASE_PUBLIC);

  // Security check: Ensure the path is within the expected base directory
  if (!resolvedUserUploadDir.startsWith(resolvedUploadDirBase + path.sep) &&
      !resolvedUserUploadDir.startsWith(resolvedUploadDirBase + path.win32.sep) ||
      resolvedUserUploadDir === resolvedUploadDirBase // Prevent deleting the base users folder
     ) {
      console.error(`Security alert: Attempt to delete directory outside designated user uploads area. Path: ${userUploadDir}, UserID: ${userIdToDelete}`);
      // Even if user record was deleted, prevent file system damage.
      // Log this critical error. Return true because the user record *was* deleted.
      return true; 
  }

  try {
    await fs.access(resolvedUserUploadDir); // Check if directory exists
    await fs.rm(resolvedUserUploadDir, { recursive: true, force: true });
    console.log(`User upload directory ${resolvedUserUploadDir} deleted successfully.`);
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      console.log(`User upload directory ${resolvedUserUploadDir} not found, nothing to delete.`);
    } else {
      console.error(`Error deleting user upload directory ${resolvedUserUploadDir}:`, error);
      // Decide if this should be a fatal error for the operation.
      // For now, user record is deleted, so we can return true, but log the fs error.
    }
  }
  return true;
}
