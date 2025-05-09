// IMPORTANT: For a real application, the file handling and "upload" process
// would need to occur on the server-side with robust security measures.
// This includes:
// 1. Validating file type and size on the server.
// 2. Scanning files for malware.
// 3. Storing files securely (e.g., in a cloud storage bucket).
// 4. Generating secure, unique URLs.
// 5. Sanitizing filenames.
// The current implementation is a client-side simulation for demo purposes.

"use client";

import React, { useState, useCallback, useRef, useEffect } from 'react';
import Image from 'next/image';
import { UploadCloud, FileWarning, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

export interface UploadedImageFile {
  name: string;
  previewSrc: string;
  url: string;
}

interface ImageUploaderProps {
  onImageUpload: (imageFile: UploadedImageFile) => void;
}

export function ImageUploader({ onImageUpload }: ImageUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const resetState = () => {
    setIsLoading(false);
    setUploadProgress(0);
    setPreviewSrc(null);
    setFileName(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = ''; // Reset file input
    }
  };

  const handleFile = useCallback((file: File | null) => {
    if (!file) return;

    // Client-side validation (should also be done on server)
    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      toast({
        variant: 'destructive',
        title: 'Invalid File Type',
        description: `Please upload a JPG, PNG, GIF, or WebP image. You tried: ${file.type}`,
      });
      resetState();
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      toast({
        variant: 'destructive',
        title: 'File Too Large',
        description: `File size cannot exceed 10MB. Your file is ${(file.size / (1024*1024)).toFixed(2)}MB.`,
      });
      resetState();
      return;
    }

    setFileName(file.name);
    setIsLoading(true);
    setUploadProgress(0);

    const reader = new FileReader();
    reader.onprogress = (event) => {
      if (event.lengthComputable) {
        const progress = Math.round((event.loaded / event.total) * 50); // Reading is 50%
        setUploadProgress(progress);
      }
    };
    reader.onloadend = () => {
      setPreviewSrc(reader.result as string);
      // Simulate upload
      let currentProgress = 50;
      const interval = setInterval(() => {
        currentProgress += 10;
        if (currentProgress <= 100) {
          setUploadProgress(currentProgress);
        } else {
          clearInterval(interval);
          // In a real app, this URL would come from the server after successful upload & processing.
          const mockUrl = `https://imgdp.co/${Math.random().toString(36).substring(2, 8)}`;
          onImageUpload({ name: file.name, previewSrc: reader.result as string, url: mockUrl });
          toast({
            title: 'Image Uploaded!',
            description: `${file.name} is now ready.`,
          });
          resetState(); 
        }
      }, 150);
    };
    reader.onerror = () => {
      toast({
        variant: 'destructive',
        title: 'Error Reading File',
        description: 'Could not read the selected file.',
      });
      resetState();
    };
    reader.readAsDataURL(file);
  }, [onImageUpload, toast]);

  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
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
    if (!isDragging) setIsDragging(true); // Ensure it's set if not already
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFile(e.dataTransfer.files[0]);
      e.dataTransfer.clearData();
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFile(e.target.files[0]);
    }
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };
  
  // Effect to clear preview if the uploader becomes unused
  useEffect(() => {
    return () => {
      if (previewSrc && previewSrc.startsWith('blob:')) { // Only revoke object URLs
        URL.revokeObjectURL(previewSrc);
      }
    };
  }, [previewSrc]);

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
          onClick={!isLoading ? triggerFileInput : undefined} // Prevent click during loading
          className={cn(
            'flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-lg cursor-pointer transition-colors duration-200 ease-in-out',
            isDragging ? 'border-primary bg-accent/10' : 'border-border hover:border-primary/70',
            isLoading ? 'cursor-default opacity-70' : ''
          )}
          role="button"
          aria-label="Image upload area"
          tabIndex={isLoading ? -1 : 0}
          onKeyDown={(e) => { if (e.key === 'Enter' && !isLoading) triggerFileInput(); }}
        >
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept={ACCEPTED_IMAGE_TYPES.join(',')}
            className="hidden"
            disabled={isLoading}
          />
          {isLoading ? (
            <div className="flex flex-col items-center text-center w-full">
              <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
              <p className="text-lg font-medium text-foreground">Uploading {fileName && `"${fileName}"`}</p>
              <Progress value={uploadProgress} className="w-full mt-2 h-2" />
              <p className="text-sm text-muted-foreground mt-1">{uploadProgress}%</p>
            </div>
          ) : previewSrc ? (
            <div className="flex flex-col items-center text-center">
              <Image src={previewSrc} alt="Image preview" width={150} height={150} className="rounded-md object-contain max-h-[150px] mb-4 shadow-md" />
              <p className="text-sm text-muted-foreground">{fileName}</p>
              <p className="text-sm text-muted-foreground">Click or drag another file to replace.</p>
            </div>
          ) : (
            <div className="flex flex-col items-center text-center pointer-events-none">
              <UploadCloud className="h-12 w-12 text-primary mb-4" />
              <p className="text-lg font-semibold text-foreground">Drop image here or click to browse</p>
              <p className="text-sm text-muted-foreground">Max 10MB. JPG, PNG, GIF, WebP</p>
            </div>
          )}
        </div>
        {!isLoading && !previewSrc && (
          <Button onClick={triggerFileInput} className="w-full mt-6" variant="default" size="lg" disabled={isLoading}>
            <UploadCloud className="mr-2 h-5 w-5" /> Select Image
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
