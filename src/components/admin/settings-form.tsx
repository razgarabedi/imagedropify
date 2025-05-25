// src/components/admin/settings-form.tsx
'use client';

import React, { useEffect, useActionState, startTransition, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { 
    updateMaxUploadSizeAction, 
    updateHomepageImageAction,
    type SettingsActionResponse 
} from '@/app/actions/settingsActions';
import { Loader2, Image as ImageIcon } from 'lucide-react';
import { Separator } from '../ui/separator';

interface SettingsFormProps {
  initialMaxUploadSizeMB: number;
  initialHomepageImageUrl: string | null;
}

const initialFormState: SettingsActionResponse = { 
    success: false, 
    currentMaxUploadSizeMB: 0, 
    currentHomepageImageUrl: null 
};

export function SettingsForm({ initialMaxUploadSizeMB, initialHomepageImageUrl }: SettingsFormProps) {
  const { toast } = useToast();
  
  const [currentSize, setCurrentSize] = useState(initialMaxUploadSizeMB);
  const [currentHomepageUrl, setCurrentHomepageUrl] = useState(initialHomepageImageUrl ?? '');


  const [uploadSizeState, uploadSizeFormAction, isUploadSizePending] = useActionState(
    updateMaxUploadSizeAction, 
    { ...initialFormState, currentMaxUploadSizeMB: initialMaxUploadSizeMB, currentHomepageImageUrl: initialHomepageImageUrl }
  );
  const [homepageImageState, homepageImageFormAction, isHomepageImagePending] = useActionState(
    updateHomepageImageAction, 
    { ...initialFormState, currentMaxUploadSizeMB: initialMaxUploadSizeMB, currentHomepageImageUrl: initialHomepageImageUrl }
  );
  
  const isAnyPending = isUploadSizePending || isHomepageImagePending;

  // Effect for upload size updates
  useEffect(() => {
    if (!isUploadSizePending) {
      if (uploadSizeState.success) {
        toast({ title: 'Settings Updated', description: `Maximum upload size is now ${uploadSizeState.currentMaxUploadSizeMB}MB.` });
        if (uploadSizeState.currentMaxUploadSizeMB !== undefined) {
          setCurrentSize(uploadSizeState.currentMaxUploadSizeMB);
        }
        // Update homepage URL display from this state if it changed
        if (uploadSizeState.currentHomepageImageUrl !== undefined) {
            setCurrentHomepageUrl(uploadSizeState.currentHomepageImageUrl ?? '');
        }
      } else if (uploadSizeState.error) {
        toast({ variant: 'destructive', title: 'Upload Size Update Failed', description: uploadSizeState.error });
        if (uploadSizeState.currentMaxUploadSizeMB !== undefined) {
          setCurrentSize(uploadSizeState.currentMaxUploadSizeMB); 
        }
      }
    }
  }, [uploadSizeState, isUploadSizePending, toast]);

  // Effect for homepage image URL updates
  useEffect(() => {
    if (!isHomepageImagePending) {
      if (homepageImageState.success) {
        toast({ title: 'Homepage Image Updated', description: `Homepage image URL has been set.` });
        if (homepageImageState.currentHomepageImageUrl !== undefined) {
          setCurrentHomepageUrl(homepageImageState.currentHomepageImageUrl ?? '');
        }
         // Update max upload size display from this state if it changed
        if (homepageImageState.currentMaxUploadSizeMB !== undefined) {
            setCurrentSize(homepageImageState.currentMaxUploadSizeMB);
        }
      } else if (homepageImageState.error) {
        toast({ variant: 'destructive', title: 'Homepage Image Update Failed', description: homepageImageState.error });
        if (homepageImageState.currentHomepageImageUrl !== undefined) {
          setCurrentHomepageUrl(homepageImageState.currentHomepageImageUrl ?? '');
        }
      }
    }
  }, [homepageImageState, isHomepageImagePending, toast]);


  const handleUploadSizeSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => {
        uploadSizeFormAction(formData);
    });
  };

  const handleHomepageImageSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => {
        homepageImageFormAction(formData);
    });
  };

  return (
    <div className="space-y-6">
      <form onSubmit={handleUploadSizeSubmit} className="space-y-4">
        <div>
          <Label htmlFor="maxUploadSizeMB">Maximum Image Upload Size (MB)</Label>
          <div className="flex items-center gap-2 mt-1">
            <Input
              id="maxUploadSizeMB"
              name="maxUploadSizeMB"
              type="number"
              value={currentSize} // Controlled component
              onChange={(e) => setCurrentSize(Number(e.target.value))}
              min="1"
              max="10" 
              className="w-32"
              disabled={isAnyPending}
            />
            <Button type="submit" disabled={isUploadSizePending || isAnyPending}>
              {isUploadSizePending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isUploadSizePending ? 'Saving...' : 'Save Size'}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
              Value between 1 and 10. The server&apos;s hard limit for request body is 10MB.
          </p>
          {uploadSizeState.error && !isUploadSizePending && <p className="text-sm text-destructive mt-2">{uploadSizeState.error}</p>}
        </div>
      </form>

      <Separator />

      <form onSubmit={handleHomepageImageSubmit} className="space-y-4">
        <div>
          <Label htmlFor="homepageImageUrl">Homepage Image URL</Label>
           <div className="flex items-center gap-2 mt-1">
            <Input
              id="homepageImageUrl"
              name="homepageImageUrl"
              type="url"
              value={currentHomepageUrl} // Controlled component
              onChange={(e) => setCurrentHomepageUrl(e.target.value)}
              placeholder="https://example.com/image.png"
              className="flex-grow"
              disabled={isAnyPending}
            />
            <Button type="submit" disabled={isHomepageImagePending || isAnyPending}>
              {isHomepageImagePending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isHomepageImagePending ? 'Saving...' : <><ImageIcon className="mr-2 h-4 w-4" /> Save Image URL</>}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Enter the full URL for the image to display on the homepage for non-logged-in users. Leave blank to use default.
          </p>
          {currentHomepageUrl && (
            <div className="mt-2">
              <p className="text-xs text-muted-foreground">Current Preview:</p>
              <img 
                src={currentHomepageUrl} 
                alt="Homepage preview" 
                className="max-w-xs max-h-32 object-contain border rounded-md mt-1"
                onError={(e) => (e.currentTarget.style.display = 'none')} // Hide if image fails to load
              />
            </div>
          )}
          {homepageImageState.error && !isHomepageImagePending && <p className="text-sm text-destructive mt-2">{homepageImageState.error}</p>}
        </div>
      </form>
    </div>
  );
}
