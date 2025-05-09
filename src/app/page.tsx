"use client";

import React, { useState, useCallback } from 'react';
import Image from 'next/image';
import { ImageUploader, type UploadedImageFile } from '@/components/image-uploader';
import { ImagePreviewCard } from '@/components/image-preview-card';
import { ThemeToggle } from '@/components/theme-toggle';
import { Separator } from '@/components/ui/separator';

// Define a type for the image objects we'll store in state
interface DisplayImage extends UploadedImageFile {
  id: string;
}

export default function Home() {
  const [uploadedImages, setUploadedImages] = useState<DisplayImage[]>([]);

  const handleImageUpload = useCallback((imageFile: UploadedImageFile) => {
    const newImage: DisplayImage = {
      ...imageFile,
      id: crypto.randomUUID(), // Generate a unique ID for the key
    };
    setUploadedImages((prevImages) => [newImage, ...prevImages]);
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
            Your Uploaded Images
          </h2>
          {uploadedImages.length === 0 ? (
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
      </footer>
    </div>
  );
}
