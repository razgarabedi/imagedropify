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
import { loginUserAction, signupUserAction, type AuthActionResponse } from '@/app/actions/authActions'; 
import { useAuth } from '@/hooks/use-auth';
import { Loader2, AlertCircle } from 'lucide-react'; // Added AlertCircle

const initialAuthState: AuthActionResponse = { success: false };

export default function LoginPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { setUser } = useAuth(); 

  const [loginState, loginFormAction, isLoginPending] = useActionState(loginUserAction, initialAuthState);
  const [signupState, signupFormAction, isSignupPending] = useActionState(signupUserAction, initialAuthState);
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false); 
  const [signupMessage, setSignupMessage] = useState<string | null>(null); // State for signup message

  useEffect(() => {
    if (!isLoginPending && loginState.success && loginState.user) {
      toast({ title: 'Login Successful', description: "You're now logged in." });
      setUser(loginState.user); 
      setSignupMessage(null); // Clear any signup message on successful login
      if (loginState.redirectTo) {
        router.push(loginState.redirectTo);
      } else {
        router.push('/');
      }
    } else if (!isLoginPending && loginState.error) {
      toast({ variant: 'destructive', title: 'Login Failed', description: loginState.error });
       setSignupMessage(null); // Clear any signup message on login error
    }
    
    // Update isSubmitting based on combined pending states
    setIsSubmitting(isLoginPending || isSignupPending); 

  }, [loginState, isLoginPending, isSignupPending, toast, router, setUser]);

  useEffect(() => {
     // Clear previous signup message when starting a new signup attempt
     if(isSignupPending) {
        setSignupMessage(null);
     }

    if (!isSignupPending && signupState.success && signupState.user) { // Successful signup AND logged in (admin case)
      toast({ title: 'Admin Signup Successful', description: "Admin account created and you're logged in." });
      setUser(signupState.user); 
      setSignupMessage(null); // Clear any message
      if (signupState.redirectTo) {
        router.push(signupState.redirectTo);
      } else {
        router.push('/');
      }
    } else if (!isSignupPending && signupState.success && signupState.message) { // Successful signup but pending
       // Don't toast here, show the message in the UI instead
       setSignupMessage(signupState.message); 
       // Clear form maybe? Or leave it so they know what they signed up with.
       // setEmail(''); // Optional: clear form on pending signup
       // setPassword(''); // Optional: clear form on pending signup
    } else if (!isSignupPending && signupState.error) { // Signup failed
      toast({ variant: 'destructive', title: 'Signup Failed', description: signupState.error });
       setSignupMessage(null); // Clear any message on error
    }
    
    // Update isSubmitting based on combined pending states
     setIsSubmitting(isLoginPending || isSignupPending);

  }, [signupState, isSignupPending, isLoginPending, toast, router, setUser]);


  const handleLoginSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSignupMessage(null); // Clear signup message on login attempt
    setIsSubmitting(true);
    const formData = new FormData(e.currentTarget);
    startTransition(() => { 
      loginFormAction(formData);
    });
  };

  const handleSignupClick = () => {
     setSignupMessage(null); // Clear previous message on new signup attempt
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
          <CardDescription>Enter your credentials or sign up.</CardDescription>
        </CardHeader>
        <CardContent>
           {/* Display Signup Message */}
           {signupMessage && (
             <div className="mb-4 rounded-md border border-yellow-300 bg-yellow-50 p-3 text-sm text-yellow-800 flex items-start">
               <AlertCircle className="w-5 h-5 mr-2 flex-shrink-0 text-yellow-600" />
               <span>{signupMessage}</span>
             </div>
           )}
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
                disabled={isSubmitting}
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
                disabled={isSubmitting}
              />
            </div>
            { (loginState.error && !isLoginPending) && <p className="text-sm text-destructive">{loginState.error}</p>}
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isLoginPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {isLoginPending ? 'Logging in...' : 'Login'}
            </Button>
          </form>
        </CardContent>
         <CardFooter className="flex flex-col items-center space-y-2 pt-4">
           <p className="text-sm text-muted-foreground">Don't have an account?</p>
            <Button variant="outline" onClick={handleSignupClick} className="w-full" disabled={isSubmitting || !email || !password}>
              {isSignupPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {isSignupPending ? 'Signing up...' : 'Sign Up with Email & Password'}
            </Button>
            { (signupState.error && !isSignupPending) && <p className="text-sm text-destructive mt-2">{signupState.error}</p>}
        </CardFooter>
      </Card>
    </div>
  );
}
