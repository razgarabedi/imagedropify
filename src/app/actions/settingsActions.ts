
// src/app/actions/settingsActions.ts
'use server';

import { z } from 'zod';
import { getCurrentUserAction } from '@/app/actions/authActions';
import { 
    setMaxUploadSizeMB as setMaxUploadSizeMBService,
    setHomepageImageUrl as setHomepageImageUrlService,
    setRegistrationsEnabled as setRegistrationsEnabledService,
    getAllSiteSettingsForAdmin // Use the new Prisma-based function
} from '@/lib/settingsService';
import type { SiteSettings } from '@/lib/settingsService';
import { revalidatePath } from 'next/cache';

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

// Helper to fetch all current settings using the Prisma service
async function getAllCurrentSettingsFromDb(): Promise<{
    currentMaxUploadSizeMB: number,
    currentHomepageImageUrl: string | null,
    currentRegistrationsEnabled: boolean
}> {
    const settings = await getAllSiteSettingsForAdmin(); // Fetches from DB
    return {
        currentMaxUploadSizeMB: settings.maxUploadSizeMB,
        currentHomepageImageUrl: settings.homepageImageUrl ?? null, // Ensure null if undefined
        currentRegistrationsEnabled: settings.registrationsEnabled,
    };
}

export async function updateMaxUploadSizeAction(
  prevState: SettingsActionResponse,
  formData: FormData
): Promise<SettingsActionResponse> {
  const currentUser = await getCurrentUserAction();
  if (!currentUser || currentUser.role !== 'Admin') { // Role check for 'Admin' (capitalized as per enum)
    return { ...prevState, success: false, error: 'Unauthorized: Admin access required.' };
  }

  const rawMaxUploadSizeMB = formData.get('maxUploadSizeMB');
  const validation = updateSettingsSchema.safeParse({ maxUploadSizeMB: rawMaxUploadSizeMB });

  if (!validation.success) {
    const currentSettings = await getAllCurrentSettingsFromDb();
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

    const newSettings = await getAllCurrentSettingsFromDb();
    return { success: true, ...newSettings };
  } catch (error: any) {
    console.error('Error updating max upload size:', error);
    const currentSettings = await getAllCurrentSettingsFromDb();
    return { ...prevState, success: false, error: error.message || 'Failed to update settings.', ...currentSettings };
  }
}

export async function updateHomepageImageAction(
  prevState: SettingsActionResponse,
  formData: FormData
): Promise<SettingsActionResponse> {
  const currentUser = await getCurrentUserAction();
  if (!currentUser || currentUser.role !== 'Admin') {
    return { ...prevState, success: false, error: 'Unauthorized: Admin access required.' };
  }

  const rawHomepageImageUrl = formData.get('homepageImageUrl');
  const validation = updateHomepageImageSchema.safeParse({ homepageImageUrl: rawHomepageImageUrl });

  if (!validation.success) {
    const currentSettings = await getAllCurrentSettingsFromDb();
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

    const newSettings = await getAllCurrentSettingsFromDb();
    return { success: true, ...newSettings };
  } catch (error: any) {
    console.error('Error updating homepage image URL:', error);
    const currentSettings = await getAllCurrentSettingsFromDb();
    return { ...prevState, success: false, error: error.message || 'Failed to update homepage image URL.', ...currentSettings };
  }
}

export async function updateRegistrationsStatusAction(
  prevState: SettingsActionResponse,
  formData: FormData
): Promise<SettingsActionResponse> {
  const currentUser = await getCurrentUserAction();
  if (!currentUser || currentUser.role !== 'Admin') {
    return { ...prevState, success: false, error: 'Unauthorized: Admin access required.' };
  }

  const rawRegistrationsEnabled = formData.get('registrationsEnabled') === 'true';
  const validation = updateRegistrationsStatusSchema.safeParse({ registrationsEnabled: rawRegistrationsEnabled });

  if (!validation.success) {
    const currentSettings = await getAllCurrentSettingsFromDb();
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
    revalidatePath('/login');

    const newSettings = await getAllCurrentSettingsFromDb();
    return { success: true, ...newSettings };
  } catch (error: any) {
    console.error('Error updating registration status:', error);
    const currentSettings = await getAllCurrentSettingsFromDb();
    return { ...prevState, success: false, error: error.message || 'Failed to update registration status.', ...currentSettings };
  }
}

export async function getCurrentSettingsAction(): Promise<SettingsActionResponse> {
  const currentUser = await getCurrentUserAction();
  if (!currentUser || currentUser.role !== 'Admin') {
    return { success: false, error: 'Unauthorized: Admin access required to fetch all settings.' };
  }
  try {
    const settings = await getAllCurrentSettingsFromDb();
    return { success: true, ...settings };
  } catch (error: any) {
    console.error('Error in getCurrentSettingsAction:', error);
    return { success: false, error: 'Failed to fetch current settings.' };
  }
}
