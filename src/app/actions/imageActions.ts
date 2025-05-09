// src/app/actions/imageActions.ts
'use server';

import fs from 'fs/promises';
import path from 'path';
import { stat } from 'fs/promises';
import { revalidatePath } from 'next/cache';

const UPLOAD_DIR_BASE = path.join(process.cwd(), 'public/uploads');
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

function getFormattedDateFolder(): string {
  const now = new Date();
  const month = (now.getMonth() + 1).toString().padStart(2, '0');
  const year = now.getFullYear();
  return `${month}.${year}`;
}

// Ensure upload directory (base and dated subfolder) exists
async function ensureUploadDirsExist(): Promise<string> {
  const dateFolder = getFormattedDateFolder();
  const fullPath = path.join(UPLOAD_DIR_BASE, dateFolder);
  try {
    await fs.mkdir(fullPath, { recursive: true }); // This creates UPLOAD_DIR_BASE and the dateFolder
  } catch (error) {
    console.error('CRITICAL: Failed to create upload directory structure:', fullPath, error);
    // Propagate error to be handled by the caller, or throw a specific error.
    // For now, re-throwing or throwing a new error.
    throw new Error(`Failed to prepare upload directory: ${fullPath}. Check permissions.`);
  }
  return fullPath; // Return the path to the specific MM.YYYY folder
}


export interface UploadedImageServerData {
  name: string; // The generated unique filename on the server
  url: string; // The public URL to access the image
  originalName: string; // The original name of the uploaded file
}

export async function uploadImage(
  formData: FormData
): Promise<{ success: boolean; data?: UploadedImageServerData; error?: string }> {
  const dateFolder = getFormattedDateFolder();
  let currentActualUploadPath: string;
  try {
    currentActualUploadPath = await ensureUploadDirsExist();
  } catch (error: any) {
    console.error('Upload directory preparation failed:', error);
    return { success: false, error: error.message || 'Server error preparing upload directory.' };
  }

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

  const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1E9)}`;
  const fileExtension = path.extname(file.name).toLowerCase() || `.${file.type.split('/')[1]}`;
  const filename = `${uniqueSuffix}${fileExtension}`;
  const filePath = path.join(currentActualUploadPath, filename);

  try {
    await fs.writeFile(filePath, buffer);
    const imageUrl = `/uploads/${dateFolder}/${filename}`;
    
    revalidatePath('/'); 
    
    return {
      success: true,
      data: { name: filename, url: imageUrl, originalName: file.name },
    };
  } catch (error) {
    console.error('Failed to save file:', error);
    return { success: false, error: 'Failed to save file on server. Check server permissions.' };
  }
}


export interface RecentImage {
  id: string; 
  name: string; 
  url: string;
  ctime: number; 
}

export async function getRecentImages(): Promise<RecentImage[]> {
  try {
    // Ensure base upload directory exists, or create it.
    await fs.mkdir(UPLOAD_DIR_BASE, { recursive: true });
  } catch (error) {
    console.error('Failed to ensure base upload directory exists for reading:', UPLOAD_DIR_BASE, error);
    return []; // Cannot proceed if base directory is not accessible/creatable
  }

  const allImages: RecentImage[] = [];
  const dateFolderRegex = /^\d{2}\.\d{4}$/; // Matches MM.YYYY format

  try {
    const yearMonthDirs = await fs.readdir(UPLOAD_DIR_BASE, { withFileTypes: true });

    for (const dirent of yearMonthDirs) {
      if (dirent.isDirectory() && dateFolderRegex.test(dirent.name)) {
        const dateFolderPath = path.join(UPLOAD_DIR_BASE, dirent.name);
        try {
          const filesInDateFolder = await fs.readdir(dateFolderPath);
          const imageFileDetails = await Promise.all(
            filesInDateFolder.map(async (file) => {
              const filePath = path.join(dateFolderPath, file);
              try {
                const stats = await stat(filePath);
                if (stats.isFile() && /\.(jpg|jpeg|png|gif|webp)$/i.test(file)) {
                  return {
                    id: `${dirent.name}/${file}`, // Unique ID including date folder
                    name: file,
                    url: `/uploads/${dirent.name}/${file}`,
                    ctime: stats.ctimeMs,
                  };
                }
              } catch (statError) {
                console.error(`Failed to stat file ${filePath}:`, statError);
                return null;
              }
              return null;
            })
          );
          allImages.push(...imageFileDetails.filter((file): file is RecentImage => file !== null));
        } catch (readDirError) {
          console.warn(`Could not read directory ${dateFolderPath}:`, readDirError);
          // Continue to other directories
        }
      }
    }

    // Sort all collected images by creation time, newest first
    allImages.sort((a, b) => b.ctime - a.ctime);

    return allImages.slice(0, 5);

  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === 'ENOENT') {
      console.warn('Base upload directory not found while fetching recent images. Returning empty list.');
      return [];
    }
    console.error('Failed to read or process images directories:', error);
    return [];
  }
}
