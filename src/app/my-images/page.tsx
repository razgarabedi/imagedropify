
// src/app/my-images/page.tsx
"use client";

import React, { useState, useCallback, useEffect } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { ImagePreviewCard } from '@/components/image-preview-card';
import { ThemeToggle } from '@/components/theme-toggle';
import { getUserImages, type UserImage } from '@/app/actions/imageActions';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { useAuth } from '@/hooks/use-auth';
import { AuthButton } from '@/components/auth-button';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { GalleryVerticalEnd, Loader2 } from 'lucide-react';

interface DisplayImage {
  id: string; // Format: userId/YYYY/MM/DD/filename.ext
  name: string;
  previewSrc: string;
  url: string;
  uploaderId: string;
}

export default function MyImagesPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [userImages, setUserImages] = useState<DisplayImage[]>([]);
  const [isLoadingImages, setIsLoadingImages] = useState(true);

  const fetchAllUserImages = useCallback(async () => {
    if (!user) {
      setUserImages([]);
      setIsLoadingImages(false);
      return;
    }

    setIsLoadingImages(true);
    try {
      // Fetches all images for the current session user (no limit)
      const imagesFromServer = await getUserImages(); 
      const displayImages: DisplayImage[] = imagesFromServer.map(img => ({
        id: img.id, // id is now userId/YYYY/MM/DD/filename.ext
        name: img.name,
        previewSrc: img.url,
        url: img.url,
        uploaderId: img.userId,
      }));
      setUserImages(displayImages);
    } catch (error) {
      console.error("Failed to fetch user images:", error);
      setUserImages([]);
    } finally {
      setIsLoadingImages(false);
    }
  }, [user]);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login?message=Please login to view your images.');
    } else if (user && !authLoading) { 
      fetchAllUserImages();
    }
  }, [user, authLoading, router, fetchAllUserImages]);

  const handleImageDelete = useCallback((deletedImageId: string) => {
    setUserImages((prevImages) => prevImages.filter(image => image.id !== deletedImageId));
  }, []);

  const handleImageRename = useCallback((oldImageId: string, newImageId: string, newName: string, newUrl: string) => {
    setUserImages((prevImages) =>
      prevImages.map(image =>
        image.id === oldImageId
          ? { ...image, id: newImageId, name: newName, url: newUrl, previewSrc: newUrl }
          : image
      ).sort((a, b) => {
          // If strict chronological order is critical and ctime is not part of DisplayImage,
          // a re-fetch might be better. For now, local update is fine.
          return 0; 
      })
    );
    // Optionally: fetchAllUserImages(); // To get fresh sort order if it's critical
  }, []);


  if (authLoading || (!user && !authLoading) ) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="mt-4 text-muted-foreground">Loading your space...</p>
      </div>
    );
  }


  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-2">
            <Image src="https://picsum.photos/seed/imagedrop-logo/40/40" alt="ImageDrop Logo" width={32} height={32} className="rounded-md" data-ai-hint="logo abstract" />
            <h1 className="text-2xl font-bold text-primary">ImageDrop</h1>
          </Link>
          <div className="flex items-center gap-4">
            <ThemeToggle />
            <AuthButton />
          </div>
        </div>
      </header>

      <main className="flex-grow container mx-auto px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8 text-center">
          <h2 className="text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
            My Uploaded Images
          </h2>
          <p className="mt-3 text-lg text-muted-foreground">
            Here are all the images you&apos;ve uploaded to ImageDrop.
          </p>
        </div>
        
        <Separator className="my-8" />

        {isLoadingImages ? (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {Array.from({ length: 10 }).map((_, index) => (
              <Card key={index} className="shadow-lg">
                <CardHeader className="p-4">
                  <Skeleton className="h-5 w-3/4" />
                </CardHeader>
                <CardContent className="p-0 aspect-[4/3] relative overflow-hidden">
                  <Skeleton className="h-full w-full" />
                </CardContent>
                <CardFooter className="p-4 flex-col items-start space-y-2">
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-4 w-1/2" />
                </CardFooter>
              </Card>
            ))}
          </div>
        ) : userImages.length === 0 ? (
          <div className="text-center py-16">
            <GalleryVerticalEnd className="mx-auto h-24 w-24 text-muted-foreground opacity-50 mb-6" />
            <p className="text-muted-foreground text-xl mb-4">No images found.</p>
            <p className="text-muted-foreground text-md mb-8">Looks like you haven&apos;t uploaded any images yet.</p>
            <Button asChild>
              <Link href="/">Upload Your First Image</Link>
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {userImages.map((image) => (
              <ImagePreviewCard
                key={image.id}
                id={image.id} // Pass the full ID: userId/YYYY/MM/DD/filename.ext
                src={image.previewSrc}
                url={image.url}
                name={image.name}
                uploaderId={image.uploaderId}
                onDelete={handleImageDelete}
                onRename={handleImageRename}
              />
            ))}
          </div>
        )}
      </main>

      <footer className="py-8 text-center text-muted-foreground border-t mt-12">
        <p>&copy; {new Date().getFullYear()} ImageDrop. All rights reserved.</p>
      </footer>
    </div>
  );
}

