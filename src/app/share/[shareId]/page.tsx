
// src/app/share/[shareId]/page.tsx

import { getSharedFolderInfoAction, type ShareActionResponse } from '@/app/actions/shareActions';
import { getUserImages, type UserImage } from '@/app/actions/imageActions';
import Image from 'next/image';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle, GalleryVerticalEnd } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';

interface SharedPageProps {
  params: {
    shareId: string;
  };
}

export default async function SharedFolderPage({ params }: SharedPageProps) {
  const { shareId } = params;

  const shareInfoResponse: ShareActionResponse = await getSharedFolderInfoAction(shareId);

  if (!shareInfoResponse.success || !shareInfoResponse.folderInfo) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background p-4 text-center">
        <AlertTriangle className="w-16 h-16 text-destructive mb-4" />
        <h1 className="text-2xl font-bold text-destructive mb-2">Share Link Invalid or Expired</h1>
        <p className="text-muted-foreground mb-6">
          {shareInfoResponse.error || "This share link is no longer valid or the folder doesn't exist."}
        </p>
        <Button asChild variant="outline">
          <Link href="/">Go to Homepage</Link>
        </Button>
      </div>
    );
  }

  const { userId, folderName } = shareInfoResponse.folderInfo;
  const images: UserImage[] = await getUserImages(userId, undefined, folderName);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-2">
             <Image src="https://placehold.co/40x40.png" alt="ImageDrop Logo" width={32} height={32} className="rounded-md" data-ai-hint="logo abstract"/>
            <h1 className="text-2xl font-bold text-primary">ImageDrop</h1>
          </Link>
           <Button asChild variant="outline" size="sm">
            <Link href="/">Back to ImageDrop</Link>
          </Button>
        </div>
      </header>

      <main className="flex-grow container mx-auto px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8 text-center">
          <h2 className="text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
            Shared Folder: <span className="text-primary">{folderName}</span>
          </h2>
          <p className="text-muted-foreground mt-2">Content shared with you.</p>
        </div>
        <Separator className="my-8" />

        {images.length === 0 ? (
          <div className="text-center py-16">
            <GalleryVerticalEnd className="mx-auto h-24 w-24 text-muted-foreground opacity-50 mb-6" />
            <p className="text-muted-foreground text-xl mb-4">This shared folder is currently empty.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {images.map((image) => (
              <Card key={image.id} className="shadow-lg overflow-hidden">
                <CardHeader className="p-0">
                  <div className="aspect-[4/3] relative w-full">
                    <Image
                      src={image.url}
                      alt={`Image: ${image.name}`}
                      fill
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                      style={{ objectFit: "cover" }}
                      className="transition-transform duration-300 hover:scale-105"
                      data-ai-hint="shared image"
                    />
                  </div>
                </CardHeader>
                <CardContent className="p-3">
                  <CardTitle className="text-sm font-medium truncate" title={image.name}>
                    {image.name}
                  </CardTitle>
                  {/* Link to direct image URL for easy saving/viewing */}
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
        )}
      </main>

      <footer className="py-8 text-center text-muted-foreground border-t mt-12">
        <p>Powered by ImageDrop. <Link href="/" className="hover:underline text-primary">Create your own shares!</Link></p>
      </footer>
    </div>
  );
}
