// src/app/actions/imageActions.ts
'use server';

import fs from 'fs/promises';
import path from 'path';
import { stat } from 'fs/promises';
import { revalidatePath } from 'next/cache';

const UPLOAD_DIR = path.join(process.cwd(), 'public/uploads');
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

// Ensure upload directory exists
async function ensureUploadDirExists() {
  try {
    await fs.mkdir(UPLOAD_DIR, { recursive: true });
  } catch (error) {
    console.error('CRITICAL: Failed to create upload directory. Please ensure the path is writable:', UPLOAD_DIR, error);
    // Depending on the deployment, manual creation or permission adjustment might be needed.
    // Throwing an error here might be too disruptive for startup if it's a permission issue that can be fixed.
    // The functions using UPLOAD_DIR will fail if it's not usable.
  }
}
// Call it at module level to attempt creation on server start/load.
ensureUploadDirExists();

export interface UploadedImageServerData {
  name: string; // The generated unique filename on the server
  url: string; // The public URL to access the image
  originalName: string; // The original name of the uploaded file
}

export async function uploadImage(
  formData: FormData
): Promise<{ success: boolean; data?: UploadedImageServerData; error?: string }> {
  await ensureUploadDirExists(); // Double-check or attempt creation before operation

  const file = formData.get('image') as File | null;

  if (!file) {
    return { success: false, error: 'No file provided.' };
  }

  if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
    return { success: false, error: `Invalid file type. Accepted: JPG, PNG, GIF, WebP. Got: ${file.type}` };
  }

  if (file.size > MAX_FILE_SIZE) {
    return { success: false, error: `File too large. Max 10MB. Got: ${(file.size / (1024 * 1024)).toFixed(2)}MB` };
  }

  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);

  // Generate a unique filename to prevent overwrites and sanitize
  const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1E9)}`;
  const fileExtension = path.extname(file.name).toLowerCase() || `.${file.type.split('/')[1]}`;
  const filename = `${uniqueSuffix}${fileExtension}`;
  const filePath = path.join(UPLOAD_DIR, filename);

  try {
    await fs.writeFile(filePath, buffer);
    const imageUrl = `/uploads/${filename}`;
    
    // Revalidate the homepage path so that getRecentImages fetches fresh data
    revalidatePath('/'); 
    
    return {
      success: true,
      data: { name: filename, url: imageUrl, originalName: file.name },
    };
  } catch (error) {
    console.error('Failed to save file:', error);
    return { success: false, error: 'Failed to save file on server. Check server permissions for public/uploads.' };
  }
}


export interface RecentImage {
  id: string; // Use filename as id, as it's unique in the uploads directory
  name: string; // Filename on server (could be originalName if stored, but for simplicity using server filename)
  url: string;
  ctime: number; // Creation timestamp for sorting
}

export async function getRecentImages(): Promise<RecentImage[]> {
  await ensureUploadDirExists(); // Double-check or attempt creation

  try {
    const files = await fs.readdir(UPLOAD_DIR);
    const imageFileDetails = await Promise.all(
      files.map(async (file) => {
        const filePath = path.join(UPLOAD_DIR, file);
        try {
          const stats = await stat(filePath);
          if (stats.isFile() && /\.(jpg|jpeg|png|gif|webp)$/i.test(file)) {
            return {
              id: file,
              name: file, // Using the server filename as 'name'
              url: `/uploads/${file}`,
              ctime: stats.ctimeMs,
            };
          }
        } catch (statError) {
          console.error(`Failed to stat file ${filePath}:`, statError);
          return null; // Skip if error (e.g. file removed during processing)
        }
        return null;
      })
    );

    const validImageFiles = imageFileDetails.filter((file): file is RecentImage => file !== null);

    // Sort by creation time, newest first
    validImageFiles.sort((a, b) => b.ctime - a.ctime);

    return validImageFiles.slice(0, 5);
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === 'ENOENT') {
      // If UPLOAD_DIR itself doesn't exist (e.g. first run, or deleted)
      console.warn('Upload directory not found while fetching recent images. Returning empty list.');
      return [];
    }
    console.error('Failed to read images directory:', error);
    return []; // Return empty array on other errors
  }
}