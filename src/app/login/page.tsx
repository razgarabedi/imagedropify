// src/app/login/page.tsx
"use client";

import React, { useState, type FormEvent, useEffect, useActionState, startTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import Link from 'next/link';
import Image from 'next/image';
import { loginUserAction, signupUserAction, type AuthActionResponse } from '@/lib/auth/actions';
import { useAuth } from '@/hooks/use-auth';
import { Loader2 } from 'lucide-react';

const initialAuthState: AuthActionResponse = { success: false };

export default function LoginPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { setUser } = useAuth(); // Get setUser from context to update global auth state

  const [loginState, loginFormAction, isLoginPending] = useActionState(loginUserAction, initialAuthState);
  const [signupState, signupFormAction, isSignupPending] = useActionState(signupUserAction, initialAuthState);
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false); // General submitting state for button text

  useEffect(() => {
    if (!isLoginPending && loginState.success && loginState.user) {
      toast({ title: 'Login Successful', description: "You're now logged in." });
      setUser(loginState.user); // Update global auth state
      if (loginState.redirectTo) {
        router.push(loginState.redirectTo);
      } else {
        router.push('/');
      }
    } else if (!isLoginPending && loginState.error) {
      toast({ variant: 'destructive', title: 'Login Failed', description: loginState.error });
    }
    setIsSubmitting(isLoginPending);
  }, [loginState, isLoginPending, toast, router, setUser]);

  useEffect(() => {
    if (!isSignupPending && signupState.success && signupState.user) {
      toast({ title: 'Signup Successful', description: "Account created and you're logged in." });
      setUser(signupState.user); // Update global auth state
      if (signupState.redirectTo) {
        router.push(signupState.redirectTo);
      } else {
        router.push('/');
      }
    } else if (!isSignupPending && signupState.error) {
      toast({ variant: 'destructive', title: 'Signup Failed', description: signupState.error });
    }
    setIsSubmitting(isSignupPending);
  }, [signupState, isSignupPending, toast, router, setUser]);


  const handleLoginSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);
    const formData = new FormData(e.currentTarget);
    // loginFormAction is used in form's action prop, so it's automatically wrapped in a transition
    loginFormAction(formData);
  };

  // handleSignupSubmit is not used directly by a form element's action prop for the signup button.
  // Instead, handleSignupClick calls signupFormAction.
  // const handleSignupSubmit = (e: FormEvent<HTMLFormElement>) => {
  //   e.preventDefault(); 
  // };

  const handleSignupClick = () => {
    if (!email || !password) {
        toast({ variant: 'destructive', title: 'Signup Failed', description: 'Email and password are required.' });
        return;
    }
    setIsSubmitting(true);
    const formData = new FormData();
    formData.append('email', email);
    formData.append('password', password);
    startTransition(() => {
      signupFormAction(formData);
    });
  };


  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
       <Link href="/" className="absolute top-4 left-4 flex items-center gap-2 text-primary hover:underline">
         <Image src="https://picsum.photos/seed/imagedrop-logo/40/40" alt="ImageDrop Logo" width={24} height={24} className="rounded-md" data-ai-hint="logo abstract" />
        Back to Home
      </Link>
      <Card className="w-full max-w-md shadow-2xl">
        <CardHeader className="text-center">
          <CardTitle className="text-3xl font-bold text-primary">Login to ImageDrop</CardTitle>
          <CardDescription>Enter your credentials to access your images.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLoginSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={isLoginPending || isSignupPending}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={isLoginPending || isSignupPending}
              />
            </div>
            { (loginState.error && !isLoginPending) && <p className="text-sm text-destructive">{loginState.error}</p>}
            <Button type="submit" className="w-full" disabled={isLoginPending || isSignupPending}>
              {isLoginPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {isLoginPending ? 'Logging in...' : 'Login'}
            </Button>
          </form>
        </CardContent>
         <CardFooter className="flex flex-col items-center space-y-2 pt-4">
           <p className="text-sm text-muted-foreground">Don't have an account?</p>
            <Button variant="outline" onClick={handleSignupClick} className="w-full" disabled={isLoginPending || isSignupPending || !email || !password}>
              {isSignupPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {isSignupPending ? 'Signing up...' : 'Sign Up with Email & Password'}
            </Button>
            { (signupState.error && !isSignupPending) && <p className="text-sm text-destructive mt-2">{signupState.error}</p>}
        </CardFooter>
      </Card>
    </div>
  );
}

