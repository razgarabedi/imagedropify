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
const MAX_FILENAME_LENGTH = 200; // Max length for new filename (excluding extension)


function getFormattedDateFolder(): string {
  const now = new Date();
  const month = (now.getMonth() + 1).toString().padStart(2, '0');
  const year = now.getFullYear();
  return `${month}.${year}`;
}

// Ensure upload directory (user-specific and dated subfolder) exists
async function ensureUploadDirsExist(userId: string): Promise<string> {
  if (!userId || typeof userId !== 'string' || userId.includes('..') || userId.includes('/')) {
    console.error('Invalid User ID for directory creation:', userId);
    throw new Error('Invalid user ID format.');
  }
  const dateFolder = getFormattedDateFolder();
  const userSpecificPath = path.join(UPLOAD_DIR_BASE_PUBLIC, userId, dateFolder);

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
  name: string; // The generated unique filename on the server (includes extension)
  url: string; // The public URL to access the image
  originalName: string; // The original name of the uploaded file (includes extension)
  userId: string; // ID of the user who uploaded the image
}

export interface UploadImageActionState {
  success: boolean;
  data?: UploadedImageServerData;
  error?: string;
}

export async function uploadImage(
  prevState: UploadImageActionState, 
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

  // Sanitize original file name for suffix, but primary name is unique
  const safeOriginalNamePart = path.basename(file.name, path.extname(file.name)).replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 50);
  const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1E9)}`;
  const filename = `${uniqueSuffix}-${safeOriginalNamePart}${fileExtension}`.substring(0,255); 
  
  const filePath = path.join(currentActualUploadPath, filename);
  const dateFolder = getFormattedDateFolder();

  try {
    await fs.writeFile(filePath, buffer);
    const imageUrl = `/uploads/users/${userId}/${dateFolder}/${filename}`;
    
    revalidatePath('/'); 
    revalidatePath('/my-images');
    
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
  id: string; // Composite ID: `userId/MM.YYYY/filename.ext`
  name: string; // filename.ext
  url: string; // Public URL: `/uploads/users/userId/MM.YYYY/filename.ext`
  ctime: number; 
  userId: string;
}

export async function getUserImages(limit?: number): Promise<UserImage[]> {
  const userId = await getCurrentUserIdFromSession();
  if (!userId) {
    return [];
  }
  
  const userUploadDir = path.join(UPLOAD_DIR_BASE_PUBLIC, userId);

  try {
    const resolvedUserUploadDir = path.resolve(userUploadDir);
    const resolvedUploadDirBase = path.resolve(UPLOAD_DIR_BASE_PUBLIC);

    if (!resolvedUserUploadDir.startsWith(resolvedUploadDirBase + path.sep) && resolvedUserUploadDir !== resolvedUploadDirBase && !resolvedUserUploadDir.startsWith(resolvedUploadDirBase + path.win32.sep) ) {
        console.error(`Security alert: Attempt to access images outside designated user uploads area. Path: ${userUploadDir}, UserID: ${userId}`);
        return []; 
    }
    await fs.access(resolvedUserUploadDir); 
  } catch (error) {
    return []; 
  }

  const allImages: UserImage[] = [];
  const dateFolderRegex = /^\d{2}\.\d{4}$/; 

  try {
    const yearMonthDirs = await fs.readdir(userUploadDir, { withFileTypes: true });

    for (const dirent of yearMonthDirs) {
      if (dirent.isDirectory() && dateFolderRegex.test(dirent.name)) {
        const dateFolderPath = path.join(userUploadDir, dirent.name);
        if (!path.resolve(dateFolderPath).startsWith(path.resolve(userUploadDir) + path.sep) && !path.resolve(dateFolderPath).startsWith(path.resolve(userUploadDir) + path.win32.sep)) {
            console.warn(`Skipping potentially malicious path: ${dateFolderPath}`);
            continue;
        }
        try {
          const filesInDateFolder = await fs.readdir(dateFolderPath);
          const imageFileDetails = await Promise.all(
            filesInDateFolder.map(async (file) => {
              if (file.includes('..') || file.includes('/') || file.includes(path.win32.sep)) {
                console.warn(`Skipping potentially malicious file name: ${file}`);
                return null;
              }
              const filePath = path.join(dateFolderPath, file);
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
                    name: file, // filename.ext
                    url: `/uploads/users/${userId}/${dirent.name}/${file}`,
                    ctime: statsResult.ctimeMs,
                    userId: userId,
                  };
                }
              } catch (statError) {
                return null;
              }
              return null;
            })
          );
          allImages.push(...imageFileDetails.filter((file): file is UserImage => file !== null));
        } catch (readDirError) {
           // Ignore if a single date folder is unreadable, continue with others.
        }
      }
    }

    allImages.sort((a, b) => b.ctime - a.ctime);
    
    if (limit) {
        return allImages.slice(0, limit);
    }
    return allImages;

  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === 'ENOENT' && nodeError.path === userUploadDir) {
      return []; // User directory doesn't exist yet, no images.
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
  prevState: DeleteImageActionState, 
  imagePathFragment: string // Expects 'MM.YYYY/filename.ext'
): Promise<DeleteImageActionState> {
  const requestingUserId = await getCurrentUserIdFromSession();
  if (!requestingUserId) {
    return { success: false, error: 'User authentication required for deletion.' };
  }

  const normalizedFragment = path.normalize(imagePathFragment);
  // Stricter validation for MM.YYYY/filename.ext format
  const fragmentParts = normalizedFragment.split(path.sep);
  if (normalizedFragment.includes('..') || fragmentParts.length !== 2 || !/^\d{2}\.\d{4}$/.test(fragmentParts[0]) || !fragmentParts[1]) {
      console.error(`Security alert: Invalid imagePathFragment for deletion. User: ${requestingUserId}, Fragment: ${imagePathFragment}`);
      return { success: false, error: 'Invalid image path format for deletion.' };
  }

  const fullServerPath = path.join(UPLOAD_DIR_BASE_PUBLIC, requestingUserId, normalizedFragment);
  
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
    revalidatePath('/my-images');
    return { success: true };
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return { success: false, error: 'File not found. It may have already been deleted.' };
    }
    console.error(`Failed to delete file ${fullServerPath}:`, error);
    return { success: false, error: 'Failed to delete file from server. Please try again.' };
  }
}


export interface RenameImageActionState {
  success: boolean;
  error?: string;
  data?: {
    newId: string; // new composite ID
    newName: string; // new filename.ext
    newUrl: string; // new public URL
  };
}

export async function renameImage(
  prevState: RenameImageActionState,
  formData: FormData
): Promise<RenameImageActionState> {
  const requestingUserId = await getCurrentUserIdFromSession();
  if (!requestingUserId) {
    return { success: false, error: 'User authentication required for renaming.' };
  }

  const currentImagePathFragment = formData.get('currentImagePathFragment') as string | null;
  const newNameWithoutExtension = formData.get('newNameWithoutExtension') as string | null;

  if (!currentImagePathFragment || !newNameWithoutExtension) {
    return { success: false, error: 'Missing current image path or new name.' };
  }

  // Validate and sanitize newNameWithoutExtension
  const sanitizedNewName = newNameWithoutExtension.replace(/[^a-zA-Z0-9._-]/g, '_').substring(0, MAX_FILENAME_LENGTH);
  if (!sanitizedNewName) {
    return { success: false, error: 'New name is invalid or empty after sanitization.' };
  }

  // Validate currentImagePathFragment format 'MM.YYYY/oldfilename.ext'
  const normalizedFragment = path.normalize(currentImagePathFragment);
  const fragmentParts = normalizedFragment.split(path.sep);
  if (normalizedFragment.includes('..') || fragmentParts.length !== 2 || !/^\d{2}\.\d{4}$/.test(fragmentParts[0]) || !fragmentParts[1]) {
    console.error(`Security alert: Invalid currentImagePathFragment for rename. User: ${requestingUserId}, Fragment: ${currentImagePathFragment}`);
    return { success: false, error: 'Invalid current image path format for renaming.' };
  }
  
  const dateFolder = fragmentParts[0];
  const oldFilenameWithExt = fragmentParts[1];
  const extension = path.extname(oldFilenameWithExt);

  if (!Object.values(MIME_TO_EXTENSION).includes(extension.toLowerCase())) {
    return { success: false, error: `Invalid or unsupported file extension: ${extension}` };
  }

  const newFilenameWithExt = `${sanitizedNewName}${extension}`;

  if (newFilenameWithExt === oldFilenameWithExt) {
    return { success: false, error: 'New name is the same as the old name.' };
  }
  
  const userBaseDir = path.resolve(path.join(UPLOAD_DIR_BASE_PUBLIC, requestingUserId));
  const oldFullPath = path.join(UPLOAD_DIR_BASE_PUBLIC, requestingUserId, dateFolder, oldFilenameWithExt);
  const newFullPath = path.join(UPLOAD_DIR_BASE_PUBLIC, requestingUserId, dateFolder, newFilenameWithExt);

  const resolvedOldPath = path.resolve(oldFullPath);
  const resolvedNewPath = path.resolve(newFullPath);

  if (!resolvedOldPath.startsWith(userBaseDir + path.sep) || !resolvedNewPath.startsWith(userBaseDir + path.sep) &&
      !resolvedOldPath.startsWith(userBaseDir + path.win32.sep) || !resolvedNewPath.startsWith(userBaseDir + path.win32.sep)) {
    console.error(`Security alert: User ${requestingUserId} attempted to rename file outside their directory. Old: ${oldFullPath}, New: ${newFullPath}`);
    return { success: false, error: 'Unauthorized attempt to rename file. Path is outside your allowed directory.' };
  }

  try {
    await fs.access(oldFullPath); // Check if old file exists
    try {
      await fs.access(newFullPath);
      // If newFullPath exists, it's an error, don't overwrite.
      return { success: false, error: `A file named "${newFilenameWithExt}" already exists in this folder.` };
    } catch (e: any) {
      // Expected: newFullPath does not exist. If error is not ENOENT, then it's some other fs issue.
      if (e.code !== 'ENOENT') throw e;
    }

    await fs.rename(oldFullPath, newFullPath);

    const newUrl = `/uploads/users/${requestingUserId}/${dateFolder}/${newFilenameWithExt}`;
    const newId = `${requestingUserId}/${dateFolder}/${newFilenameWithExt}`;

    revalidatePath('/');
    revalidatePath('/my-images');

    return {
      success: true,
      data: {
        newId,
        newName: newFilenameWithExt, // This is filename.ext
        newUrl,
      },
    };
  } catch (error: any) {
    if (error.code === 'ENOENT' && error.path === oldFullPath) {
      return { success: false, error: 'Original file not found. It may have been deleted or moved.' };
    }
    console.error(`Failed to rename file from ${oldFullPath} to ${newFullPath}:`, error);
    return { success: false, error: 'Failed to rename file on server. Please try again.' };
  }
}


/**
 * Note on Security (Local File System):
 * - User IDs in paths: Ensure User IDs are sanitized or are non-malleable (e.g., UUIDs) to prevent path traversal. User IDs are validated against '..' and '/'.
 * - Path construction: `path.join` and `path.resolve` are used. Resolved paths are validated to be within expected base directories for the user.
 * - Input Sanitization: 
 *   - `imagePathFragment` for delete/rename is normalized and checked for '..', leading slashes, and expected structure.
 *   - `newNameWithoutExtension` for rename is sanitized (regexp replace) and length-limited.
 *   - File extensions are derived from MIME types on upload or checked against a list of valid extensions for rename/delete. Original extensions are preserved on rename.
 * - File Permissions: The Node.js process (run by PM2) needs read/write permissions to `public/uploads/users`. Nginx needs read access.
 * - Overwriting: The `renameImage` action checks if a file with the new name already exists and prevents overwriting.
 * - Nginx Configuration: Nginx config should:
 *   - Serve files from `/public/uploads` directly.
 *   - Disable script execution in the uploads directory.
 *   - Set `X-Content-Type-Options: nosniff`.
 * - This implementation relies on the session mechanism (`getCurrentUserIdFromSession`) being secure.
 */
