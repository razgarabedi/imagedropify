
// src/app/actions/settingsActions.ts
'use server';

import { z } from 'zod';
import { getCurrentUserAction } from '@/app/actions/authActions';
import { 
    getMaxUploadSizeMB, 
    setMaxUploadSizeMB as setMaxUploadSizeMBService,
    getHomepageImageUrl,
    setHomepageImageUrl as setHomepageImageUrlService,
    getRegistrationsEnabled,
    setRegistrationsEnabled as setRegistrationsEnabledService
} from '@/lib/settingsService';
import type { SiteSettings } from '@/lib/settingsService'; // Import SiteSettings
import { revalidatePath } from 'next/cache';
import fs from 'fs/promises'; // For direct read for actualHomepageImageUrl
import path from 'path'; // For direct read path

const updateSettingsSchema = z.object({
  maxUploadSizeMB: z.coerce.number().min(1, "Must be at least 1MB").max(100, "Cannot exceed 100MB (server hard limit might be lower)"),
});

const updateHomepageImageSchema = z.object({
  homepageImageUrl: z.string().url({ message: "Please enter a valid URL." }).or(z.literal('')).optional(),
});

const updateRegistrationsStatusSchema = z.object({
  registrationsEnabled: z.boolean(),
});


export interface SettingsActionResponse {
  success: boolean;
  error?: string;
  currentMaxUploadSizeMB?: number;
  currentHomepageImageUrl?: string | null;
  currentRegistrationsEnabled?: boolean;
}

// Helper to fetch all current settings
async function getAllCurrentSettings(): Promise<{ 
    currentMaxUploadSizeMB: number, 
    currentHomepageImageUrl: string | null,
    currentRegistrationsEnabled: boolean 
}> {
    const size = await getMaxUploadSizeMB();
    const registrationsEnabled = await getRegistrationsEnabled();
    
    // For homepageImageUrl, read directly to distinguish between empty string (admin set) and null/default
    const rawSettings = await fs.readFile(path.join(process.cwd(), 'server-settings.json'), 'utf-8')
                                .then(JSON.parse)
                                .catch(() => ({ homepageImageUrl: null } as Partial<SiteSettings>));
    const actualStoredUrl = rawSettings.homepageImageUrl === undefined ? null : rawSettings.homepageImageUrl;

    return { 
        currentMaxUploadSizeMB: size, 
        currentHomepageImageUrl: actualStoredUrl,
        currentRegistrationsEnabled: registrationsEnabled 
    };
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

export async function updateRegistrationsStatusAction(
  prevState: SettingsActionResponse,
  formData: FormData
): Promise<SettingsActionResponse> {
  const currentUser = await getCurrentUserAction();
  if (!currentUser || currentUser.role !== 'admin') {
    return { ...prevState, success: false, error: 'Unauthorized: Admin access required.' };
  }
  
  const rawRegistrationsEnabled = formData.get('registrationsEnabled') === 'true'; // FormData values are strings
  const validation = updateRegistrationsStatusSchema.safeParse({ registrationsEnabled: rawRegistrationsEnabled });

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
    await setRegistrationsEnabledService(validation.data.registrationsEnabled);
    revalidatePath('/admin/dashboard');
    revalidatePath('/login'); // Revalidate login page in case it shows a message

    const newSettings = await getAllCurrentSettings();
    return { success: true, ...newSettings };
  } catch (error: any) {
    console.error('Error updating registration status:', error);
    const currentSettings = await getAllCurrentSettings();
    return { ...prevState, success: false, error: error.message || 'Failed to update registration status.', ...currentSettings };
  }
}


// Combined action to get all current settings for the form
export async function getCurrentSettingsAction(): Promise<SettingsActionResponse> {
    const currentUser = await getCurrentUserAction();
    if (!currentUser || currentUser.role !== 'admin') {
        // For non-admins, we still want to allow fetching some settings like registrationsEnabled for client-side checks if needed,
        // but sensitive settings like maxUploadSizeMB might be restricted.
        // For now, let's allow fetching all for simplicity, but this could be refined.
        // If non-admin, maybe only return a subset of settings or specific error.
        // This action is primarily for the admin dashboard, so strict admin check might be better.
         return { success: false, error: 'Unauthorized: Admin access required to fetch all settings.' };
    }
    try {
        const settings = await getAllCurrentSettings();
        return { success: true, ...settings };
    } catch (error: any) {
        return { success: false, error: 'Failed to fetch current settings.' };
    }
}
