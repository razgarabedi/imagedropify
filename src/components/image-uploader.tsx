
"use client";

import React, { useState, useCallback, useRef, useEffect } from 'react';
import Image from 'next/image';
import { UploadCloud, Loader2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { uploadImageAction, type UploadImageResponse } from '@/app/actions/upload-actions';
import { useFormStatus } from 'react-dom';
import { useActionState } from 'react';

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
const ACCEPTED_IMAGE_MIME_TYPES_STRING = 'image/jpeg,image/png,image/gif,image/webp';
const ACCEPTED_IMAGE_MIME_TYPES_ARRAY = ACCEPTED_IMAGE_MIME_TYPES_STRING.split(',');


export interface UploadedImageFile {
  name: string;
  previewSrc: string; // This will be a data URL for client-side preview
  url: string; // This will be the server URL
}

interface ImageUploaderProps {
  onImageUpload: (imageFile: UploadedImageFile) => void;
}

function UploaderFormFields({ 
  previewSrc, 
  fileName, 
  clientError,
  serverError,
  isDragging,
  handleDragEnter,
  handleDragLeave,
  handleDragOver,
  handleDrop,
  triggerFileInput,
  handleFileChange,
  fileInputRef
} : {
  previewSrc: string | null;
  fileName: string | null;
  clientError: string | null;
  serverError: string | null;
  isDragging: boolean;
  pending?: boolean; // pending is passed from parent, not used internally here as useFormStatus takes over
  handleDragEnter: (e: React.DragEvent<HTMLDivElement>) => void;
  handleDragLeave: (e: React.DragEvent<HTMLDivElement>) => void;
  handleDragOver: (e: React.DragEvent<HTMLDivElement>) => void;
  handleDrop: (e: React.DragEvent<HTMLDivElement>) => void;
  triggerFileInput: () => void;
  handleFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  fileInputRef: React.RefObject<HTMLInputElement>;
}) {
  const { pending: formIsSubmitting } = useFormStatus(); // Get pending state specific to form submission

  return (
    <>
      <div
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onClick={formIsSubmitting ? undefined : triggerFileInput}
        className={cn(
          'flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-lg transition-colors duration-200 ease-in-out',
          isDragging ? 'border-primary bg-accent/10' : 'border-border hover:border-primary/70',
          formIsSubmitting ? 'cursor-default opacity-70' : 'cursor-pointer',
          (clientError || serverError) && 'border-destructive'
        )}
        role="button"
        aria-label="Image upload area"
        tabIndex={formIsSubmitting ? -1 : 0}
        onKeyDown={(e) => { if (e.key === 'Enter' && !formIsSubmitting) triggerFileInput(); }}
      >
        <input
          type="file"
          name="file" // Name attribute is important for FormData
          ref={fileInputRef}
          onChange={handleFileChange}
          accept={ACCEPTED_IMAGE_MIME_TYPES_STRING}
          className="hidden"
          disabled={formIsSubmitting}
        />
        {formIsSubmitting && !previewSrc && ( // Show loader only if submitting without preview (e.g. initial submit button click)
            <div className="flex flex-col items-center text-center w-full">
              <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
              <p className="text-lg font-medium text-foreground">Processing...</p>
            </div>
        )}
        {!formIsSubmitting && previewSrc && !clientError ? (
          <div className="flex flex-col items-center text-center">
            <Image src={previewSrc} alt="Image preview" width={150} height={150} className="rounded-md object-contain max-h-[150px] mb-4 shadow-md" data-ai-hint="image preview" />
            <p className="text-sm text-muted-foreground break-all">{fileName}</p>
            <p className="text-sm text-muted-foreground">Click or drag another file to replace.</p>
          </div>
        ) : !formIsSubmitting ? ( // Only show upload prompt if not submitting
          <div className="flex flex-col items-center text-center pointer-events-none">
            <UploadCloud className="h-12 w-12 text-primary mb-4" />
            <p className="text-lg font-semibold text-foreground">Drop image here or click to browse</p>
            <p className="text-sm text-muted-foreground">Max 10MB. JPG, PNG, GIF, WebP</p>
          </div>
        ) : null}
         {/* If submitting and there's a preview, the preview is shown */}
         {formIsSubmitting && previewSrc && (
            <div className="flex flex-col items-center text-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary my-2" />
                <Image src={previewSrc} alt="Image preview" width={100} height={100} className="rounded-md object-contain max-h-[100px] mb-2 shadow-md opacity-50" data-ai-hint="image preview loading" />
                <p className="text-sm text-muted-foreground">Uploading {fileName}...</p>
            </div>
        )}
      </div>

      {clientError && (
        <div className="p-3 bg-destructive/10 border border-destructive text-destructive text-sm rounded-md flex items-center gap-2">
          <AlertCircle className="h-5 w-5" />
          <p>{clientError}</p>
        </div>
      )}
      
      {serverError && (
        <div className="p-3 bg-destructive/10 border border-destructive text-destructive text-sm rounded-md flex items-center gap-2">
          <AlertCircle className="h-5 w-5" />
          <p>{serverError}</p>
        </div>
      )}

      {previewSrc && !clientError && <SubmitButton />}
      
      {!previewSrc && !formIsSubmitting && !clientError && ( // Don't show "Select Image" if already submitting
          <Button onClick={triggerFileInput} className="w-full mt-6" variant="default" size="lg" type="button" disabled={formIsSubmitting}>
            <UploadCloud className="mr-2 h-5 w-5" /> Select Image
          </Button>
        )}
    </>
  );
}


function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full mt-4" variant="default" size="lg" disabled={pending}>
      {pending ? (
        <>
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Uploading...
        </>
      ) : (
        <>
         <UploadCloud className="mr-2 h-5 w-5" /> Confirm and Upload
        </>
      )}
    </Button>
  );
}


export function ImageUploader({ onImageUpload }: ImageUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [clientError, setClientError] = useState<string | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const { toast } = useToast();

  const initialState: UploadImageResponse = { success: false };
  const [state, formAction] = useActionState(uploadImageAction, initialState);


  const resetClientState = useCallback(() => {
    setPreviewSrc(null);
    setFileName(null);
    setClientError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  useEffect(() => {
    if (state?.success && state.url && state.name && previewSrc) {
      onImageUpload({ name: state.name, previewSrc: previewSrc, url: state.url });
      toast({
        title: 'Image Uploaded!',
        description: `${state.name} is now available. URL: ${state.url}`,
      });
      resetClientState();
      formRef.current?.reset(); 
    } else if (state && !state.success) {
      const errorMsg = state.error || state.errors?._form?.join(', ') || state.errors?.file?.join(', ') || 'Upload failed. Please try again.';
      setClientError(errorMsg); 
      toast({
        variant: 'destructive',
        title: 'Upload Failed',
        description: errorMsg,
      });
    }
  }, [state, onImageUpload, toast, resetClientState, previewSrc]);


  const handleFileSelected = useCallback((file: File | null) => {
    setClientError(null); 
    if (!file) {
      setPreviewSrc(null);
      setFileName(null);
      if (fileInputRef.current) {
          fileInputRef.current.value = ''; 
      }
      return;
    }

    if (!ACCEPTED_IMAGE_MIME_TYPES_ARRAY.includes(file.type)) {
      setClientError(`Invalid file type. Please upload JPG, PNG, GIF, or WebP. You provided: ${file.type}`);
      resetClientState(); 
      return;
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      setClientError(`File too large (max 10MB). Your file is ${(file.size / (1024*1024)).toFixed(2)}MB.`);
      resetClientState();
      return;
    }

    setFileName(file.name);
    const reader = new FileReader();
    reader.onloadend = () => {
      setPreviewSrc(reader.result as string);
    };
    reader.onerror = () => {
      setClientError('Error reading file for preview.');
      resetClientState();
    };
    reader.readAsDataURL(file);
  }, [resetClientState]);

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
    if (!isDragging) setIsDragging(true);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      if (fileInputRef.current) {
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(file);
        fileInputRef.current.files = dataTransfer.files;
      }
      handleFileSelected(file); 
      e.dataTransfer.clearData();
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFileSelected(e.target.files[0]);
    } else {
      handleFileSelected(null); 
    }
  };

  const triggerFileInput = () => {
    setClientError(null);
    fileInputRef.current?.click();
  };
  
  useEffect(() => {
    const currentPreview = previewSrc;
    return () => {
      if (currentPreview && currentPreview.startsWith('blob:')) { // Check if it's a blob URL
        URL.revokeObjectURL(currentPreview);
      } else if (currentPreview && currentPreview.startsWith('data:')) { // Check if it's a data URL
        // Data URLs don't need explicit revocation, but good to be aware
      }
    };
  }, [previewSrc]);

  const serverErrorMsg = state && !state.success ? (state.error || state.errors?._form?.join(', ') || state.errors?.file?.join(', ')) : null;

  return (
    <Card className="shadow-xl hover:shadow-2xl transition-shadow duration-300">
      <CardHeader>
        <CardTitle className="text-center text-xl">Upload Your Image</CardTitle>
        <CardDescription className="text-center">Drag & drop or click to select a file.</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} ref={formRef} className="space-y-4">
          <UploaderFormFields
            previewSrc={previewSrc}
            fileName={fileName}
            clientError={clientError}
            serverError={serverErrorMsg}
            isDragging={isDragging}
            // pending={formStatus.pending} // Pass form status pending if needed by UploaderFormFields
            handleDragEnter={handleDragEnter}
            handleDragLeave={handleDragLeave}
            handleDragOver={handleDragOver}
            handleDrop={handleDrop}
            triggerFileInput={triggerFileInput}
            handleFileChange={handleFileChange}
            fileInputRef={fileInputRef}
          />
        </form>
      </CardContent>
    </Card>
  );
}
