// src/app/login/page.tsx
"use client";

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '@/lib/firebase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import Link from 'next/link';
import Image from 'next/image';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      toast({ title: 'Login Successful', description: "You're now logged in." });
      router.push('/');
    } catch (err: any) {
      setError(err.message || 'Failed to login. Please check your credentials.');
      toast({ variant: 'destructive', title: 'Login Failed', description: err.message || 'Please check your credentials.' });
    } finally {
      setIsLoading(false);
    }
  };
  
  // A simple signup function (can be expanded or moved)
  const handleSignup = async () => {
    setError(null);
    setIsLoading(true);
    try {
      // For simplicity, using createUserWithEmailAndPassword directly.
      // In a real app, you might redirect to a separate signup page or use a different flow.
      const { createUserWithEmailAndPassword } = await import('firebase/auth');
      await createUserWithEmailAndPassword(auth, email, password);
      toast({ title: 'Signup Successful', description: "You're now logged in." });
      router.push('/');
    } catch (err: any) {
        let errorMessage = 'Failed to sign up.';
        if (err.code === 'auth/email-already-in-use') {
            errorMessage = 'This email is already in use. Try logging in.';
        } else if (err.code === 'auth/weak-password') {
            errorMessage = 'Password should be at least 6 characters.';
        } else {
            errorMessage = err.message || errorMessage;
        }
        setError(errorMessage);
        toast({ variant: 'destructive', title: 'Signup Failed', description: errorMessage });
    } finally {
        setIsLoading(false);
    }
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
          <form onSubmit={handleLogin} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={isLoading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={isLoading}
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? 'Logging in...' : 'Login'}
            </Button>
          </form>
        </CardContent>
         <CardFooter className="flex flex-col items-center space-y-2 pt-4">
           <p className="text-sm text-muted-foreground">Don't have an account?</p>
            <Button variant="outline" onClick={handleSignup} className="w-full" disabled={isLoading}>
              {isLoading ? 'Signing up...' : 'Sign Up with Email & Password'}
            </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
