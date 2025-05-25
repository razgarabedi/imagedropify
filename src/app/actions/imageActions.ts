
// src/app/actions/imageActions.ts
'use server';

import fs from 'fs/promises';
import path from 'path';
import { stat } from 'fs/promises';
import { revalidatePath } from 'next/cache';
import { getCurrentUserIdFromSession, findUserById } from '@/lib/auth/service'; 
import { getMaxUploadSizeMB as getGlobalMaxUploadSizeMB } from '@/lib/settingsService';
import type { User } from '@/lib/auth/types';

const UPLOAD_DIR_BASE_PUBLIC = path.join(process.cwd(), 'public/uploads/users');
const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const MIME_TO_EXTENSION: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
};
const MAX_FILENAME_LENGTH = 200; 

// Returns a path like "YYYY/MM/DD"
function getFormattedDatePath(): string {
  const now = new Date();
  const year = now.getFullYear().toString();
  const month = (now.getMonth() + 1).toString().padStart(2, '0');
  const day = now.getDate().toString().padStart(2, '0');
  return path.join(year, month, day); // Uses path.join for OS-agnostic path segments
}

async function ensureUploadDirsExist(userId: string): Promise<string> {
  if (!userId || typeof userId !== 'string' || userId.includes('..') || userId.includes('/')) {
    console.error('Invalid User ID for directory creation:', userId);
    throw new Error('Invalid user ID format.');
  }
  const datePath = getFormattedDatePath(); // "YYYY/MM/DD"
  const userSpecificPath = path.join(UPLOAD_DIR_BASE_PUBLIC, userId, datePath);

  const resolvedUserSpecificPath = path.resolve(userSpecificPath);
  const resolvedUploadDirBase = path.resolve(UPLOAD_DIR_BASE_PUBLIC);

  if (!resolvedUserSpecificPath.startsWith(resolvedUploadDirBase + path.sep) &&
      !resolvedUserSpecificPath.startsWith(resolvedUploadDirBase + path.win32.sep) ||
       resolvedUserSpecificPath === resolvedUploadDirBase) { 
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
  name: string;
  url: string;
  originalName: string;
  userId: string;
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
  try {
    const userId = await getCurrentUserIdFromSession();
    if (!userId) {
      return { success: false, error: 'User authentication required for upload.' };
    }

    const user = await findUserById(userId) as User | undefined;
    if (!user) {
        return { success: false, error: 'User not found.' };
    }
    
    if (user.status !== 'approved') {
       return { success: false, error: `Account status is '${user.status}'. Uploads require 'approved' status.` };
    }

    // --- Limit Checks ---
    if (user.maxImages !== null && user.maxImages !== undefined) {
        const currentImageCount = await countUserImages(userId);
        if (currentImageCount >= user.maxImages) {
            return { success: false, error: `Upload limit reached (${user.maxImages} images). Please delete some images to upload more.` };
        }
    }
    
    const globalMaxUploadSizeMB = await getGlobalMaxUploadSizeMB();
    const userMaxSingleUploadMB = user.maxSingleUploadSizeMB; 
    const effectiveMaxSingleMB = userMaxSingleUploadMB !== null && userMaxSingleUploadMB !== undefined 
                                ? userMaxSingleUploadMB 
                                : globalMaxUploadSizeMB;
    const effectiveMaxSingleBytes = effectiveMaxSingleMB * 1024 * 1024;

    const file = formData.get('image') as File | null;
    if (!file) {
      return { success: false, error: 'No file provided.' };
    }

    if (file.size > effectiveMaxSingleBytes) {
       return { success: false, error: `File too large (${(file.size / (1024 * 1024)).toFixed(2)}MB). Maximum allowed size for you is ${effectiveMaxSingleMB}MB.` };
    }

     if (user.maxTotalStorageMB !== null && user.maxTotalStorageMB !== undefined) {
        const currentTotalStorageBytes = await calculateUserTotalStorage(userId);
        const maxTotalStorageBytes = user.maxTotalStorageMB * 1024 * 1024;
        const projectedTotalBytes = currentTotalStorageBytes + file.size;

        if (projectedTotalBytes > maxTotalStorageBytes) {
            const currentTotalMB = (currentTotalStorageBytes / (1024*1024)).toFixed(2);
            const neededMB = (file.size / (1024*1024)).toFixed(2);
            return { success: false, error: `Insufficient storage space. You need ${neededMB}MB, but have ${currentTotalMB}MB used out of your ${user.maxTotalStorageMB}MB limit.` };
        }
    }

    // --- End Limit Checks ---

    let currentActualUploadPath: string;
    try {
      currentActualUploadPath = await ensureUploadDirsExist(userId); // This returns the full path including YYYY/MM/DD
    } catch (error: any) {
      console.error('Upload directory preparation failed:', error);
      return { success: false, error: error.message || 'Server error preparing upload directory. Contact support.' };
    }

    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      return { success: false, error: `Invalid file type. Accepted types: JPG, PNG, GIF, WebP. You provided: ${file.type}` };
    }

    const fileExtension = MIME_TO_EXTENSION[file.type];
    if (!fileExtension) {
      return { success: false, error: `File type (${file.type}) is not supported or cannot be mapped to an extension.` };
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const safeOriginalNamePart = path.basename(file.name, path.extname(file.name))
                                   .replace(/[^a-zA-Z0-9_-]/g, '_') 
                                   .substring(0, 50); 
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1E9)}`;
    const filename = `${uniqueSuffix}-${safeOriginalNamePart}${fileExtension}`.substring(0, MAX_FILENAME_LENGTH); 

    const filePath = path.join(currentActualUploadPath, filename);
    const datePathForUrl = getFormattedDatePath(); // "YYYY/MM/DD" but using system-specific separators

    // --- Path Safety Check ---
    const resolvedFilePath = path.resolve(filePath);
    if (!resolvedFilePath.startsWith(path.resolve(currentActualUploadPath) + path.sep) &&
        !resolvedFilePath.startsWith(path.resolve(currentActualUploadPath) + path.win32.sep) ){
         console.error(`Security alert: Attempt to write file outside designated upload directory. Path: ${filePath}`);
         throw new Error('File path is outside allowed directory.');
    }
    // --- End Path Safety Check ---

    try {
      await fs.writeFile(filePath, buffer);
      // Ensure URL uses forward slashes for web compatibility
      const webDatePath = datePathForUrl.split(path.sep).join('/'); 
      const imageUrl = `/uploads/users/${userId}/${webDatePath}/${filename}`;

      revalidatePath('/');
      revalidatePath('/my-images');
      revalidatePath(`/admin/dashboard`); 

      return {
        success: true,
        data: { name: filename, url: imageUrl, originalName: file.name, userId },
      };
    } catch (error: any) {
      console.error('Failed to save file to disk:', filePath, error);
      return { success: false, error: 'Failed to save file on server. Please try again or contact support if the issue persists.' };
    }
  } catch (e: any) {
    console.error("Unexpected error in uploadImage action:", e);
    return { success: false, error: e.message || "An unexpected server error occurred during upload." };
  }
}


export interface UserImage {
  id: string; // Format: userId/YYYY/MM/DD/filename.ext
  name: string;
  url: string;
  ctime: number; 
  size: number; 
  userId: string;
}

export async function getUserImages(userIdFromSession?: string, limit?: number): Promise<UserImage[]> {
  const userId = userIdFromSession || await getCurrentUserIdFromSession();
  if (!userId) {
    console.log("getUserImages: No userId provided or found in session.");
    return [];
  }

  const userBaseDir = path.join(UPLOAD_DIR_BASE_PUBLIC, userId);

  try {
    const resolvedUserBaseDir = path.resolve(userBaseDir);
    const resolvedUploadDirBase = path.resolve(UPLOAD_DIR_BASE_PUBLIC);

    if (!resolvedUserBaseDir.startsWith(resolvedUploadDirBase + path.sep) &&
        !resolvedUserBaseDir.startsWith(resolvedUploadDirBase + path.win32.sep) ||
        resolvedUserBaseDir === resolvedUploadDirBase) {
        console.error(`Security alert: Attempt to access images outside designated user uploads area. Path: ${userBaseDir}, UserID: ${userId}`);
        return [];
    }
    await fs.access(resolvedUserBaseDir);
  } catch (error: any) {
     if (error.code === 'ENOENT') {
        return []; 
     }
     console.error(`Error accessing user base directory ${userBaseDir}:`, error);
     return [];
  }

  const allImages: UserImage[] = [];
  const yearDirRegex = /^\d{4}$/;
  const monthDirRegex = /^\d{2}$/;
  const dayDirRegex = /^\d{2}$/;

  try {
    const yearDirs = await fs.readdir(userBaseDir, { withFileTypes: true });

    for (const yearDirent of yearDirs) {
      if (yearDirent.isDirectory() && yearDirRegex.test(yearDirent.name)) {
        const yearPath = path.join(userBaseDir, yearDirent.name);
        const monthDirs = await fs.readdir(yearPath, { withFileTypes: true });

        for (const monthDirent of monthDirs) {
          if (monthDirent.isDirectory() && monthDirRegex.test(monthDirent.name)) {
            const monthPath = path.join(yearPath, monthDirent.name);
            const dayDirs = await fs.readdir(monthPath, { withFileTypes: true });

            for (const dayDirent of dayDirs) {
              if (dayDirent.isDirectory() && dayDirRegex.test(dayDirent.name)) {
                const dayPath = path.join(monthPath, dayDirent.name);
                
                // Security Check: Ensure dayPath is within user's base directory structure
                const resolvedDayPath = path.resolve(dayPath);
                 if (!resolvedDayPath.startsWith(path.resolve(userBaseDir) + path.sep) &&
                     !resolvedDayPath.startsWith(path.resolve(userBaseDir) + path.win32.sep)
                    ) {
                    console.warn(`Skipping potentially incorrect path structure: ${dayPath} is not under ${userBaseDir}`);
                    continue;
                }

                try {
                  const filesInDayFolder = await fs.readdir(dayPath);
                  const imageFileDetails = await Promise.all(
                    filesInDayFolder.map(async (file) => {
                      if (file.includes('..') || file.includes('/') || file.includes(path.win32.sep)) {
                        console.warn(`Skipping potentially malicious file name: ${file}`);
                        return null;
                      }
                      
                      const filePath = path.join(dayPath, file);
                      const resolvedFilePath = path.resolve(filePath);
                       if (!resolvedFilePath.startsWith(resolvedDayPath + path.sep) &&
                           !resolvedFilePath.startsWith(resolvedDayPath + path.win32.sep)) {
                            console.warn(`Skipping potentially incorrect file path: ${filePath} is not directly under ${dayPath}`);
                            return null;
                       }

                      try {
                        const statsResult = await stat(filePath);
                        const validExtensions = Object.values(MIME_TO_EXTENSION);
                        if (statsResult.isFile() && validExtensions.some(ext => file.toLowerCase().endsWith(ext))) {
                          const webDatePath = `${yearDirent.name}/${monthDirent.name}/${dayDirent.name}`;
                          return {
                            id: `${userId}/${webDatePath}/${file}`, // Use web-friendly path for ID
                            name: file,
                            url: `/uploads/users/${userId}/${webDatePath}/${file}`, // Use web-friendly path for URL
                            ctime: statsResult.ctimeMs,
                            size: statsResult.size,
                            userId: userId,
                          };
                        }
                      } catch (statError: any) {
                         if (statError.code !== 'ENOENT') {
                             console.error(`Error getting stats for file ${filePath}:`, statError);
                         }
                         return null; 
                      }
                      return null;
                    })
                  );
                  allImages.push(...imageFileDetails.filter((file): file is UserImage => file !== null));
                } catch (readDirError) {
                     console.error(`Error reading directory ${dayPath}:`, readDirError);
                }
              }
            }
          }
        }
      }
    }

    allImages.sort((a, b) => b.ctime - a.ctime);

    if (limit) {
        return allImages.slice(0, limit);
    }
    return allImages;

  } catch (error) {
    console.error(`Failed to read or process user image directories for user ${userId}:`, error);
    return []; 
  }
}

export async function calculateUserTotalStorage(userId: string): Promise<number> {
   if (!userId || typeof userId !== 'string' || userId.includes('..') || userId.includes('/')) {
    console.error('Invalid User ID for calculating storage:', userId);
    return 0;
  }
  const allUserImages = await getUserImages(userId); 
  const totalSize = allUserImages.reduce((acc, image) => acc + image.size, 0);
  return totalSize;
}


export async function countUserImages(userId: string): Promise<number> {
  if (!userId || typeof userId !== 'string' || userId.includes('..') || userId.includes('/')) {
    console.error('Invalid User ID for counting images:', userId);
    return 0;
  }
  const userImages = await getUserImages(userId); 
  return userImages.length;
}


export interface DeleteImageActionState {
    success: boolean;
    error?: string;
}

export async function deleteImage(
  prevState: DeleteImageActionState,
  imagePathFragmentWithUser: string // Now format: "userId/YYYY/MM/DD/filename.ext"
): Promise<DeleteImageActionState> {
  const requestingUserId = await getCurrentUserIdFromSession();
  if (!requestingUserId) {
    return { success: false, error: 'User authentication required for deletion.' };
  }
  
  // Validate fragment structure and components
  if (typeof imagePathFragmentWithUser !== 'string' || imagePathFragmentWithUser.includes('..')) {
    console.error(`Security alert: Invalid imagePathFragment (contains '..' or not a string). User: ${requestingUserId}, Fragment: ${imagePathFragmentWithUser}`);
    return { success: false, error: 'Invalid image path format for deletion (contains ..).' };
  }

  const parts = imagePathFragmentWithUser.split('/');
  if (parts.length !== 5) { // userId, YYYY, MM, DD, filename
    console.error(`Security alert: Invalid imagePathFragment structure. Expected 5 parts, got ${parts.length}. User: ${requestingUserId}, Fragment: ${imagePathFragmentWithUser}`);
    return { success: false, error: 'Invalid image path format for deletion (structure).' };
  }

  const imageOwnerId = parts[0];
  const yearPart = parts[1];
  const monthPart = parts[2];
  const dayPart = parts[3];
  const filename = parts[4];

  if (requestingUserId !== imageOwnerId) {
     console.error(`Security alert: User ${requestingUserId} attempted to delete image owned by ${imageOwnerId}. Fragment: ${imagePathFragmentWithUser}`);
     return { success: false, error: 'Unauthorized: You can only delete your own images.' };
  }


  if (!/^\d{4}$/.test(yearPart) || !/^\d{2}$/.test(monthPart) || !/^\d{2}$/.test(dayPart)) {
      console.error(`Security alert: Invalid date components in fragment. User: ${requestingUserId}, Fragment: ${imagePathFragmentWithUser}`);
      return { success: false, error: 'Invalid image path format for deletion (date parts).' };
  }
  if (!filename || filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
      console.error(`Security alert: Invalid filename component in fragment. User: ${requestingUserId}, Filename: ${filename}`);
      return { success: false, error: 'Invalid image path format for deletion (filename).' };
  }

  const fullServerPath = path.join(UPLOAD_DIR_BASE_PUBLIC, imageOwnerId, yearPart, monthPart, dayPart, filename);

  const userBaseDir = path.resolve(path.join(UPLOAD_DIR_BASE_PUBLIC, requestingUserId));
  const resolvedFullPath = path.resolve(fullServerPath);

  if (!resolvedFullPath.startsWith(userBaseDir + path.sep) &&
      !resolvedFullPath.startsWith(userBaseDir + path.win32.sep)) {
      console.error(`Security alert: User ${requestingUserId} attempted to delete path outside their directory: ${fullServerPath}`);
      return { success: false, error: 'Unauthorized attempt to delete file. Path is outside your allowed directory.' };
  }

  try {
    await fs.access(fullServerPath); 
    await fs.unlink(fullServerPath); 

    revalidatePath('/');
    revalidatePath('/my-images');
    revalidatePath('/admin/dashboard'); 
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
    newId: string; // userId/YYYY/MM/DD/newFilename.ext
    newName: string; // newFilename.ext
    newUrl: string; // /uploads/users/userId/YYYY/MM/DD/newFilename.ext
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

  const currentImageId = formData.get('currentImageId') as string | null; // Format: "userId/YYYY/MM/DD/oldFilename.ext"
  const newNameWithoutExtension = formData.get('newNameWithoutExtension') as string | null;

  if (!currentImageId || !newNameWithoutExtension) {
    return { success: false, error: 'Missing current image ID or new name.' };
  }

  const sanitizedNewName = newNameWithoutExtension.replace(/[^a-zA-Z0-9._-]/g, '_').substring(0, MAX_FILENAME_LENGTH - 10); 
  if (!sanitizedNewName) {
    return { success: false, error: 'New name is invalid or empty after sanitization.' };
  }

  if (typeof currentImageId !== 'string' || currentImageId.includes('..')) {
    console.error(`Security alert: Invalid currentImageId (contains '..' or not a string) for rename. User: ${requestingUserId}, ID: ${currentImageId}`);
    return { success: false, error: 'Invalid current image ID format for renaming (contains ..).' };
  }
  const parts = currentImageId.split('/');
   if (parts.length !== 5) { // userId, YYYY, MM, DD, oldFilename.ext
    console.error(`Security alert: Invalid currentImageId structure. Expected 5 parts, got ${parts.length}. User: ${requestingUserId}, ID: ${currentImageId}`);
    return { success: false, error: 'Invalid current image ID format for renaming (structure).' };
  }
  const imageOwnerId = parts[0];
  const yearPart = parts[1];
  const monthPart = parts[2];
  const dayPart = parts[3];
  const oldFilenameWithExt = parts[4];

  if (requestingUserId !== imageOwnerId) {
    console.error(`Security alert: User ${requestingUserId} attempted to rename image owned by ${imageOwnerId}. ID: ${currentImageId}`);
    return { success: false, error: 'Unauthorized: You can only rename your own images.' };
  }

  if (!/^\d{4}$/.test(yearPart) || !/^\d{2}$/.test(monthPart) || !/^\d{2}$/.test(dayPart)) {
      console.error(`Security alert: Invalid date components in ID for rename. User: ${requestingUserId}, ID: ${currentImageId}`);
      return { success: false, error: 'Invalid current image ID format for renaming (date parts).' };
  }
  if (!oldFilenameWithExt || oldFilenameWithExt.includes('/') || oldFilenameWithExt.includes('\\') || oldFilenameWithExt.includes('..')) {
      console.error(`Security alert: Invalid filename component in ID for rename. User: ${requestingUserId}, Filename: ${oldFilenameWithExt}`);
      return { success: false, error: 'Invalid current image ID format for renaming (filename).' };
  }

  const extension = path.extname(oldFilenameWithExt);
  if (!Object.values(MIME_TO_EXTENSION).includes(extension.toLowerCase())) {
    return { success: false, error: `Invalid or unsupported file extension: ${extension}` };
  }

  const oldPrefix = oldFilenameWithExt.split('-').slice(0, 2).join('-'); 
  let newFilenameWithExt = `${oldPrefix}-${sanitizedNewName}${extension}`;

  if (!/^\d{13}-\d{1,10}-/.test(oldPrefix + '-')) {
      console.warn(`Old filename prefix '${oldPrefix}' does not match expected unique format. Proceeding, but uniqueness relies on original generation.`);
      const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1E9)}`;
      newFilenameWithExt = `${uniqueSuffix}-${sanitizedNewName}${extension}`.substring(0, MAX_FILENAME_LENGTH);
  }
  
  newFilenameWithExt = newFilenameWithExt.substring(0, MAX_FILENAME_LENGTH); 


  if (newFilenameWithExt === oldFilenameWithExt) {
    return { success: false, error: 'New name is the same as the old name.' };
  }

  const userBaseDir = path.resolve(path.join(UPLOAD_DIR_BASE_PUBLIC, requestingUserId));
  const dateSubPath = path.join(yearPart, monthPart, dayPart);
  const oldFullPath = path.join(UPLOAD_DIR_BASE_PUBLIC, requestingUserId, dateSubPath, oldFilenameWithExt);
  const newFullPath = path.join(UPLOAD_DIR_BASE_PUBLIC, requestingUserId, dateSubPath, newFilenameWithExt);

  const resolvedOldPath = path.resolve(oldFullPath);
  const resolvedNewPath = path.resolve(newFullPath);

  const isOldPathSafe = resolvedOldPath.startsWith(userBaseDir + path.sep) || resolvedOldPath.startsWith(userBaseDir + path.win32.sep);
  const isNewPathSafe = resolvedNewPath.startsWith(userBaseDir + path.sep) || resolvedNewPath.startsWith(userBaseDir + path.win32.sep);

  if (!isOldPathSafe || !isNewPathSafe) {
    console.error(`Security alert: User ${requestingUserId} attempted to rename file with path outside their directory. Old: ${oldFullPath}, New: ${newFullPath}`);
    return { success: false, error: 'Unauthorized attempt to rename file. Path is outside your allowed directory.' };
  }

  try {
    await fs.access(oldFullPath);

    try {
      await fs.access(newFullPath);
      console.warn(`Rename conflict: Target file ${newFullPath} already exists.`);
      return { success: false, error: `A file named "${newFilenameWithExt}" unexpectedly already exists.` };
    } catch (e: any) {
      if (e.code !== 'ENOENT') {
         throw e; 
      }
    }

    await fs.rename(oldFullPath, newFullPath);
    
    const webDatePath = `${yearPart}/${monthPart}/${dayPart}`;
    const newUrl = `/uploads/users/${requestingUserId}/${webDatePath}/${newFilenameWithExt}`;
    const newId = `${requestingUserId}/${webDatePath}/${newFilenameWithExt}`;

    revalidatePath('/');
    revalidatePath('/my-images');
    revalidatePath('/admin/dashboard');


    return {
      success: true,
      data: {
        newId,
        newName: newFilenameWithExt,
        newUrl,
      },
    };
  } catch (error: any) {
    if (error.code === 'ENOENT') { 
      return { success: false, error: 'Original file not found. It may have been deleted or moved.' };
    }
    console.error(`Failed to rename file from ${oldFullPath} to ${newFullPath}:`, error);
    return { success: false, error: 'Failed to rename file on server. Please try again.' };
  }
}

/**
 * Security Notes for File System Operations:
 * - User-Specific Directories: All operations are scoped to `UPLOAD_DIR_BASE_PUBLIC/userId/...`.
 * - Path Component Validation:
 *   - `userId`: Checked for `..` and `/` during directory creation. Obtained from secure session.
 *   - `datePath` (`YYYY/MM/DD`): Generated server-side. Format validated during retrieval/delete/rename.
 *   - `filename`: Sanitized on upload (regexp, length limited), includes unique prefix. Validated for traversal characters during delete/rename.
 * - Path Resolution & Canonicalization: `path.join` used for construction, `path.resolve` and `startsWith` checks confine operations strictly within the authenticated user's designated directory structure. This is a key defense against path traversal.
 * - File Extensions: Validated against `MIME_TO_EXTENSION` map and `ACCEPTED_IMAGE_TYPES`.
 * - Input Sanitization for Rename: `newNameWithoutExtension` is sanitized (regexp for allowed chars, length limited).
 * - Race Conditions: While basic checks for file existence are done (e.g., before rename, on delete error), advanced race condition handling (e.g., atomic operations if critical) is not implemented for this local FS demo.
 * - Nginx Configuration: Crucial for serving static files securely (prevent script execution, `X-Content-Type-Options: nosniff`, `client_max_body_size`).
 * - Session Management: Relies on secure JWT handling.
 * - User Authorization: Checks ensure users can only modify/delete their own images. Admin actions are separate.
 */

