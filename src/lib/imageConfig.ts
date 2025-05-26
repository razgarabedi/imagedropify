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
// Reduced delay as long delays were not solving the root web server issue.
// The fs.access polling loop in imageActions.ts is a more targeted check for file visibility by Node.js.
export const POST_UPLOAD_DELAY_MS = 500;
