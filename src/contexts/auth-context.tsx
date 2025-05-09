// src/contexts/auth-context.tsx
"use client";

import type { ReactNode } from 'react';
import { createContext, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import type { User } from '@/lib/auth/types';
import { getCurrentUserAction } from '@/lib/auth/actions';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  // isFirebaseAvailable is no longer relevant for auth, remove or rename if used for other Firebase services
  // For simplicity, removing it from AuthContext as auth is now local.
  setUser: React.Dispatch<React.SetStateAction<User | null>>; // Allow components to update user state (e.g., after login)
}

export const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  setUser: () => {},
});

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchCurrentUser() {
      try {
        const currentUser = await getCurrentUserAction();
        setUser(currentUser);
      } catch (error) {
        console.error("Failed to fetch current user:", error);
        setUser(null); // Ensure user is null if session check fails
      } finally {
        setLoading(false);
      }
    }
    fetchCurrentUser();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ user, loading, setUser }}>
      {children}
    </AuthContext.Provider>
  );
}
