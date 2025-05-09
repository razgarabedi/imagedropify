// src/app/page.tsx
"use client";

import React, { useState, useCallback, useEffect } from 'react';
import Image from 'next/image';
import { ImageUploader, type UploadedImageFile as ClientUploadedImageFile } from '@/components/image-uploader';
import { ImagePreviewCard } from '@/components/image-preview-card';
import { ThemeToggle } from '@/components/theme-toggle';
import { Separator } from '@/components/ui/separator';
import { getRecentImages } from '@/app/actions/imageActions';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';


interface DisplayImage {
  id: string; 
  name: string; 
  previewSrc: string; 
  url: string; 
}

export default function Home() {
  const [uploadedImages, setUploadedImages] = useState<DisplayImage[]>([]);
  const [isLoadingInitialImages, setIsLoadingInitialImages] = useState(true);

  const fetchAndSetRecentImages = useCallback(async () => {
    setIsLoadingInitialImages(true);
    try {
      const recentImagesFromServer = await getRecentImages();
      const displayImages: DisplayImage[] = recentImagesFromServer.map(img => ({
        id: img.id, 
        name: img.name, 
        previewSrc: img.url, // For existing images, previewSrc is the server URL
        url: img.url,
      }));
      setUploadedImages(displayImages);
    } catch (error) {
      console.error("Failed to fetch recent images:", error);
      // Optionally, show a toast to the user
    } finally {
      setIsLoadingInitialImages(false);
    }
  }, []);

  useEffect(() => {
    fetchAndSetRecentImages();
  }, [fetchAndSetRecentImages]);

  const handleImageUpload = useCallback((imageFile: ClientUploadedImageFile) => {
    // imageFile comes from ImageUploader: name (original), previewSrc (local dataURI), url (server URL)
    const newImage: DisplayImage = {
      id: imageFile.url.split('/').pop() || crypto.randomUUID(), // Use server filename from URL as ID
      name: imageFile.name, // Original name
      previewSrc: imageFile.url, // After successful upload, use the server URL as previewSrc
      url: imageFile.url,
    };

    setUploadedImages((prevImages) => {
      // Add new image to the front, remove duplicates by URL, and keep only the last 5
      const updatedImages = [newImage, ...prevImages];
      const uniqueImages = updatedImages.filter((img, index, self) =>
        index === self.findIndex((t) => t.url === img.url)
      );
      return uniqueImages.slice(0, 5); 
    });
  }, []);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2">
            <Image src="https://picsum.photos/seed/imagedrop-logo/40/40" alt="ImageDrop Logo" width={32} height={32} className="rounded-md" data-ai-hint="logo abstract" />
            <h1 className="text-2xl font-bold text-primary">ImageDrop</h1>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <main className="flex-grow container mx-auto px-4 py-8 sm:px-6 lg:px-8">
        <section aria-labelledby="upload-title" className="mb-12">
          <div className="max-w-3xl mx-auto text-center">
            <h2 id="upload-title" className="text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
              Upload and Share Your Images
            </h2>
            <p className="mt-4 text-lg text-muted-foreground">
              Drag & drop your images or click to select files. Max 10MB per image. Supports JPG, PNG, GIF, WebP.
            </p>
          </div>
          <div className="mt-10 max-w-2xl mx-auto">
            <ImageUploader onImageUpload={handleImageUpload} />
          </div>
        </section>

        <Separator className="my-12" />
        
        <section aria-labelledby="gallery-title">
          <h2 id="gallery-title" className="text-2xl font-semibold text-foreground mb-6 text-center sm:text-left">
            Your Latest Uploads
          </h2>
          {isLoadingInitialImages ? (
             <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {Array.from({ length: Math.min(uploadedImages.length, 4) || 4 }).map((_, index) => ( // Show skeletons for up to 4 items or actual count if less
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
              <Image src="https://picsum.photos/seed/no-images/200/200" alt="No images uploaded" width={150} height={150} className="mx-auto rounded-lg opacity-50 mb-4" data-ai-hint="empty state illustration" />
              <p className="text-muted-foreground text-lg">No images uploaded yet. Start by uploading an image above!</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {uploadedImages.map((image) => (
                <ImagePreviewCard key={image.id} src={image.previewSrc} url={image.url} name={image.name} />
              ))}
            </div>
          )}
        </section>
      </main>

      <footer className="py-8 text-center text-muted-foreground border-t">
        <p>&copy; {new Date().getFullYear()} ImageDrop. All rights reserved (not really, it's a demo!).</p>
        <p className="text-xs mt-1">Note: The 'public/uploads' directory must exist and be writable by the server process.</p>
      </footer>
    </div>
  );
}