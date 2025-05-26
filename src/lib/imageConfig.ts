// src/lib/imageConfig.ts

export const DEFAULT_FOLDER_NAME = "Uploads";
export const MAX_FILENAME_LENGTH = 200;
export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
export const MIME_TO_EXTENSION: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
};
export const POST_UPLOAD_DELAY_MS = 2000; // Increased from 1000ms to 2000ms for diagnostics
