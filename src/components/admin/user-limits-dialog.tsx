// src/components/admin/user-limits-dialog.tsx
'use client';

import React, { useState, useEffect, useActionState, startTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { useToast } from '@/hooks/use-toast';
import { Loader2, Save } from 'lucide-react';
import { updateUserLimitsAction, type AdminUserActionResponse, type UserWithActivity } from '@/app/actions/userActions';
import type { UserLimits } from '@/lib/auth/types';

interface UserLimitsDialogProps {
  user: UserWithActivity;
  triggerButton: React.ReactNode; // The button that opens the dialog
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const initialFormState: AdminUserActionResponse = { success: false };

export function UserLimitsDialog({ user, triggerButton, open, onOpenChange }: UserLimitsDialogProps) {
  const { toast } = useToast();

  // Initialize form state with current user limits or empty strings
  const [limits, setLimits] = useState<Record<keyof UserLimits, string>>({
    maxImages: user.maxImages?.toString() ?? '',
    maxSingleUploadSizeMB: user.maxSingleUploadSizeMB?.toString() ?? '',
    maxTotalStorageMB: user.maxTotalStorageMB?.toString() ?? '',
  });

  // Reset form when dialog opens/closes or user changes
  useEffect(() => {
     setLimits({
        maxImages: user.maxImages?.toString() ?? '',
        maxSingleUploadSizeMB: user.maxSingleUploadSizeMB?.toString() ?? '',
        maxTotalStorageMB: user.maxTotalStorageMB?.toString() ?? '',
     });
  }, [user, open]); // Depend on user and open state

  const [state, formAction, isPending] = useActionState(updateUserLimitsAction, initialFormState);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setLimits(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    formData.append('userId', user.id); // Add userId to the form data
    startTransition(() => {
      formAction(formData);
    });
  };

  // Effect to handle action result (toast and close dialog)
  useEffect(() => {
    if (!isPending) {
      if (state.success && state.user) {
        toast({ title: 'Limits Updated', description: `Limits successfully updated for ${state.user.email}.` });
        onOpenChange(false); // Close dialog on success
      } else if (state.error) {
        toast({ variant: 'destructive', title: 'Update Failed', description: state.error });
        // Keep dialog open on failure
      }
    }
  }, [state, isPending, toast, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        {triggerButton}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Manage Limits for {user.email}</DialogTitle>
          <DialogDescription>
            Set specific upload limits for this user. Leave fields blank to use global defaults or remove limits.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="grid gap-4 py-4">
           {/* Hidden input for userId */}
           <input type="hidden" name="userId" value={user.id} />
          
           <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="maxImages" className="text-right">
              Max Images
            </Label>
            <Input
              id="maxImages"
              name="maxImages"
              type="number"
              min="0"
              step="1"
              value={limits.maxImages}
              onChange={handleInputChange}
              className="col-span-3"
              placeholder="Unlimited (leave blank)"
              disabled={isPending}
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="maxSingleUploadSizeMB" className="text-right">
              Max File (MB)
            </Label>
            <Input
              id="maxSingleUploadSizeMB"
              name="maxSingleUploadSizeMB"
              type="number"
              min="0.1"
              step="0.1"
              value={limits.maxSingleUploadSizeMB}
              onChange={handleInputChange}
              className="col-span-3"
              placeholder="Global default (leave blank)"
              disabled={isPending}
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="maxTotalStorageMB" className="text-right">
              Total Storage (MB)
            </Label>
            <Input
              id="maxTotalStorageMB"
              name="maxTotalStorageMB"
              type="number"
              min="1"
              step="1"
              value={limits.maxTotalStorageMB}
              onChange={handleInputChange}
              className="col-span-3"
              placeholder="Unlimited (leave blank)"
              disabled={isPending}
            />
          </div>
           {state.error && !isPending && <p className="col-span-4 text-sm text-destructive">{state.error}</p>}
           <DialogFooter>
             <DialogClose asChild>
               <Button type="button" variant="outline" disabled={isPending}>Cancel</Button>
             </DialogClose>
             <Button type="submit" disabled={isPending}>
               {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
               {isPending ? 'Saving...' : 'Save Limits'}
             </Button>
           </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
