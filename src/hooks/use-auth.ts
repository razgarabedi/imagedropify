// src/hooks/use-auth.ts
"use client";

import { useContext } from 'react';
import { AuthContext } from '@/contexts/auth-context';

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  // context now includes setUser and no longer includes isFirebaseAvailable
  return context;
}
