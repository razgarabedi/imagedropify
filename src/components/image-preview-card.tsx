// src/components/image-preview-card.tsx
"use client";

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import { Copy, Check } from 'lucide-react';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface ImagePreviewCardProps {
  src: string; // This is the same as url, used for Image component
  url: string; // Relative server URL e.g., /uploads/MM.YYYY/filename.jpg
  name: string; // Original file name
}

export function ImagePreviewCard({ src, url, name }: ImagePreviewCardProps) {
  const { toast } = useToast();
  const [isCopied, setIsCopied] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [fullUrl, setFullUrl] = useState('');

  useEffect(() => {
    // Trigger fade-in animation
    const timer = setTimeout(() => setIsVisible(true), 50); // Slight delay for animation
    
    // Construct full URL on client-side
    if (typeof window !== 'undefined') {
      setFullUrl(`${window.location.origin}${url}`);
    } else {
      // Fallback for SSR or if window is not available, though copy won't work here
      setFullUrl(url); 
    }
    
    return () => clearTimeout(timer);
  }, [url]);


  const handleCopyUrl = async () => {
    if (!fullUrl) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Full URL not available yet.',
      });
      return;
    }
    try {
      await navigator.clipboard.writeText(fullUrl);
      toast({
        title: 'URL Copied!',
        description: 'The image URL has been copied to your clipboard.',
      });
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000); // Reset icon after 2 seconds
    } catch (err) {
      console.error('Failed to copy URL:', err);
      toast({
        variant: 'destructive',
        title: 'Copy Failed',
        description: 'Could not copy the URL. Please try again manually.',
      });
    }
  };

  return (
    <Card className={cn(
        "shadow-lg hover:shadow-xl transition-all duration-300 ease-in-out transform hover:-translate-y-1",
        "opacity-0 animate-in fade-in-0 zoom-in-95 duration-500 fill-mode-forwards",
        isVisible ? "opacity-100" : ""
      )}
    >
      <CardHeader className="p-4">
        <CardTitle className="text-base font-semibold truncate" title={name}>{name}</CardTitle>
      </CardHeader>
      <CardContent className="p-0 aspect-[4/3] relative overflow-hidden group">
        <Image
          src={src} // src should be the relative path for the Image component
          alt={`Preview of ${name}`}
          layout="fill"
          objectFit="cover"
          className="transition-transform duration-300 group-hover:scale-105"
          data-ai-hint="uploaded image"
        />
      </CardContent>
      <CardFooter className="p-4 flex-col items-start space-y-2">
        <div className="flex w-full space-x-2">
          <Input 
            type="text" 
            value={fullUrl || 'Loading URL...'} // Display the full URL
            readOnly 
            className="text-sm flex-grow min-w-0" 
            aria-label="Image URL"
          />
          <Button 
            variant="outline" 
            size="icon" 
            onClick={handleCopyUrl} 
            aria-label="Copy URL"
            disabled={!fullUrl} // Disable button if fullUrl is not ready
          >
            {isCopied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">Relative path: {url}</p>
      </CardFooter>
    </Card>
  );
}
