
// src/app/my-images/page.tsx
"use client";

import React, { useState, useCallback, useEffect, useActionState, startTransition, useMemo } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { ImagePreviewCard } from '@/components/image-preview-card';
import { ThemeToggle } from '@/components/theme-toggle';
import { 
    getUserImages, 
    type UserImageData, 
    createFolderAction, 
    listUserFolders,
    type UserFolder,
    type FolderActionResponse as ImageFolderActionResponse 
} from '@/app/actions/imageActions';
import { 
    createShareLinkAction, 
    revokeShareLinkAction, 
    getActiveShareLinkForFolder,
    type ShareActionResponse 
} from '@/app/actions/shareActions';
import { DEFAULT_FOLDER_NAME } from '@/lib/imageConfig';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { useAuth } from '@/hooks/use-auth';
import { AuthButton } from '@/components/auth-button';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { GalleryVerticalEnd, Loader2, FolderPlus, Folder as FolderIcon, Share2, Link2, Copy, Trash2, Check } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface DisplayImage {
  id: string; 
  name: string; 
  previewSrc: string; 
  url: string; 
  uploaderId: string; 
  folderName: string;
  originalName: string; 
}

const initialImageFolderActionState: ImageFolderActionResponse = { success: false };
const initialShareActionState: ShareActionResponse = { success: false };

export default function MyImagesPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const { toast } = useToast();

  const [userImages, setUserImages] = useState<DisplayImage[]>([]);
  const [isLoadingImages, setIsLoadingImages] = useState(true);
  const [userFolders, setUserFolders] = useState<UserFolder[]>([{ name: DEFAULT_FOLDER_NAME }]);
  const [currentFolder, setCurrentFolder] = useState<string>(DEFAULT_FOLDER_NAME);
  const [newFolderName, setNewFolderName] = useState('');
  const [activeShareUrl, setActiveShareUrl] = useState<string | null>(null);
  const [isShareUrlCopied, setIsShareUrlCopied] = useState(false);
  
  const [createFolderState, createFolderFormAction, isCreateFolderPending] = useActionState(createFolderAction, initialImageFolderActionState);
  const [createShareLinkState, createShareLinkFormAction, isCreateShareLinkPending] = useActionState(createShareLinkAction, initialShareActionState);
  const [revokeShareLinkState, revokeShareLinkFormAction, isRevokeShareLinkPending] = useActionState(revokeShareLinkAction, initialShareActionState);

  const fetchUserFolders = useCallback(async () => {
    if (!user && !authLoading) {
        setUserFolders([{ name: DEFAULT_FOLDER_NAME }]);
        setCurrentFolder(DEFAULT_FOLDER_NAME);
        return;
    }
    if (!user) return; 

    try {
      const folders = await listUserFolders(user.id);
      setUserFolders(folders.length > 0 ? folders : [{ name: DEFAULT_FOLDER_NAME }]);
      if (!folders.some(f => f.name === currentFolder) && folders.length > 0) {
          setCurrentFolder(DEFAULT_FOLDER_NAME);
      } else if (folders.length === 0) {
          setCurrentFolder(DEFAULT_FOLDER_NAME);
      }
    } catch (error) {
      console.error("Failed to fetch user folders:", error);
      toast({ variant: 'destructive', title: 'Error', description: 'Could not load your folders.' });
      setUserFolders([{ name: DEFAULT_FOLDER_NAME }]);
      setCurrentFolder(DEFAULT_FOLDER_NAME);
    }
  }, [user, authLoading, toast, currentFolder]);

  const fetchActiveShareLink = useCallback(async (folderName: string) => {
    if (!user || !folderName) {
        setActiveShareUrl(null);
        return;
    }
    const response = await getActiveShareLinkForFolder(folderName);
    if (response.success && response.shareUrl) {
        setActiveShareUrl(window.location.origin + response.shareUrl);
    } else {
        setActiveShareUrl(null);
    }
  }, [user]);


  const fetchImagesForCurrentFolder = useCallback(async () => {
    if (!user || !currentFolder) {
      setUserImages([]);
      setIsLoadingImages(false);
      return;
    }
    setIsLoadingImages(true);
    try {
      const imagesFromServer: UserImageData[] = await getUserImages(user.id, undefined, currentFolder);
      const displayImages: DisplayImage[] = imagesFromServer.map(img => ({
        id: img.id, 
        name: img.name, 
        previewSrc: img.url, 
        url: img.url, 
        uploaderId: img.userId,
        folderName: img.folderName,
        originalName: img.originalName,
      }));
      setUserImages(displayImages);
      fetchActiveShareLink(currentFolder);
    } catch (error) {
      console.error("Failed to fetch user images for folder:", currentFolder, error);
      setUserImages([]);
      toast({ variant: 'destructive', title: 'Error', description: `Could not load images for folder ${currentFolder}.` });
    } finally {
      setIsLoadingImages(false);
    }
  }, [user, currentFolder, toast, fetchActiveShareLink]);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login?message=Please login to view your images.');
    } else if (!authLoading && user) {
      fetchUserFolders();
    }
  }, [user, authLoading, router, fetchUserFolders]);

  useEffect(() => {
    if (user && !authLoading && currentFolder) {
      fetchImagesForCurrentFolder();
    }
  }, [user, authLoading, currentFolder, fetchImagesForCurrentFolder]);
  
  useEffect(() => {
    if (!isCreateFolderPending) {
        if (createFolderState.success && createFolderState.folderName) {
            toast({ title: 'Folder Created', description: `Folder "${createFolderState.folderName}" created successfully.` });
            setNewFolderName('');
            fetchUserFolders().then(() => {
                 setCurrentFolder(createFolderState.folderName!); 
            });
        } else if (createFolderState.error) {
            toast({ variant: 'destructive', title: 'Create Folder Failed', description: createFolderState.error });
        }
    }
  }, [createFolderState, isCreateFolderPending, toast, fetchUserFolders]);

  useEffect(() => {
    if (!isCreateShareLinkPending) {
        if (createShareLinkState.success && createShareLinkState.shareUrl) {
            setActiveShareUrl(window.location.origin + createShareLinkState.shareUrl);
            toast({ title: 'Share Link Created!', description: 'Folder is now shareable.' });
        } else if (createShareLinkState.error) {
            toast({ variant: 'destructive', title: 'Share Failed', description: createShareLinkState.error });
        }
    }
  }, [createShareLinkState, isCreateShareLinkPending, toast]);

  useEffect(() => {
    if (!isRevokeShareLinkPending) {
        if (revokeShareLinkState.success) {
            setActiveShareUrl(null);
            toast({ title: 'Share Link Revoked', description: 'Folder is no longer shared.' });
        } else if (revokeShareLinkState.error) {
            toast({ variant: 'destructive', title: 'Revoke Failed', description: revokeShareLinkState.error });
        }
    }
  }, [revokeShareLinkState, isRevokeShareLinkPending, toast]);


  const handleCreateFolderSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!newFolderName.trim()) {
        toast({ variant: 'destructive', title: 'Error', description: 'Folder name cannot be empty.'});
        return;
    }
    const formData = new FormData();
    formData.append('newFolderName', newFolderName.trim());
    startTransition(() => {
        createFolderFormAction(formData);
    });
  };

  const handleCreateShareLink = () => {
    if (!currentFolder) return;
    const formData = new FormData();
    formData.append('folderName', currentFolder);
    startTransition(() => {
        createShareLinkFormAction(formData);
    });
  };

  const handleRevokeShareLink = () => {
    if (!currentFolder) return;
    const formData = new FormData();
    formData.append('folderName', currentFolder);
    startTransition(() => {
        revokeShareLinkFormAction(formData);
    });
  };

  const handleCopyShareUrl = async () => {
    if (!activeShareUrl) return;
    try {
      await navigator.clipboard.writeText(activeShareUrl);
      toast({ title: 'Share URL Copied!'});
      setIsShareUrlCopied(true);
      setTimeout(() => setIsShareUrlCopied(false), 2000);
    } catch (err) {
      toast({ variant: 'destructive', title: 'Copy Failed', description: 'Could not copy URL.' });
    }
  };

  const handleImageDelete = useCallback((deletedImageDbId: string) => {
    setUserImages((prevImages) => prevImages.filter(image => image.id !== deletedImageDbId));
  }, []);

  const handleImageRename = useCallback((oldImageDbId: string, newImageDbId: string, newName: string, newUrl: string) => {
    setUserImages((prevImages) =>
      prevImages.map(image =>
        image.id === oldImageDbId
          ? { ...image, name: newName, url: newUrl, previewSrc: newUrl }
          : image
      )
    );
  }, []);
  
  const uniqueKeyForSkeletons = useMemo(() => Math.random(), []);

  if (authLoading || (!user && !authLoading) ) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="mt-4 text-muted-foreground">Loading your space...</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-2">
            <Image src="https://placehold.co/40x40.png" alt="ImageDrop Logo" width={32} height={32} className="rounded-md" data-ai-hint="logo abstract" />
            <h1 className="text-2xl font-bold text-primary">ImageDrop</h1>
          </Link>
          <div className="flex items-center gap-4">
            <ThemeToggle />
            <AuthButton />
          </div>
        </div>
      </header>

      <main className="flex-grow container mx-auto px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8 text-center">
          <h2 className="text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
            My Uploaded Images
          </h2>
        </div>

        <Card className="mb-8 shadow-md">
          <CardHeader>
            <CardContent className="flex flex-col sm:flex-row gap-4 items-start justify-between p-4">
                <div className="flex flex-col gap-4 w-full sm:w-auto">
                    <div className="flex-grow w-full sm:w-auto">
                        <Label htmlFor="folder-select" className="mb-1 block text-sm font-medium">Select Folder</Label>
                        <Select value={currentFolder} onValueChange={setCurrentFolder} disabled={userFolders.length === 0}>
                            <SelectTrigger id="folder-select" className="w-full sm:w-[250px]">
                                <SelectValue placeholder="Select a folder" />
                            </SelectTrigger>
                            <SelectContent>
                                {userFolders.map(folder => (
                                    <SelectItem key={folder.name} value={folder.name}>
                                        <div className="flex items-center gap-2">
                                            <FolderIcon className="h-4 w-4" />
                                            {folder.name}
                                        </div>
                                    </SelectItem>
                                ))}
                                {userFolders.length === 0 && <SelectItem value={DEFAULT_FOLDER_NAME} disabled>{DEFAULT_FOLDER_NAME}</SelectItem>}
                            </SelectContent>
                        </Select>
                    </div>
                    <form onSubmit={handleCreateFolderSubmit} className="flex gap-2 w-full sm:w-auto items-end">
                        <div className="flex-grow">
                            <Label htmlFor="newFolderName" className="mb-1 block text-sm font-medium">Create New Folder</Label>
                            <Input 
                                id="newFolderName"
                                type="text"
                                placeholder="New folder name"
                                value={newFolderName}
                                onChange={(e) => setNewFolderName(e.target.value)}
                                className="flex-grow"
                                disabled={isCreateFolderPending}
                            />
                        </div>
                        <Button type="submit" disabled={isCreateFolderPending || !newFolderName.trim()}>
                            {isCreateFolderPending ? <Loader2 className="h-4 w-4 animate-spin mr-2"/> : <FolderPlus className="h-4 w-4 mr-2"/>}
                            Create
                        </Button>
                    </form>
                </div>

                {currentFolder && currentFolder !== DEFAULT_FOLDER_NAME && (
                  <div className="mt-4 sm:mt-0 w-full sm:w-auto sm:max-w-md">
                    <h3 className="text-md font-semibold mb-2">Share Folder: &quot;{currentFolder}&quot;</h3>
                    {activeShareUrl ? (
                      <div className="space-y-2">
                        <Label htmlFor="activeShareUrl">Shareable Link:</Label>
                        <div className="flex gap-2">
                          <Input id="activeShareUrl" type="text" value={activeShareUrl} readOnly className="flex-grow"/>
                          <Button variant="outline" size="icon" onClick={handleCopyShareUrl} disabled={isShareUrlCopied}>
                            {isShareUrlCopied ? <Check className="h-4 w-4 text-green-500"/> : <Copy className="h-4 w-4"/>}
                          </Button>
                        </div>
                        <Button variant="destructive" onClick={handleRevokeShareLink} disabled={isRevokeShareLinkPending} className="w-full">
                          {isRevokeShareLinkPending ? <Loader2 className="h-4 w-4 animate-spin mr-2"/> : <Trash2 className="h-4 w-4 mr-2"/>}
                          Revoke Share Link
                        </Button>
                        {revokeShareLinkState.error && <p className="text-sm text-destructive">{revokeShareLinkState.error}</p>}
                      </div>
                    ) : (
                      <div>
                        <Button onClick={handleCreateShareLink} disabled={isCreateShareLinkPending} className="w-full">
                          {isCreateShareLinkPending ? <Loader2 className="h-4 w-4 animate-spin mr-2"/> : <Share2 className="h-4 w-4 mr-2"/>}
                          Create Share Link
                        </Button>
                        {createShareLinkState.error && <p className="text-sm text-destructive mt-1">{createShareLinkState.error}</p>}
                         <p className="text-xs text-muted-foreground mt-1">Generates a public link to view this folder's contents.</p>
                      </div>
                    )}
                  </div>
                )}
                 {currentFolder && currentFolder === DEFAULT_FOLDER_NAME && (
                    <div className="mt-4 sm:mt-0 text-sm text-muted-foreground w-full sm:w-auto sm:max-w-md">
                        <p>The &quot;{DEFAULT_FOLDER_NAME}&quot; folder cannot be shared directly. Create a custom folder to share its contents.</p>
                    </div>
                )}
            </CardContent>
          </CardHeader>
        </Card>
        
        <p className="mt-1 mb-6 text-lg text-muted-foreground text-center">
            Viewing images in folder: <span className="font-semibold text-primary">{currentFolder}</span>
        </p>
        
        <Separator className="my-8" />

        {isLoadingImages ? (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {Array.from({ length: 10 }).map((_, index) => (
              <Card key={`skeleton-myimages-${index}-${uniqueKeyForSkeletons}`} className="shadow-lg">
                <CardHeader className="p-4"><Skeleton className="h-5 w-3/4" /></CardHeader>
                <CardContent className="p-0 aspect-[4/3] relative overflow-hidden"><Skeleton className="h-full w-full" /></CardContent>
                <CardFooter className="p-4 flex-col items-start space-y-2"><Skeleton className="h-8 w-full" /><Skeleton className="h-4 w-1/2" /></CardFooter>
              </Card>
            ))}
          </div>
        ) : userImages.length === 0 ? (
          <div className="text-center py-16">
            <GalleryVerticalEnd className="mx-auto h-24 w-24 text-muted-foreground opacity-50 mb-6" />
            <p className="text-muted-foreground text-xl mb-4">No images found in &quot;{currentFolder}&quot;.</p>
            <p className="text-muted-foreground text-md mb-8">Upload images to this folder using the homepage.</p>
            <Button asChild><Link href="/">Go to Upload</Link></Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
             {userImages.filter(image => image && typeof image.id === 'string' && image.id.trim() !== '').map((image) => (
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
              />
            ))}
          </div>
        )}
      </main>

      <footer className="py-8 text-center text-muted-foreground border-t mt-12">
        <p>&copy; {new Date().getFullYear()} ImageDrop. All rights reserved.</p>
      </footer>
    </div>
  );
}
