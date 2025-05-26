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
// Increased for diagnostic purposes. If this helps, it points to a severe timing issue on the server.
export const POST_UPLOAD_DELAY_MS = 3000; // Increased to 3000ms (3 seconds)
