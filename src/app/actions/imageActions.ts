
// src/app/actions/imageActions.ts
'use server';

import fs from 'fs/promises';
import path from 'path';
import { stat } from 'fs/promises';
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import { getCurrentUserIdFromSession, findUserById } from '@/lib/auth/service';
import { getMaxUploadSizeMB as getGlobalMaxUploadSizeMB } from '@/lib/settingsService';
import type { User } from '@/lib/auth/types';
import type { Image as PrismaImage } from '@prisma/client';
import { 
    DEFAULT_FOLDER_NAME, 
    MAX_FILENAME_LENGTH,
    ACCEPTED_IMAGE_TYPES,
    MIME_TO_EXTENSION,
    POST_UPLOAD_DELAY_MS
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
  if (!folderName || folderName.includes('..') || folderName.includes('/') || folderName.length > 100) {
    console.error('Invalid folderName for directory creation:', folderName);
    throw new Error('Invalid folder name format or length.');
  }

  const datePath = getFormattedDatePath(); // "YYYY/MM/DD"
  const fullFolderPath = path.join(UPLOAD_DIR_BASE_PUBLIC, userId, folderName, datePath);

  const resolvedFullFolderPath = path.resolve(fullFolderPath);
  const resolvedUserFolderBase = path.resolve(path.join(UPLOAD_DIR_BASE_PUBLIC, userId, folderName));

  if (!resolvedFullFolderPath.startsWith(resolvedUserFolderBase + path.sep) &&
      !resolvedFullFolderPath.startsWith(resolvedUserFolderBase + path.win32.sep) ||
       resolvedFullFolderPath === resolvedUserFolderBase) {
      console.error(`Security alert: Attempt to create directory outside designated folder area. Path: ${fullFolderPath}, UserID: ${userId}, Folder: ${folderName}`);
      throw new Error('Path is outside allowed directory for user folder uploads.');
  }

  try {
    await fs.mkdir(fullFolderPath, { recursive: true, mode: 0o755 });
  } catch (error) {
    console.error('CRITICAL: Failed to create user-specific folder upload directory structure:', fullFolderPath, error);
    throw new Error(`Failed to prepare upload directory: ${fullFolderPath}. Check server logs and directory permissions.`);
  }
  return fullFolderPath;
}

// This interface might be adjusted or replaced by PrismaImage type directly in some contexts
export interface UploadedImageServerData {
  id: string; // Database ID (UUID)
  name: string; // filename on disk
  url: string; // full public URL /uploads/users/...
  originalName: string;
  userId: string;
  folderName: string;
  mimeType: string;
  size: number;
}

export interface UploadImageActionState {
  success: boolean;
  data?: UploadedImageServerData; // Or directly PrismaImage
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

    const user = await findUserById(userId);
    if (!user) {
        return { success: false, error: 'User not found.' };
    }
    if (user.status !== 'Approved') { 
       return { success: false, error: `Account status is '${user.status}'. Uploads require 'Approved' status.` };
    }

    const folderNameInput = formData.get('folderName') as string | null;
    const targetFolderName = (folderNameInput && folderNameInput.trim() !== "") ? folderNameInput.trim() : DEFAULT_FOLDER_NAME;

    if (targetFolderName.includes('..') || targetFolderName.includes('/') || targetFolderName.includes('\\')) {
        return { success: false, error: 'Invalid folder name specified for upload.' };
    }

    if (user.maxImages !== null && user.maxImages !== undefined) {
        const currentImageCount = await countUserImages(userId, null); 
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

    let currentActualUploadPath: string; // Full path to YYYY/MM/DD directory
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
    const diskFilename = `${uniqueSuffix}-${safeOriginalNamePart}${fileExtension}`.substring(0, MAX_FILENAME_LENGTH);
    const filePathOnDisk = path.join(currentActualUploadPath, diskFilename); // Full path to file on disk
    
    const datePathForUrlDb = getFormattedDatePath(); // "YYYY/MM/DD" for DB and URL construction
    const urlPathForDb = path.join(userId, targetFolderName, datePathForUrlDb, diskFilename).split(path.sep).join('/'); // Relative path for DB: userId/folderName/YYYY/MM/DD/filename.ext

    const resolvedFilePath = path.resolve(filePathOnDisk);
    if (!resolvedFilePath.startsWith(path.resolve(currentActualUploadPath) + path.sep) &&
        !resolvedFilePath.startsWith(path.resolve(currentActualUploadPath) + path.win32.sep) ){
         console.error(`Security alert: Attempt to write file outside designated upload directory. Path: ${filePathOnDisk}`);
         throw new Error('File path is outside allowed directory.');
    }

    try {
      await fs.writeFile(filePathOnDisk, buffer, { mode: 0o644 });
      
      if (POST_UPLOAD_DELAY_MS > 0) {
        await new Promise(resolve => setTimeout(resolve, POST_UPLOAD_DELAY_MS));
      }
      
      // Save metadata to database
      const imageRecord = await prisma.image.create({
        data: {
          filename: diskFilename,
          originalName: file.name,
          urlPath: urlPathForDb, // Store the relative path
          mimeType: file.type,
          size: file.size,
          folderName: targetFolderName,
          userId: userId,
        }
      });

      revalidatePath('/');
      revalidatePath('/my-images');
      revalidatePath(`/admin/dashboard`);

      return {
        success: true,
        data: { 
            id: imageRecord.id, 
            name: imageRecord.filename, 
            url: `/uploads/users/${imageRecord.urlPath}`, 
            originalName: imageRecord.originalName, 
            userId: imageRecord.userId, 
            folderName: imageRecord.folderName,
            mimeType: imageRecord.mimeType,
            size: imageRecord.size,
        },
      };
    } catch (error: any) {
      console.error('Failed to save file to disk or database:', filePathOnDisk, error);
      // Attempt to clean up file if DB write fails? Or handle orphans later.
      // For now, just report error.
      return { success: false, error: 'Failed to save file or its metadata.' };
    }
  } catch (e: any) {
    console.error("Unexpected error in uploadImage action:", e);
    return { success: false, error: e.message || "An unexpected server error occurred during upload." };
  }
}

// This type represents the data structure returned by getUserImages
export interface UserImageData {
  id: string; // Database ID (UUID)
  name: string; // filename on disk
  url: string; // Full public URL
  uploadedAt: Date;
  size: number;
  userId: string;
  folderName: string;
  originalName: string;
  mimeType: string;
}

// Fetches images for a user, optionally filtered by folderName.
// If targetFolderName is null, it fetches for ALL folders of the user.
export async function getUserImages(
  userIdFromSession?: string, 
  limit?: number, 
  targetFolderName?: string | null
): Promise<UserImageData[]> {
  const userId = userIdFromSession || await getCurrentUserIdFromSession();
  if (!userId) {
    console.log("getUserImages: No userId provided or found in session.");
    return [];
  }

  const whereClause: any = { userId };
  if (targetFolderName !== undefined && targetFolderName !== null) {
    whereClause.folderName = targetFolderName;
  }
  // If targetFolderName is null, we fetch all images for the user (no folder filter).
  // If targetFolderName is undefined (e.g., default case from homepage), it defaults to DEFAULT_FOLDER_NAME
  else if (targetFolderName === undefined) { 
    whereClause.folderName = DEFAULT_FOLDER_NAME;
  }


  try {
    const imagesFromDb = await prisma.image.findMany({
      where: whereClause,
      orderBy: {
        uploadedAt: 'desc',
      },
      take: limit,
    });

    return imagesFromDb.map(img => ({
      id: img.id,
      name: img.filename,
      url: `/uploads/users/${img.urlPath}`, // Construct full URL
      uploadedAt: img.uploadedAt,
      size: img.size,
      userId: img.userId,
      folderName: img.folderName,
      originalName: img.originalName,
      mimeType: img.mimeType,
    }));
  } catch (error) {
    console.error(`Failed to fetch images for user ${userId} from database:`, error);
    return [];
  }
}


export async function calculateUserTotalStorage(userId: string): Promise<number> {
   if (!userId || typeof userId !== 'string' || userId.includes('..') || userId.includes('/')) {
    console.error('Invalid User ID for calculating storage:', userId);
    return 0;
  }
  try {
    const result = await prisma.image.aggregate({
      _sum: {
        size: true,
      },
      where: {
        userId: userId,
      },
    });
    return result._sum.size || 0;
  } catch (error) {
    console.error(`Error calculating total storage for user ${userId}:`, error);
    return 0;
  }
}

export async function countUserImages(userId: string, targetFolderName?: string | null): Promise<number> {
  if (!userId || typeof userId !== 'string' || userId.includes('..') || userId.includes('/')) {
    console.error('Invalid User ID for counting images:', userId);
    return 0;
  }
  
  const whereClause: any = { userId };
  if (targetFolderName !== undefined && targetFolderName !== null) {
    whereClause.folderName = targetFolderName;
  }
  // If targetFolderName is null, count all images for the user.
  // If undefined, it implies count for default folder in some contexts, or all if not specified.
  // For the purpose of user.maxImages limit, we should count ALL images if targetFolderName is null.
  // If targetFolderName is undefined, it should likely count all for safety or be explicit.
  // Let's assume if targetFolderName is null, we count all. If undefined, specific logic might depend on caller.
  // The current usage in uploadImage passes null for "all folders" check.

  try {
    return await prisma.image.count({ where: whereClause });
  } catch (error) {
    console.error(`Error counting images for user ${userId}:`, error);
    return 0;
  }
}

export interface DeleteImageActionState {
    success: boolean;
    error?: string;
    deletedImageId?: string; // Return the DB ID of the deleted image
}

export async function deleteImage(
  prevState: DeleteImageActionState,
  imageDbId: string // Now expects the database UUID of the image
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

  if (typeof imageDbId !== 'string' || !imageDbId) {
    console.error(`Security alert: Invalid imageDbId. User: ${requestingUserId}, ID: ${imageDbId}`);
    return { success: false, error: 'Invalid image ID format.' };
  }
  
  try {
    const imageRecord = await prisma.image.findUnique({
      where: { id: imageDbId },
    });

    if (!imageRecord) {
      return { success: false, error: 'Image not found in database.' };
    }

    if (imageRecord.userId !== requestingUserId) {
      console.error(`Security alert: User ${requestingUserId} attempted to delete image ${imageDbId} owned by ${imageRecord.userId}.`);
      return { success: false, error: 'Unauthorized: You can only delete your own images.' };
    }

    const fullServerPath = path.join(UPLOAD_DIR_BASE_PUBLIC, imageRecord.urlPath);
    
    // Security check: ensure constructed path is within UPLOAD_DIR_BASE_PUBLIC
    const resolvedFullServerPath = path.resolve(fullServerPath);
    const resolvedUploadBase = path.resolve(UPLOAD_DIR_BASE_PUBLIC);
    if (!resolvedFullServerPath.startsWith(resolvedUploadBase + path.sep)) {
        console.error(`Security alert: Attempt to delete file outside base uploads directory. Path: ${fullServerPath}`);
        return { success: false, error: 'Invalid file path for deletion.' };
    }

    // Delete from database first
    await prisma.image.delete({
      where: { id: imageDbId },
    });

    // Then delete from filesystem
    try {
      await fs.access(fullServerPath);
      await fs.unlink(fullServerPath);
    } catch (fsError: any) {
      if (fsError.code === 'ENOENT') {
        console.warn(`File ${fullServerPath} not found on disk for image ID ${imageDbId}, but DB record deleted.`);
        // Proceed as success since DB record is gone
      } else {
        console.error(`Failed to delete file ${fullServerPath} from disk for image ID ${imageDbId}:`, fsError);
        // DB record deleted, but file remains. Log this, but still report overall "success" from user's perspective
        // as the image is no longer listed. A cleanup job might be needed for orphaned files.
      }
    }

    revalidatePath('/');
    revalidatePath('/my-images');
    revalidatePath('/admin/dashboard');
    return { success: true, deletedImageId: imageDbId };
  } catch (error: any) {
    console.error(`Failed to delete image (ID: ${imageDbId}):`, error);
    return { success: false, error: 'Failed to delete image from server. Please try again.' };
  }
}

export interface RenameImageActionState {
  success: boolean;
  error?: string;
  data?: {
    newId: string; // Database ID (remains the same)
    newName: string; // New filename on disk
    newUrl: string; // New full public URL
    newOriginalName?: string; // Original name (doesn't change on rename typically)
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

  const currentImageDbId = formData.get('currentImageId') as string | null; 
  const newNameWithoutExtension = formData.get('newNameWithoutExtension') as string | null;

  if (!currentImageDbId || !newNameWithoutExtension) {
    return { success: false, error: 'Missing current image ID or new name.' };
  }

  const sanitizedNewName = newNameWithoutExtension.replace(/[^a-zA-Z0-9._-]/g, '_').substring(0, MAX_FILENAME_LENGTH - 10); 
  if (!sanitizedNewName) {
    return { success: false, error: 'New name is invalid or empty after sanitization.' };
  }
  
  try {
    const imageRecord = await prisma.image.findUnique({
      where: { id: currentImageDbId },
    });

    if (!imageRecord) {
      return { success: false, error: 'Image not found in database.' };
    }

    if (imageRecord.userId !== requestingUserId) {
      console.error(`Security alert: User ${requestingUserId} attempted to rename image ${currentImageDbId} owned by ${imageRecord.userId}.`);
      return { success: false, error: 'Unauthorized: You can only rename your own images.' };
    }

    const oldDiskFilename = imageRecord.filename;
    const extension = path.extname(oldDiskFilename);
    if (!Object.values(MIME_TO_EXTENSION).includes(extension.toLowerCase())) {
      return { success: false, error: `Invalid or unsupported file extension: ${extension}` };
    }

    const oldPrefixMatch = oldDiskFilename.match(/^(\d{13}-\d{1,10})-/);
    const prefix = oldPrefixMatch ? oldPrefixMatch[1] : `${Date.now()}-${Math.round(Math.random() * 1E9)}`;
    
    let newDiskFilename = `${prefix}-${sanitizedNewName}${extension}`;
    newDiskFilename = newDiskFilename.substring(0, MAX_FILENAME_LENGTH);

    if (newDiskFilename === oldDiskFilename) {
      return { success: false, error: 'New name is the same as the old name.' };
    }

    // Extract path components from imageRecord.urlPath (userId/folderName/YYYY/MM/DD/oldDiskFilename)
    const pathParts = imageRecord.urlPath.split('/');
    if (pathParts.length < 5) { // userId, folderName, YYYY, MM, DD, filename
        return { success: false, error: 'Invalid image URL path structure in database.' };
    }
    const relativeDirOnly = pathParts.slice(0, -1).join(path.sep); // userId/folderName/YYYY/MM/DD as local path parts

    const oldFullPathOnDisk = path.join(UPLOAD_DIR_BASE_PUBLIC, relativeDirOnly, oldDiskFilename);
    const newFullPathOnDisk = path.join(UPLOAD_DIR_BASE_PUBLIC, relativeDirOnly, newDiskFilename);

    // Security check for paths
    const resolvedUserBase = path.resolve(path.join(UPLOAD_DIR_BASE_PUBLIC, requestingUserId));
    const resolvedOldPath = path.resolve(oldFullPathOnDisk);
    const resolvedNewPath = path.resolve(newFullPathOnDisk);

    if (!resolvedOldPath.startsWith(resolvedUserBase + path.sep) || !resolvedNewPath.startsWith(resolvedUserBase + path.sep)) {
        console.error(`Security alert: Path outside designated user directory during rename. User: ${requestingUserId}`);
        return { success: false, error: 'Unauthorized attempt to rename file. Path is outside your allowed directory.' };
    }
    
    await fs.access(oldFullPathOnDisk); 
    try {
      await fs.access(newFullPathOnDisk);
      return { success: false, error: `A file named "${newDiskFilename}" already exists in this location.` };
    } catch (e: any) {
      if (e.code !== 'ENOENT') throw e; // Re-throw if it's not a "file not found" error
    }

    await fs.rename(oldFullPathOnDisk, newFullPathOnDisk);
    
    if (POST_UPLOAD_DELAY_MS > 0) {
        await new Promise(resolve => setTimeout(resolve, POST_UPLOAD_DELAY_MS));
    }

    const newUrlPathForDb = path.join(relativeDirOnly, newDiskFilename).split(path.sep).join('/');

    const updatedImageRecord = await prisma.image.update({
        where: { id: currentImageDbId },
        data: {
            filename: newDiskFilename,
            urlPath: newUrlPathForDb,
            // originalName typically doesn't change on rename, but you could add UI for it
        }
    });

    revalidatePath('/');
    revalidatePath('/my-images');
    revalidatePath('/admin/dashboard');

    return { 
        success: true, 
        data: { 
            newId: updatedImageRecord.id, // DB ID remains the same
            newName: updatedImageRecord.filename, 
            newUrl: `/uploads/users/${updatedImageRecord.urlPath}`,
            // newOriginalName: updatedImageRecord.originalName // if you decide to allow changing it
        } 
    };
  } catch (error: any) {
    if (error.code === 'ENOENT') return { success: false, error: 'Original file not found.' };
    console.error(`Failed to rename image ID ${currentImageDbId}:`, error);
    return { success: false, error: 'Failed to rename file on server.' };
  }
}

export interface UserFolder {
  name: string;
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
    
    try {
      await fs.access(resolvedUserBase);
    } catch (error: any) {
        if (error.code === 'ENOENT') {
            try {
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
        await fs.mkdir(folderPath, { recursive: false, mode: 0o755 }); 
        revalidatePath('/my-images');
        // No DB operation needed for folder creation itself, as folders are just directories
        // However, we list them by scanning the filesystem.
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
        return [{ name: DEFAULT_FOLDER_NAME }]; 
    }
    const userUploadsPath = path.join(UPLOAD_DIR_BASE_PUBLIC, userId);
    const resolvedUserUploadsPath = path.resolve(userUploadsPath);
    const resolvedUploadsBase = path.resolve(UPLOAD_DIR_BASE_PUBLIC);

    if (!resolvedUserUploadsPath.startsWith(resolvedUploadsBase + path.sep) &&
        !resolvedUserUploadsPath.startsWith(resolvedUploadsBase + path.win32.sep)) {
        console.error(`Security Alert: Attempt to list folders outside base uploads directory. User: ${userId}`);
        return [{ name: DEFAULT_FOLDER_NAME }]; 
    }
    
    let folders: UserFolder[] = [];
    try {
        await fs.access(userUploadsPath); 
        const entries = await fs.readdir(userUploadsPath, { withFileTypes: true });
        folders = entries
            .filter(dirent => dirent.isDirectory() && dirent.name !== '.' && dirent.name !== '..')
            .map(dirent => ({ name: dirent.name }));
        
    } catch (error: any) {
        if (error.code === 'ENOENT') { 
          // If user's base directory doesn't exist, that's fine, means no folders yet.
        } else {
            console.error(`Error listing folders for user ${userId}:`, error);
        }
    }

    // Ensure default folder is always listed if it doesn't physically exist yet (or if no folders exist)
    if (!folders.some(f => f.name === DEFAULT_FOLDER_NAME)) {
       folders.unshift({ name: DEFAULT_FOLDER_NAME });
    }

    return folders.sort((a,b) => {
        if (a.name === DEFAULT_FOLDER_NAME) return -1; 
        if (b.name === DEFAULT_FOLDER_NAME) return 1;
        return a.name.localeCompare(b.name);
    });
}
