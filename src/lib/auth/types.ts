// src/lib/auth/types.ts

export type UserStatus = 'pending' | 'approved' | 'rejected';

export interface User {
  id: string;
  email: string;
  role: 'admin' | 'user'; 
  status: UserStatus; // Added status field
  // User-specific limits (optional). null or undefined means no specific limit (global or default applies).
  maxImages?: number | null; 
  maxSingleUploadSizeMB?: number | null;
  maxTotalStorageMB?: number | null; 
}

export interface SessionPayload {
  userId: string;
  email: string;
  role: 'admin' | 'user'; 
  status: UserStatus; // Added status field
  exp?: number; // Expiration time for JWT
  iat?: number; // Issued at time for JWT
}

// Type for updating user limits
export interface UserLimits {
    maxImages?: number | null;
    maxSingleUploadSizeMB?: number | null;
    maxTotalStorageMB?: number | null;
}
