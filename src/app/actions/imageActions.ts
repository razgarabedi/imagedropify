
// src/app/actions/imageActions.ts
'use server';

import fs from 'fs/promises';
import path from 'path';
import { stat } from 'fs/promises';
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers'; // Import cookies
import { getCurrentUserIdFromSession, findUserById } from '@/lib/auth/service';
import { getMaxUploadSizeMB as getGlobalMaxUploadSizeMB } from '@/lib/settingsService';
import type { User } from '@/lib/auth/types';
import { 
    DEFAULT_FOLDER_NAME, 
    MAX_FILENAME_LENGTH,
    ACCEPTED_IMAGE_TYPES,
    MIME_TO_EXTENSION
} from '@/lib/imageConfig';

const UPLOAD_DIR_BASE_PUBLIC = path.join(process.cwd(), 'public/uploads/users');

// Returns a path like "YYYY/MM/DD"
function getFormattedDatePath(): string {
  const now = new Date();
  const year = now.getFullYear().toString();
  const month = (now.getMonth() + 1).toString().padStart(2, '0');
  const day = now.getDate().toString().padStart(2, '0');
  return path.join(year, month, day);
}

// Ensures upload directories exist, including the specified folderName
async function ensureUploadDirsExist(userId: string, folderName: string): Promise<string> {
  if (!userId || typeof userId !== 'string' || userId.includes('..') || userId.includes('/')) {
    console.error('Invalid User ID for directory creation:', userId);
    throw new Error('Invalid user ID format.');
  }
  // Validate folderName: prevent path traversal, empty names, or excessively long names
  if (!folderName || folderName.includes('..') || folderName.includes('/') || folderName.length > 100) {
    console.error('Invalid folderName for directory creation:', folderName);
    throw new Error('Invalid folder name format or length.');
  }

  const datePath = getFormattedDatePath(); // "YYYY/MM/DD"
  // Path structure: userId/folderName/YYYY/MM/DD
  const fullFolderPath = path.join(UPLOAD_DIR_BASE_PUBLIC, userId, folderName, datePath);

  const resolvedFullFolderPath = path.resolve(fullFolderPath);
  // Base path for security check: uploads/users/userId/folderName
  const resolvedUserFolderBase = path.resolve(path.join(UPLOAD_DIR_BASE_PUBLIC, userId, folderName));


  if (!resolvedFullFolderPath.startsWith(resolvedUserFolderBase + path.sep) &&
      !resolvedFullFolderPath.startsWith(resolvedUserFolderBase + path.win32.sep) ||
       resolvedFullFolderPath === resolvedUserFolderBase) {
      console.error(`Security alert: Attempt to create directory outside designated folder area. Path: ${fullFolderPath}, UserID: ${userId}, Folder: ${folderName}`);
      throw new Error('Path is outside allowed directory for user folder uploads.');
  }

  try {
    // Explicitly set mode 0o755 (rwxr-xr-x) for created directories.
    // This ensures owner (node_user) has rwx, and group/others have rx (read/traverse).
    await fs.mkdir(fullFolderPath, { recursive: true, mode: 0o755 });
  } catch (error) {
    console.error('CRITICAL: Failed to create user-specific folder upload directory structure:', fullFolderPath, error);
    throw new Error(`Failed to prepare upload directory: ${fullFolderPath}. Check server logs and directory permissions.`);
  }
  return fullFolderPath;
}


export interface UploadedImageServerData {
  id: string; // Now: userId/folderName/YYYY/MM/DD/filename.ext
  name: string;
  url: string; // Now: /uploads/users/userId/folderName/YYYY/MM/DD/filename.ext
  originalName: string;
  userId: string;
  folderName: string;
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
      const cookieStore = await cookies();
      const tokenExists = cookieStore.has('session_token');
      if (!tokenExists) {
          return { success: false, error: 'Upload failed: Session token not found. Please log in.' };
      } else {
          return { success: false, error: 'Upload failed: Session token invalid or expired. Please log in again.' };
      }
    }

    const user = await findUserById(userId) as User | undefined;
    if (!user) {
        return { success: false, error: 'User not found.' };
    }
    if (user.status !== 'approved') {
       return { success: false, error: `Account status is '${user.status}'. Uploads require 'approved' status.` };
    }

    const folderNameInput = formData.get('folderName') as string | null;
    const targetFolderName = (folderNameInput && folderNameInput.trim() !== "") ? folderNameInput.trim() : DEFAULT_FOLDER_NAME;

    // Validate targetFolderName against potentially harmful characters or patterns
    if (targetFolderName.includes('..') || targetFolderName.includes('/') || targetFolderName.includes('\\')) {
        return { success: false, error: 'Invalid folder name specified for upload.' };
    }


    if (user.maxImages !== null && user.maxImages !== undefined) {
        const currentImageCount = await countUserImages(userId, null); // Count across all folders
        if (currentImageCount >= user.maxImages) {
            return { success: false, error: `Upload limit reached (${user.maxImages} images). Please delete some images to upload more.` };
        }
    }
    
    const globalMaxUploadSizeMB = await getGlobalMaxUploadSizeMB();
    const userMaxSingleUploadMB = user.maxSingleUploadSizeMB;
    const effectiveMaxSingleMB = userMaxSingleUploadMB !== null && userMaxSingleUploadSizeMB !== undefined
                                ? userMaxSingleUploadSizeMB
                                : globalMaxUploadSizeMB;
    const effectiveMaxSingleBytes = effectiveMaxSingleMB * 1024 * 1024;

    const file = formData.get('image') as File | null;
    if (!file) {
      return { success: false, error: 'No file provided.' };
    }
    if (file.size > effectiveMaxSingleBytes) {
       return { success: false, error: `File too large (${(file.size / (1024 * 1024)).toFixed(2)}MB). Max allowed for you: ${effectiveMaxSingleMB}MB.` };
    }
     if (user.maxTotalStorageMB !== null && user.maxTotalStorageMB !== undefined) {
        const currentTotalStorageBytes = await calculateUserTotalStorage(userId);
        const maxTotalStorageBytes = user.maxTotalStorageMB * 1024 * 1024;
        const projectedTotalBytes = currentTotalStorageBytes + file.size;
        if (projectedTotalBytes > maxTotalStorageBytes) {
            return { success: false, error: `Insufficient storage space. You need ${(file.size / (1024*1024)).toFixed(2)}MB, current usage: ${(currentTotalStorageBytes / (1024*1024)).toFixed(2)}MB / ${user.maxTotalStorageMB}MB limit.` };
        }
    }

    let currentActualUploadPath: string;
    try {
      currentActualUploadPath = await ensureUploadDirsExist(userId, targetFolderName);
    } catch (error: any) {
      console.error('Upload directory preparation failed:', error);
      return { success: false, error: error.message || 'Server error preparing upload directory.' };
    }

    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      return { success: false, error: `Invalid file type. Accepted: JPG, PNG, GIF, WebP. Provided: ${file.type}` };
    }
    const fileExtension = MIME_TO_EXTENSION[file.type];
    if (!fileExtension) {
      return { success: false, error: `Unsupported file type (${file.type}).` };
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const safeOriginalNamePart = path.basename(file.name, path.extname(file.name))
                                   .replace(/[^a-zA-Z0-9_-]/g, '_')
                                   .substring(0, 50);
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1E9)}`;
    const filename = `${uniqueSuffix}-${safeOriginalNamePart}${fileExtension}`.substring(0, MAX_FILENAME_LENGTH);
    const filePath = path.join(currentActualUploadPath, filename);
    
    const datePathForUrl = getFormattedDatePath(); 

    const resolvedFilePath = path.resolve(filePath);
    if (!resolvedFilePath.startsWith(path.resolve(currentActualUploadPath) + path.sep) &&
        !resolvedFilePath.startsWith(path.resolve(currentActualUploadPath) + path.win32.sep) ){
         console.error(`Security alert: Attempt to write file outside designated upload directory. Path: ${filePath}`);
         throw new Error('File path is outside allowed directory.');
    }

    try {
      // Explicitly set mode 0o644 (rw-r--r--) for the created file.
      // This ensures owner (node_user) has rw, and group/others have r (read).
      await fs.writeFile(filePath, buffer, { mode: 0o644 });
      
      const webDatePath = datePathForUrl.split(path.sep).join('/');
      // URL and ID now include targetFolderName
      const imageUrl = `/uploads/users/${userId}/${targetFolderName}/${webDatePath}/${filename}`;
      const imageId = `${userId}/${targetFolderName}/${webDatePath}/${filename}`;

      revalidatePath('/');
      revalidatePath('/my-images');
      revalidatePath(`/admin/dashboard`);

      return {
        success: true,
        data: { id: imageId, name: filename, url: imageUrl, originalName: file.name, userId, folderName: targetFolderName },
      };
    } catch (error: any) {
      console.error('Failed to save file to disk:', filePath, error);
      return { success: false, error: 'Failed to save file on server.' };
    }
  } catch (e: any) {
    console.error("Unexpected error in uploadImage action:", e);
    return { success: false, error: e.message || "An unexpected server error occurred during upload." };
  }
}

export interface UserImage {
  id: string; // Format: userId/folderName/YYYY/MM/DD/filename.ext
  name: string;
  url: string;
  ctime: number;
  size: number;
  userId: string;
  folderName: string;
}

// Fetches images. If targetFolderName is null, it fetches for ALL folders of the user.
// If targetFolderName is specified, it fetches only for that folder.
export async function getUserImages(userIdFromSession?: string, limit?: number, targetFolderName?: string | null): Promise<UserImage[]> {
  const userId = userIdFromSession || await getCurrentUserIdFromSession();
  if (!userId) {
    console.log("getUserImages: No userId provided or found in session.");
    return [];
  }

  const allImages: UserImage[] = [];
  
  let foldersToScan: string[] = [];
  if (targetFolderName === null) { // Fetch from all folders
    const userFolders = await listUserFolders(userId);
    foldersToScan = userFolders.map(f => f.name);
    if (!foldersToScan.includes(DEFAULT_FOLDER_NAME)) { // Ensure default folder is scanned if fetching all
        foldersToScan.push(DEFAULT_FOLDER_NAME);
    }
  } else if (targetFolderName) { // Fetch from a specific folder
    foldersToScan = [targetFolderName];
  } else {
    // If targetFolderName is undefined (or empty string, though UI should prevent that), default to DEFAULT_FOLDER_NAME
    foldersToScan = [DEFAULT_FOLDER_NAME];
  }


  for (const folderName of foldersToScan) {
    const userFolderBaseDir = path.join(UPLOAD_DIR_BASE_PUBLIC, userId, folderName);

    try {
      const resolvedUserFolderBaseDir = path.resolve(userFolderBaseDir);
      const resolvedUploadDirBase = path.resolve(path.join(UPLOAD_DIR_BASE_PUBLIC, userId)); // User's root

      if (!resolvedUserFolderBaseDir.startsWith(resolvedUploadDirBase + path.sep) &&
          !resolvedUserFolderBaseDir.startsWith(resolvedUploadDirBase + path.win32.sep) ||
          resolvedUserFolderBaseDir === path.resolve(UPLOAD_DIR_BASE_PUBLIC) // Prevent scanning above users dir
          ) {
          console.error(`Security alert: Attempt to access images outside designated user folder area. Path: ${userFolderBaseDir}, UserID: ${userId}, Folder: ${folderName}`);
          continue; // Skip this folder
      }
      await fs.access(resolvedUserFolderBaseDir);
    } catch (error: any) {
       if (error.code === 'ENOENT') {
          // If the default folder doesn't exist yet (e.g. user hasn't uploaded anything to it),
          // it's not an error, just means no images there.
          if (folderName === DEFAULT_FOLDER_NAME && targetFolderName !== null) {
            // console.log(`Default folder ${DEFAULT_FOLDER_NAME} for user ${userId} does not exist yet.`);
          } else if (folderName !== DEFAULT_FOLDER_NAME) {
            // console.log(`User-created folder ${folderName} for user ${userId} does not exist.`);
          }
          continue; // Folder doesn't exist, skip
       }
       console.error(`Error accessing user folder base directory ${userFolderBaseDir}:`, error);
       continue; // Skip this folder on other errors
    }

    const yearDirRegex = /^\d{4}$/;
    const monthDirRegex = /^\d{2}$/;
    const dayDirRegex = /^\d{2}$/;

    try {
      const yearDirs = await fs.readdir(userFolderBaseDir, { withFileTypes: true });
      for (const yearDirent of yearDirs) {
        if (yearDirent.isDirectory() && yearDirRegex.test(yearDirent.name)) {
          const yearPath = path.join(userFolderBaseDir, yearDirent.name);
          const monthDirs = await fs.readdir(yearPath, { withFileTypes: true });
          for (const monthDirent of monthDirs) {
            if (monthDirent.isDirectory() && monthDirRegex.test(monthDirent.name)) {
              const monthPath = path.join(yearPath, monthDirent.name);
              const dayDirs = await fs.readdir(monthPath, { withFileTypes: true });
              for (const dayDirent of dayDirs) {
                if (dayDirent.isDirectory() && dayDirRegex.test(dayDirent.name)) {
                  const dayPath = path.join(monthPath, dayDirent.name);
                  const resolvedDayPath = path.resolve(dayPath);
                   if (!resolvedDayPath.startsWith(path.resolve(userFolderBaseDir) + path.sep) &&
                       !resolvedDayPath.startsWith(path.resolve(userFolderBaseDir) + path.win32.sep)
                      ) {
                      console.warn(`Skipping potentially incorrect path structure: ${dayPath}`);
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
                              console.warn(`Skipping potentially incorrect file path: ${filePath}`);
                              return null;
                         }
                        try {
                          const statsResult = await stat(filePath);
                          const validExtensions = Object.values(MIME_TO_EXTENSION);
                          if (statsResult.isFile() && validExtensions.some(ext => file.toLowerCase().endsWith(ext))) {
                            const webDatePath = `${yearDirent.name}/${monthDirent.name}/${dayDirent.name}`;
                            return {
                              id: `${userId}/${folderName}/${webDatePath}/${file}`,
                              name: file,
                              url: `/uploads/users/${userId}/${folderName}/${webDatePath}/${file}`,
                              ctime: statsResult.ctimeMs,
                              size: statsResult.size,
                              userId: userId,
                              folderName: folderName,
                            };
                          }
                        } catch (statError: any) {
                           if (statError.code !== 'ENOENT') console.error(`Error getting stats for file ${filePath}:`, statError);
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
    } catch (error) {
      console.error(`Failed to read/process image dirs for user ${userId}, folder ${folderName}:`, error);
    }
  } // End folder loop

  allImages.sort((a, b) => b.ctime - a.ctime);
  // Apply limit only if fetching for a specific folder OR globally (if targetFolderName is null).
  // If targetFolderName is null, the limit applies to the grand total after iterating all folders.
  // If targetFolderName is specified, the limit applies to that folder's content.
  if (limit) { 
      return allImages.slice(0, limit);
  }
  return allImages;
}


export async function calculateUserTotalStorage(userId: string): Promise<number> {
   if (!userId || typeof userId !== 'string' || userId.includes('..') || userId.includes('/')) {
    console.error('Invalid User ID for calculating storage:', userId);
    return 0;
  }
  const allUserImages = await getUserImages(userId, undefined, null); // Get all images from all folders
  const totalSize = allUserImages.reduce((acc, image) => acc + image.size, 0);
  return totalSize;
}

export async function countUserImages(userId: string, targetFolderName?: string | null): Promise<number> {
  if (!userId || typeof userId !== 'string' || userId.includes('..') || userId.includes('/')) {
    console.error('Invalid User ID for counting images:', userId);
    return 0;
  }
  // If targetFolderName is null, count across all folders. If specified, count in that folder.
  const userImages = await getUserImages(userId, undefined, targetFolderName);
  return userImages.length;
}

export interface DeleteImageActionState {
    success: boolean;
    error?: string;
}

// imageId is now format: "userId/folderName/YYYY/MM/DD/filename.ext"
export async function deleteImage(
  prevState: DeleteImageActionState,
  imageId: string
): Promise<DeleteImageActionState> {
  const requestingUserId = await getCurrentUserIdFromSession();
  if (!requestingUserId) {
     const cookieStore = await cookies();
     const tokenExists = cookieStore.has('session_token');
     if (!tokenExists) {
         return { success: false, error: 'Delete failed: Session token not found. Please log in.' };
     } else {
         return { success: false, error: 'Delete failed: Session token invalid or expired. Please log in again.' };
     }
  }

  if (typeof imageId !== 'string' || imageId.includes('..')) {
    console.error(`Security alert: Invalid imageId (contains '..'). User: ${requestingUserId}, ID: ${imageId}`);
    return { success: false, error: 'Invalid image ID format (contains ..).' };
  }

  const parts = imageId.split('/');
  if (parts.length !== 6) { // userId, folderName, YYYY, MM, DD, filename
    console.error(`Security alert: Invalid imageId structure. Expected 6 parts, got ${parts.length}. User: ${requestingUserId}, ID: ${imageId}`);
    return { success: false, error: 'Invalid image ID format (structure).' };
  }

  const imageOwnerId = parts[0];
  const folderName = parts[1];
  const yearPart = parts[2];
  const monthPart = parts[3];
  const dayPart = parts[4];
  const filename = parts[5];

  if (requestingUserId !== imageOwnerId) {
     console.error(`Security alert: User ${requestingUserId} attempted to delete image owned by ${imageOwnerId}. ID: ${imageId}`);
     return { success: false, error: 'Unauthorized: You can only delete your own images.' };
  }
  if (!folderName || folderName.includes('/') || folderName.includes('\\') || folderName.includes('..')) {
      console.error(`Security alert: Invalid folderName component in ID. User: ${requestingUserId}, Folder: ${folderName}`);
      return { success: false, error: 'Invalid image ID format (folderName).' };
  }
  if (!/^\d{4}$/.test(yearPart) || !/^\d{2}$/.test(monthPart) || !/^\d{2}$/.test(dayPart)) {
      console.error(`Security alert: Invalid date components in ID. User: ${requestingUserId}, ID: ${imageId}`);
      return { success: false, error: 'Invalid image ID format (date parts).' };
  }
  if (!filename || filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
      console.error(`Security alert: Invalid filename component in ID. User: ${requestingUserId}, Filename: ${filename}`);
      return { success: false, error: 'Invalid image ID format (filename).' };
  }

  const fullServerPath = path.join(UPLOAD_DIR_BASE_PUBLIC, imageOwnerId, folderName, yearPart, monthPart, dayPart, filename);
  // Security check base path: uploads/users/userId/folderName/
  const userFolderBaseDir = path.resolve(path.join(UPLOAD_DIR_BASE_PUBLIC, requestingUserId, folderName));
  const resolvedFullPath = path.resolve(fullServerPath);

  if (!resolvedFullPath.startsWith(userFolderBaseDir + path.sep) &&
      !resolvedFullPath.startsWith(userFolderBaseDir + path.win32.sep)) {
      console.error(`Security alert: User ${requestingUserId} attempted to delete path outside their folder: ${fullServerPath}`);
      return { success: false, error: 'Unauthorized attempt to delete file. Path is outside your allowed folder directory.' };
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
    newId: string; // userId/folderName/YYYY/MM/DD/newFilename.ext
    newName: string; // newFilename.ext
    newUrl: string; // /uploads/users/userId/folderName/YYYY/MM/DD/newFilename.ext
  };
}

export async function renameImage(
  prevState: RenameImageActionState,
  formData: FormData
): Promise<RenameImageActionState> {
  const requestingUserId = await getCurrentUserIdFromSession();
  if (!requestingUserId) {
    const cookieStore = await cookies();
    const tokenExists = cookieStore.has('session_token');
    if (!tokenExists) {
        return { success: false, error: 'Rename failed: Session token not found. Please log in.' };
    } else {
        return { success: false, error: 'Rename failed: Session token invalid or expired. Please log in again.' };
    }
  }

  const currentImageId = formData.get('currentImageId') as string | null; // Format: "userId/folderName/YYYY/MM/DD/oldFilename.ext"
  const newNameWithoutExtension = formData.get('newNameWithoutExtension') as string | null;

  if (!currentImageId || !newNameWithoutExtension) {
    return { success: false, error: 'Missing current image ID or new name.' };
  }

  const sanitizedNewName = newNameWithoutExtension.replace(/[^a-zA-Z0-9._-]/g, '_').substring(0, MAX_FILENAME_LENGTH - 10); // Leave space for prefix and extension
  if (!sanitizedNewName) {
    return { success: false, error: 'New name is invalid or empty after sanitization.' };
  }

  if (typeof currentImageId !== 'string' || currentImageId.includes('..')) {
    return { success: false, error: 'Invalid current image ID format (contains ..).' };
  }
  const parts = currentImageId.split('/');
   if (parts.length !== 6) { // userId, folderName, YYYY, MM, DD, oldFilename.ext
    return { success: false, error: 'Invalid current image ID format (structure).' };
  }
  const imageOwnerId = parts[0];
  const folderName = parts[1];
  const yearPart = parts[2];
  const monthPart = parts[3];
  const dayPart = parts[4];
  const oldFilenameWithExt = parts[5];

  if (requestingUserId !== imageOwnerId) {
    return { success: false, error: 'Unauthorized: You can only rename your own images.' };
  }
  if (!folderName || folderName.includes('/') || folderName.includes('\\') || folderName.includes('..')) {
      return { success: false, error: 'Invalid image ID format (folderName).' };
  }
  if (!/^\d{4}$/.test(yearPart) || !/^\d{2}$/.test(monthPart) || !/^\d{2}$/.test(dayPart)) {
      return { success: false, error: 'Invalid current image ID format (date parts).' };
  }
  if (!oldFilenameWithExt || oldFilenameWithExt.includes('/') || oldFilenameWithExt.includes('\\') || oldFilenameWithExt.includes('..')) {
      return { success: false, error: 'Invalid current image ID format (filename).' };
  }

  const extension = path.extname(oldFilenameWithExt);
  if (!Object.values(MIME_TO_EXTENSION).includes(extension.toLowerCase())) {
    return { success: false, error: `Invalid or unsupported file extension: ${extension}` };
  }

  // Preserve the unique prefix from the old filename if it exists and looks like our timestamp-random prefix
  const oldPrefixMatch = oldFilenameWithExt.match(/^(\d{13}-\d{1,10})-/);
  const oldPrefix = oldPrefixMatch ? oldPrefixMatch[1] : `${Date.now()}-${Math.round(Math.random() * 1E9)}`;

  let newFilenameWithExt = `${oldPrefix}-${sanitizedNewName}${extension}`;
  newFilenameWithExt = newFilenameWithExt.substring(0, MAX_FILENAME_LENGTH);


  if (newFilenameWithExt === oldFilenameWithExt) {
    return { success: false, error: 'New name is the same as the old name.' };
  }

  // Base path for security check: uploads/users/userId/folderName/
  const userFolderBaseDir = path.resolve(path.join(UPLOAD_DIR_BASE_PUBLIC, requestingUserId, folderName));
  const dateSubPath = path.join(yearPart, monthPart, dayPart);

  const oldFullPath = path.join(UPLOAD_DIR_BASE_PUBLIC, requestingUserId, folderName, dateSubPath, oldFilenameWithExt);
  const newFullPath = path.join(UPLOAD_DIR_BASE_PUBLIC, requestingUserId, folderName, dateSubPath, newFilenameWithExt);

  const resolvedOldPath = path.resolve(oldFullPath);
  const resolvedNewPath = path.resolve(newFullPath);

  const dateLevelBasePath = path.resolve(path.join(userFolderBaseDir, dateSubPath));

  // Ensure both old and new paths are strictly within the specific YYYY/MM/DD directory
  const isOldPathSafe = resolvedOldPath.startsWith(dateLevelBasePath + path.sep) || resolvedOldPath.startsWith(dateLevelBasePath + path.win32.sep);
  const isNewPathSafe = resolvedNewPath.startsWith(dateLevelBasePath + path.sep) || resolvedNewPath.startsWith(dateLevelBasePath + path.win32.sep);
  
  if (!isOldPathSafe || !isNewPathSafe) {
    console.error(`Security alert: Path outside designated folder/date directory. User: ${requestingUserId}, Old: ${oldFullPath}, New: ${newFullPath}`);
    return { success: false, error: 'Unauthorized attempt to rename file. Path is outside your allowed directory.' };
  }


  try {
    await fs.access(oldFullPath); // Check if old file exists
    try {
      // Check if new file name already exists
      await fs.access(newFullPath);
      // If newFullPath exists, it's a conflict
      return { success: false, error: `A file named "${newFilenameWithExt}" already exists in this location.` };
    } catch (e: any) {
      // If access to newFullPath throws ENOENT, it means the new file name is available, which is good.
      // If it throws any other error, re-throw it.
      if (e.code !== 'ENOENT') throw e;
    }

    // Proceed with renaming
    await fs.rename(oldFullPath, newFullPath);
    
    const webDatePath = `${yearPart}/${monthPart}/${dayPart}`;
    const newUrl = `/uploads/users/${requestingUserId}/${folderName}/${webDatePath}/${newFilenameWithExt}`;
    const newId = `${requestingUserId}/${folderName}/${webDatePath}/${newFilenameWithExt}`;

    revalidatePath('/');
    revalidatePath('/my-images');
    revalidatePath('/admin/dashboard');

    return { success: true, data: { newId, newName: newFilenameWithExt, newUrl } };
  } catch (error: any) {
    if (error.code === 'ENOENT') return { success: false, error: 'Original file not found.' };
    console.error(`Failed to rename file from ${oldFullPath} to ${newFullPath}:`, error);
    return { success: false, error: 'Failed to rename file on server.' };
  }
}

// --- Folder Management Actions ---
export interface UserFolder {
  name: string;
  // path: string; // Could be relative to user's upload dir, e.g., "My Documents"
  // imageCount?: number; // Optional: for display
  // createdAt?: number; // Optional
}

export interface FolderActionResponse {
    success: boolean;
    error?: string;
    folderName?: string;
    folders?: UserFolder[];
}

export async function createFolderAction(
    prevState: FolderActionResponse,
    formData: FormData
): Promise<FolderActionResponse> {
    const userId = await getCurrentUserIdFromSession();
    if (!userId) {
        const cookieStore = await cookies();
        const tokenExists = cookieStore.has('session_token');
        if (!tokenExists) {
            return { success: false, error: 'Folder creation failed: Session token not found. Please log in.' };
        } else {
            return { success: false, error: 'Folder creation failed: Session token invalid or expired. Please log in again.' };
        }
    }

    const newFolderName = formData.get('newFolderName') as string | null;
    if (!newFolderName || newFolderName.trim() === "" || newFolderName === DEFAULT_FOLDER_NAME) {
        return { success: false, error: `Folder name cannot be empty or '${DEFAULT_FOLDER_NAME}'.` };
    }
    if (newFolderName.includes('..') || newFolderName.includes('/') || newFolderName.includes('\\') || newFolderName.length > 100) {
        return { success: false, error: 'Invalid characters in folder name or name too long.' };
    }

    const folderPath = path.join(UPLOAD_DIR_BASE_PUBLIC, userId, newFolderName);
    const resolvedFolderPath = path.resolve(folderPath);
    const resolvedUserBase = path.resolve(path.join(UPLOAD_DIR_BASE_PUBLIC, userId));

    if (!resolvedFolderPath.startsWith(resolvedUserBase + path.sep) &&
        !resolvedFolderPath.startsWith(resolvedUserBase + path.win32.sep)) {
        console.error(`Security Alert: Attempt to create folder outside user's directory. User: ${userId}, Path: ${folderPath}`);
        return { success: false, error: "Invalid folder path." };
    }
    
    // Check if the main user directory exists, if not create it
    try {
      await fs.access(resolvedUserBase);
    } catch (error: any) {
        if (error.code === 'ENOENT') {
            try {
                // Explicitly set mode 0o755 (rwxr-xr-x) for the base user directory
                await fs.mkdir(resolvedUserBase, { recursive: true, mode: 0o755 });
            } catch (mkdirError) {
                console.error(`Failed to create base user directory ${resolvedUserBase}:`, mkdirError);
                return { success: false, error: 'Failed to prepare user storage on server.' };
            }
        } else {
            console.error(`Error accessing base user directory ${resolvedUserBase}:`, error);
            return { success: false, error: 'Server error checking user storage.' };
        }
    }


    try {
        // Explicitly set mode 0o755 (rwxr-xr-x) for the new folder
        await fs.mkdir(folderPath, { recursive: false, mode: 0o755 }); 
        revalidatePath('/my-images');
        return { success: true, folderName: newFolderName };
    } catch (error: any) {
        if (error.code === 'EEXIST') {
            return { success: false, error: `Folder "${newFolderName}" already exists.` };
        }
        console.error(`Failed to create folder ${folderPath}:`, error);
        return { success: false, error: 'Failed to create folder on server.' };
    }
}

export async function listUserFolders(userIdFromSession?: string): Promise<UserFolder[]> {
    const userId = userIdFromSession || await getCurrentUserIdFromSession();
    if (!userId) {
        return [{ name: DEFAULT_FOLDER_NAME }]; // Always include default if no user/logged out
    }
    const userUploadsPath = path.join(UPLOAD_DIR_BASE_PUBLIC, userId);
    const resolvedUserUploadsPath = path.resolve(userUploadsPath);
    const resolvedUploadsBase = path.resolve(UPLOAD_DIR_BASE_PUBLIC);

    if (!resolvedUserUploadsPath.startsWith(resolvedUploadsBase + path.sep) &&
        !resolvedUserUploadsPath.startsWith(resolvedUploadsBase + path.win32.sep)) {
        console.error(`Security Alert: Attempt to list folders outside base uploads directory. User: ${userId}`);
        return [{ name: DEFAULT_FOLDER_NAME }]; // Fallback to default on security issue
    }
    
    let folders: UserFolder[] = [];
    try {
        await fs.access(userUploadsPath); // Check if user's base upload dir exists
        const entries = await fs.readdir(userUploadsPath, { withFileTypes: true });
        folders = entries
            .filter(dirent => dirent.isDirectory() && dirent.name !== '.' && dirent.name !== '..')
            .map(dirent => ({ name: dirent.name }));
        
    } catch (error: any) {
        if (error.code === 'ENOENT') { // User directory doesn't exist yet
            // No user-created folders, so only the default exists conceptually
        } else {
            console.error(`Error listing folders for user ${userId}:`, error);
            // On other errors, return default to be safe
        }
    }

    // Ensure DEFAULT_FOLDER_NAME is always in the list, and at the beginning if it doesn't exist physically
    // (even if it doesn't physically exist as a dir yet, it's a valid target for uploads)
    if (!folders.some(f => f.name === DEFAULT_FOLDER_NAME)) {
       folders.unshift({ name: DEFAULT_FOLDER_NAME });
    }


    return folders.sort((a,b) => {
        if (a.name === DEFAULT_FOLDER_NAME) return -1; // Keep default first
        if (b.name === DEFAULT_FOLDER_NAME) return 1;
        return a.name.localeCompare(b.name);
    });
}

