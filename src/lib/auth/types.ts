// src/lib/auth/types.ts

// Use capitalized values to match Prisma enum
export type UserStatus = 'Pending' | 'Approved' | 'Rejected';
export type UserRole = 'Admin' | 'User'; // Ensure UserRole also matches Prisma enum if used directly

export interface User {
  id: string;
  email: string;
  role: UserRole; 
  status: UserStatus;
  maxImages?: number | null; 
  maxSingleUploadSizeMB?: number | null;
  maxTotalStorageMB?: number | null; 
}

export interface SessionPayload {
  userId: string;
  email: string;
  role: UserRole; 
  status: UserStatus;
  exp?: number; 
  iat?: number; 
}

export interface UserLimits {
    maxImages?: number | null;
    maxSingleUploadSizeMB?: number | null;
    maxTotalStorageMB?: number | null;
}
