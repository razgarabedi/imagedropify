
// src/app/admin/layout.tsx
import type { ReactNode } from 'react';
import { getCurrentUserAction } from '@/app/actions/authActions';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { ThemeToggle } from '@/components/theme-toggle';
import { AuthButton } from '@/components/auth-button';
import { ShieldAlert } from 'lucide-react';

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await getCurrentUserAction();

  if (!user) {
    redirect('/login?message=Please login to access admin area.');
    return null; 
  }

  if (user.role !== 'Admin') { // Role check for 'Admin' (capitalized as per enum)
     return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background text-foreground p-4">
        <ShieldAlert className="w-16 h-16 text-destructive mb-4" />
        <h1 className="text-2xl font-bold mb-2">Access Denied</h1>
        <p className="text-muted-foreground mb-6">You do not have permission to view this page.</p>
        <Link href="/" className="text-primary hover:underline">
          Go to Homepage
        </Link>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link href="/admin/dashboard" className="flex items-center gap-2">
            <Image src="https://picsum.photos/seed/imagedrop-admin/40/40" alt="ImageDrop Admin Logo" width={32} height={32} className="rounded-md" data-ai-hint="shield logo" />
            <h1 className="text-xl font-bold text-primary">ImageDrop Admin</h1>
          </Link>
          <div className="flex items-center gap-4">
            <ThemeToggle />
            <AuthButton />
          </div>
        </div>
      </header>
      <main className="flex-grow container mx-auto px-4 py-8 sm:px-6 lg:px-8">
        {children}
      </main>
       <footer className="py-8 text-center text-muted-foreground border-t">
        <p>&copy; {new Date().getFullYear()} ImageDrop Admin Panel.</p>
      </footer>
    </div>
  );
}
