
// src/app/share/[shareId]/page.tsx
"use client"; // Converted to Client Component for pagination state

import React, { useState, useEffect, useCallback } from 'react';
import { getSharedFolderInfoAction, type ShareActionResponse } from '@/app/actions/shareActions';
import { getUserImages, type UserImageData, type PaginatedUserImagesResponse } from '@/app/actions/imageActions';
import Image from 'next/image';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle, GalleryVerticalEnd, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { format } from 'date-fns';
import { ITEMS_PER_PAGE } from '@/lib/imageConfig';
import { ImagePagination } from '@/components/image-pagination';

interface SharedPageProps {
  params: {
    shareId: string;
  };
}

export default function SharedFolderPage({ params }: SharedPageProps) {
  const { shareId } = params;

  const [images, setImages] = useState<UserImageData[]>([]);
  const [folderName, setFolderName] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalImages, setTotalImages] = useState(0);

  const fetchSharedData = useCallback(async (pageToFetch: number) => {
    setIsLoading(true);
    setError(null);

    if (!userId || !folderName) { // Fetch folder info only if not already fetched
        const shareInfoResponse: ShareActionResponse = await getSharedFolderInfoAction(shareId);
        if (!shareInfoResponse.success || !shareInfoResponse.folderInfo) {
            setError(shareInfoResponse.error || "Share link not found or invalid.");
            setIsLoading(false);
            return;
        }
        setUserId(shareInfoResponse.folderInfo.userId);
        setFolderName(shareInfoResponse.folderInfo.folderName);
        // Now userId and folderName are set, proceed to fetch images in the next effect or call
    }
    
    // This block will run if userId and folderName were set in a previous call or just now
    if (userId && folderName) {
        try {
            const imageResponse: PaginatedUserImagesResponse = await getUserImages(userId, {
                page: pageToFetch,
                limit: ITEMS_PER_PAGE,
                targetFolderName: folderName
            });
            setImages(imageResponse.images);
            setTotalPages(imageResponse.totalPages);
            setCurrentPage(imageResponse.currentPage);
            setTotalImages(imageResponse.totalImages);
        } catch (e: any) {
            console.error("Error fetching images for shared folder:", e);
            setError("Could not load images for this shared folder.");
            setImages([]);
            setTotalPages(1);
        }
    }
    setIsLoading(false);
  }, [shareId, userId, folderName]); // Dependencies for fetching shared data

  useEffect(() => {
    // Fetch initial folder info and first page of images
    fetchSharedData(1);
  }, [shareId]); // Only re-run if shareId changes (which it won't after initial load)

  useEffect(() => {
    // Fetch images when currentPage changes, but only if we already have userId and folderName
    if (userId && folderName) {
      fetchSharedData(currentPage);
    }
  }, [currentPage, userId, folderName, fetchSharedData]);


  const handlePageChange = (newPage: number) => {
    setCurrentPage(newPage);
  };

  if (isLoading && images.length === 0 && !error) { // Initial loading state
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background p-4">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="mt-4 text-muted-foreground">Loading shared folder...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background p-4 text-center">
        <AlertTriangle className="w-12 h-12 sm:w-16 sm:h-16 text-destructive mb-4" />
        <h1 className="text-xl sm:text-2xl font-bold text-destructive mb-2">Access Denied</h1>
        <p className="text-sm sm:text-base text-muted-foreground mb-6">{error}</p>
        <Button asChild variant="outline">
          <Link href="/">Go to Homepage</Link>
        </Button>
      </div>
    );
  }
  
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-2">
             <Image src="https://placehold.co/40x40.png" alt="ImageDrop Logo" width={32} height={32} className="rounded-md" data-ai-hint="logo abstract"/>
            <h1 className="text-xl sm:text-2xl font-bold text-primary">ImageDrop</h1>
          </Link>
           <Button asChild variant="outline" size="sm">
            <Link href="/">Back to ImageDrop</Link>
          </Button>
        </div>
      </header>

      <main className="flex-grow container mx-auto px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8 text-center">
          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground md:text-4xl">
            Shared Folder: <span className="text-primary">{folderName || 'Loading...'}</span>
          </h2>
          <p className="text-muted-foreground mt-2 text-sm sm:text-base">Content shared with you.</p>
        </div>
        <Separator className="my-6 md:my-8" />

        {isLoading && images.length === 0 ? (
             <div className="text-center py-10 md:py-16">
                <Loader2 className="mx-auto h-16 sm:h-24 w-16 sm:w-24 text-primary animate-spin mb-4 sm:mb-6" />
                <p className="text-muted-foreground text-lg sm:text-xl mb-4">Loading images...</p>
            </div>
        ) : !isLoading && images.length === 0 ? (
          <div className="text-center py-10 md:py-16">
            <GalleryVerticalEnd className="mx-auto h-16 sm:h-24 w-16 sm:w-24 text-muted-foreground opacity-50 mb-4 sm:mb-6" />
            <p className="text-muted-foreground text-lg sm:text-xl mb-4">This shared folder is currently empty.</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 md:gap-6">
              {images.map((image) => (
                <Card key={image.id} className="shadow-lg overflow-hidden group">
                  <CardHeader className="p-0">
                    <div className="aspect-[4/3] relative w-full">
                      <Image
                        src={image.url}
                        alt={`Image: ${image.originalName}`}
                        fill
                        sizes="(max-width: 640px) 100vw, (max-width: 768px) 50vw, (max-width: 1024px) 33vw, 20vw"
                        style={{ objectFit: "cover" }}
                        className="transition-transform duration-300 group-hover:scale-105"
                        data-ai-hint="shared image"
                        unoptimized={true}
                      />
                    </div>
                  </CardHeader>
                  <CardContent className="p-3">
                    <CardTitle className="text-sm font-medium truncate" title={image.originalName}>
                      {image.originalName}
                    </CardTitle>
                     <p className="text-xs text-muted-foreground">Uploaded: {format(new Date(image.uploadedAt), "MMM d, yyyy")}</p>
                     <a
                      href={image.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-primary hover:underline mt-1 block"
                    >
                      View Full Image
                    </a>
                  </CardContent>
                </Card>
              ))}
            </div>
            <ImagePagination
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={handlePageChange}
              totalImages={totalImages}
              itemsPerPage={ITEMS_PER_PAGE}
            />
          </>
        )}
      </main>

      <footer className="py-8 text-center text-muted-foreground border-t mt-8 md:mt-12">
        <p className="text-sm">Powered by ImageDrop. <Link href="/" className="hover:underline text-primary">Create your own shares!</Link></p>
      </footer>
    </div>
  );
}
