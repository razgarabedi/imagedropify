
// src/components/image-preview-card.tsx
"use client";

import React, { useState, useEffect, useActionState, startTransition } from 'react';
import Image from 'next/image';
import { Copy, Check, Trash2, Loader2, FilePenLine } from 'lucide-react';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/use-auth';
import { deleteImage, renameImage, type DeleteImageActionState, type RenameImageActionState } from '@/app/actions/imageActions';
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
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";
import { Label } from '@/components/ui/label';

interface ImagePreviewCardProps {
  id: string; // Database ID (UUID)
  src: string; // Full public URL for display
  url: string; // Full public URL for display/copy (same as src for this component)
  name: string; // filename on disk (e.g., uniqueId-sanitizedName.ext)
  uploaderId: string; // userId from the image record
  originalName: string; // Original filename from upload
  onDelete?: (imageDbId: string) => void;
  onRename?: (oldImageDbId: string, newImageDbId: string, newName: string, newUrl: string) => void;
}

const initialDeleteState: DeleteImageActionState = { success: false };
const initialRenameState: RenameImageActionState = { success: false };

export function ImagePreviewCard({ id, src, url, name, uploaderId, originalName, onDelete, onRename }: ImagePreviewCardProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [isCopied, setIsCopied] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [fullUrl, setFullUrl] = useState('');
  
  const [isRenameDialogOpen, setIsRenameDialogOpen] = useState(false);
  // Initialize newNameInput with the current name without extension from the 'name' prop (which is filename on disk)
  const [newNameInput, setNewNameInput] = useState(name.substring(0, name.lastIndexOf('.')));

  useEffect(() => {
    // Update newNameInput if the 'name' prop changes (e.g., after a successful rename)
    setNewNameInput(name.substring(0, name.lastIndexOf('.')));
  }, [name]);

  const [deleteActionState, deleteFormAction, isDeletePending] = useActionState(deleteImage, initialDeleteState);
  const [renameActionState, renameFormAction, isRenamePending] = useActionState(renameImage, initialRenameState);

  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), 50);
    // The 'url' prop is already the full public URL
    setFullUrl(url); 
    return () => clearTimeout(timer);
  }, [url]);

  useEffect(() => {
    if (!isDeletePending && deleteActionState.success && deleteActionState.deletedImageId) {
        toast({ title: 'Image Deleted', description: `${originalName} has been successfully deleted.` });
        if (onDelete) onDelete(deleteActionState.deletedImageId); 
    } else if (!isDeletePending && deleteActionState.error) {
        toast({ variant: 'destructive', title: 'Delete Failed', description: deleteActionState.error });
    }
  }, [deleteActionState, isDeletePending, toast, originalName, onDelete]);

  useEffect(() => {
    if (!isRenamePending && renameActionState.success && renameActionState.data) {
      toast({ title: 'Image Renamed', description: `Renamed to "${renameActionState.data.newName}".` });
      // id (db id) doesn't change, newName is new filename, newUrl is new full URL
      if (onRename) onRename(id, renameActionState.data.newId, renameActionState.data.newName, renameActionState.data.newUrl);
      setIsRenameDialogOpen(false); 
    } else if (!isRenamePending && renameActionState.error) {
      toast({ variant: 'destructive', title: 'Rename Failed', description: renameActionState.error });
    }
  }, [renameActionState, isRenamePending, toast, id, onRename, name]);


  const handleCopyUrl = async () => {
    if (!fullUrl) { toast({ variant: 'destructive', title: 'Error', description: 'Full URL not available.' }); return; }
    try {
      await navigator.clipboard.writeText(fullUrl);
      toast({ title: 'URL Copied!', description: 'Image URL copied to clipboard.' });
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000); 
    } catch (err) {
      toast({ variant: 'destructive', title: 'Copy Failed', description: 'Could not copy URL.' });
    }
  };

  const handleDelete = () => {
    // deleteImage action now takes the database ID directly
    startTransition(() => {
        deleteFormAction(id); 
    });
  };

  const handleRenameSubmit = () => {
    if (!newNameInput.trim()) {
        toast({ variant: 'destructive', title: 'Invalid Name', description: 'New name cannot be empty.' });
        return;
    }
    const formData = new FormData();
    formData.append('currentImageId', id); // Pass the database ID
    formData.append('newNameWithoutExtension', newNameInput.trim());
    startTransition(() => {
        renameFormAction(formData);
    });
  };

  const canModify = user && uploaderId === user.id;

  return (
    <Card className={cn(
        "shadow-lg hover:shadow-xl transition-all duration-300 ease-in-out transform hover:-translate-y-1",
        "opacity-0 animate-in fade-in-0 zoom-in-95 duration-500 fill-mode-forwards",
        isVisible ? "opacity-100" : ""
      )}
    >
      <CardHeader className="p-4 flex flex-row justify-between items-start">
        <CardTitle className="text-base font-semibold truncate mr-2" title={name}>{name}</CardTitle>
        {canModify && (
          <div className="flex items-center space-x-1">
            <Dialog open={isRenameDialogOpen} onOpenChange={(open) => {
              setIsRenameDialogOpen(open);
              if (open) { // Reset input when dialog opens
                setNewNameInput(name.substring(0, name.lastIndexOf('.')));
              }
            }}>
              <DialogTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary" disabled={isRenamePending || isDeletePending}>
                  <FilePenLine className="h-4 w-4" />
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Rename Image</DialogTitle>
                  <DialogDescription>Enter new name for &quot;{originalName}&quot;. Extension will be preserved.</DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="newName" className="text-right">New Name</Label>
                    <Input id="newName" value={newNameInput} onChange={(e) => setNewNameInput(e.target.value)} className="col-span-3" placeholder="Enter new name" disabled={isRenamePending} />
                  </div>
                </div>
                 {renameActionState.error && !isRenamePending && <p className="text-sm text-destructive px-6 -mt-2">{renameActionState.error}</p>}
                <DialogFooter>
                  <DialogClose asChild><Button variant="outline" disabled={isRenamePending}>Cancel</Button></DialogClose>
                  <Button onClick={handleRenameSubmit} disabled={isRenamePending || !newNameInput.trim()}>
                    {isRenamePending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {isRenamePending ? 'Renaming...' : 'Save Name'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" disabled={isDeletePending || isRenamePending}>
                  {isDeletePending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                  <AlertDialogDescription>Permanently delete &quot;{originalName}&quot;?</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={isDeletePending}>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDelete} disabled={isDeletePending} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                    {isDeletePending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {isDeletePending ? 'Deleting...' : 'Delete'}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}
      </CardHeader>
      <CardContent className="p-0 aspect-[4/3] relative overflow-hidden group">
        <Image
          src={src} alt={`Preview of ${originalName}`} fill sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          style={{objectFit: "cover"}} className="transition-transform duration-300 group-hover:scale-105"
          data-ai-hint="uploaded image" priority={false} 
        />
      </CardContent>
      <CardFooter className="p-4 flex-col items-start space-y-2">
        <div className="flex w-full space-x-2">
          <Input type="text" value={fullUrl || 'Loading URL...'} readOnly className="text-sm flex-grow min-w-0" aria-label="Image URL" />
          <Button variant="outline" size="icon" onClick={handleCopyUrl} aria-label="Copy URL" disabled={!fullUrl || isCopied} >
            {isCopied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">Original name: {originalName}</p>
      </CardFooter>
    </Card>
  );
}
