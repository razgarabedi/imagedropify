// src/lib/auth/types.ts
export interface User {
  id: string;
  email: string;
  // Add other user fields if needed
}

export interface SessionPayload {
  userId: string;
  email: string;
  // Add other session data if needed
  exp?: number; // Expiration time for JWT
  iat?: number; // Issued at time for JWT
}
