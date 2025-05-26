
// src/components/image-uploader.tsx
"use client";

import React, { useState, useCallback, useRef, useEffect, useActionState, startTransition } from 'react';
import Image from 'next/image';
import { UploadCloud, Loader2, UserX, ListChecks } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { uploadImage, type UploadImageActionState, type UploadedImageServerData } from '@/app/actions/imageActions';
import { useAuth } from '@/hooks/use-auth';
import Link from 'next/link';
import { ACCEPTED_IMAGE_TYPES } from '@/lib/imageConfig'; // Import accepted types

interface ImageUploaderProps {
  onImageUpload: (imageData: UploadedImageServerData) => void;
  currentFolderName?: string | null;
}

const initialUploadState: UploadImageActionState = { success: false };
const CLIENT_MAX_FILE_SIZE_MB = 6; // 6MB per-file limit for client-side check

export function ImageUploader({ onImageUpload, currentFolderName }: ImageUploaderProps) {
  const { user, loading: authLoading } = useAuth();
  const [isDragging, setIsDragging] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  
  const [fileQueue, setFileQueue] = useState<File[]>([]);
  const [currentUploadingFile, setCurrentUploadingFile] = useState<File | null>(null);
  const [currentPreviewSrc, setCurrentPreviewSrc] = useState<string | null>(null);
  const [totalFilesQueued, setTotalFilesQueued] = useState(0);
  const [completedFilesCount, setCompletedFilesCount] = useState(0);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const [actionState, formAction, isPending] = useActionState(uploadImage, initialUploadState);

  const resetUploaderVisualState = useCallback((isFullReset: boolean = true) => {
    setUploadProgress(0);
    setCurrentUploadingFile(null);
    setCurrentPreviewSrc(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    if (isFullReset) {
        setFileQueue([]);
        setTotalFilesQueued(0);
        setCompletedFilesCount(0);
    }
  }, []);

  const processNextFile = useCallback(() => {
    if (fileQueue.length === 0) {
      if (totalFilesQueued > 0) { // All files processed
        toast({ title: "Uploads Complete", description: `${completedFilesCount} of ${totalFilesQueued} files uploaded successfully.`});
      }
      resetUploaderVisualState(true);
      return;
    }

    if (isPending) return; // Don't start a new upload if one is already pending

    const nextFile = fileQueue[0];
    setCurrentUploadingFile(nextFile);
    setUploadProgress(5); // Simulate progress start

    const reader = new FileReader();
    reader.onloadend = () => {
      setCurrentPreviewSrc(reader.result as string);
      const formData = new FormData();
      formData.append('image', nextFile);
      if (currentFolderName) {
        formData.append('folderName', currentFolderName);
      }
      setUploadProgress(30);
      startTransition(() => {
        formAction(formData);
      });
    };
    reader.onerror = () => {
      toast({ variant: 'destructive', title: 'Error Reading File', description: `Could not read ${nextFile.name} for preview.` });
      setFileQueue(prev => prev.slice(1)); // Remove problematic file
      setCompletedFilesCount(prev => prev + 1); // Count as processed (though failed)
      // processNextFile(); // Trigger next file processing immediately - No, actionState useEffect will handle it
    };
    reader.readAsDataURL(nextFile);

  }, [fileQueue, formAction, resetUploaderVisualState, toast, currentFolderName, isPending, totalFilesQueued, completedFilesCount]);


  useEffect(() => {
    if (!isPending && currentUploadingFile) { // An action has just completed
      if (actionState.success && actionState.data) {
        toast({
          title: 'Image Uploaded!',
          description: `${actionState.data.originalName} to folder "${actionState.data.folderName}".`,
        });
        onImageUpload(actionState.data);
      } else if (actionState.error) {
        toast({
          variant: 'destructive',
          title: `Upload Failed for ${currentUploadingFile.name}`,
          description: actionState.error,
        });
      }
      // Remove the processed file from the queue and trigger next
      setFileQueue(prev => prev.slice(1));
      setCompletedFilesCount(prev => prev + 1);
      setCurrentUploadingFile(null); // Clear current file as it's processed
    }
  }, [actionState, isPending, onImageUpload, toast, currentUploadingFile]);
  
  // Effect to trigger processing the next file when the queue is updated and no upload is pending
  useEffect(() => {
    if (fileQueue.length > 0 && !isPending && !currentUploadingFile) {
      processNextFile();
    } else if (fileQueue.length === 0 && totalFilesQueued > 0 && !isPending && !currentUploadingFile) {
      // This condition means all files are processed (queue empty, but total was > 0)
      // and no action is currently pending and currentUploadingFile is cleared.
      // Toast for completion is handled by processNextFile when it initially finds the queue empty after processing all.
      resetUploaderVisualState(true);
    }
  }, [fileQueue, isPending, currentUploadingFile, processNextFile, totalFilesQueued, resetUploaderVisualState]);


  const handleFilesSelected = useCallback((files: FileList | null) => {
    if (!files || files.length === 0) return;
    if (isPending && fileQueue.length > 0) { // An upload sequence is already in progress
        toast({ variant: 'default', title: 'Upload in Progress', description: 'Please wait for the current batch to complete before adding more files.' });
        return;
    }


    if (!user) {
      toast({ variant: 'destructive', title: 'Authentication Required', description: 'Please login to upload images.' });
      resetUploaderVisualState(true);
      return;
    }
    
    const newValidFiles: File[] = [];
    const rejectedFiles: {name: string, reason: string}[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
        rejectedFiles.push({name: file.name, reason: `Invalid file type. Accepted: JPG, PNG, GIF, WebP. Provided: ${file.type || 'unknown'}`});
        continue;
      }
      if (file.size > CLIENT_MAX_FILE_SIZE_MB * 1024 * 1024) {
        rejectedFiles.push({name: file.name, reason: `File too large (${(file.size / (1024 * 1024)).toFixed(2)}MB). Max allowed: ${CLIENT_MAX_FILE_SIZE_MB}MB per file.`});
        continue;
      }
      newValidFiles.push(file);
    }

    if (rejectedFiles.length > 0) {
        const rejectedMessages = rejectedFiles.map(rf => `${rf.name}: ${rf.reason}`).join('\n');
        toast({
            variant: 'destructive',
            title: `${rejectedFiles.length} File(s) Rejected`,
            description: <pre className="mt-2 w-full rounded-md bg-slate-950 p-4"><code className="text-white text-xs">{rejectedMessages}</code></pre>,
            duration: 10000,
        });
    }

    if (newValidFiles.length > 0) {
      setFileQueue(prevQueue => [...prevQueue, ...newValidFiles]);
      setTotalFilesQueued(prevTotal => prevTotal + newValidFiles.length);
      if (!isPending && !currentUploadingFile) { // If not already uploading, start the process
        // processNextFile(); // This will be triggered by the useEffect watching fileQueue
      }
    } else if (rejectedFiles.length > 0 && newValidFiles.length === 0) {
      // All files were rejected, reset input if needed
       if (fileInputRef.current) fileInputRef.current.value = '';
    }

  }, [isPending, user, toast, resetUploaderVisualState, currentUploadingFile, fileQueue.length]);


  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault(); e.stopPropagation();
    if (isPending || !user || authLoading) return;
    setIsDragging(true);
  };
  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault(); e.stopPropagation();
    setIsDragging(false);
  };
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault(); e.stopPropagation();
    if (isPending || !user || authLoading) return;
    if (!isDragging) setIsDragging(true);
  };
  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault(); e.stopPropagation();
    setIsDragging(false);
    if (isPending || !user || authLoading) return;
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFilesSelected(e.dataTransfer.files);
      e.dataTransfer.clearData();
    }
  };
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleFilesSelected(e.target.files);
  };
  const triggerFileInput = () => {
    if ((isPending && fileQueue.length > 0) || !user || authLoading) return;
    fileInputRef.current?.click();
  };

  useEffect(() => {
    const currentPreview = currentPreviewSrc; // Changed from localPreviewSrc
    return () => { if (currentPreview && currentPreview.startsWith('blob:')) URL.revokeObjectURL(currentPreview); };
  }, [currentPreviewSrc]);

  if (authLoading) {
    return (
      <Card className="shadow-xl"><CardHeader><CardTitle className="text-center text-xl">Upload Your Image(s)</CardTitle></CardHeader>
        <CardContent className="flex flex-col items-center justify-center p-8">
          <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" /><p>Verifying authentication...</p>
        </CardContent>
      </Card>
    );
  }
  if (!user) {
    return (
      <Card className="shadow-xl hover:shadow-2xl transition-shadow duration-300">
        <CardHeader><CardTitle className="text-center text-xl">Login to Upload</CardTitle><CardDescription className="text-center">Please login to upload and manage your images.</CardDescription></CardHeader>
        <CardContent className="flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-lg">
            <UserX className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-lg font-semibold text-foreground">Authentication Required</p>
            <p className="text-sm text-muted-foreground">You need to be logged in to upload images.</p>
            <Button asChild className="mt-4"><Link href="/login">Go to Login</Link></Button>
        </CardContent>
      </Card>
    )
  }
  
  const effectivePending = isPending || (fileQueue.length > 0 && !!currentUploadingFile);

  return (
    <Card className="shadow-xl hover:shadow-2xl transition-shadow duration-300">
      <CardHeader>
        <CardTitle className="text-center text-xl">Upload Image(s){currentFolderName && ` to "${currentFolderName}"`}</CardTitle>
        <CardDescription className="text-center">Drag & drop or click to select files. Max {CLIENT_MAX_FILE_SIZE_MB}MB per file.</CardDescription>
      </CardHeader>
      <CardContent>
        <div
          onDragEnter={handleDragEnter} onDragLeave={handleDragLeave} onDragOver={handleDragOver} onDrop={handleDrop} onClick={triggerFileInput}
          className={cn('flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-lg cursor-pointer transition-colors duration-200 ease-in-out',
            isDragging ? 'border-primary bg-accent/10' : 'border-border hover:border-primary/70',
            effectivePending ? 'cursor-default opacity-70' : ''
          )}
          role="button" aria-label="Image upload area" tabIndex={effectivePending ? -1 : 0}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if(!effectivePending) triggerFileInput(); }}}
        >
          <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" disabled={effectivePending} name="image" accept={ACCEPTED_IMAGE_TYPES.join(',')} multiple />
          {effectivePending ? (
            <div className="flex flex-col items-center text-center w-full">
              <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
              <p className="text-lg font-medium text-foreground">
                {totalFilesQueued > 1 ? `Uploading file ${completedFilesCount + 1} of ${totalFilesQueued}` : 'Uploading...'}
              </p>
              {currentUploadingFile && <p className="text-sm text-muted-foreground truncate max-w-xs">{currentUploadingFile.name}</p>}
              <Progress value={uploadProgress} className="w-full mt-2 h-2" />
              <p className="text-sm text-muted-foreground mt-1">{uploadProgress > 0 ? `${uploadProgress}%` : 'Processing...'}</p>
            </div>
          ) : currentPreviewSrc && currentUploadingFile ? ( // Should be currentPreviewSrc && currentUploadingFile based on how processNextFile sets them
            <div className="flex flex-col items-center text-center">
              <Image src={currentPreviewSrc} alt="Image preview" width={150} height={150} className="rounded-md object-contain max-h-[150px] mb-4 shadow-md" data-ai-hint="upload preview" />
              <p className="text-sm text-muted-foreground">{currentUploadingFile.name}</p>
              <p className="text-sm text-muted-foreground">Click or drag another file to replace.</p>
            </div>
          ) : (
            <div className="flex flex-col items-center text-center pointer-events-none">
              {fileQueue.length > 0 ? <ListChecks className="h-12 w-12 text-green-500 mb-4" /> : <UploadCloud className="h-12 w-12 text-primary mb-4" />}
              <p className="text-lg font-semibold text-foreground">
                {fileQueue.length > 0 ? `${fileQueue.length} file(s) queued. Drop more or click to add.` : 'Drop images here or click to browse'}
              </p>
              <p className="text-sm text-muted-foreground">Supports JPG, PNG, GIF, WebP. Max {CLIENT_MAX_FILE_SIZE_MB}MB per file.</p>
            </div>
          )}
        </div>
        {!effectivePending && !currentPreviewSrc && ( // Show select button if not uploading and no preview (i.e. after queue finishes or initially)
          <Button onClick={triggerFileInput} className="w-full mt-6" variant="default" size="lg" disabled={effectivePending}>
            <UploadCloud className="mr-2 h-5 w-5" /> Select Image(s)
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

