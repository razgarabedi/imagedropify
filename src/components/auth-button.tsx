// src/components/auth-button.tsx
"use client";

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase/client'; // auth can be undefined
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { LogIn, LogOut, UserCircle, AlertTriangle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";


export function AuthButton() {
  const { user, loading, isFirebaseAvailable } = useAuth(); 
  const router = useRouter();
  const { toast } = useToast();

  const handleLogout = async () => {
    if (!isFirebaseAvailable || !auth) {
      toast({ variant: 'destructive', title: 'Logout Failed', description: 'Firebase authentication is not available.' });
      return;
    }
    try {
      await signOut(auth);
      toast({ title: 'Logged Out', description: "You've been successfully logged out." });
      router.push('/'); 
    } catch (error) {
      console.error('Logout failed:', error);
      toast({ variant: 'destructive', title: 'Logout Failed', description: 'Could not log you out. Please try again.' });
    }
  };

  if (!isFirebaseAvailable && !loading) {
    return (
        <Button variant="outline" size="sm" disabled title="Firebase not configured. Authentication unavailable.">
          <AlertTriangle className="mr-2 h-4 w-4 text-destructive" />
          <span className="text-destructive">Auth Unavailable</span>
        </Button>
    );
  }

  if (loading) {
    return <Button variant="outline" size="sm" disabled>Loading...</Button>;
  }

  if (user) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="flex items-center gap-2">
            <UserCircle className="h-5 w-5" />
            <span className="hidden sm:inline">{user.email || 'Account'}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>{user.email}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleLogout} className="text-destructive hover:!bg-destructive hover:!text-destructive-foreground cursor-pointer">
            <LogOut className="mr-2 h-4 w-4" />
            Logout
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <Button asChild variant="outline" size="sm">
      <Link href="/login">
        <LogIn className="mr-2 h-4 w-4" />
        Login
      </Link>
    </Button>
  );
}
