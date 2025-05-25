
// src/components/admin/settings-form.tsx
'use client';

import React, { useEffect, useActionState, startTransition, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch'; // Import Switch
import { useToast } from '@/hooks/use-toast';
import { 
    updateMaxUploadSizeAction, 
    updateHomepageImageAction,
    updateRegistrationsStatusAction, // Import new action
    type SettingsActionResponse 
} from '@/app/actions/settingsActions';
import { Loader2, Image as ImageIcon, UserPlus, UserX } from 'lucide-react'; // Added UserPlus, UserX
import { Separator } from '../ui/separator';

interface SettingsFormProps {
  initialMaxUploadSizeMB: number;
  initialHomepageImageUrl: string | null;
  initialRegistrationsEnabled: boolean; // Add new prop
}

const initialFormState: SettingsActionResponse = { 
    success: false, 
    currentMaxUploadSizeMB: 0, 
    currentHomepageImageUrl: null,
    currentRegistrationsEnabled: true,
};

export function SettingsForm({ initialMaxUploadSizeMB, initialHomepageImageUrl, initialRegistrationsEnabled }: SettingsFormProps) {
  const { toast } = useToast();
  
  const [currentSize, setCurrentSize] = useState(initialMaxUploadSizeMB);
  const [currentHomepageUrl, setCurrentHomepageUrl] = useState(initialHomepageImageUrl ?? '');
  const [currentRegistrationsEnabled, setCurrentRegistrationsEnabled] = useState(initialRegistrationsEnabled);


  const [uploadSizeState, uploadSizeFormAction, isUploadSizePending] = useActionState(
    updateMaxUploadSizeAction, 
    { ...initialFormState, currentMaxUploadSizeMB: initialMaxUploadSizeMB, currentHomepageImageUrl: initialHomepageImageUrl, currentRegistrationsEnabled: initialRegistrationsEnabled }
  );
  const [homepageImageState, homepageImageFormAction, isHomepageImagePending] = useActionState(
    updateHomepageImageAction, 
    { ...initialFormState, currentMaxUploadSizeMB: initialMaxUploadSizeMB, currentHomepageImageUrl: initialHomepageImageUrl, currentRegistrationsEnabled: initialRegistrationsEnabled }
  );
  const [registrationsStatusState, registrationsStatusFormAction, isRegistrationsStatusPending] = useActionState(
    updateRegistrationsStatusAction,
    { ...initialFormState, currentMaxUploadSizeMB: initialMaxUploadSizeMB, currentHomepageImageUrl: initialHomepageImageUrl, currentRegistrationsEnabled: initialRegistrationsEnabled }
  );
  
  const isAnyPending = isUploadSizePending || isHomepageImagePending || isRegistrationsStatusPending;

  // Effect for upload size updates
  useEffect(() => {
    if (!isUploadSizePending) {
      if (uploadSizeState.success) {
        toast({ title: 'Settings Updated', description: `Maximum upload size is now ${uploadSizeState.currentMaxUploadSizeMB}MB.` });
        if (uploadSizeState.currentMaxUploadSizeMB !== undefined) setCurrentSize(uploadSizeState.currentMaxUploadSizeMB);
        if (uploadSizeState.currentHomepageImageUrl !== undefined) setCurrentHomepageUrl(uploadSizeState.currentHomepageImageUrl ?? '');
        if (uploadSizeState.currentRegistrationsEnabled !== undefined) setCurrentRegistrationsEnabled(uploadSizeState.currentRegistrationsEnabled);
      } else if (uploadSizeState.error) {
        toast({ variant: 'destructive', title: 'Upload Size Update Failed', description: uploadSizeState.error });
        if (uploadSizeState.currentMaxUploadSizeMB !== undefined) setCurrentSize(uploadSizeState.currentMaxUploadSizeMB); 
      }
    }
  }, [uploadSizeState, isUploadSizePending, toast]);

  // Effect for homepage image URL updates
  useEffect(() => {
    if (!isHomepageImagePending) {
      if (homepageImageState.success) {
        toast({ title: 'Homepage Image Updated', description: `Homepage image URL has been set.` });
        if (homepageImageState.currentHomepageImageUrl !== undefined) setCurrentHomepageUrl(homepageImageState.currentHomepageImageUrl ?? '');
        if (homepageImageState.currentMaxUploadSizeMB !== undefined) setCurrentSize(homepageImageState.currentMaxUploadSizeMB);
        if (homepageImageState.currentRegistrationsEnabled !== undefined) setCurrentRegistrationsEnabled(homepageImageState.currentRegistrationsEnabled);
      } else if (homepageImageState.error) {
        toast({ variant: 'destructive', title: 'Homepage Image Update Failed', description: homepageImageState.error });
        if (homepageImageState.currentHomepageImageUrl !== undefined) setCurrentHomepageUrl(homepageImageState.currentHomepageImageUrl ?? '');
      }
    }
  }, [homepageImageState, isHomepageImagePending, toast]);

  // Effect for registration status updates
  useEffect(() => {
    if (!isRegistrationsStatusPending) {
      if (registrationsStatusState.success) {
        toast({ title: 'Registration Settings Updated', description: `New user registrations are now ${registrationsStatusState.currentRegistrationsEnabled ? 'ENABLED' : 'DISABLED'}.` });
        if (registrationsStatusState.currentRegistrationsEnabled !== undefined) setCurrentRegistrationsEnabled(registrationsStatusState.currentRegistrationsEnabled);
        if (registrationsStatusState.currentMaxUploadSizeMB !== undefined) setCurrentSize(registrationsStatusState.currentMaxUploadSizeMB);
        if (registrationsStatusState.currentHomepageImageUrl !== undefined) setCurrentHomepageUrl(registrationsStatusState.currentHomepageImageUrl ?? '');
      } else if (registrationsStatusState.error) {
        toast({ variant: 'destructive', title: 'Registration Update Failed', description: registrationsStatusState.error });
        if (registrationsStatusState.currentRegistrationsEnabled !== undefined) setCurrentRegistrationsEnabled(registrationsStatusState.currentRegistrationsEnabled);
      }
    }
  }, [registrationsStatusState, isRegistrationsStatusPending, toast]);


  const handleUploadSizeSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => uploadSizeFormAction(formData));
  };

  const handleHomepageImageSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => homepageImageFormAction(formData));
  };

  const handleRegistrationsToggle = (checked: boolean) => {
    setCurrentRegistrationsEnabled(checked); // Optimistically update UI
    const formData = new FormData();
    formData.append('registrationsEnabled', String(checked));
    startTransition(() => registrationsStatusFormAction(formData));
  };

  return (
    <div className="space-y-8"> {/* Increased overall spacing */}
      <form onSubmit={handleUploadSizeSubmit} className="space-y-4">
        <div>
          <Label htmlFor="maxUploadSizeMB" className="text-base font-semibold">Maximum Image Upload Size (MB)</Label>
          <div className="flex items-center gap-2 mt-1">
            <Input
              id="maxUploadSizeMB"
              name="maxUploadSizeMB"
              type="number"
              value={currentSize}
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
              Value between 1 and 10. Server request body limit is 10MB.
          </p>
          {uploadSizeState.error && !isUploadSizePending && <p className="text-sm text-destructive mt-2">{uploadSizeState.error}</p>}
        </div>
      </form>

      <Separator />

      <form onSubmit={handleHomepageImageSubmit} className="space-y-4">
        <div>
          <Label htmlFor="homepageImageUrl" className="text-base font-semibold">Homepage Image URL</Label>
           <div className="flex items-center gap-2 mt-1">
            <Input
              id="homepageImageUrl"
              name="homepageImageUrl"
              type="url"
              value={currentHomepageUrl}
              onChange={(e) => setCurrentHomepageUrl(e.target.value)}
              placeholder="https://example.com/image.png or leave blank for default"
              className="flex-grow"
              disabled={isAnyPending}
            />
            <Button type="submit" disabled={isHomepageImagePending || isAnyPending}>
              {isHomepageImagePending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isHomepageImagePending ? 'Saving...' : <><ImageIcon className="mr-2 h-4 w-4" /> Save Image URL</>}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Enter URL for homepage image (logged-out users). Blank uses default.
          </p>
          {currentHomepageUrl && (
            <div className="mt-2">
              <p className="text-xs text-muted-foreground">Current Preview:</p>
              <img 
                src={currentHomepageUrl} 
                alt="Homepage preview" 
                className="max-w-xs max-h-32 object-contain border rounded-md mt-1"
                onError={(e) => (e.currentTarget.style.display = 'none')} 
              />
            </div>
          )}
          {homepageImageState.error && !isHomepageImagePending && <p className="text-sm text-destructive mt-2">{homepageImageState.error}</p>}
        </div>
      </form>

      <Separator />

      {/* Registrations Toggle Section */}
      <div className="space-y-2">
        <Label htmlFor="registrationsEnabledSwitch" className="text-base font-semibold">New User Registrations</Label>
        <div className="flex items-center space-x-3 mt-1">
          <Switch
            id="registrationsEnabledSwitch"
            checked={currentRegistrationsEnabled}
            onCheckedChange={handleRegistrationsToggle}
            disabled={isRegistrationsStatusPending || isAnyPending}
            aria-label="Toggle new user registrations"
          />
          <span className={cn("text-sm", currentRegistrationsEnabled ? "text-green-600" : "text-red-600")}>
            {isRegistrationsStatusPending ? (
              <Loader2 className="h-4 w-4 animate-spin inline-block mr-1" />
            ) : currentRegistrationsEnabled ? (
              <UserPlus className="h-4 w-4 inline-block mr-1" />
            ) : (
              <UserX className="h-4 w-4 inline-block mr-1" />
            )}
            {currentRegistrationsEnabled ? 'Enabled' : 'Disabled'}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          Control whether new users can sign up for an account.
        </p>
        {registrationsStatusState.error && !isRegistrationsStatusPending && (
          <p className="text-sm text-destructive mt-2">{registrationsStatusState.error}</p>
        )}
      </div>
    </div>
  );
}
