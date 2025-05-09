// src/components/image-preview-card.tsx
"use client";

import React, { useState, useEffect, useActionState, startTransition } from 'react';
import Image from 'next/image';
import { Copy, Check, Trash2, Loader2 } from 'lucide-react';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/use-auth';
import { deleteImage } from '@/app/actions/imageActions';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"

interface ImagePreviewCardProps {
  id: string; // Server ID: `userId/MM.YYYY/filename.ext`
  src: string; 
  url: string; // Relative server URL e.g., /uploads/users/userId/MM.YYYY/filename.jpg
  name: string; // Original file name
  uploaderId: string; // The ID of the user who uploaded this image
  onDelete?: (imageId: string) => void; // Callback after successful deletion, passes the server ID
}

const initialDeleteState: { success: boolean; error?: string } = { success: false };

export function ImagePreviewCard({ id, src, url, name, uploaderId, onDelete }: ImagePreviewCardProps) {
  const { toast } = useToast();
  const { user } = useAuth(); // Client-side user from context
  const [isCopied, setIsCopied] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [fullUrl, setFullUrl] = useState('');

  // deleteImage server action gets requestingUserId from session.
  // It needs the imagePathFragment, which is `MM.YYYY/filename.ext`.
  // The `id` prop is `uploaderId/MM.YYYY/filename.ext`.
  const imagePathFragmentForAction = id.substring(id.indexOf('/') + 1);


  const [deleteActionState, deleteFormAction, isDeletePending] = useActionState(
    async (currentState: typeof initialDeleteState, formData: FormData) => {
        // The user object from useAuth() is client-side.
        // The deleteImage server action will verify the session on the server.
        // We just need to pass the correct imagePathFragment.
        const fragment = formData.get('imagePathFragment') as string;
        if (!fragment) return { success: false, error: "Image path fragment is missing."};
        const result = await deleteImage(fragment); 
        return result;
    },
    initialDeleteState
  );

  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), 50);
    if (typeof window !== 'undefined') {
      setFullUrl(`${window.location.origin}${url}`);
    } else {
      setFullUrl(url); 
    }
    return () => clearTimeout(timer);
  }, [url]);

  useEffect(() => {
    if (!isDeletePending && deleteActionState.success) {
        toast({
            title: 'Image Deleted',
            description: `${name} has been successfully deleted.`,
        });
        if (onDelete) {
            onDelete(id); // Notify parent with the full server ID to remove from list
        }
    } else if (!isDeletePending && deleteActionState.error) {
        toast({
            variant: 'destructive',
            title: 'Delete Failed',
            description: deleteActionState.error,
        });
    }
  }, [deleteActionState, isDeletePending, toast, name, id, onDelete]);


  const handleCopyUrl = async () => {
    if (!fullUrl) {
      toast({ variant: 'destructive', title: 'Error', description: 'Full URL not available yet.' });
      return;
    }
    try {
      await navigator.clipboard.writeText(fullUrl);
      toast({ title: 'URL Copied!', description: 'The image URL has been copied to your clipboard.' });
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000); 
    } catch (err) {
      console.error('Failed to copy URL:', err);
      toast({ variant: 'destructive', title: 'Copy Failed', description: 'Could not copy the URL. Please try again manually.' });
    }
  };

  const handleDelete = () => {
    const formData = new FormData();
    formData.append('imagePathFragment', imagePathFragmentForAction);
    startTransition(() => {
        deleteFormAction(formData);
    });
  };

  // Check if the currently logged-in user (from client-side context) is the uploader
  const canDelete = user && uploaderId === user.id;

  return (
    <Card className={cn(
        "shadow-lg hover:shadow-xl transition-all duration-300 ease-in-out transform hover:-translate-y-1",
        "opacity-0 animate-in fade-in-0 zoom-in-95 duration-500 fill-mode-forwards",
        isVisible ? "opacity-100" : ""
      )}
    >
      <CardHeader className="p-4 flex flex-row justify-between items-start">
        <CardTitle className="text-base font-semibold truncate mr-2" title={name}>{name}</CardTitle>
        {canDelete && (
           <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" disabled={isDeletePending}>
                {isDeletePending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                <AlertDialogDescription>
                  This action cannot be undone. This will permanently delete the image
                  "{name}".
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={isDeletePending}>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete} disabled={isDeletePending} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                  {isDeletePending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  {isDeletePending ? 'Deleting...' : 'Delete'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </CardHeader>
      <CardContent className="p-0 aspect-[4/3] relative overflow-hidden group">
        <Image
          src={src} 
          alt={`Preview of ${name}`}
          fill 
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          style={{objectFit: "cover"}}
          className="transition-transform duration-300 group-hover:scale-105"
          data-ai-hint="uploaded image"
          priority={false}
        />
      </CardContent>
      <CardFooter className="p-4 flex-col items-start space-y-2">
        <div className="flex w-full space-x-2">
          <Input 
            type="text" 
            value={fullUrl || 'Loading URL...'} 
            readOnly 
            className="text-sm flex-grow min-w-0" 
            aria-label="Image URL"
          />
          <Button 
            variant="outline" 
            size="icon" 
            onClick={handleCopyUrl} 
            aria-label="Copy URL"
            disabled={!fullUrl || isCopied} 
          >
            {isCopied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">Relative path: {url}</p>
      </CardFooter>
    </Card>
  );
}
