// src/components/auth-button.tsx
"use client";

import Link from 'next/link';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { LogIn, LogOut, UserCircle, Loader2, Images, ShieldCheck } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { logoutUserAction } from '@/app/actions/authActions'; 
import React from 'react';


export function AuthButton() {
  const { user, loading, setUser } = useAuth(); 
  const { toast } = useToast(); 
  const [isLoggingOut, setIsLoggingOut] = React.useState(false);

  const handleLogout = async () => { 
    setIsLoggingOut(true);
    try {
      const result = await logoutUserAction();
      if (result.success) {
        setUser(null); 
      } else {
        toast({ variant: 'destructive', title: 'Logout Failed', description: result.error || 'Could not log out. Please try again.' });
      }
    } catch (error) {
      console.error('Logout initiation failed:', error);
      toast({ variant: 'destructive', title: 'Logout Failed', description: 'An unexpected error occurred. Please try again.' });
    } finally {
      setIsLoggingOut(false); 
    }
  };

  if (loading) {
    return <Button variant="outline" size="sm" disabled><Loader2 className="mr-2 h-4 w-4 animate-spin" />Loading...</Button>;
  }

  if (user) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="flex items-center gap-2" disabled={isLoggingOut}>
             {isLoggingOut ? <Loader2 className="h-5 w-5 animate-spin" /> : <UserCircle className="h-5 w-5" />}
            <span className="hidden sm:inline">{user.email || 'Account'}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>{user.email} ({user.role})</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild className="cursor-pointer">
            <Link href="/my-images">
              <Images className="mr-2 h-4 w-4" />
              My Images
            </Link>
          </DropdownMenuItem>
          {user.role === 'admin' && (
            <DropdownMenuItem asChild className="cursor-pointer">
              <Link href="/admin/dashboard">
                <ShieldCheck className="mr-2 h-4 w-4" />
                Admin Dashboard
              </Link>
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleLogout} className="text-destructive hover:!bg-destructive hover:!text-destructive-foreground cursor-pointer" disabled={isLoggingOut}>
            {isLoggingOut ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LogOut className="mr-2 h-4 w-4" />}
            {isLoggingOut ? 'Logging out...' : 'Logout'}
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
