// src/app/actions/imageActions.ts
'use server';

import fs from 'fs/promises';
import path from 'path';
import { stat } from 'fs/promises';
import { revalidatePath } from 'next/cache';
import { getCurrentUserIdFromSession } from '@/lib/auth/service'; // Import session utility

const UPLOAD_DIR_BASE_PUBLIC = path.join(process.cwd(), 'public/uploads/users');
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const MIME_TO_EXTENSION: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
};


function getFormattedDateFolder(): string {
  const now = new Date();
  const month = (now.getMonth() + 1).toString().padStart(2, '0');
  const year = now.getFullYear();
  return `${month}.${year}`;
}

// Ensure upload directory (user-specific and dated subfolder) exists
async function ensureUploadDirsExist(userId: string): Promise<string> {
  if (!userId || typeof userId !== 'string' || userId.includes('..') || userId.includes('/')) {
    // Basic sanity check for userId format to prevent path traversal.
    // A more robust validation (e.g., UUID format) might be better depending on ID generation.
    console.error('Invalid User ID for directory creation:', userId);
    throw new Error('Invalid user ID format.');
  }
  const dateFolder = getFormattedDateFolder();
  // path.join sanitizes paths and prevents simple traversal like '../'
  const userSpecificPath = path.join(UPLOAD_DIR_BASE_PUBLIC, userId, dateFolder);

  // Final check to ensure the path is within the allowed base directory
  const resolvedUserSpecificPath = path.resolve(userSpecificPath);
  const resolvedUploadDirBase = path.resolve(UPLOAD_DIR_BASE_PUBLIC);

  if (!resolvedUserSpecificPath.startsWith(resolvedUploadDirBase + path.sep) && resolvedUserSpecificPath !== resolvedUploadDirBase && !resolvedUserSpecificPath.startsWith(resolvedUploadDirBase + path.win32.sep)) {
      console.error(`Security alert: Attempt to create directory outside designated uploads area. Path: ${userSpecificPath}, UserID: ${userId}`);
      throw new Error('Path is outside allowed directory for user uploads.');
  }

  try {
    await fs.mkdir(userSpecificPath, { recursive: true });
  } catch (error) {
    console.error('CRITICAL: Failed to create user-specific upload directory structure:', userSpecificPath, error);
    throw new Error(`Failed to prepare upload directory: ${userSpecificPath}. Check server logs and directory permissions.`);
  }
  return userSpecificPath; 
}


export interface UploadedImageServerData {
  name: string; // The generated unique filename on the server
  url: string; // The public URL to access the image
  originalName: string; // The original name of the uploaded file
  userId: string; // ID of the user who uploaded the image
}

export interface UploadImageActionState {
  success: boolean;
  data?: UploadedImageServerData;
  error?: string;
}

export async function uploadImage(
  prevState: UploadImageActionState, // Added prevState parameter
  formData: FormData
): Promise<UploadImageActionState> {
  const userId = await getCurrentUserIdFromSession();
  if (!userId) {
    return { success: false, error: 'User authentication required for upload.' };
  }
  
  let currentActualUploadPath: string;
  try {
    currentActualUploadPath = await ensureUploadDirsExist(userId);
  } catch (error: any) {
    console.error('Upload directory preparation failed:', error);
    return { success: false, error: error.message || 'Server error preparing upload directory. Contact support.' };
  }

  const file = formData.get('image') as File | null;

  if (!file) {
    return { success: false, error: 'No file provided.' };
  }

  if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
    return { success: false, error: `Invalid file type. Accepted types: JPG, PNG, GIF, WebP. You provided: ${file.type}` };
  }

  const fileExtension = MIME_TO_EXTENSION[file.type];
  if (!fileExtension) {
    return { success: false, error: `File type (${file.type}) is not supported or cannot be mapped to an extension.` };
  }

  if (file.size > MAX_FILE_SIZE) {
    return { success: false, error: `File too large. Maximum allowed size is 10MB. Your file is ${(file.size / (1024 * 1024)).toFixed(2)}MB.` };
  }

  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);

  // Sanitize original file name for use in unique suffix if desired, or just use random data
  // For simplicity, using random data is safer.
  const safeOriginalNamePart = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').substring(0, 50);
  const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1E9)}-${safeOriginalNamePart}`;
  const filename = `${uniqueSuffix}${fileExtension}`.substring(0,255); // Ensure filename length is reasonable
  
  const filePath = path.join(currentActualUploadPath, filename);
  const dateFolder = getFormattedDateFolder();

  try {
    await fs.writeFile(filePath, buffer);
    const imageUrl = `/uploads/users/${userId}/${dateFolder}/${filename}`;
    
    revalidatePath('/'); 
    
    return {
      success: true,
      data: { name: filename, url: imageUrl, originalName: file.name, userId },
    };
  } catch (error) {
    console.error('Failed to save file to disk:', filePath, error);
    return { success: false, error: 'Failed to save file on server. Please try again or contact support if the issue persists.' };
  }
}


export interface UserImage {
  id: string; 
  name: string; 
  url: string;
  ctime: number; 
  userId: string;
}

export async function getUserImages(): Promise<UserImage[]> {
  const userId = await getCurrentUserIdFromSession();
  if (!userId) {
    return [];
  }
  
  const userUploadDir = path.join(UPLOAD_DIR_BASE_PUBLIC, userId);

  try {
    // Check if user's base upload directory exists and is accessible.
    // path.resolve helps normalize the path.
    const resolvedUserUploadDir = path.resolve(userUploadDir);
    const resolvedUploadDirBase = path.resolve(UPLOAD_DIR_BASE_PUBLIC);

    if (!resolvedUserUploadDir.startsWith(resolvedUploadDirBase + path.sep) && resolvedUserUploadDir !== resolvedUploadDirBase && !resolvedUserUploadDir.startsWith(resolvedUploadDirBase + path.win32.sep) ) {
        console.error(`Security alert: Attempt to access images outside designated user uploads area. Path: ${userUploadDir}, UserID: ${userId}`);
        return []; // Path is outside allowed directory
    }
    await fs.access(resolvedUserUploadDir); 
  } catch (error) {
    // User directory doesn't exist, or access error so no images to list.
    return []; 
  }

  const allImages: UserImage[] = [];
  const dateFolderRegex = /^\d{2}\.\d{4}$/; // Matches MM.YYYY format

  try {
    const yearMonthDirs = await fs.readdir(userUploadDir, { withFileTypes: true });

    for (const dirent of yearMonthDirs) {
      if (dirent.isDirectory() && dateFolderRegex.test(dirent.name)) {
        const dateFolderPath = path.join(userUploadDir, dirent.name);
        // Security: ensure dateFolderPath is still within userUploadDir
        if (!path.resolve(dateFolderPath).startsWith(path.resolve(userUploadDir) + path.sep) && !path.resolve(dateFolderPath).startsWith(path.resolve(userUploadDir) + path.win32.sep)) {
            console.warn(`Skipping potentially malicious path: ${dateFolderPath}`);
            continue;
        }
        try {
          const filesInDateFolder = await fs.readdir(dateFolderPath);
          const imageFileDetails = await Promise.all(
            filesInDateFolder.map(async (file) => {
              // Sanitize file name before joining: basic check for traversal
              if (file.includes('..') || file.includes('/') || file.includes(path.win32.sep)) {
                console.warn(`Skipping potentially malicious file name: ${file}`);
                return null;
              }
              const filePath = path.join(dateFolderPath, file);
              // Security: ensure filePath is still within dateFolderPath
              if (!path.resolve(filePath).startsWith(path.resolve(dateFolderPath) + path.sep) && !path.resolve(filePath).startsWith(path.resolve(dateFolderPath) + path.win32.sep)) {
                console.warn(`Skipping potentially malicious file path: ${filePath}`);
                return null;
              }
              try {
                const statsResult = await stat(filePath);
                const validExtensions = Object.values(MIME_TO_EXTENSION);
                if (statsResult.isFile() && validExtensions.some(ext => file.toLowerCase().endsWith(ext))) {
                  return {
                    id: `${userId}/${dirent.name}/${file}`, 
                    name: file,
                    url: `/uploads/users/${userId}/${dirent.name}/${file}`,
                    ctime: statsResult.ctimeMs,
                    userId: userId,
                  };
                }
              } catch (statError) {
                // console.error(`Failed to stat file ${filePath}:`, statError); // Can be noisy
                return null;
              }
              return null;
            })
          );
          allImages.push(...imageFileDetails.filter((file): file is UserImage => file !== null));
        } catch (readDirError) {
          // console.warn(`Could not read directory ${dateFolderPath}:`, readDirError); // Can be noisy
        }
      }
    }

    allImages.sort((a, b) => b.ctime - a.ctime);
    return allImages.slice(0, 5); // Return last 5 uploaded photos

  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === 'ENOENT' && nodeError.path === userUploadDir) {
      return [];
    }
    console.error('Failed to read or process user image directories:', error);
    return []; 
  }
}

export interface DeleteImageActionState {
    success: boolean;
    error?: string;
}

export async function deleteImage(
  prevState: DeleteImageActionState, // Added prevState
  imagePathFragment: string // e.g., MM.YYYY/filename.ext (relative to user's dir)
): Promise<DeleteImageActionState> {
  const requestingUserId = await getCurrentUserIdFromSession();
  if (!requestingUserId) {
    return { success: false, error: 'User authentication required for deletion.' };
  }

  // Validate imagePathFragment to prevent path traversal.
  // It should not contain '..' or start with '/'. It should be 'MM.YYYY/filename.ext'.
  const normalizedFragment = path.normalize(imagePathFragment);
   if (normalizedFragment.includes('..') || normalizedFragment.startsWith(path.sep) || normalizedFragment.startsWith(path.win32.sep) || normalizedFragment.split(path.sep).length !== 2 && normalizedFragment.split(path.win32.sep).length !== 2) {
      console.error(`Security alert: Invalid imagePathFragment for deletion. User: ${requestingUserId}, Fragment: ${imagePathFragment}`);
      return { success: false, error: 'Invalid image path format for deletion.' };
  }

  const fullServerPath = path.join(UPLOAD_DIR_BASE_PUBLIC, requestingUserId, normalizedFragment);
  
  // Security check: Ensure the path being deleted is within the user's designated folder.
  const userBaseDir = path.resolve(path.join(UPLOAD_DIR_BASE_PUBLIC, requestingUserId));
  const resolvedFullPath = path.resolve(fullServerPath);

  if (!resolvedFullPath.startsWith(userBaseDir + path.sep) && !resolvedFullPath.startsWith(userBaseDir + path.win32.sep)) {
      console.error(`Security alert: User ${requestingUserId} attempted to delete path outside their directory: ${fullServerPath}`);
      return { success: false, error: 'Unauthorized attempt to delete file. Path is outside your allowed directory.' };
  }
  
  try {
    await fs.access(fullServerPath); 
    await fs.unlink(fullServerPath); 
    
    revalidatePath('/'); 
    return { success: true };
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return { success: false, error: 'File not found. It may have already been deleted.' };
    }
    console.error(`Failed to delete file ${fullServerPath}:`, error);
    return { success: false, error: 'Failed to delete file from server. Please try again.' };
  }
}


/**
 * Note on Security (Local File System):
 * - User IDs in paths: Ensure User IDs are sanitized or are non-malleable (e.g., UUIDs) to prevent path traversal.
 * - Path construction: Use `path.join` and `path.resolve` carefully. Always validate that resolved paths are within expected base directories.
 * - Input Sanitization: Sanitize `imagePathFragment` and any user-provided parts of file paths.
 * - File Permissions: The Node.js process (run by PM2) needs write permissions to `public/uploads/users`. Individual user directories should ideally have permissions scoped to that user if possible at the OS level (more complex setup).
 * - Nginx Configuration: The Nginx config should still:
 *   - Serve files from `/public/uploads` directly.
 *   - Disable script execution in the uploads directory.
 *   - Set `X-Content-Type-Options: nosniff`.
 * - This implementation relies on the session mechanism (`getCurrentUserIdFromSession`) being secure.
 */

