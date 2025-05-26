
// src/components/page-content/home-page-client-content.tsx
"use client";

import React, { useState, useCallback, useEffect, ReactNode } from 'react';
import Image from 'next/image';
import { ImageUploader } from '@/components/image-uploader';
import { ImagePreviewCard } from '@/components/image-preview-card';
import { ThemeToggle } from '@/components/theme-toggle';
import { Separator } from '@/components/ui/separator';
import { 
    getUserImages, 
    type UserImageData, 
    listUserFolders, 
    type UserFolder,
    type PaginatedUserImagesResponse
} from '@/app/actions/imageActions';
import { DEFAULT_FOLDER_NAME, LATEST_IMAGES_COUNT } from '@/lib/imageConfig'; 
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { useAuth } from '@/hooks/use-auth';
import { AuthButton } from '@/components/auth-button';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Folder, Image as ImageIconLucide } from 'lucide-react';
import type { UploadedImageServerData } from '@/app/actions/imageActions';

interface DisplayImage {
  id: string;
  name: string;
  previewSrc: string; 
  url: string;         
  uploaderId: string;
  folderName: string;
  originalName: string;
}

interface HomePageClientContentProps {
  serverImageContent: ReactNode | null;
}

export function HomePageClientContent({ serverImageContent }: HomePageClientContentProps) {
  const { user, loading: authLoading } = useAuth();
  const [uploadedImages, setUploadedImages] = useState<DisplayImage[]>([]);
  const [isLoadingImages, setIsLoadingImages] = useState(true);
  const [userFolders, setUserFolders] = useState<UserFolder[]>([{ name: DEFAULT_FOLDER_NAME }]);
  const [selectedFolder, setSelectedFolder] = useState<string>(DEFAULT_FOLDER_NAME);

  const fetchUserFoldersForUpload = useCallback(async () => {
    if (!user) {
        setUserFolders([{ name: DEFAULT_FOLDER_NAME }]);
        setSelectedFolder(DEFAULT_FOLDER_NAME);
        return;
    }
    try {
        const folders = await listUserFolders(user.id);
        const validFolders = folders.length > 0 ? folders : [{ name: DEFAULT_FOLDER_NAME }];
        setUserFolders(validFolders);
        if (!validFolders.some(f => f.name === selectedFolder)) {
            setSelectedFolder(DEFAULT_FOLDER_NAME);
        }
    } catch (error) {
        console.error("Failed to fetch user folders for upload:", error);
        setUserFolders([{ name: DEFAULT_FOLDER_NAME }]);
        setSelectedFolder(DEFAULT_FOLDER_NAME);
    }
  }, [user, selectedFolder]);

  const fetchImagesForSelectedFolder = useCallback(async (folderToFetch: string) => {
    if (authLoading) {
        setIsLoadingImages(true);
        return;
    }
    if (!user) {
      setUploadedImages([]);
      setIsLoadingImages(false);
      return;
    }
    setIsLoadingImages(true);
    try {
      const response: PaginatedUserImagesResponse = await getUserImages(user.id, { 
        page: 1, 
        limit: LATEST_IMAGES_COUNT, 
        targetFolderName: folderToFetch 
      });
      // img here is UserImageData, which has a pre-constructed 'url' property
      const displayImages: DisplayImage[] = response.images.map(img => ({
        id: img.id,
        name: img.filename || '',
        previewSrc: `${img.url}?t=${Date.now()}`, // Use the correct img.url from UserImageData
        url: img.url, // Use the correct img.url from UserImageData
        uploaderId: img.userId,
        folderName: img.folderName,
        originalName: img.originalName || '',
      }));
      setUploadedImages(displayImages);
    } catch (error) {
      console.error(`Failed to fetch user images for folder ${folderToFetch}:`, error);
      setUploadedImages([]);
    } finally {
      setIsLoadingImages(false);
    }
  }, [user, authLoading]);

  useEffect(() => {
    if (!authLoading) {
      if (user) {
        fetchUserFoldersForUpload();
      } else {
        setUserFolders([{ name: DEFAULT_FOLDER_NAME }]);
        setSelectedFolder(DEFAULT_FOLDER_NAME);
        setUploadedImages([]);
        setIsLoadingImages(false);
      }
    }
  }, [authLoading, user, fetchUserFoldersForUpload]);

  useEffect(() => {
    if (!authLoading && user) {
        fetchImagesForSelectedFolder(selectedFolder);
    } else if (!authLoading && !user) {
        setUploadedImages([]);
        setIsLoadingImages(false);
    }
  }, [authLoading, user, selectedFolder, fetchImagesForSelectedFolder]);


  const handleImageUpload = useCallback((imageFile: UploadedImageServerData) => {
    if (user && imageFile.folderName === selectedFolder) {
      const newImage: DisplayImage = {
        id: imageFile.id,
        name: imageFile.filename,
        previewSrc: `/uploads/users/${imageFile.urlPath}?t=${Date.now()}`,
        url: `/uploads/users/${imageFile.urlPath}`,
        uploaderId: imageFile.userId,
        folderName: imageFile.folderName,
        originalName: imageFile.originalName,
      };
      setUploadedImages(prev => [newImage, ...prev.slice(0, LATEST_IMAGES_COUNT - 1)]);
    }
    if (user) {
      fetchImagesForSelectedFolder(selectedFolder);
    }
  }, [user, selectedFolder, fetchImagesForSelectedFolder]);


  const handleImageDelete = useCallback((deletedImageDbId: string) => {
    if (user) {
        setUploadedImages(prevImages => prevImages.filter(img => img.id !== deletedImageDbId));
        fetchImagesForSelectedFolder(selectedFolder);
    }
  }, [user, selectedFolder, fetchImagesForSelectedFolder]);

  const handleImageRename = useCallback((oldImageDbId: string, newImageDbId: string, newName: string, newUrl: string) => {
    if (user) {
      setUploadedImages(prevImages =>
        prevImages.map(img =>
          img.id === oldImageDbId
            ? { ...img, id: newImageDbId, name: newName, previewSrc: `${newUrl}?t=${Date.now()}`, url: newUrl }
            : img
        )
      );
      fetchImagesForSelectedFolder(selectedFolder);
    } 
  }, [user, selectedFolder, fetchImagesForSelectedFolder]);


  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-2">
            <Image src="https://placehold.co/40x40.png" alt="ImageDrop Logo" width={32} height={32} className="rounded-md" data-ai-hint="logo abstract" />
            <h1 className="text-xl sm:text-2xl font-bold text-primary">ImageDrop</h1>
          </Link>
          <div className="flex items-center gap-4">
            <ThemeToggle />
            <AuthButton />
          </div>
        </div>
      </header>

      <main className="flex-grow container mx-auto px-4 py-8 sm:px-6 lg:px-8">
        {user && (
          <section aria-labelledby="upload-title" className="mb-8 md:mb-12">
            <div className="max-w-3xl mx-auto text-center">
              <h2 id="upload-title" className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground md:text-4xl">
                Upload Your Images
              </h2>
              <p className="mt-2 sm:mt-3 text-sm sm:text-base text-muted-foreground md:text-lg">
                Supports JPG, PNG, GIF, WebP. Max size varies by user/site setting.
              </p>
            </div>

            <div className="mt-4 sm:mt-6 max-w-md mx-auto">
                <Label htmlFor="upload-folder-select" className="text-xs sm:text-sm font-medium text-muted-foreground">Upload to folder:</Label>
                <Select value={selectedFolder} onValueChange={setSelectedFolder} disabled={userFolders.length === 0 || authLoading}>
                    <SelectTrigger id="upload-folder-select" className="w-full mt-1">
                        <SelectValue placeholder="Select a folder" />
                    </SelectTrigger>
                    <SelectContent>
                        {userFolders.map(folder => (
                            <SelectItem key={folder.name} value={folder.name}>
                                <div className="flex items-center gap-2">
                                    <Folder className="h-4 w-4" />
                                    {folder.name}
                                </div>
                            </SelectItem>
                        ))}
                        {userFolders.length === 0 && <SelectItem value={DEFAULT_FOLDER_NAME} disabled>{DEFAULT_FOLDER_NAME}</SelectItem>}
                    </SelectContent>
                </Select>
                 <p className="text-xs text-muted-foreground mt-1">
                    Go to <Link href="/my-images" className="underline hover:text-primary">My Images</Link> to create new folders.
                  </p>
            </div>

            <div className="mt-3 sm:mt-4 max-w-2xl mx-auto">
              <ImageUploader onImageUpload={handleImageUpload} currentFolderName={selectedFolder} />
            </div>
          </section>
        )}

        {!user && !authLoading && serverImageContent && (
          <section className="text-center py-8 md:py-16">
            {serverImageContent}
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground mb-4">Welcome to ImageDrop!</h2>
            <p className="text-lg sm:text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
              The easiest way to upload and share your images. Securely store your memories and share them with friends, family, or the world.
            </p>
            <Button asChild size="lg">
              <Link href="/login">Login to Get Started</Link>
            </Button>
          </section>
        )}

        {!user && authLoading && (
             <section className="text-center py-8 md:py-16">
                <Skeleton className="mx-auto rounded-lg mb-8 shadow-lg w-[300px] h-[200px]" />
                <Skeleton className="h-10 w-3/4 mx-auto mb-4" />
                <Skeleton className="h-6 w-1/2 mx-auto mb-8" />
                <Skeleton className="h-12 w-48 mx-auto" />
            </section>
        )}


        {!authLoading && user && <Separator className="my-6 md:my-8" />}

        {!authLoading && user && (
          <section aria-labelledby="gallery-title">
            <h2 id="gallery-title" className="text-xl sm:text-2xl font-semibold text-foreground mb-4 sm:mb-6 text-center sm:text-left">
              Latest Images in: <span className="text-primary">&quot;{selectedFolder}&quot;</span> (Shows up to {LATEST_IMAGES_COUNT})
            </h2>
            {isLoadingImages ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
                {Array.from({ length: LATEST_IMAGES_COUNT }).map((_, index) => (
                  <Card key={`skeleton-latest-${selectedFolder}-${index}-${Date.now()}-${Math.random()}`} className="shadow-lg">
                    <CardHeader className="p-4"><Skeleton className="h-5 w-3/4" /></CardHeader>
                    <CardContent className="p-0 aspect-[4/3] relative overflow-hidden"><Skeleton className="h-full w-full" /></CardContent>
                    <CardFooter className="p-4 flex-col items-start space-y-2"><Skeleton className="h-8 w-full" /><Skeleton className="h-4 w-1/2" /></CardFooter>
                  </Card>
                ))}
              </div>
            ) : uploadedImages.length === 0 ? (
              <div className="text-center py-10">
                <ImageIconLucide className="mx-auto h-16 sm:h-24 w-16 sm:w-24 text-muted-foreground opacity-50 mb-4 sm:mb-6" data-ai-hint="empty state folder" />
                <p className="text-muted-foreground text-lg sm:text-xl mb-4">No images found in &quot;{selectedFolder}&quot;.</p>
                <p className="text-sm sm:text-base text-muted-foreground">Start by uploading an image above!</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
                {uploadedImages.filter(image => image && typeof image.id === 'string' && image.id.trim() !== '').map((image) => (
                  <ImagePreviewCard
                    key={image.id} 
                    id={image.id}
                    src={image.previewSrc}
                    url={image.url}
                    name={image.name}
                    uploaderId={image.uploaderId}
                    originalName={image.originalName}
                    folderName={image.folderName}
                    onDelete={handleImageDelete}
                    onRename={handleImageRename}
                    unoptimized={true}
                  />
                ))}
              </div>
            )}
             {uploadedImages.length > 0 && user && (
              <div className="mt-8 text-center">
                <Button asChild variant="outline">
                  <Link href="/my-images">View All My Images & Folders</Link>
                </Button>
              </div>
            )}
          </section>
        )}
         {authLoading && user && ( 
            <section aria-labelledby="gallery-title">
                 <Skeleton className="h-8 w-1/2 mb-6 mx-auto sm:mx-0" />
                 <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
                    {Array.from({ length: LATEST_IMAGES_COUNT }).map((_, index) => (
                    <Card key={`skeleton-loggedin-${selectedFolder}-${index}-${Date.now()}-${Math.random()}`} className="shadow-lg">
                        <CardHeader className="p-4"><Skeleton className="h-5 w-3/4" /></CardHeader>
                        <CardContent className="p-0 aspect-[4/3] relative overflow-hidden"><Skeleton className="h-full w-full" /></CardContent>
                        <CardFooter className="p-4 flex-col items-start space-y-2"><Skeleton className="h-8 w-full" /><Skeleton className="h-4 w-1/2" /></CardFooter>
                    </Card>
                    ))}
                </div>
            </section>
        )}
      </main>

      <footer className="py-8 text-center text-muted-foreground border-t mt-8 md:mt-12">
        <p className="text-sm">&copy; {new Date().getFullYear()} ImageDrop. All rights reserved (not really, it&apos;s a demo!).</p>
         <p className="text-xs mt-1">Images stored in `public/uploads/users/userId/folderName/`.</p>
         <p className="text-xs mt-1">User data & image metadata now in PostgreSQL.</p>
      </footer>
    </div>
  );
}

