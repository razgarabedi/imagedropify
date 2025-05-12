// src/app/actions/settingsActions.ts
'use server';

import { z } from 'zod';
import { getCurrentUserAction } from '@/app/actions/authActions';
import { getMaxUploadSizeMB, setMaxUploadSizeMB as setMaxUploadSizeMBService } from '@/lib/settingsService';
import { revalidatePath } from 'next/cache';

const updateSettingsSchema = z.object({
  maxUploadSizeMB: z.coerce.number().min(1, "Must be at least 1MB").max(100, "Cannot exceed 100MB (server hard limit might be lower)"), // Coerce to number
});

export interface SettingsActionResponse {
  success: boolean;
  error?: string;
  currentMaxUploadSizeMB?: number;
}

export async function updateMaxUploadSizeAction(
  prevState: SettingsActionResponse,
  formData: FormData
): Promise<SettingsActionResponse> {
  const currentUser = await getCurrentUserAction();
  if (!currentUser || currentUser.role !== 'admin') {
    return { success: false, error: 'Unauthorized: Admin access required.' };
  }

  const rawMaxUploadSizeMB = formData.get('maxUploadSizeMB');

  const validation = updateSettingsSchema.safeParse({ maxUploadSizeMB: rawMaxUploadSizeMB });

  if (!validation.success) {
    const currentSize = await getMaxUploadSizeMB();
    return {
      success: false,
      error: validation.error.errors.map((e) => e.message).join(', '),
      currentMaxUploadSizeMB: currentSize,
    };
  }

  try {
    await setMaxUploadSizeMBService(validation.data.maxUploadSizeMB);
    revalidatePath('/admin/dashboard'); // Revalidate to show updated settings
    revalidatePath('/'); // Revalidate home if it displays upload info

    const newSize = await getMaxUploadSizeMB();
    return { success: true, currentMaxUploadSizeMB: newSize };
  } catch (error: any) {
    console.error('Error updating max upload size:', error);
    const currentSize = await getMaxUploadSizeMB();
    return { success: false, error: error.message || 'Failed to update settings.', currentMaxUploadSizeMB: currentSize };
  }
}

export async function getCurrentMaxUploadSizeAction(): Promise<SettingsActionResponse> {
    const currentUser = await getCurrentUserAction();
    if (!currentUser || currentUser.role !== 'admin') {
        return { success: false, error: 'Unauthorized: Admin access required.' };
    }
    try {
        const size = await getMaxUploadSizeMB();
        return { success: true, currentMaxUploadSizeMB: size };
    } catch (error: any) {
        return { success: false, error: 'Failed to fetch current upload size.' };
    }
}
