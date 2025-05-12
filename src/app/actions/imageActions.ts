// src/app/actions/imageActions.ts
'use server';

import fs from 'fs/promises';
import path from 'path';
import { stat } from 'fs/promises';
import { revalidatePath } from 'next/cache';
import { getCurrentUserIdFromSession, findUserById } from '@/lib/auth/service'; 
import { getMaxUploadSizeMB as getGlobalMaxUploadSizeMB } from '@/lib/settingsService'; // Import global settings service
import type { User } from '@/lib/auth/types'; // Import User type

const UPLOAD_DIR_BASE_PUBLIC = path.join(process.cwd(), 'public/uploads/users');
const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const MIME_TO_EXTENSION: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
};
const MAX_FILENAME_LENGTH = 200; 

function getFormattedDateFolder(): string {
  const now = new Date();
  const month = (now.getMonth() + 1).toString().padStart(2, '0');
  const year = now.getFullYear();
  return `${month}.${year}`;
}

async function ensureUploadDirsExist(userId: string): Promise<string> {
  if (!userId || typeof userId !== 'string' || userId.includes('..') || userId.includes('/')) {
    console.error('Invalid User ID for directory creation:', userId);
    throw new Error('Invalid user ID format.');
  }
  const dateFolder = getFormattedDateFolder();
  const userSpecificPath = path.join(UPLOAD_DIR_BASE_PUBLIC, userId, dateFolder);

  const resolvedUserSpecificPath = path.resolve(userSpecificPath);
  const resolvedUploadDirBase = path.resolve(UPLOAD_DIR_BASE_PUBLIC);

  // Security Check: Ensure the resolved path is strictly within the user's designated base directory
  if (!resolvedUserSpecificPath.startsWith(resolvedUploadDirBase + path.sep) &&
      !resolvedUserSpecificPath.startsWith(resolvedUploadDirBase + path.win32.sep) ||
       resolvedUserSpecificPath === resolvedUploadDirBase) { // Also prevent writing directly into the base 'users' folder
      console.error(`Security alert: Attempt to create directory outside designated uploads area. Path: ${userSpecificPath}, UserID: ${userId}`);
      throw new Error('Path is outside allowed directory for user uploads.');
  }

  try {
    await fs.mkdir(userSpecificPath, { recursive: true });
    // Set permissions if needed, though default usually works if Node process owner is correct. Example:
    // await fs.chmod(userSpecificPath, 0o755); // Adjust permissions as necessary for your setup
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

    // Fetch user details to check limits
    const user = await findUserById(userId) as User | undefined; // Get user details (without password)
    if (!user) {
        return { success: false, error: 'User not found.' };
    }
    
    // Check if user account is approved
    if (user.status !== 'approved') {
       return { success: false, error: `Account status is '${user.status}'. Uploads require 'approved' status.` };
    }

    // --- Limit Checks ---

    // 1. Max Images Limit
    if (user.maxImages !== null && user.maxImages !== undefined) {
        const currentImageCount = await countUserImages(userId);
        if (currentImageCount >= user.maxImages) {
            return { success: false, error: `Upload limit reached (${user.maxImages} images). Please delete some images to upload more.` };
        }
    }
    
    // 2. Max Single Upload Size Limit
    const globalMaxUploadSizeMB = await getGlobalMaxUploadSizeMB();
    const userMaxSingleUploadMB = user.maxSingleUploadSizeMB; // Could be null or number
    // Use user limit if set and lower than global, otherwise use global (or user limit if higher, but capped by server config eventually)
    // For simplicity: Prioritize user limit if set. Global is a fallback. Server config is the absolute cap.
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

    // 3. Max Total Storage Limit (Check *before* writing the file)
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
      currentActualUploadPath = await ensureUploadDirsExist(userId);
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

    // Generate a unique filename to prevent collisions
    const safeOriginalNamePart = path.basename(file.name, path.extname(file.name))
                                   .replace(/[^a-zA-Z0-9_-]/g, '_') // Sanitize
                                   .substring(0, 50); // Limit length
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1E9)}`;
    const filename = `${uniqueSuffix}-${safeOriginalNamePart}${fileExtension}`.substring(0, MAX_FILENAME_LENGTH); // Ensure final length constraint

    const filePath = path.join(currentActualUploadPath, filename);
    const dateFolder = getFormattedDateFolder();

    // --- Path Safety Check (Redundant but good practice) ---
    const resolvedFilePath = path.resolve(filePath);
    if (!resolvedFilePath.startsWith(path.resolve(currentActualUploadPath) + path.sep) &&
        !resolvedFilePath.startsWith(path.resolve(currentActualUploadPath) + path.win32.sep) ){
         console.error(`Security alert: Attempt to write file outside designated upload directory. Path: ${filePath}`);
         throw new Error('File path is outside allowed directory.');
    }
    // --- End Path Safety Check ---


    try {
      await fs.writeFile(filePath, buffer);
      const imageUrl = `/uploads/users/${userId}/${dateFolder}/${filename}`;

      revalidatePath('/');
      revalidatePath('/my-images');
      revalidatePath(`/admin/dashboard`); // Revalidate admin dashboard for user activity updates

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
    // Avoid exposing internal errors directly unless needed for specific debugging
    return { success: false, error: e.message || "An unexpected server error occurred during upload." };
  }
}


export interface UserImage {
  id: string;
  name: string;
  url: string;
  ctime: number;
  size: number; // Add size in bytes
  userId: string;
}

export async function getUserImages(userIdFromSession?: string, limit?: number): Promise<UserImage[]> {
  const userId = userIdFromSession || await getCurrentUserIdFromSession();
  if (!userId) {
    console.log("getUserImages: No userId provided or found in session.");
    return [];
  }

  const userUploadDir = path.join(UPLOAD_DIR_BASE_PUBLIC, userId);

  try {
    // Security Check: Ensure base directory is within the public uploads folder
    const resolvedUserUploadDir = path.resolve(userUploadDir);
    const resolvedUploadDirBase = path.resolve(UPLOAD_DIR_BASE_PUBLIC);

    if (!resolvedUserUploadDir.startsWith(resolvedUploadDirBase + path.sep) &&
        !resolvedUserUploadDir.startsWith(resolvedUploadDirBase + path.win32.sep) ||
        resolvedUserUploadDir === resolvedUploadDirBase) { // Disallow operating directly on the base dir
        console.error(`Security alert: Attempt to access images outside designated user uploads area. Path: ${userUploadDir}, UserID: ${userId}`);
        return [];
    }
    // Check if the directory exists, fail gracefully if not
    await fs.access(resolvedUserUploadDir);
  } catch (error: any) {
     if (error.code === 'ENOENT') {
       // console.log(`User directory not found for user ${userId}, returning empty list.`);
        return []; // User directory doesn't exist, no images.
     }
     console.error(`Error accessing user directory ${userUploadDir}:`, error);
     return []; // Other access error
  }

  const allImages: UserImage[] = [];
  const dateFolderRegex = /^\d{2}\.\d{4}$/;

  try {
    const yearMonthDirs = await fs.readdir(userUploadDir, { withFileTypes: true });

    for (const dirent of yearMonthDirs) {
      if (dirent.isDirectory() && dateFolderRegex.test(dirent.name)) {
        const dateFolderPath = path.join(userUploadDir, dirent.name);
        
        // Security Check: Ensure date folder is directly under user's folder
        const resolvedDateFolderPath = path.resolve(dateFolderPath);
        const resolvedUserUploadDirCheck = path.resolve(userUploadDir); // Re-resolve for safety
        if (!resolvedDateFolderPath.startsWith(resolvedUserUploadDirCheck + path.sep) &&
            !resolvedDateFolderPath.startsWith(resolvedUserUploadDirCheck + path.win32.sep)) {
            console.warn(`Skipping potentially incorrect path structure: ${dateFolderPath} is not directly under ${userUploadDir}`);
            continue;
        }
        
        try {
          const filesInDateFolder = await fs.readdir(dateFolderPath);
          const imageFileDetails = await Promise.all(
            filesInDateFolder.map(async (file) => {
              // Security Check: Basic check on filename components
              if (file.includes('..') || file.includes('/') || file.includes(path.win32.sep)) {
                console.warn(`Skipping potentially malicious file name: ${file}`);
                return null;
              }
              
              const filePath = path.join(dateFolderPath, file);
              // Security Check: Ensure resolved file path is within the date folder path
               const resolvedFilePath = path.resolve(filePath);
               if (!resolvedFilePath.startsWith(resolvedDateFolderPath + path.sep) &&
                   !resolvedFilePath.startsWith(resolvedDateFolderPath + path.win32.sep)) {
                    console.warn(`Skipping potentially incorrect file path: ${filePath} is not directly under ${dateFolderPath}`);
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
                    size: statsResult.size, // Include file size
                    userId: userId,
                  };
                }
              } catch (statError: any) {
                 // Log stat errors if they aren't 'file not found' during a race condition etc.
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
             console.error(`Error reading directory ${dateFolderPath}:`, readDirError);
            // Continue to next directory if one fails
        }
      }
    }

    // Sort images by creation time, newest first
    allImages.sort((a, b) => b.ctime - a.ctime);

    // Apply limit if provided
    if (limit) {
        return allImages.slice(0, limit);
    }
    return allImages;

  } catch (error) {
    // Handle potential errors reading the main user directory itself
    console.error(`Failed to read or process user image directories for user ${userId}:`, error);
    return []; // Return empty on failure
  }
}

// Calculates total storage used by a user in bytes
export async function calculateUserTotalStorage(userId: string): Promise<number> {
   if (!userId || typeof userId !== 'string' || userId.includes('..') || userId.includes('/')) {
    console.error('Invalid User ID for calculating storage:', userId);
    return 0;
  }
  // Fetch all images *without* limit to get total size
  const allUserImages = await getUserImages(userId); 
  
  // Sum the sizes
  const totalSize = allUserImages.reduce((acc, image) => acc + image.size, 0);
  
  return totalSize;
}


export async function countUserImages(userId: string): Promise<number> {
  // Basic validation for userId
  if (!userId || typeof userId !== 'string' || userId.includes('..') || userId.includes('/')) {
    console.error('Invalid User ID for counting images:', userId);
    return 0;
  }
  const userImages = await getUserImages(userId); // Pass userId directly
  return userImages.length;
}


export interface DeleteImageActionState {
    success: boolean;
    error?: string;
}

export async function deleteImage(
  prevState: DeleteImageActionState,
  imagePathFragment: string
): Promise<DeleteImageActionState> {
  const requestingUserId = await getCurrentUserIdFromSession();
  if (!requestingUserId) {
    return { success: false, error: 'User authentication required for deletion.' };
  }

  // Security: Validate fragment structure and components
  if (typeof imagePathFragment !== 'string' || imagePathFragment.includes('..')) {
    console.error(`Security alert: Invalid imagePathFragment (contains '..' or not a string). User: ${requestingUserId}, Fragment: ${imagePathFragment}`);
    return { success: false, error: 'Invalid image path format for deletion.' };
  }

  const parts = imagePathFragment.split('/');
  if (parts.length !== 2) {
    console.error(`Security alert: Invalid imagePathFragment structure (not 'folder/file'). User: ${requestingUserId}, Fragment: ${imagePathFragment}`);
    return { success: false, error: 'Invalid image path format for deletion.' };
  }

  const dateFolder = parts[0];
  const filename = parts[1];

  // Validate date folder format
  if (!/^\d{2}\.\d{4}$/.test(dateFolder)) {
      console.error(`Security alert: Invalid date folder component in fragment. User: ${requestingUserId}, DateFolder: ${dateFolder}`);
      return { success: false, error: 'Invalid image path format for deletion.' };
  }
  // Validate filename for potentially harmful characters or structures
  if (!filename || filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
      console.error(`Security alert: Invalid filename component in fragment. User: ${requestingUserId}, Filename: ${filename}`);
      return { success: false, error: 'Invalid image path format for deletion.' };
  }

  const fullServerPath = path.join(UPLOAD_DIR_BASE_PUBLIC, requestingUserId, dateFolder, filename);

  // Security Check: Ensure the final resolved path is within the user's directory
  const userBaseDir = path.resolve(path.join(UPLOAD_DIR_BASE_PUBLIC, requestingUserId));
  const resolvedFullPath = path.resolve(fullServerPath);

  if (!resolvedFullPath.startsWith(userBaseDir + path.sep) &&
      !resolvedFullPath.startsWith(userBaseDir + path.win32.sep)) {
      console.error(`Security alert: User ${requestingUserId} attempted to delete path outside their directory: ${fullServerPath}`);
      return { success: false, error: 'Unauthorized attempt to delete file. Path is outside your allowed directory.' };
  }

  try {
    await fs.access(fullServerPath); // Check if file exists before unlinking
    await fs.unlink(fullServerPath); // Delete the file

    revalidatePath('/');
    revalidatePath('/my-images');
    revalidatePath('/admin/dashboard'); // Update admin view if needed
    return { success: true };
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      // File already gone, treat as success? Or inform user? Let's inform.
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
    newId: string;
    newName: string;
    newUrl: string;
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

  // Sanitize the new name (allow letters, numbers, dot, underscore, hyphen) and limit length
  const sanitizedNewName = newNameWithoutExtension.replace(/[^a-zA-Z0-9._-]/g, '_').substring(0, MAX_FILENAME_LENGTH - 10); // Leave space for timestamp/extension
  if (!sanitizedNewName) {
    return { success: false, error: 'New name is invalid or empty after sanitization.' };
  }

  // Security: Validate fragment structure and components
  if (typeof currentImagePathFragment !== 'string' || currentImagePathFragment.includes('..')) {
    console.error(`Security alert: Invalid currentImagePathFragment (contains '..' or not a string) for rename. User: ${requestingUserId}, Fragment: ${currentImagePathFragment}`);
    return { success: false, error: 'Invalid current image path format for renaming.' };
  }
  const parts = currentImagePathFragment.split('/');
   if (parts.length !== 2) {
    console.error(`Security alert: Invalid currentImagePathFragment structure (not 'folder/file') for rename. User: ${requestingUserId}, Fragment: ${currentImagePathFragment}`);
    return { success: false, error: 'Invalid current image path format for renaming.' };
  }
  const dateFolder = parts[0];
  const oldFilenameWithExt = parts[1];

   // Validate date folder format
  if (!/^\d{2}\.\d{4}$/.test(dateFolder)) {
      console.error(`Security alert: Invalid date folder component in fragment for rename. User: ${requestingUserId}, DateFolder: ${dateFolder}`);
      return { success: false, error: 'Invalid current image path format for renaming.' };
  }
   // Validate old filename format
  if (!oldFilenameWithExt || oldFilenameWithExt.includes('/') || oldFilenameWithExt.includes('\\') || oldFilenameWithExt.includes('..')) {
      console.error(`Security alert: Invalid filename component in fragment for rename. User: ${requestingUserId}, Filename: ${oldFilenameWithExt}`);
      return { success: false, error: 'Invalid current image path format for renaming.' };
  }

  const extension = path.extname(oldFilenameWithExt);
  if (!Object.values(MIME_TO_EXTENSION).includes(extension.toLowerCase())) {
    return { success: false, error: `Invalid or unsupported file extension: ${extension}` };
  }

  // Construct new filename *with* the same unique prefix from the old name to preserve uniqueness guarantee
  const oldPrefix = oldFilenameWithExt.split('-').slice(0, 2).join('-'); // Assuming format is uniqueSuffix-safeOriginalNamePart.ext
  let newFilenameWithExt = `${oldPrefix}-${sanitizedNewName}${extension}`;

  // Optional: Add extra check to ensure the prefix looks like timestamp-random
  if (!/^\d{13}-\d{1,10}-/.test(oldPrefix + '-')) {
      console.warn(`Old filename prefix '${oldPrefix}' does not match expected unique format. Proceeding, but uniqueness relies on original generation.`);
      // Fallback if prefix extraction failed - generate a *new* unique name
      const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1E9)}`;
      newFilenameWithExt = `${uniqueSuffix}-${sanitizedNewName}${extension}`.substring(0, MAX_FILENAME_LENGTH);
  }
  
  newFilenameWithExt = newFilenameWithExt.substring(0, MAX_FILENAME_LENGTH); // Final length check


  if (newFilenameWithExt === oldFilenameWithExt) {
    return { success: false, error: 'New name is the same as the old name.' };
  }

  const userBaseDir = path.resolve(path.join(UPLOAD_DIR_BASE_PUBLIC, requestingUserId));
  const oldFullPath = path.join(UPLOAD_DIR_BASE_PUBLIC, requestingUserId, dateFolder, oldFilenameWithExt);
  const newFullPath = path.join(UPLOAD_DIR_BASE_PUBLIC, requestingUserId, dateFolder, newFilenameWithExt);

  // Security Check: Ensure both old and new paths resolve within the user's directory
  const resolvedOldPath = path.resolve(oldFullPath);
  const resolvedNewPath = path.resolve(newFullPath);

  const isOldPathSafe = resolvedOldPath.startsWith(userBaseDir + path.sep) || resolvedOldPath.startsWith(userBaseDir + path.win32.sep);
  const isNewPathSafe = resolvedNewPath.startsWith(userBaseDir + path.sep) || resolvedNewPath.startsWith(userBaseDir + path.win32.sep);

  if (!isOldPathSafe || !isNewPathSafe) {
    console.error(`Security alert: User ${requestingUserId} attempted to rename file with path outside their directory. Old: ${oldFullPath}, New: ${newFullPath}`);
    return { success: false, error: 'Unauthorized attempt to rename file. Path is outside your allowed directory.' };
  }

  try {
    // Check if old file exists
    await fs.access(oldFullPath);

    // Check if new file name already exists (should be unlikely due to unique prefix)
    try {
      await fs.access(newFullPath);
      // If access succeeds, the file exists. This shouldn't happen if unique prefixes are preserved.
      console.warn(`Rename conflict: Target file ${newFullPath} already exists.`);
      return { success: false, error: `A file named "${newFilenameWithExt}" unexpectedly already exists.` };
    } catch (e: any) {
      if (e.code !== 'ENOENT') {
         // Error other than "not found" while checking new path
         throw e; 
      }
      // ENOENT is expected - new file name doesn't exist, proceed with rename.
    }

    // Perform the rename
    await fs.rename(oldFullPath, newFullPath);

    const newUrl = `/uploads/users/${requestingUserId}/${dateFolder}/${newFilenameWithExt}`;
    const newId = `${requestingUserId}/${dateFolder}/${newFilenameWithExt}`;

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
    if (error.code === 'ENOENT') { // Check if the *original* file was not found
      return { success: false, error: 'Original file not found. It may have been deleted or moved.' };
    }
    console.error(`Failed to rename file from ${oldFullPath} to ${newFullPath}:`, error);
    return { success: false, error: 'Failed to rename file on server. Please try again.' };
  }
}

/**
 * Note on Security (Local File System):
 * - User IDs in paths: User IDs from session are assumed to be non-malleable (e.g., UUIDs). Additional checks for '..' or '/' in `userId` are done where directories are created. Path resolution checks ensure operations stay within the user's designated folder (`public/uploads/users/[userId]`).
 * - Path construction: `path.join` is used for constructing FS paths. `path.resolve` is used for canonicalizing paths for security checks against the user's base directory.
 * - Input Sanitization: 
 *   - `imagePathFragment` (format `MM.YYYY/filename.ext`) for delete/rename is parsed and components (`dateFolder`, `filename`) are individually validated.
 *   - `newNameWithoutExtension` for rename is sanitized (regexp replace for allowed chars) and length-limited.
 *   - File extensions are validated against `MIME_TO_EXTENSION` map.
 *   - Filenames on upload include a unique prefix (`timestamp-random`) to prevent collisions and overwrites. Filenames are sanitized.
 * - Path Traversal Prevention: Critical checks using `path.resolve` and `startsWith` are implemented in `ensureUploadDirsExist`, `getUserImages`, `deleteImage`, and `renameImage` to confine operations strictly within the authenticated user's designated directory under `UPLOAD_DIR_BASE_PUBLIC`.
 * - File Permissions: The Node.js process needs read/write permissions to `public/uploads/users/*`, `users.json`, `server-settings.json`. Nginx needs read access to serve images. Correct ownership and permissions (e.g., `chown nodeuser:nodeuser`, `chmod 755`) are essential in deployment.
 * - Overwriting: Prevented by using unique filenames on upload. Rename checks if the target exists.
 * - Nginx Configuration: Should serve files directly, disable script execution, set `X-Content-Type-Options: nosniff`, and enforce `client_max_body_size`.
 * - Session Management: Relies on secure JWT handling (HTTP-only cookies, strong secret key, HTTPS).
 * - Limit Enforcement: User-specific limits (image count, file size, total storage) are checked server-side in `uploadImage`.
 */
