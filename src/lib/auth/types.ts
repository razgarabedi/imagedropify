// src/lib/auth/types.ts

export type UserStatus = 'pending' | 'approved' | 'rejected';

export interface User {
  id: string;
  email: string;
  role: 'admin' | 'user'; 
  status: UserStatus; // Added status field
}

export interface SessionPayload {
  userId: string;
  email: string;
  role: 'admin' | 'user'; 
  status: UserStatus; // Added status field
  exp?: number; // Expiration time for JWT
  iat?: number; // Issued at time for JWT
}
