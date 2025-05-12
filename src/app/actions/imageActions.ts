// src/app/actions/imageActions.ts
'use server';

import fs from 'fs/promises';
import path from 'path';
import { stat } from 'fs/promises';
import { revalidatePath } from 'next/cache';
import { getCurrentUserIdFromSession } from '@/lib/auth/service'; 
import { getMaxUploadSizeMB } from '@/lib/settingsService'; // Import settings service

const UPLOAD_DIR_BASE_PUBLIC = path.join(process.cwd(), 'public/uploads/users');
// const MAX_FILE_SIZE = 6 * 1024 * 1024; // 6MB - This will be replaced by dynamic value
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

  if (!(resolvedUserSpecificPath.startsWith(resolvedUploadDirBase + path.sep) || 
        resolvedUserSpecificPath.startsWith(resolvedUploadDirBase + path.win32.sep) ||
        resolvedUserSpecificPath === resolvedUploadDirBase)
     ) {
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
    
    const maxUploadSizeMB = await getMaxUploadSizeMB();
    const currentMaxFileSize = maxUploadSizeMB * 1024 * 1024;

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

    if (file.size > currentMaxFileSize) {
      return { success: false, error: `File too large. Maximum allowed size is ${maxUploadSizeMB}MB. Your file is ${(file.size / (1024 * 1024)).toFixed(2)}MB.` };
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

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
    return { success: false, error: "An unexpected server error occurred during upload. Please check server logs." };
  }
}


export interface UserImage {
  id: string; 
  name: string; 
  url: string; 
  ctime: number; 
  userId: string;
}

export async function getUserImages(userIdFromSession?: string, limit?: number): Promise<UserImage[]> {
  const userId = userIdFromSession || await getCurrentUserIdFromSession();
  if (!userId) {
    return [];
  }
  
  const userUploadDir = path.join(UPLOAD_DIR_BASE_PUBLIC, userId);

  try {
    const resolvedUserUploadDir = path.resolve(userUploadDir);
    const resolvedUploadDirBase = path.resolve(UPLOAD_DIR_BASE_PUBLIC);

    if (!(resolvedUserUploadDir.startsWith(resolvedUploadDirBase + path.sep) ||
          resolvedUserUploadDir.startsWith(resolvedUploadDirBase + path.win32.sep) ||
          resolvedUserUploadDir === resolvedUploadDirBase)
       ) {
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
        const resolvedDateFolderPath = path.resolve(dateFolderPath);
        const resolvedUserUploadDirCheck = path.resolve(userUploadDir); 
        
        if (!(resolvedDateFolderPath.startsWith(resolvedUserUploadDirCheck + path.sep) ||
              resolvedDateFolderPath.startsWith(resolvedUserUploadDirCheck + path.win32.sep))
           ) {
            console.warn(`Skipping potentially malicious path: ${dateFolderPath} as it's not a direct child of ${userUploadDir}`);
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
              const resolvedFilePath = path.resolve(filePath);
              if (!(resolvedFilePath.startsWith(resolvedDateFolderPath + path.sep) ||
                    resolvedFilePath.startsWith(resolvedDateFolderPath + path.win32.sep))
                 ) {
                console.warn(`Skipping potentially malicious file path: ${filePath} as it's not a direct child of ${dateFolderPath}`);
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
                return null;
              }
              return null;
            })
          );
          allImages.push(...imageFileDetails.filter((file): file is UserImage => file !== null));
        } catch (readDirError) {
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
      return []; 
    }
    console.error('Failed to read or process user image directories:', error);
    return []; 
  }
}

export async function countUserImages(userId: string): Promise<number> {
  // Basic validation for userId, though more robust validation might be needed
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

  if (!/^\d{2}\.\d{4}$/.test(dateFolder)) {
    console.error(`Security alert: Invalid date folder component in fragment. User: ${requestingUserId}, DateFolder: ${dateFolder}`);
    return { success: false, error: 'Invalid image path format for deletion.' };
  }

  if (!filename || filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
    console.error(`Security alert: Invalid filename component in fragment. User: ${requestingUserId}, Filename: ${filename}`);
    return { success: false, error: 'Invalid image path format for deletion.' };
  }
  
  const fullServerPath = path.join(UPLOAD_DIR_BASE_PUBLIC, requestingUserId, dateFolder, filename);
  
  const userBaseDir = path.resolve(path.join(UPLOAD_DIR_BASE_PUBLIC, requestingUserId));
  const resolvedFullPath = path.resolve(fullServerPath);

  if (!(resolvedFullPath.startsWith(userBaseDir + path.sep) || 
        resolvedFullPath.startsWith(userBaseDir + path.win32.sep))
     ) {
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

  const sanitizedNewName = newNameWithoutExtension.replace(/[^a-zA-Z0-9._-]/g, '_').substring(0, MAX_FILENAME_LENGTH);
  if (!sanitizedNewName) {
    return { success: false, error: 'New name is invalid or empty after sanitization.' };
  }

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

  if (!/^\d{2}\.\d{4}$/.test(dateFolder)) {
      console.error(`Security alert: Invalid date folder component in fragment for rename. User: ${requestingUserId}, DateFolder: ${dateFolder}`);
      return { success: false, error: 'Invalid current image path format for renaming.' };
  }

  if (!oldFilenameWithExt || oldFilenameWithExt.includes('/') || oldFilenameWithExt.includes('\\') || oldFilenameWithExt.includes('..')) {
      console.error(`Security alert: Invalid filename component in fragment for rename. User: ${requestingUserId}, Filename: ${oldFilenameWithExt}`);
      return { success: false, error: 'Invalid current image path format for renaming.' };
  }

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
      return { success: false, error: `A file named "${newFilenameWithExt}" already exists in this folder.` };
    } catch (e: any) {
      if (e.code !== 'ENOENT') throw e; 
    }

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
    if (error.code === 'ENOENT' && error.path === oldFullPath) {
      return { success: false, error: 'Original file not found. It may have been deleted or moved.' };
    }
    console.error(`Failed to rename file from ${oldFullPath} to ${newFullPath}:`, error);
    return { success: false, error: 'Failed to rename file on server. Please try again.' };
  }
}

/**
 * Note on Security (Local File System):
 * - User IDs in paths: User IDs from session are assumed to be non-malleable (e.g., UUIDs). Additional checks for '..' or '/' in `userId` are done where directories are created.
 * - Path construction: `path.join` is used for constructing FS paths, which correctly uses OS-specific separators. `path.resolve` is used for canonicalizing paths for security checks.
 * - Input Sanitization: 
 *   - `imagePathFragment` (format `MM.YYYY/filename.ext`) for delete/rename is now parsed by splitting by `/`. Its components (`dateFolder`, `filename`) are individually validated for format and malicious characters (`..`, `/`, `\`).
 *   - `newNameWithoutExtension` for rename is sanitized (regexp replace for allowed characters) and length-limited.
 *   - File extensions are derived from MIME types on upload or checked against a list of valid extensions for rename. Original extensions are preserved on rename.
 * - Path Traversal Prevention:
 *   - `ensureUploadDirsExist`: Checks `userId` and ensures resolved path is within `UPLOAD_DIR_BASE_PUBLIC`.
 *   - `getUserImages`: Checks resolved paths for user's directory and subdirectories against base paths.
 *   - `deleteImage`, `renameImage`: Critically, after constructing full file paths, `path.resolve` is used, and the resulting absolute path is checked to ensure it's within the `requestingUserId`'s specific subdirectory of `UPLOAD_DIR_BASE_PUBLIC` using `startsWith`. This is a key defense.
 * - File Permissions: The Node.js process (run by PM2) needs read/write permissions to `public/uploads/users/*`. Nginx needs read access to serve these files.
 * - Overwriting: The `renameImage` action checks if a file with the new name already exists and prevents overwriting.
 * - Nginx Configuration: Nginx config should:
 *   - Serve files from `/public/uploads` directly.
 *   - Disable script execution in the uploads directory.
 *   - Set `X-Content-Type-Options: nosniff`.
 * - This implementation relies on the session mechanism (`getCurrentUserIdFromSession`) being secure for identifying the user.
 */
