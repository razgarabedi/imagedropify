
// src/lib/settingsService.ts
'use server';

import fs from 'fs/promises';
import path from 'path';

const SETTINGS_FILE_PATH = path.join(process.cwd(), 'server-settings.json');
const DEFAULT_MAX_UPLOAD_SIZE_MB = 6; 
const DEFAULT_HOMEPAGE_IMAGE_URL = "https://placehold.co/300x200.png";
const DEFAULT_REGISTRATIONS_ENABLED = true;

export interface SiteSettings {
  maxUploadSizeMB: number;
  homepageImageUrl?: string | null;
  registrationsEnabled: boolean;
}

async function readSettings(): Promise<SiteSettings> {
  try {
    await fs.access(SETTINGS_FILE_PATH);
    const data = await fs.readFile(SETTINGS_FILE_PATH, 'utf-8');
    const settings = JSON.parse(data) as Partial<SiteSettings>;
    return {
      maxUploadSizeMB: typeof settings.maxUploadSizeMB === 'number' ? settings.maxUploadSizeMB : DEFAULT_MAX_UPLOAD_SIZE_MB,
      homepageImageUrl: typeof settings.homepageImageUrl === 'string' ? settings.homepageImageUrl : DEFAULT_HOMEPAGE_IMAGE_URL,
      registrationsEnabled: typeof settings.registrationsEnabled === 'boolean' ? settings.registrationsEnabled : DEFAULT_REGISTRATIONS_ENABLED,
    };
  } catch (error) {
    console.warn('Settings file not found or corrupted, using default settings. Error:', error);
    const defaultSettings: SiteSettings = {
        maxUploadSizeMB: DEFAULT_MAX_UPLOAD_SIZE_MB,
        homepageImageUrl: DEFAULT_HOMEPAGE_IMAGE_URL,
        registrationsEnabled: DEFAULT_REGISTRATIONS_ENABLED,
    };
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        try {
            await writeSettings(defaultSettings);
            console.log('Created default server-settings.json');
            return defaultSettings;
        } catch (writeError) {
            console.error('Failed to create default server-settings.json:', writeError);
        }
    }
    return defaultSettings;
  }
}

async function writeSettings(settings: SiteSettings): Promise<void> {
  try {
    const settingsToWrite = {
        ...settings,
        homepageImageUrl: settings.homepageImageUrl === undefined ? null : settings.homepageImageUrl,
        registrationsEnabled: typeof settings.registrationsEnabled === 'boolean' ? settings.registrationsEnabled : DEFAULT_REGISTRATIONS_ENABLED,
    };
    await fs.writeFile(SETTINGS_FILE_PATH, JSON.stringify(settingsToWrite, null, 2), 'utf-8');
  } catch (error) {
    console.error("Failed to write settings file:", error);
    throw new Error("Server error: Could not save site settings.");
  }
}

export async function getMaxUploadSizeMB(): Promise<number> {
  const settings = await readSettings();
  return settings.maxUploadSizeMB;
}

export async function setMaxUploadSizeMB(sizeMB: number): Promise<void> {
  if (typeof sizeMB !== 'number' || sizeMB <= 0 || sizeMB > 100) { 
    throw new Error('Invalid upload size. Must be a positive number, typically not exceeding 100MB.');
  }
  const currentSettings = await readSettings();
  const newSettings: SiteSettings = {
    ...currentSettings,
    maxUploadSizeMB: sizeMB,
  };
  await writeSettings(newSettings);
}

export async function getHomepageImageUrl(): Promise<string> {
  const settings = await readSettings();
  return settings.homepageImageUrl || DEFAULT_HOMEPAGE_IMAGE_URL;
}

export async function setHomepageImageUrl(imageUrl: string | null): Promise<void> {
  if (imageUrl && !imageUrl.startsWith('http://') && !imageUrl.startsWith('https://')) {
    throw new Error('Invalid image URL. Must start with http:// or https://.');
  }
  const currentSettings = await readSettings();
  const newSettings: SiteSettings = {
    ...currentSettings,
    homepageImageUrl: imageUrl, 
  };
  await writeSettings(newSettings);
}

export async function getRegistrationsEnabled(): Promise<boolean> {
  const settings = await readSettings();
  return settings.registrationsEnabled;
}

export async function setRegistrationsEnabled(isEnabled: boolean): Promise<void> {
  if (typeof isEnabled !== 'boolean') {
    throw new Error('Invalid value for registrationsEnabled. Must be true or false.');
  }
  const currentSettings = await readSettings();
  const newSettings: SiteSettings = {
    ...currentSettings,
    registrationsEnabled: isEnabled,
  };
  await writeSettings(newSettings);
}
