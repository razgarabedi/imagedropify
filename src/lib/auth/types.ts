// src/lib/auth/types.ts
export interface User {
  id: string;
  email: string;
  role: 'admin' | 'user'; // Added role
  // Add other user fields if needed
}

export interface SessionPayload {
  userId: string;
  email: string;
  role: 'admin' | 'user'; // Added role
  // Add other session data if needed
  exp?: number; // Expiration time for JWT
  iat?: number; // Issued at time for JWT
}

