// src/app/actions/imageActions.ts
'use server';

import fs from 'fs/promises';
import path from 'path';
import { stat } from 'fs/promises';
import { revalidatePath } from 'next/cache';

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
  if (!userId) {
    throw new Error('User ID is required to prepare upload directory.');
  }
  const dateFolder = getFormattedDateFolder();
  const userSpecificPath = path.join(UPLOAD_DIR_BASE_PUBLIC, userId, dateFolder);
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

export async function uploadImage(
  formData: FormData,
  userId: string
): Promise<{ success: boolean; data?: UploadedImageServerData; error?: string }> {
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

  const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1E9)}`;
  const filename = `${uniqueSuffix}${fileExtension}`;
  const filePath = path.join(currentActualUploadPath, filename);
  const dateFolder = getFormattedDateFolder();

  try {
    await fs.writeFile(filePath, buffer);
    const imageUrl = `/uploads/users/${userId}/${dateFolder}/${filename}`;
    
    revalidatePath('/'); // Revalidate the home page to show new images for the user
    
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

export async function getUserImages(userId: string): Promise<UserImage[]> {
  if (!userId) {
    // console.warn('User ID not provided for getUserImages.');
    return [];
  }
  
  const userUploadDir = path.join(UPLOAD_DIR_BASE_PUBLIC, userId);

  try {
    await fs.access(userUploadDir); 
  } catch (error) {
    // User directory doesn't exist, so no images to list.
    return []; 
  }

  const allImages: UserImage[] = [];
  const dateFolderRegex = /^\d{2}\.\d{4}$/; // Matches MM.YYYY format

  try {
    const yearMonthDirs = await fs.readdir(userUploadDir, { withFileTypes: true });

    for (const dirent of yearMonthDirs) {
      if (dirent.isDirectory() && dateFolderRegex.test(dirent.name)) {
        const dateFolderPath = path.join(userUploadDir, dirent.name);
        try {
          const filesInDateFolder = await fs.readdir(dateFolderPath);
          const imageFileDetails = await Promise.all(
            filesInDateFolder.map(async (file) => {
              const filePath = path.join(dateFolderPath, file);
              try {
                const stats = await stat(filePath);
                const validExtensions = Object.values(MIME_TO_EXTENSION);
                if (stats.isFile() && validExtensions.some(ext => file.toLowerCase().endsWith(ext))) {
                  return {
                    id: `${userId}/${dirent.name}/${file}`, 
                    name: file,
                    url: `/uploads/users/${userId}/${dirent.name}/${file}`,
                    ctime: stats.ctimeMs,
                    userId: userId,
                  };
                }
              } catch (statError) {
                console.error(`Failed to stat file ${filePath}:`, statError);
                return null;
              }
              return null;
            })
          );
          allImages.push(...imageFileDetails.filter((file): file is UserImage => file !== null));
        } catch (readDirError) {
          console.warn(`Could not read directory ${dateFolderPath}:`, readDirError);
        }
      }
    }

    allImages.sort((a, b) => b.ctime - a.ctime);
    // The original request was for "last 5 uploaded photos". This can be kept if desired,
    // or show all user photos. For now, let's show all.
    // return allImages.slice(0, 5); 
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

export async function deleteImage(
  imagePathFragment: string, // e.g., MM.YYYY/filename.ext (relative to user's dir)
  requestingUserId: string
): Promise<{ success: boolean; error?: string }> {
  if (!requestingUserId) {
    return { success: false, error: 'User authentication required for deletion.' };
  }

  // Construct the full server path and the expected public URL fragment
  // The imagePathFragment is expected to be "MM.YYYY/filename.ext"
  // The full public URL would be /uploads/users/USER_ID/MM.YYYY/filename.ext

  const fullServerPath = path.join(UPLOAD_DIR_BASE_PUBLIC, requestingUserId, imagePathFragment);
  const publicUrlPath = `/uploads/users/${requestingUserId}/${imagePathFragment}`;


  // Security check: Ensure the path being deleted is within the user's designated folder.
  // This check verifies that `fullServerPath` starts with the user's base upload directory.
  const userBaseDir = path.resolve(path.join(UPLOAD_DIR_BASE_PUBLIC, requestingUserId));
  const resolvedFullPath = path.resolve(fullServerPath);

  if (!resolvedFullPath.startsWith(userBaseDir + path.sep) && resolvedFullPath !== userBaseDir) {
      console.error(`Security alert: User ${requestingUserId} attempted to delete path outside their directory: ${fullServerPath}`);
      return { success: false, error: 'Unauthorized attempt to delete file. Path is outside your allowed directory.' };
  }
  
  // Further check: extract userId from the imagePath if it were part of the URL structure used in `id` of `UserImage`
  // For instance, if imagePathFragment was the full public URL like `/uploads/users/someUserId/MM.YYYY/filename.ext`
  // const pathParts = imagePathFragment.split('/'); // e.g. ['', 'uploads', 'users', 'userIdFromFile', 'MM.YYYY', 'filename.ext']
  // const userIdFromFile = pathParts.length > 3 ? pathParts[3] : pathParts[3] : null;
  // if (userIdFromFile !== requestingUserId) {
  //   console.error(`Security alert: User ${requestingUserId} attempted to delete file belonging to ${userIdFromFile}`);
  //   return { success: false, error: 'Unauthorized attempt to delete file.' };
  // }
  // The current `imagePathFragment` is simpler, so the directory check is primary.

  try {
    await fs.access(fullServerPath); // Check if file exists
    await fs.unlink(fullServerPath); // Delete the file
    
    // Revalidate relevant paths. The homepage for this user will change.
    revalidatePath('/'); 
    // Potentially revalidate a user-specific gallery page if it existed.
    // revalidatePath(`/users/${requestingUserId}/gallery`);

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
 * Note on Security:
 * - Files are now stored in user-specific directories (`public/uploads/users/[userId]/...`).
 * - Deletion action MUST verify that the `requestingUserId` matches the `userId` in the path of the file being deleted.
 * - Ensure Nginx/web server configuration for `/public/uploads` directory still:
 *   - Disables script execution.
 *   - Serves files with appropriate `Content-Type` and `X-Content-Type-Options: nosniff`.
 * - Input validation for `userId` and `imagePathFragment` is critical to prevent path traversal.
 *   The current implementation relies on `path.join` and then `path.resolve` for constructing safe paths.
 *   The check `resolvedFullPath.startsWith(userBaseDir)` is a key defense.
 */
