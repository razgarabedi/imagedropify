// src/components/admin/settings-form.tsx
'use client';

import React, { useEffect, useActionState, startTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { updateMaxUploadSizeAction, type SettingsActionResponse } from '@/app/actions/settingsActions';
import { Loader2 } from 'lucide-react';

interface SettingsFormProps {
  initialMaxUploadSizeMB: number;
}

const initialFormState: SettingsActionResponse = { success: false };

export function SettingsForm({ initialMaxUploadSizeMB }: SettingsFormProps) {
  const { toast } = useToast();
  const [currentSize, setCurrentSize] = React.useState(initialMaxUploadSizeMB);
  
  const [state, formAction, isPending] = useActionState(updateMaxUploadSizeAction, {
    ...initialFormState,
    currentMaxUploadSizeMB: initialMaxUploadSizeMB,
  });

  useEffect(() => {
    if (!isPending && state.success) {
      toast({ title: 'Settings Updated', description: `Maximum upload size is now ${state.currentMaxUploadSizeMB}MB.` });
      if (state.currentMaxUploadSizeMB !== undefined) {
        setCurrentSize(state.currentMaxUploadSizeMB);
      }
    } else if (!isPending && state.error) {
      toast({ variant: 'destructive', title: 'Update Failed', description: state.error });
       if (state.currentMaxUploadSizeMB !== undefined) {
        setCurrentSize(state.currentMaxUploadSizeMB); // Revert to last known good or initial
      }
    }
  }, [state, isPending, toast]);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => {
        formAction(formData);
    });
  };


  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label htmlFor="maxUploadSizeMB">Maximum Image Upload Size (MB)</Label>
        <div className="flex items-center gap-2 mt-1">
          <Input
            id="maxUploadSizeMB"
            name="maxUploadSizeMB"
            type="number"
            defaultValue={currentSize}
            min="1"
            max="10" // Reflecting Next.js server action bodyLimit which is 10MB
            className="w-32"
            disabled={isPending}
            key={currentSize} // Re-render input if currentSize changes from server
          />
          <Button type="submit" disabled={isPending}>
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isPending ? 'Saving...' : 'Save'}
          </Button>
        </div>
         <p className="text-xs text-muted-foreground mt-1">
            Value between 1 and 10. The server&apos;s hard limit for request body is 10MB.
          </p>
        {state.error && !isPending && <p className="text-sm text-destructive mt-2">{state.error}</p>}
      </div>
    </form>
  );
}
