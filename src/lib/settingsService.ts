// src/lib/settingsService.ts
'use server';

import fs from 'fs/promises';
import path from 'path';

const SETTINGS_FILE_PATH = path.join(process.cwd(), 'server-settings.json');
const DEFAULT_MAX_UPLOAD_SIZE_MB = 6; // Default if file is missing or corrupt

export interface SiteSettings {
  maxUploadSizeMB: number;
}

async function readSettings(): Promise<SiteSettings> {
  try {
    await fs.access(SETTINGS_FILE_PATH);
    const data = await fs.readFile(SETTINGS_FILE_PATH, 'utf-8');
    const settings = JSON.parse(data) as Partial<SiteSettings>;
    // Ensure essential settings have default values if missing
    return {
      maxUploadSizeMB: typeof settings.maxUploadSizeMB === 'number' ? settings.maxUploadSizeMB : DEFAULT_MAX_UPLOAD_SIZE_MB,
    };
  } catch (error) {
    // If file doesn't exist or is invalid, return default settings
    console.warn('Settings file not found or corrupted, using default settings. Error:', error);
    return { maxUploadSizeMB: DEFAULT_MAX_UPLOAD_SIZE_MB };
  }
}

async function writeSettings(settings: SiteSettings): Promise<void> {
  try {
    await fs.writeFile(SETTINGS_FILE_PATH, JSON.stringify(settings, null, 2), 'utf-8');
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
