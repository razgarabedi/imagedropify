// src/components/auth-button.tsx
"use client";

import Link from 'next/link';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { LogIn, LogOut, UserCircle, Loader2, Images } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { logoutUserAction } from '@/lib/auth/actions';
import React from 'react';


export function AuthButton() {
  const { user, loading, setUser } = useAuth(); 
  const { toast } = useToast(); // toast is kept in case of future needs but not used for logout success
  const [isLoggingOut, setIsLoggingOut] = React.useState(false);

  const handleLogout = () => { // Made non-async as we are not awaiting logoutUserAction in a way that its redirect error is caught
    setIsLoggingOut(true);
    
    // Call the server action. It will delete the cookie and redirect.
    // Next.js handles the redirect mechanism (which involves throwing a special error).
    // We don't use try/catch here for the redirect itself.
    logoutUserAction().catch((error) => {
      // This catch is for unexpected errors from logoutUserAction *before* it redirects,
      // or if the action promise itself is rejected for other reasons.
      // The redirect error thrown by `redirect()` is handled by Next.js and shouldn't typically reach here
      // if `logoutUserAction` is not awaited in a way that propagates that specific error.
      // However, if an actual operational error occurs in `logoutUserAction` (e.g., `cookies()` fails),
      // it might be caught here.
      console.error('Logout initiation failed:', error);
      toast({ variant: 'destructive', title: 'Logout Failed', description: 'An unexpected error occurred. Please try again.' });
      setIsLoggingOut(false); // Reset loading state on unexpected error
    });

    // Optimistically update client-side auth state.
    // The redirect will ultimately ensure the user is on the login page.
    setUser(null); 
    
    // A success toast is generally not needed because the user will be redirected to the login page.
    // If the redirect is slow, setIsLoggingOut(false) might be desired, but usually, the page navigates away.
    // For simplicity, we rely on the navigation to change the UI state.
    // If the component is still mounted and an error didn't occur to set isLoggingOut to false,
    // it will remain true until navigation. This is generally acceptable.
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
          <DropdownMenuLabel>{user.email}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild className="cursor-pointer">
            <Link href="/my-images">
              <Images className="mr-2 h-4 w-4" />
              My Images
            </Link>
          </DropdownMenuItem>
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
