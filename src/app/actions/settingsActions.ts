// src/app/actions/settingsActions.ts
'use server';

import { z } from 'zod';
import { getCurrentUserAction } from '@/app/actions/authActions';
import { 
    getMaxUploadSizeMB, 
    setMaxUploadSizeMB as setMaxUploadSizeMBService,
    getHomepageImageUrl,
    setHomepageImageUrl as setHomepageImageUrlService
} from '@/lib/settingsService';
import { revalidatePath } from 'next/cache';

const updateSettingsSchema = z.object({
  maxUploadSizeMB: z.coerce.number().min(1, "Must be at least 1MB").max(100, "Cannot exceed 100MB (server hard limit might be lower)"),
});

const updateHomepageImageSchema = z.object({
  homepageImageUrl: z.string().url({ message: "Please enter a valid URL." }).or(z.literal('')).optional(), // Allow empty string to reset
});

export interface SettingsActionResponse {
  success: boolean;
  error?: string;
  currentMaxUploadSizeMB?: number;
  currentHomepageImageUrl?: string | null;
}

export async function updateMaxUploadSizeAction(
  prevState: SettingsActionResponse,
  formData: FormData
): Promise<SettingsActionResponse> {
  const currentUser = await getCurrentUserAction();
  if (!currentUser || currentUser.role !== 'admin') {
    return { ...prevState, success: false, error: 'Unauthorized: Admin access required.' };
  }

  const rawMaxUploadSizeMB = formData.get('maxUploadSizeMB');
  const validation = updateSettingsSchema.safeParse({ maxUploadSizeMB: rawMaxUploadSizeMB });

  if (!validation.success) {
    const currentSettings = await getAllCurrentSettings();
    return {
      ...prevState,
      success: false,
      error: validation.error.errors.map((e) => e.message).join(', '),
      ...currentSettings
    };
  }

  try {
    await setMaxUploadSizeMBService(validation.data.maxUploadSizeMB);
    revalidatePath('/admin/dashboard');
    revalidatePath('/'); 

    const newSettings = await getAllCurrentSettings();
    return { success: true, ...newSettings };
  } catch (error: any) {
    console.error('Error updating max upload size:', error);
    const currentSettings = await getAllCurrentSettings();
    return { ...prevState, success: false, error: error.message || 'Failed to update settings.', ...currentSettings };
  }
}

export async function updateHomepageImageAction(
  prevState: SettingsActionResponse,
  formData: FormData
): Promise<SettingsActionResponse> {
  const currentUser = await getCurrentUserAction();
  if (!currentUser || currentUser.role !== 'admin') {
    return { ...prevState, success: false, error: 'Unauthorized: Admin access required.' };
  }
  
  const rawHomepageImageUrl = formData.get('homepageImageUrl');
  const validation = updateHomepageImageSchema.safeParse({ homepageImageUrl: rawHomepageImageUrl });

  if (!validation.success) {
    const currentSettings = await getAllCurrentSettings();
    return {
      ...prevState,
      success: false,
      error: validation.error.errors.map((e) => e.message).join(', '),
      ...currentSettings
    };
  }
  
  try {
    const imageUrlToSet = validation.data.homepageImageUrl === '' ? null : validation.data.homepageImageUrl || null;
    await setHomepageImageUrlService(imageUrlToSet);
    revalidatePath('/admin/dashboard');
    revalidatePath('/');

    const newSettings = await getAllCurrentSettings();
    return { success: true, ...newSettings };
  } catch (error: any) {
    console.error('Error updating homepage image URL:', error);
    const currentSettings = await getAllCurrentSettings();
    return { ...prevState, success: false, error: error.message || 'Failed to update homepage image URL.', ...currentSettings };
  }
}

// Helper to fetch all current settings
async function getAllCurrentSettings(): Promise<{ currentMaxUploadSizeMB: number, currentHomepageImageUrl: string | null }> {
    const size = await getMaxUploadSizeMB();
    const url = await getHomepageImageUrl(); // This will return default if null/undefined
    // Read settings directly to get the actual stored value (null or string)
    const rawSettings = await fs.readFile(path.join(process.cwd(), 'server-settings.json'), 'utf-8').then(JSON.parse).catch(() => ({}));
    const actualStoredUrl = rawSettings.homepageImageUrl === undefined ? null : rawSettings.homepageImageUrl;

    return { currentMaxUploadSizeMB: size, currentHomepageImageUrl: actualStoredUrl };
}


// Combined action to get all current settings for the form
export async function getCurrentSettingsAction(): Promise<SettingsActionResponse> {
    const currentUser = await getCurrentUserAction();
    if (!currentUser || currentUser.role !== 'admin') {
        return { success: false, error: 'Unauthorized: Admin access required.' };
    }
    try {
        const settings = await getAllCurrentSettings();
        return { success: true, ...settings };
    } catch (error: any) {
        return { success: false, error: 'Failed to fetch current settings.' };
    }
}
