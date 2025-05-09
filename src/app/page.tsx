// src/app/page.tsx
"use client";

import React, { useState, useCallback, useEffect } from 'react';
import Image from 'next/image';
import { ImageUploader, type UploadedImageFile as ClientUploadedImageFile } from '@/components/image-uploader';
import { ImagePreviewCard } from '@/components/image-preview-card';
import { ThemeToggle } from '@/components/theme-toggle';
import { Separator } from '@/components/ui/separator';
import { getUserImages, type UserImage } from '@/app/actions/imageActions';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { useAuth } from '@/hooks/use-auth';
import { AuthButton } from '@/components/auth-button';
import Link from 'next/link';
import { Button } from '@/components/ui/button';


interface DisplayImage {
  id: string; 
  name: string; 
  previewSrc: string; 
  url: string; 
  uploaderId: string; // userId of the uploader
}

export default function Home() {
  const { user, loading: authLoading } = useAuth();
  const [uploadedImages, setUploadedImages] = useState<DisplayImage[]>([]);
  const [isLoadingInitialImages, setIsLoadingInitialImages] = useState(true);

  const fetchUserImages = useCallback(async () => {
    if (!user) { // User must be logged in to see their images
      setUploadedImages([]);
      setIsLoadingInitialImages(false);
      return;
    }
    setIsLoadingInitialImages(true);
    try {
      // getUserImages now gets userId from session internally
      const userImagesFromServer = await getUserImages(); 
      const displayImages: DisplayImage[] = userImagesFromServer.map(img => ({
        // id for ImagePreviewCard is "userId/MM.YYYY/filename.ext"
        // but deleteImage action expects "MM.YYYY/filename.ext"
        // The ImagePreviewCard will handle stripping the userId part if needed for deletion
        id: img.id, 
        name: img.name, 
        previewSrc: img.url,
        url: img.url,
        uploaderId: img.userId, 
      }));
      setUploadedImages(displayImages);
    } catch (error) {
      console.error("Failed to fetch user images:", error);
      // Potentially show a toast to the user
    } finally {
      setIsLoadingInitialImages(false);
    }
  }, [user]); // Depend on user object

  useEffect(() => {
    // Fetch images when auth state is resolved (not loading) and user exists
    if (!authLoading) {
      fetchUserImages();
    }
  }, [authLoading, user, fetchUserImages]); // Add user to dependencies

  const handleImageUpload = useCallback((imageFile: ClientUploadedImageFile) => {
    // imageFile.url is like /uploads/users/USER_ID/MM.YYYY/filename.ext
    // imageFile.userId is the uploader's ID
    // The ID for ImagePreviewCard should be unique for the key prop and useful for deletion.
    // For deletion, we need "MM.YYYY/filename.ext" relative to the user's folder.
    // The server UserImage.id is `userId/MM.YYYY/filename.ext`
    
    const newImage: DisplayImage = {
      id: `${imageFile.userId}/${imageFile.url.split('/').slice(4).join('/')}`, // Reconstruct server-like ID
      name: imageFile.name, 
      previewSrc: imageFile.url, 
      url: imageFile.url,
      uploaderId: imageFile.userId,
    };

    setUploadedImages((prevImages) => {
      // Add new image and then re-fetch to get the last 5 sorted by ctime from server
      // For immediate feedback, add locally, then trigger a re-fetch.
      fetchUserImages(); // Re-fetch to ensure we have the correct last 5
      
      // Optimistic update (optional, fetchUserImages will overwrite)
      const updatedImages = [newImage, ...prevImages];
      const uniqueImages = updatedImages.filter((img, index, self) =>
        index === self.findIndex((t) => t.url === img.url)
      );
      return uniqueImages.slice(0, 5); 
    });
  }, [fetchUserImages]);

  const handleImageDelete = useCallback((deletedImageId: string) => {
    // deletedImageId is the full `userId/MM.YYYY/filename.ext`
    setUploadedImages((prevImages) => prevImages.filter(image => image.id !== deletedImageId));
    // Optionally, re-fetch images to ensure consistency if deletion might affect sorting/count
    fetchUserImages();
  }, [fetchUserImages]);
  
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
        {user && (
          <section aria-labelledby="upload-title" className="mb-12">
            <div className="max-w-3xl mx-auto text-center">
              <h2 id="upload-title" className="text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
                Upload Your Images
              </h2>
              <p className="mt-4 text-lg text-muted-foreground">
                Drag & drop your images or click to select files. Max 10MB per image. Supports JPG, PNG, GIF, WebP.
              </p>
            </div>
            <div className="mt-10 max-w-2xl mx-auto">
              {/* ImageUploader internally uses user from session for uploadImage action */}
              <ImageUploader onImageUpload={handleImageUpload} />
            </div>
          </section>
        )}

        {!user && !authLoading && (
          <section className="text-center py-16">
            <Image src="https://picsum.photos/seed/image-sharing/300/200" alt="Image sharing concept" width={300} height={200} className="mx-auto rounded-lg mb-8 shadow-lg" data-ai-hint="image sharing illustration"/>
            <h2 className="text-4xl font-extrabold tracking-tight text-foreground mb-4">Welcome to ImageDrop!</h2>
            <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
              The easiest way to upload and share your images. Securely store your memories and share them with friends, family, or the world.
            </p>
            <Button asChild size="lg">
              <Link href="/login">Login to Get Started</Link>
            </Button>
          </section>
        )}

        {user && <Separator className="my-12" />}
        
        {user && (
          <section aria-labelledby="gallery-title">
            <h2 id="gallery-title" className="text-2xl font-semibold text-foreground mb-6 text-center sm:text-left">
              Your Latest Uploaded Images
            </h2>
            {isLoadingInitialImages ? (
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {Array.from({ length: 4 }).map((_, index) => ( 
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
            ) : uploadedImages.length === 0 ? (
              <div className="text-center py-10">
                <Image src="https://picsum.photos/seed/no-images-user/200/200" alt="No images uploaded by user" width={150} height={150} className="mx-auto rounded-lg opacity-50 mb-4" data-ai-hint="empty state folder" />
                <p className="text-muted-foreground text-lg">You haven't uploaded any images yet. Start by uploading an image above!</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {uploadedImages.map((image) => (
                  <ImagePreviewCard 
                    key={image.id} // This id is `userId/MM.YYYY/filename.ext`
                    id={image.id} 
                    src={image.previewSrc} 
                    url={image.url} 
                    name={image.name} 
                    uploaderId={image.uploaderId}
                    onDelete={handleImageDelete}
                  />
                ))}
              </div>
            )}
          </section>
        )}
      </main>

      <footer className="py-8 text-center text-muted-foreground border-t">
        <p>&copy; {new Date().getFullYear()} ImageDrop. All rights reserved (not really, it's a demo!).</p>
         <p className="text-xs mt-1">Note: User-specific image directories are created under 'public/uploads/users/'.</p>
         <p className="text-xs mt-1">Users are stored in users.json (demo only, insecure).</p>
      </footer>
    </div>
  );
}
