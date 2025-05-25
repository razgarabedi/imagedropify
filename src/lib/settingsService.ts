
// src/lib/settingsService.ts
'use server';

import prisma from '@/lib/prisma';

const DEFAULT_MAX_UPLOAD_SIZE_MB = 6;
const DEFAULT_HOMEPAGE_IMAGE_URL = "https://placehold.co/300x200.png";
const DEFAULT_REGISTRATIONS_ENABLED = true;
const SETTINGS_ROW_ID = 1; // For the single-row settings table

export interface SiteSettings {
  id?: number; // id is present in the DB model
  maxUploadSizeMB: number;
  homepageImageUrl?: string | null;
  registrationsEnabled: boolean;
  updatedAt?: Date; // updatedAt is present in the DB model
}

async function getSettings(): Promise<SiteSettings> {
  let settings = await prisma.siteSetting.findUnique({
    where: { id: SETTINGS_ROW_ID },
  });

  if (!settings) {
    console.warn('Site settings not found in database, creating with defaults.');
    try {
      settings = await prisma.siteSetting.create({
        data: {
          id: SETTINGS_ROW_ID,
          maxUploadSizeMB: DEFAULT_MAX_UPLOAD_SIZE_MB,
          homepageImageUrl: DEFAULT_HOMEPAGE_IMAGE_URL,
          registrationsEnabled: DEFAULT_REGISTRATIONS_ENABLED,
        },
      });
    } catch (error) {
      console.error('Failed to create default site settings in database:', error);
      // Fallback to in-memory defaults if DB creation fails
      return {
        maxUploadSizeMB: DEFAULT_MAX_UPLOAD_SIZE_MB,
        homepageImageUrl: DEFAULT_HOMEPAGE_IMAGE_URL,
        registrationsEnabled: DEFAULT_REGISTRATIONS_ENABLED,
      };
    }
  }
  // Ensure all fields are present even if fetched from DB
  return {
    id: settings.id,
    maxUploadSizeMB: settings.maxUploadSizeMB,
    homepageImageUrl: settings.homepageImageUrl,
    registrationsEnabled: settings.registrationsEnabled,
    updatedAt: settings.updatedAt,
  };
}

async function updateSettings(newSettings: Partial<Omit<SiteSettings, 'id' | 'updatedAt'>>): Promise<SiteSettings> {
  try {
    const settings = await prisma.siteSetting.upsert({
      where: { id: SETTINGS_ROW_ID },
      update: newSettings,
      create: {
        id: SETTINGS_ROW_ID,
        maxUploadSizeMB: newSettings.maxUploadSizeMB ?? DEFAULT_MAX_UPLOAD_SIZE_MB,
        homepageImageUrl: newSettings.homepageImageUrl === undefined ? DEFAULT_HOMEPAGE_IMAGE_URL : newSettings.homepageImageUrl,
        registrationsEnabled: newSettings.registrationsEnabled ?? DEFAULT_REGISTRATIONS_ENABLED,
      },
    });
    return settings;
  } catch (error) {
    console.error("Failed to update site settings in database:", error);
    throw new Error("Server error: Could not save site settings.");
  }
}

export async function getMaxUploadSizeMB(): Promise<number> {
  const settings = await getSettings();
  return settings.maxUploadSizeMB;
}

export async function setMaxUploadSizeMB(sizeMB: number): Promise<void> {
  if (typeof sizeMB !== 'number' || sizeMB <= 0 || sizeMB > 100) {
    throw new Error('Invalid upload size. Must be a positive number, typically not exceeding 100MB.');
  }
  await updateSettings({ maxUploadSizeMB: sizeMB });
}

export async function getHomepageImageUrl(): Promise<string> {
  const settings = await getSettings();
  return settings.homepageImageUrl || DEFAULT_HOMEPAGE_IMAGE_URL; // Fallback if null in DB
}

export async function setHomepageImageUrl(imageUrl: string | null): Promise<void> {
  if (imageUrl && !imageUrl.startsWith('http://') && !imageUrl.startsWith('https://')) {
    throw new Error('Invalid image URL. Must start with http:// or https://.');
  }
  await updateSettings({ homepageImageUrl: imageUrl });
}

export async function getRegistrationsEnabled(): Promise<boolean> {
  const settings = await getSettings();
  return settings.registrationsEnabled;
}

export async function setRegistrationsEnabled(isEnabled: boolean): Promise<void> {
  if (typeof isEnabled !== 'boolean') {
    throw new Error('Invalid value for registrationsEnabled. Must be true or false.');
  }
  await updateSettings({ registrationsEnabled: isEnabled });
}

// This function is for the admin dashboard to fetch all settings at once
export async function getAllSiteSettingsForAdmin(): Promise<SiteSettings> {
    return getSettings();
}
