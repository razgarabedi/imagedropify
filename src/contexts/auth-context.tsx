// src/contexts/auth-context.tsx
"use client";

import type { User as FirebaseUser } from 'firebase/auth';
import { createContext, useEffect, useState, type ReactNode } from 'react';
import { auth } from '@/lib/firebase/client'; // auth can be undefined
import { Loader2 } from 'lucide-react';
import { isFirebaseConfigured } from '@/lib/firebase/config';

interface AuthContextType {
  user: FirebaseUser | null;
  loading: boolean;
  isFirebaseAvailable: boolean; 
}

export const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  isFirebaseAvailable: false,
});

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [isFirebaseAvailable, setIsFirebaseAvailable] = useState(false);

  useEffect(() => {
    const firebaseEffectivelyAvailable = isFirebaseConfigured && !!auth;
    setIsFirebaseAvailable(firebaseEffectivelyAvailable);

    if (firebaseEffectivelyAvailable) {
      const unsubscribe = auth.onAuthStateChanged((firebaseUser) => {
        setUser(firebaseUser);
        setLoading(false);
      });
      return () => unsubscribe();
    } else {
      // Firebase is not configured, or auth failed to initialize
      setUser(null);
      setLoading(false); // Stop loading, user is effectively not logged in
      // A warning is already logged from client.ts
    }
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ user, loading, isFirebaseAvailable }}>
      {children}
    </AuthContext.Provider>
  );
}
