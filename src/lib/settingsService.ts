// src/lib/settingsService.ts
'use server';

import fs from 'fs/promises';
import path from 'path';

const SETTINGS_FILE_PATH = path.join(process.cwd(), 'server-settings.json');
const DEFAULT_MAX_UPLOAD_SIZE_MB = 6; // Default if file is missing or corrupt
const DEFAULT_HOMEPAGE_IMAGE_URL = "https://placehold.co/300x200.png"; // Default homepage image

export interface SiteSettings {
  maxUploadSizeMB: number;
  homepageImageUrl?: string | null; // Optional, can be null or undefined
}

async function readSettings(): Promise<SiteSettings> {
  try {
    await fs.access(SETTINGS_FILE_PATH);
    const data = await fs.readFile(SETTINGS_FILE_PATH, 'utf-8');
    const settings = JSON.parse(data) as Partial<SiteSettings>;
    // Ensure essential settings have default values if missing
    return {
      maxUploadSizeMB: typeof settings.maxUploadSizeMB === 'number' ? settings.maxUploadSizeMB : DEFAULT_MAX_UPLOAD_SIZE_MB,
      homepageImageUrl: typeof settings.homepageImageUrl === 'string' ? settings.homepageImageUrl : DEFAULT_HOMEPAGE_IMAGE_URL,
    };
  } catch (error) {
    // If file doesn't exist or is invalid, return default settings
    console.warn('Settings file not found or corrupted, using default settings. Error:', error);
    // Attempt to create the file with defaults if it doesn't exist
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        const defaultSettings: SiteSettings = {
            maxUploadSizeMB: DEFAULT_MAX_UPLOAD_SIZE_MB,
            homepageImageUrl: DEFAULT_HOMEPAGE_IMAGE_URL,
        };
        try {
            await writeSettings(defaultSettings);
            console.log('Created default server-settings.json');
            return defaultSettings;
        } catch (writeError) {
            console.error('Failed to create default server-settings.json:', writeError);
        }
    }
    return { 
        maxUploadSizeMB: DEFAULT_MAX_UPLOAD_SIZE_MB,
        homepageImageUrl: DEFAULT_HOMEPAGE_IMAGE_URL
    };
  }
}

async function writeSettings(settings: SiteSettings): Promise<void> {
  try {
    // Ensure homepageImageUrl is either a string or null, not undefined
    const settingsToWrite = {
        ...settings,
        homepageImageUrl: settings.homepageImageUrl === undefined ? null : settings.homepageImageUrl
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
  if (typeof sizeMB !== 'number' || sizeMB <= 0 || sizeMB > 100) { // Basic validation, 100MB as an arbitrary upper sanity limit
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
  // Basic URL validation (can be improved)
  if (imageUrl && !imageUrl.startsWith('http://') && !imageUrl.startsWith('https://')) {
    throw new Error('Invalid image URL. Must start with http:// or https://.');
  }
  const currentSettings = await readSettings();
  const newSettings: SiteSettings = {
    ...currentSettings,
    homepageImageUrl: imageUrl, // Can be null to reset to default effectively on next get
  };
  await writeSettings(newSettings);
}
