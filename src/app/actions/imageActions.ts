
// src/app/actions/imageActions.ts
'use server';

import fs from 'fs/promises';
import path from 'path';
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
const MAX_FILE_ACCESS_RETRY_MS = 5000; // Max 5 seconds to wait for file access by Node.js process
const FILE_ACCESS_RETRY_INTERVAL_MS = 200; // Check every 200ms

// Ensures upload directories exist: public/uploads/users/[userId]/[folderName]
async function ensureUploadDirsExist(userId: string, folderName: string): Promise<string> {
  if (!userId || typeof userId !== 'string' || userId.includes('..') || userId.includes('/')) {
    console.error('Invalid User ID for directory creation:', userId);
    throw new Error('Invalid user ID format.');
  }
  if (!folderName || folderName.includes('..') || folderName.includes('/') || folderName.length > 100) {
    console.error('Invalid folderName for directory creation:', folderName);
    throw new Error('Invalid folder name format or length.');
  }

  const userFolderSpecificPath = path.join(UPLOAD_DIR_BASE_PUBLIC, userId, folderName);

  const resolvedUserFolderSpecificPath = path.resolve(userFolderSpecificPath);
  const resolvedUserBase = path.resolve(path.join(UPLOAD_DIR_BASE_PUBLIC, userId));

  if (!resolvedUserFolderSpecificPath.startsWith(resolvedUserBase + path.sep) && 
      !resolvedUserFolderSpecificPath.startsWith(resolvedUserBase + path.win32.sep)) {
      console.error(`Security alert: Attempt to create directory outside designated user folder area. Path: ${userFolderSpecificPath}, UserID: ${userId}, Folder: ${folderName}`);
      throw new Error('Path is outside allowed directory for user folder uploads.');
  }
  
  try {
    await fs.mkdir(resolvedUserBase, { recursive: true, mode: 0o755 });
  } catch (error) {
    console.error('CRITICAL: Failed to create base user directory:', resolvedUserBase, error);
    throw new Error(`Failed to prepare base user upload directory: ${resolvedUserBase}. Check server logs and directory permissions.`);
  }

  try {
    await fs.mkdir(resolvedUserFolderSpecificPath, { recursive: true, mode: 0o755 });
  } catch (error) {
    console.error('CRITICAL: Failed to create user-specific folder upload directory:', resolvedUserFolderSpecificPath, error);
    throw new Error(`Failed to prepare upload directory: ${resolvedUserFolderSpecificPath}. Check server logs and directory permissions.`);
  }
  return resolvedUserFolderSpecificPath; // This is the path to users/[userId]/[folderName]
}

export interface UploadedImageServerData extends PrismaImage {}

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
    const effectiveMaxSingleMB = userMaxSingleUploadMB !== null && userMaxSingleUploadMB !== undefined
                                ? userMaxSingleUploadMB
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

    let uploadPathForFolder: string; 
    try {
      uploadPathForFolder = await ensureUploadDirsExist(userId, targetFolderName);
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
    
    const filePathOnDisk = path.join(uploadPathForFolder, diskFilename); 
    const urlPathForDb = path.join(userId, targetFolderName, diskFilename).split(path.sep).join('/');

    const resolvedFilePath = path.resolve(filePathOnDisk);
    if (!resolvedFilePath.startsWith(path.resolve(uploadPathForFolder) + path.sep) &&
        !resolvedFilePath.startsWith(path.resolve(uploadPathForFolder) + path.win32.sep) ){
         console.error(`Security alert: Attempt to write file outside designated upload directory. Path: ${filePathOnDisk}`);
         throw new Error('File path is outside allowed directory.');
    }

    try {
      await fs.writeFile(filePathOnDisk, buffer, { mode: 0o644 });
      console.log(`File ${filePathOnDisk} written successfully with mode 0o644.`);

      // Actively wait for file to be accessible by the Node process
      let fileAccessible = false;
      const startTime = Date.now();
      while (!fileAccessible && (Date.now() - startTime) < MAX_FILE_ACCESS_RETRY_MS) {
        try {
          await fs.access(filePathOnDisk, fs.constants.R_OK); // Check for read access
          fileAccessible = true;
          console.log(`File ${filePathOnDisk} is accessible for reading by Node.js process after ${Date.now() - startTime}ms.`);
          break;
        } catch (accessError: any) {
          if (accessError.code === 'ENOENT') {
            console.warn(`File ${filePathOnDisk} not yet found by fs.access (ENOENT), retrying in ${FILE_ACCESS_RETRY_INTERVAL_MS}ms...`);
          } else {
             console.warn(`File ${filePathOnDisk} not yet accessible by fs.access (Error: ${accessError.message}), retrying in ${FILE_ACCESS_RETRY_INTERVAL_MS}ms...`);
          }
          await new Promise(resolve => setTimeout(resolve, FILE_ACCESS_RETRY_INTERVAL_MS));
        }
      }

      if (!fileAccessible) {
        console.error(`File ${filePathOnDisk} was not accessible by Node.js process after ${MAX_FILE_ACCESS_RETRY_MS}ms. Upload will proceed, but immediate access issues by web server are likely.`);
        // Optionally, you could fail the upload here if strict accessibility is required:
        // return { success: false, error: `Server error: Uploaded file not accessible after ${MAX_FILE_ACCESS_RETRY_MS / 1000}s.` };
      }

      try {
        const stats = await fs.stat(filePathOnDisk);
        console.log(`fs.stat successful for ${filePathOnDisk} after write and access checks. Size: ${stats.size}`);
      } catch (statError: any) {
        console.warn(`Post-write fs.stat failed for ${filePathOnDisk} (Error: ${statError.message}). Continuing upload.`);
      }
      
      if (POST_UPLOAD_DELAY_MS > 0) {
        console.log(`Applying POST_UPLOAD_DELAY_MS of ${POST_UPLOAD_DELAY_MS}ms.`);
        await new Promise(resolve => setTimeout(resolve, POST_UPLOAD_DELAY_MS));
      }
      
      const imageRecord = await prisma.image.create({
        data: {
          filename: diskFilename,
          originalName: file.name,
          urlPath: urlPathForDb, 
          mimeType: file.type,
          size: file.size,
          folderName: targetFolderName,
          userId: userId,
        }
      });

      revalidatePath('/');
      revalidatePath('/my-images');
      revalidatePath(`/admin/dashboard`); // For user storage/image count updates

      return { success: true, data: imageRecord };
    } catch (error: any) {
      console.error('Failed to save file to disk or database:', filePathOnDisk, error);
      try {
        await fs.unlink(filePathOnDisk);
      } catch (cleanupError) {
        console.error(`Failed to cleanup orphaned file ${filePathOnDisk} after DB error:`, cleanupError);
      }
      return { success: false, error: 'Failed to save file or its metadata.' };
    }
  } catch (e: any) {
    console.error("Unexpected error in uploadImage action:", e);
    return { success: false, error: e.message || "An unexpected server error occurred during upload." };
  }
}

export interface UserImageData extends PrismaImage {
  url: string; 
}

export async function getUserImages(
  userIdFromSession?: string, 
  limit?: number, 
  targetFolderName?: string | null
): Promise<UserImageData[]> {
  const userIdToQuery = userIdFromSession || await getCurrentUserIdFromSession();
  if (!userIdToQuery) {
    return [];
  }

  const whereClause: any = { userId: userIdToQuery };
  if (targetFolderName !== undefined && targetFolderName !== null) {
    whereClause.folderName = targetFolderName;
  } else if (targetFolderName === undefined) { 
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
      ...img,
      url: `/uploads/users/${img.urlPath}`, 
    }));
  } catch (error) {
    console.error(`Failed to fetch images for user ${userIdToQuery} from database:`, error);
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
    deletedImageId?: string;
}

export async function deleteImage(
  prevState: DeleteImageActionState,
  imageDbId: string 
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

  if (typeof imageDbId !== 'string' || !imageDbId.trim() || imageDbId.includes('..') || imageDbId.includes('/')) {
    console.error(`Security alert: Invalid imageDbId for deletion. User: ${requestingUserId}, ID: ${imageDbId}`);
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
    
    const resolvedFullServerPath = path.resolve(fullServerPath);
    const resolvedUploadBase = path.resolve(UPLOAD_DIR_BASE_PUBLIC);

    if (!resolvedFullServerPath.startsWith(resolvedUploadBase + path.sep) &&
        !resolvedFullServerPath.startsWith(resolvedUploadBase + path.win32.sep) ||
        resolvedFullServerPath === resolvedUploadBase ) { 
        console.error(`Security alert: Attempt to delete file outside base uploads directory or the base directory itself. Path: ${fullServerPath}`);
        return { success: false, error: 'Invalid file path for deletion.' };
    }

    await prisma.image.delete({
      where: { id: imageDbId },
    });

    try {
      await fs.access(fullServerPath); 
      await fs.unlink(fullServerPath);
    } catch (fsError: any) {
      if (fsError.code === 'ENOENT') {
        console.warn(`File ${fullServerPath} not found on disk for image ID ${imageDbId}, but DB record deleted.`);
      } else {
        console.error(`Failed to delete file ${fullServerPath} from disk for image ID ${imageDbId}:`, fsError);
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

  if (!currentImageDbId || typeof currentImageDbId !== 'string' || !currentImageDbId.trim() || currentImageDbId.includes('..') || currentImageDbId.includes('/')) {
    return { success: false, error: 'Invalid current image ID format.' };
  }
  if (!newNameWithoutExtension || typeof newNameWithoutExtension !== 'string') {
    return { success: false, error: 'New name is missing or invalid.' };
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
      return { 
        success: true, 
        data: { 
            newId: imageRecord.id, 
            newName: imageRecord.filename, 
            newUrl: `/uploads/users/${imageRecord.urlPath}`,
        } 
      };
    }
    
    const pathParts = imageRecord.urlPath.split('/');
    if (pathParts.length !== 3) { 
        console.error(`Invalid image urlPath structure in DB for image ${imageRecord.id}: ${imageRecord.urlPath}`);
        return { success: false, error: 'Internal server error: Invalid image path structure.' };
    }
    const storedUserId = pathParts[0];
    const storedFolderName = pathParts[1];
    
    const physicalDirectoryPath = path.join(UPLOAD_DIR_BASE_PUBLIC, storedUserId, storedFolderName);

    const oldFullPathOnDisk = path.join(physicalDirectoryPath, oldDiskFilename);
    const newFullPathOnDisk = path.join(physicalDirectoryPath, newDiskFilename);

    const resolvedUserBase = path.resolve(path.join(UPLOAD_DIR_BASE_PUBLIC, requestingUserId));
    const resolvedOldPath = path.resolve(oldFullPathOnDisk);
    const resolvedNewPath = path.resolve(newFullPathOnDisk);

    if (!resolvedOldPath.startsWith(resolvedUserBase + path.sep) &&
        !resolvedOldPath.startsWith(resolvedUserBase + path.win32.sep) ||
        !resolvedNewPath.startsWith(resolvedUserBase + path.sep) &&
        !resolvedNewPath.startsWith(resolvedUserBase + path.win32.sep)
    ) {
        console.error(`Security alert: Path outside designated user directory during rename. User: ${requestingUserId}`);
        return { success: false, error: 'Unauthorized attempt to rename file. Path is outside your allowed directory.' };
    }
    
    await fs.access(oldFullPathOnDisk); 
    try {
      await fs.access(newFullPathOnDisk);
      return { success: false, error: `A file named "${newDiskFilename}" already exists in this location.` };
    } catch (e: any) {
      if (e.code !== 'ENOENT') throw e; 
    }

    await fs.rename(oldFullPathOnDisk, newFullPathOnDisk);
    
    try {
      await fs.stat(newFullPathOnDisk);
    } catch (statError: any) {
      console.warn(`Post-rename fs.stat failed for ${newFullPathOnDisk} (Error: ${statError.message}). Continuing update.`);
    }
    if (POST_UPLOAD_DELAY_MS > 0) { 
        await new Promise(resolve => setTimeout(resolve, POST_UPLOAD_DELAY_MS));
    }

    const newUrlPathForDb = path.join(storedUserId, storedFolderName, newDiskFilename).split(path.sep).join('/');

    const updatedImageRecord = await prisma.image.update({
        where: { id: currentImageDbId },
        data: {
            filename: newDiskFilename,
            urlPath: newUrlPathForDb,
        }
    });

    revalidatePath('/');
    revalidatePath('/my-images');
    revalidatePath('/admin/dashboard');

    return { 
        success: true, 
        data: { 
            newId: updatedImageRecord.id, 
            newName: updatedImageRecord.filename, 
            newUrl: `/uploads/users/${updatedImageRecord.urlPath}`,
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
        await ensureUploadDirsExist(userId, newFolderName); 
        revalidatePath('/my-images');
        return { success: true, folderName: newFolderName };
    } catch (error: any) {
        console.error(`Failed to create folder ${folderPath}:`, error); 
        return { success: false, error: error.message || 'Failed to create folder on server.' };
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
        } else {
            console.error(`Error listing folders for user ${userId}:`, error);
        }
    }

    if (!folders.some(f => f.name === DEFAULT_FOLDER_NAME)) {
       folders.unshift({ name: DEFAULT_FOLDER_NAME });
    }

    return folders.sort((a,b) => {
        if (a.name === DEFAULT_FOLDER_NAME) return -1; 
        if (b.name === DEFAULT_FOLDER_NAME) return 1;
        return a.name.localeCompare(b.name);
    });
}

    