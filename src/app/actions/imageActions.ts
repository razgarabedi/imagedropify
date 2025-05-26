
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
import type { Image as PrismaImageType } from '@prisma/client';
import {
    DEFAULT_FOLDER_NAME,
    MAX_FILENAME_LENGTH,
    ACCEPTED_IMAGE_TYPES,
    MIME_TO_EXTENSION,
    ITEMS_PER_PAGE
} from '@/lib/imageConfig';

const UPLOAD_DIR_BASE_PUBLIC = path.join(process.cwd(), 'public/uploads/users');
const FILE_ACCESS_RETRY_MAX_MS = 5000;
const FILE_ACCESS_RETRY_INTERVAL_MS = 200;

// Ensures upload directories exist: public/uploads/users/[userId]/[folderName]
async function ensureUploadDirsExist(userId: string, folderName: string): Promise<string> {
  if (!userId || typeof userId !== 'string' || userId.includes('..') || userId.includes('/')) {
    console.error('Invalid User ID for directory creation:', userId);
    throw new Error('Invalid user ID format.');
  }
  const sanitizedFolderName = folderName.replace(/[/\\]|^\.\.$/g, '_').substring(0, 100);
  if (!sanitizedFolderName || sanitizedFolderName === '.' || sanitizedFolderName === '..') {
    console.error('Invalid folderName for directory creation after sanitization:', folderName);
    throw new Error('Invalid folder name format or length.');
  }

  const userSpecificBasePath = path.join(UPLOAD_DIR_BASE_PUBLIC, userId);
  const folderSpecificPath = path.join(userSpecificBasePath, sanitizedFolderName);

  const resolvedUserSpecificBasePath = path.resolve(userSpecificBasePath);
  const resolvedFolderSpecificPath = path.resolve(folderSpecificPath);
  const resolvedUploadsBase = path.resolve(UPLOAD_DIR_BASE_PUBLIC);

  if (!resolvedUserSpecificBasePath.startsWith(resolvedUploadsBase + path.sep) &&
      !resolvedUserSpecificBasePath.startsWith(resolvedUploadsBase + path.win32.sep) ){
      console.error(`Security alert: Attempt to create base user directory outside designated uploads area. Path: ${userSpecificBasePath}`);
      throw new Error('Path is outside allowed directory for user uploads.');
  }

  if (!resolvedFolderSpecificPath.startsWith(resolvedUserSpecificBasePath + path.sep) &&
      !resolvedFolderSpecificPath.startsWith(resolvedUserSpecificBasePath + path.win32.sep)) {
      console.error(`Security alert: Attempt to create folder directory outside designated user folder area. Path: ${folderSpecificPath}, UserID: ${userId}, Folder: ${sanitizedFolderName}`);
      throw new Error('Path is outside allowed directory for user folder uploads.');
  }

  try {
    await fs.mkdir(resolvedUserSpecificBasePath, { recursive: true, mode: 0o755 });
  } catch (error: any) {
    if (error.code !== 'EEXIST') {
      console.error(`CRITICAL: Failed to create base user directory '${resolvedUserSpecificBasePath}': ${error.message}`, error);
      throw new Error(`Failed to prepare base user upload directory: ${resolvedUserSpecificBasePath}. Check server logs and directory permissions.`);
    }
  }

  try {
    await fs.mkdir(resolvedFolderSpecificPath, { recursive: true, mode: 0o755 });
  } catch (error: any) {
    if (error.code !== 'EEXIST') {
      console.error(`CRITICAL: Failed to create user-specific folder upload directory '${resolvedFolderSpecificPath}': ${error.message}`, error);
      throw new Error(`Failed to prepare upload directory: ${resolvedFolderSpecificPath}. Check server logs and directory permissions.`);
    }
  }
  return resolvedFolderSpecificPath;
}

export interface UploadedImageServerData extends PrismaImageType {}

export interface UploadImageActionState {
  success: boolean;
  data?: UploadedImageServerData;
  error?: string;
}

export async function uploadImage(
  prevState: UploadImageActionState,
  formData: FormData
): Promise<UploadImageActionState> {
  let filePathOnDiskLocal: string | undefined = undefined;

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
    const finalFolderName = (folderNameInput && folderNameInput.trim() !== "") ? folderNameInput.trim() : DEFAULT_FOLDER_NAME;

    if (finalFolderName.includes('..') || finalFolderName.includes('/') || finalFolderName.includes('\\')) {
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
      uploadPathForFolder = await ensureUploadDirsExist(userId, finalFolderName);
    } catch (error: any) {
      console.error('Upload directory preparation failed:', error);
      return { success: false, error: error.message || 'Server error preparing upload directory.' };
    }

    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      return { success: false, error: `Invalid file type. Accepted: JPG, PNG, GIF, WebP. Provided: ${file.type}` };
    }
    const fileExtension = MIME_TO_EXTENSION[file.type] || path.extname(file.name);
    if (!fileExtension) {
      return { success: false, error: `Unsupported file type or unable to determine extension (${file.type}).` };
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const safeOriginalNamePart = path.basename(file.name, path.extname(file.name))
                                   .replace(/[^a-zA-Z0-9_-]/g, '_')
                                   .substring(0, 50);
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1E9)}`;
    const diskFilename = `${uniqueSuffix}-${safeOriginalNamePart}${fileExtension}`.substring(0, MAX_FILENAME_LENGTH);

    filePathOnDiskLocal = path.join(uploadPathForFolder, diskFilename);
    // urlPathForDb is just 'userId/folderName/diskFilename.ext'
    const urlPathForDb = path.join(userId, finalFolderName, diskFilename).split(path.sep).join('/');

    const resolvedFilePath = path.resolve(filePathOnDiskLocal);
    if (!resolvedFilePath.startsWith(path.resolve(uploadPathForFolder) + path.sep) &&
        !resolvedFilePath.startsWith(path.resolve(uploadPathForFolder) + path.win32.sep) ){
         console.error(`Security alert: Attempt to write file outside designated upload directory. Path: ${filePathOnDiskLocal}`);
         throw new Error('File path is outside allowed directory.');
    }

    try {
      await fs.writeFile(filePathOnDiskLocal, buffer, { mode: 0o644 });
      
      let fileAccessible = false;
      const startTime = Date.now();
      while (!fileAccessible && (Date.now() - startTime) < FILE_ACCESS_RETRY_MAX_MS) {
        try {
          await fs.access(filePathOnDiskLocal, fs.constants.R_OK);
          fileAccessible = true;
          break;
        } catch (accessError: any) {
          await new Promise(resolve => setTimeout(resolve, FILE_ACCESS_RETRY_INTERVAL_MS));
        }
      }

      if (!fileAccessible) {
        // Removed warning
      }

      const imageRecord = await prisma.image.create({
        data: {
          filename: diskFilename,
          originalName: file.name,
          urlPath: urlPathForDb,
          mimeType: file.type,
          size: file.size,
          folderName: finalFolderName,
          userId: userId,
        }
      });

      revalidatePath('/');
      revalidatePath('/my-images');
      revalidatePath(`/admin/dashboard`);
      revalidatePath(`/share`); // Revalidate base share path as new shares might affect listings

      return { success: true, data: imageRecord };
    } catch (error: any) {
      console.error('Failed to save file to disk or database:', filePathOnDiskLocal, error);
      if (filePathOnDiskLocal) {
          try {
            await fs.unlink(filePathOnDiskLocal);
          } catch (cleanupError) {
            console.error(`Failed to cleanup orphaned file ${filePathOnDiskLocal} after DB error:`, cleanupError);
          }
      }
      return { success: false, error: 'Failed to save file or its metadata.' };
    }
  } catch (e: any) {
    console.error("Unexpected error in uploadImage action:", e);
    if (filePathOnDiskLocal) {
      try {
        await fs.unlink(filePathOnDiskLocal);
      } catch (cleanupError) {
        console.error(`Failed to cleanup orphaned file ${filePathOnDiskLocal} from outer catch:`, cleanupError);
      }
    }
    return { success: false, error: e.message || "An unexpected server error occurred during upload." };
  }
}

export interface UserImageData {
  id: string;
  filename: string;
  originalName: string;
  urlPath: string; 
  mimeType: string;
  size: number;
  folderName: string;
  userId: string;
  uploadedAt: Date;
  updatedAt: Date;
  url: string; 
}

export interface PaginatedUserImagesResponse {
  images: UserImageData[];
  totalPages: number;
  currentPage: number;
  totalImages: number;
}

export async function getUserImages(
  userIdFromSession?: string,
  options?: { page?: number; limit?: number; targetFolderName?: string | null }
): Promise<PaginatedUserImagesResponse> {
  const userIdToQuery = userIdFromSession || await getCurrentUserIdFromSession();
  if (!userIdToQuery) {
    return { images: [], totalPages: 0, currentPage: 1, totalImages: 0 };
  }

  const page = options?.page || 1;
  const limit = options?.limit || ITEMS_PER_PAGE;
  const targetFolderName = options?.targetFolderName;

  const whereClause: any = { userId: userIdToQuery };
  if (targetFolderName !== undefined && targetFolderName !== null) {
    whereClause.folderName = targetFolderName;
  }

  try {
    const totalImages = await prisma.image.count({ where: whereClause });
    const totalPages = Math.ceil(totalImages / limit);

    const imagesFromDb = await prisma.image.findMany({
      where: whereClause,
      orderBy: {
        uploadedAt: 'desc',
      },
      skip: (page - 1) * limit,
      take: limit,
    });

    const mappedImages: UserImageData[] = imagesFromDb.map((img): UserImageData => ({
      id: img.id,
      filename: img.filename,
      originalName: img.originalName,
      urlPath: img.urlPath,
      mimeType: img.mimeType,
      size: img.size,
      folderName: img.folderName,
      userId: img.userId,
      uploadedAt: img.uploadedAt,
      updatedAt: img.updatedAt,
      url: `/uploads/users/${img.urlPath}`,
    }));

    return {
        images: mappedImages,
        totalPages: totalPages,
        currentPage: page,
        totalImages: totalImages,
    };

  } catch (error) {
    console.error(`Failed to fetch images for user ${userIdToQuery} from database:`, error);
    return { images: [], totalPages: 0, currentPage: 1, totalImages: 0 };
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

    // urlPath is userId/folderName/filename.ext
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
    revalidatePath(`/share`); // Revalidate base share path
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
      const originalMimeExt = MIME_TO_EXTENSION[imageRecord.mimeType];
      if (!originalMimeExt || extension.toLowerCase() !== originalMimeExt.toLowerCase()) {
           console.warn(`Filename extension ${extension} for image ${imageRecord.id} does not match expected for MIME type ${imageRecord.mimeType}. Proceeding with original extension from filename.`);
      }
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

    // urlPath is 'userId/folderName/oldDiskFilename.ext'
    const pathSegments = imageRecord.urlPath.split('/');
    if (pathSegments.length < 3) { 
        console.error(`Invalid image urlPath structure in DB for image ${imageRecord.id}: ${imageRecord.urlPath}`);
        return { success: false, error: 'Internal server error: Invalid image path structure.' };
    }
    const storedUserId = pathSegments[0]; 
    const storedFolderName = pathSegments[1];

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
    revalidatePath(`/share`); // Revalidate base share path

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
            } catch (mkdirError:any) {
                console.error(`Failed to create base user directory ${resolvedUserBase}: ${mkdirError.message}`, mkdirError);
                return { success: false, error: 'Failed to prepare user storage on server.' };
            }
        } else { 
            console.error(`Error accessing base user directory ${resolvedUserBase}: ${error.message}`, error);
            return { success: false, error: 'Server error checking user storage.' };
        }
    }

    try {
        await ensureUploadDirsExist(userId, newFolderName); 
        revalidatePath('/my-images'); 
        return { success: true, folderName: newFolderName };
    } catch (error: any) {
        console.error(`Failed to create folder ${newFolderName} for user ${userId}: ${error.message}`, error);
        if (error.message.includes('EEXIST') || (error.code && error.code === 'EEXIST')) {
            return { success: false, error: `Folder "${newFolderName}" already exists.` };
        }
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
          try {
            await fs.mkdir(userUploadsPath, { recursive: true, mode: 0o755 });
            const defaultFolderPath = path.join(userUploadsPath, DEFAULT_FOLDER_NAME);
            await fs.mkdir(defaultFolderPath, { recursive: true, mode: 0o755 });
          } catch (mkdirError: any) {
            console.error(`Error creating base or default directory ${userUploadsPath} during listUserFolders: ${mkdirError.message}`, mkdirError);
          }
        } else {
            console.error(`Error listing folders for user ${userId}: ${error.message}`, error);
        }
    }
    
    if (!folders.some(f => f.name === DEFAULT_FOLDER_NAME)) {
       folders.unshift({ name: DEFAULT_FOLDER_NAME }); 
       try {
            const defaultFolderPath = path.join(userUploadsPath, DEFAULT_FOLDER_NAME);
            await fs.access(defaultFolderPath); 
       } catch (accessError: any) {
            if (accessError.code === 'ENOENT') { 
                try {
                    await fs.mkdir(path.join(userUploadsPath, DEFAULT_FOLDER_NAME), { recursive: true, mode: 0o755 });
                } catch (mkdirError: any) {
                    console.error(`Error creating default folder ${DEFAULT_FOLDER_NAME} for user ${userId} because it was missing: ${mkdirError.message}`, mkdirError);
                }
            }
       }
    }
    
    return folders.sort((a,b) => {
        if (a.name === DEFAULT_FOLDER_NAME) return -1;
        if (b.name === DEFAULT_FOLDER_NAME) return 1;
        return a.name.localeCompare(b.name);
    });
}
