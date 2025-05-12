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

const LATEST_IMAGES_COUNT = 8;

export default function Home() {
  const { user, loading: authLoading } = useAuth();
  const [uploadedImages, setUploadedImages] = useState<DisplayImage[]>([]);
  const [isLoadingInitialImages, setIsLoadingInitialImages] = useState(true);
  const [needsImageFetch, setNeedsImageFetch] = useState(true); // Start with true to fetch on initial load if authenticated

  const fetchUserImages = useCallback(async () => {
    if (authLoading) { 
        setIsLoadingInitialImages(true); 
        return;
    }

    if (!user) { 
      setUploadedImages([]);
      setIsLoadingInitialImages(false);
      return;
    }

    setIsLoadingInitialImages(true);
    try {
      // Corrected call: Pass undefined for userIdFromSession to use the session user,
      // and LATEST_IMAGES_COUNT as the limit.
      const userImagesFromServer = await getUserImages(undefined, LATEST_IMAGES_COUNT); 
      const displayImages: DisplayImage[] = userImagesFromServer.map(img => ({
        id: img.id, 
        name: img.name, 
        previewSrc: img.url,
        url: img.url,
        uploaderId: img.userId, 
      }));
      setUploadedImages(displayImages);
    } catch (error) {
      console.error("Failed to fetch user images:", error);
      setUploadedImages([]); 
    } finally {
      setIsLoadingInitialImages(false);
    }
  }, [user, authLoading]); 

  useEffect(() => {
    if (!authLoading) { // Only trigger fetch if auth state is resolved
      setNeedsImageFetch(true);     
    }
  }, [authLoading, user]); // Re-evaluate when user changes too, to fetch if user logs in/out

  useEffect(() => {
    if (needsImageFetch) {
      fetchUserImages();
      setNeedsImageFetch(false); 
    }
  }, [needsImageFetch, fetchUserImages]); 

  const handleImageUpload = useCallback((imageFile: ClientUploadedImageFile) => {
    // ImageFile.url from server: `/uploads/users/userId/MM.YYYY/filename.ext`
    // ImageFile.userId from server: `userId`
    // We need to construct an ID like: `userId/MM.YYYY/filename.ext`
    const serverFilename = imageFile.url.split('/').pop() || imageFile.name; 
    // imageFile.url.split('/') -> ['', 'uploads', 'users', 'USER_ID', 'MM.YYYY', 'filename.ext']
    // We need 'USER_ID/MM.YYYY/filename.ext', which starts at index 3
    const userAndPathPart = imageFile.url.split('/').slice(3).join('/');
    
    const newImage: DisplayImage = {
      id: userAndPathPart, // Corrected ID construction
      name: serverFilename, 
      previewSrc: imageFile.url, 
      url: imageFile.url,
      uploaderId: imageFile.userId,
    };

    setUploadedImages((prevImages) => {
        const updatedImages = [newImage, ...prevImages];
        const uniqueImages = updatedImages.filter((img, index, self) =>
            index === self.findIndex((t) => t.id === img.id) // Use ID for uniqueness
        );
        return uniqueImages.slice(0, LATEST_IMAGES_COUNT);
    });
    // No need to setNeedsImageFetch(true) here, as revalidation should update
    // Or, if immediate consistency is critical, fetchUserImages() can be called.
    // For now, rely on optimistic update and potential revalidation.
  }, []);

  const handleImageDelete = useCallback((deletedImageId: string) => {
    setUploadedImages((prevImages) => prevImages.filter(image => image.id !== deletedImageId));
    // Optionally setNeedsImageFetch(true) if you want to ensure the list is fully accurate from server
    // especially if the number of images drops below LATEST_IMAGES_COUNT
  }, []);
  
  const handleImageRename = useCallback((oldImageId: string, newImageId: string, newName: string, newUrl: string) => {
    setUploadedImages((prevImages) =>
      prevImages.map(image =>
        image.id === oldImageId
          ? { ...image, id: newImageId, name: newName, url: newUrl, previewSrc: newUrl }
          : image
      ).sort((a, b) => { // Re-sort if ctime was part of DisplayImage and used for sorting
          // Assuming fetchUserImages will re-sort correctly upon next fetch if needed
          // For now, just update the item. If sorting logic is client-side and complex, adjust here.
          return 0; // Placeholder if no client-side re-sorting based on name/id
      })
    );
     // setNeedsImageFetch(true); // Trigger a re-fetch to ensure list consistency, especially order
  }, []);
  
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
                Drag & drop your images or click to select files. Max 6MB per image. Supports JPG, PNG, GIF, WebP.
              </p>
            </div>
            <div className="mt-10 max-w-2xl mx-auto">
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

        {!authLoading && user && <Separator className="my-12" />}
        
        {!authLoading && user && (
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
                <p className="text-muted-foreground text-lg">You haven&apos;t uploaded any images yet. Start by uploading an image above!</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {uploadedImages.map((image) => (
                  <ImagePreviewCard 
                    key={image.id}
                    id={image.id} 
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
             {uploadedImages.length > 0 && uploadedImages.length >= LATEST_IMAGES_COUNT && (
              <div className="mt-8 text-center">
                <Button asChild variant="outline">
                  <Link href="/my-images">View All My Images</Link>
                </Button>
              </div>
            )}
          </section>
        )}
         {authLoading && ( // Show this loader only when auth is loading, not necessarily image loading
            <div className="flex flex-col justify-center items-center py-16">
                 <Skeleton className="h-12 w-12 rounded-full mb-4" />
                 <Skeleton className="h-6 w-48" />
            </div>
        )}
      </main>

      <footer className="py-8 text-center text-muted-foreground border-t">
        <p>&copy; {new Date().getFullYear()} ImageDrop. All rights reserved (not really, it&apos;s a demo!).</p>
         <p className="text-xs mt-1">Note: User-specific image directories are created under &apos;public/uploads/users/&apos;.</p>
         <p className="text-xs mt-1">Users are stored in users.json (demo only, insecure).</p>
      </footer>
    </div>
  );
}

