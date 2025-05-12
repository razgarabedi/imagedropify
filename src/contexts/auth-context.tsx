// src/contexts/auth-context.tsx
"use client";

import type { ReactNode } from 'react';
import { createContext, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import type { User } from '@/lib/auth/types'; // User type now includes 'role'
import { getCurrentUserAction } from '@/app/actions/authActions';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  setUser: React.Dispatch<React.SetStateAction<User | null>>;
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
      setLoading(true); 
      try {
        const currentUser = await getCurrentUserAction();
        setUser(currentUser);
      } catch (error) {
        console.error("Failed to fetch current user:", error);
        setUser(null); 
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
