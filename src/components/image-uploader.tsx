// src/components/image-uploader.tsx
"use client";

import React, { useState, useCallback, useRef, useEffect, useActionState, startTransition } from 'react';
import Image from 'next/image';
import { UploadCloud, Loader2, UserX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { uploadImage, type UploadImageActionState, type UploadedImageServerData } from '@/app/actions/imageActions';
import { useAuth } from '@/hooks/use-auth'; // For checking if user is logged in on client
import Link from 'next/link';


const MAX_FILE_SIZE = 6 * 1024 * 1024; // 6MB
const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

export interface UploadedImageFile {
  name: string; // original file name
  previewSrc: string; // data URI for local preview
  url: string; // server URL for the image
  userId: string; // ID of the user who uploaded it (from server response)
}

interface ImageUploaderProps {
  onImageUpload: (imageFile: UploadedImageFile) => void;
}

const initialUploadState: UploadImageActionState = { success: false };


export function ImageUploader({ onImageUpload }: ImageUploaderProps) {
  const { user, loading: authLoading } = useAuth(); // Get user from client-side context
  const [isDragging, setIsDragging] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [localPreviewSrc, setLocalPreviewSrc] = useState<string | null>(null);
  const [localFileName, setLocalFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  // The uploadImage server action will get the userId from the session itself.
  // No need to pass userId from client to the action.
  const [actionState, formAction, isPending] = useActionState(uploadImage, initialUploadState);

  const resetUploaderVisualState = useCallback(() => {
    setUploadProgress(0);
    setLocalPreviewSrc(null);
    setLocalFileName(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  useEffect(() => {
    if (isPending) {
      // Pending state is active
    } else if (actionState.success && actionState.data) {
      toast({
        title: 'Image Uploaded!',
        description: `${actionState.data.originalName} is now ready.`,
      });
      onImageUpload({
        name: actionState.data.originalName,
        previewSrc: localPreviewSrc || actionState.data.url, 
        url: actionState.data.url,
        userId: actionState.data.userId, // userId comes from server response
      });
      resetUploaderVisualState();
    } else if (actionState.error) {
      toast({
        variant: 'destructive',
        title: 'Upload Failed',
        description: actionState.error,
      });
      setUploadProgress(0); // Reset progress on error
    }
  }, [actionState, isPending, onImageUpload, toast, resetUploaderVisualState, localPreviewSrc]);


  const handleFileSelected = useCallback((file: File | null) => {
    if (!file) return;
    if (isPending) return; 

    if (!user) { // Client-side check before attempting upload
      toast({ variant: 'destructive', title: 'Authentication Required', description: 'Please login to upload images.' });
      resetUploaderVisualState();
      return;
    }

    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      toast({ variant: 'destructive', title: 'Invalid File Type', description: `Please upload a JPG, PNG, GIF, or WebP image. You tried: ${file.type}` });
      resetUploaderVisualState();
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      toast({ variant: 'destructive', title: 'File Too Large', description: `File size cannot exceed 6MB. Your file is ${(file.size / (1024 * 1024)).toFixed(2)}MB.` });
      resetUploaderVisualState();
      return;
    }

    setLocalFileName(file.name);
    setUploadProgress(0); // Reset progress before new upload starts

    const reader = new FileReader();
    reader.onloadend = () => {
      setLocalPreviewSrc(reader.result as string);
      const formData = new FormData();
      formData.append('image', file);
      startTransition(() => {
        formAction(formData); // Pass only formData, action gets userId from session
      });
    };
    reader.onerror = () => {
      toast({ variant: 'destructive', title: 'Error Reading File', description: 'Could not read the selected file for preview.' });
      resetUploaderVisualState();
    };
    reader.readAsDataURL(file);
  }, [isPending, formAction, resetUploaderVisualState, toast, user]);


  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (isPending || !user || authLoading) return;
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (isPending || !user || authLoading) return;
    if (!isDragging) setIsDragging(true);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (isPending || !user || authLoading) return;
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileSelected(e.dataTransfer.files[0]);
      e.dataTransfer.clearData();
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFileSelected(e.target.files[0]);
    }
  };

  const triggerFileInput = () => {
    if (isPending || !user || authLoading) return;
    fileInputRef.current?.click();
  };
  
  useEffect(() => {
    // Cleanup for blob URLs
    const currentPreview = localPreviewSrc;
    return () => {
      if (currentPreview && currentPreview.startsWith('blob:')) {
        URL.revokeObjectURL(currentPreview);
      }
    };
  }, [localPreviewSrc]);

  if (authLoading) {
    return (
      <Card className="shadow-xl">
        <CardHeader>
          <CardTitle className="text-center text-xl">Upload Your Image</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-center justify-center p-8">
          <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
          <p>Verifying authentication...</p>
        </CardContent>
      </Card>
    );
  }
  
  if (!user) { // If user is not logged in (after authLoading is false)
    return (
      <Card className="shadow-xl hover:shadow-2xl transition-shadow duration-300">
        <CardHeader>
          <CardTitle className="text-center text-xl">Login to Upload</CardTitle>
          <CardDescription className="text-center">Please login to upload and manage your images.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-lg">
            <UserX className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-lg font-semibold text-foreground">Authentication Required</p>
            <p className="text-sm text-muted-foreground">You need to be logged in to upload images.</p>
            <Button asChild className="mt-4">
                <Link href="/login">Go to Login</Link>
            </Button>
        </CardContent>
      </Card>
    )
  }
  
  return (
    <Card className="shadow-xl hover:shadow-2xl transition-shadow duration-300">
      <CardHeader>
        <CardTitle className="text-center text-xl">Upload Your Image</CardTitle>
        <CardDescription className="text-center">Drag & drop or click to select a file.</CardDescription>
      </CardHeader>
      <CardContent>
        <div
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onClick={triggerFileInput}
          className={cn(
            'flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-lg cursor-pointer transition-colors duration-200 ease-in-out',
            isDragging ? 'border-primary bg-accent/10' : 'border-border hover:border-primary/70',
            isPending ? 'cursor-default opacity-70' : ''
          )}
          role="button"
          aria-label="Image upload area"
          tabIndex={isPending ? -1 : 0}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if(!isPending) triggerFileInput(); }}}
        >
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept={ACCEPTED_IMAGE_TYPES.join(',')}
            className="hidden"
            disabled={isPending}
            name="image" 
          />
          {isPending ? (
            <div className="flex flex-col items-center text-center w-full">
              <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
              <p className="text-lg font-medium text-foreground">Uploading {localFileName && `"${localFileName}"`}</p>
              <Progress value={uploadProgress} className="w-full mt-2 h-2" />
              <p className="text-sm text-muted-foreground mt-1">{uploadProgress}%</p>
            </div>
          ) : localPreviewSrc ? (
            <div className="flex flex-col items-center text-center">
              <Image src={localPreviewSrc} alt="Image preview" width={150} height={150} className="rounded-md object-contain max-h-[150px] mb-4 shadow-md" data-ai-hint="upload preview" />
              <p className="text-sm text-muted-foreground">{localFileName}</p>
              <p className="text-sm text-muted-foreground">Click or drag another file to replace.</p>
            </div>
          ) : (
            <div className="flex flex-col items-center text-center pointer-events-none">
              <UploadCloud className="h-12 w-12 text-primary mb-4" />
              <p className="text-lg font-semibold text-foreground">Drop image here or click to browse</p>
              <p className="text-sm text-muted-foreground">Max 6MB. JPG, PNG, GIF, WebP</p>
            </div>
          )}
        </div>
        {!isPending && !localPreviewSrc && (
          <Button onClick={triggerFileInput} className="w-full mt-6" variant="default" size="lg" disabled={isPending}>
            <UploadCloud className="mr-2 h-5 w-5" /> Select Image
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

