// src/app/actions/imageActions.ts
'use server';

import fs from 'fs/promises';
import path from 'path';
import { stat } from 'fs/promises';
import { revalidatePath } from 'next/cache';

const UPLOAD_DIR_BASE = path.join(process.cwd(), 'public/uploads');
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

// Ensure upload directory (base and dated subfolder) exists
async function ensureUploadDirsExist(): Promise<string> {
  const dateFolder = getFormattedDateFolder();
  const fullPath = path.join(UPLOAD_DIR_BASE, dateFolder);
  try {
    await fs.mkdir(fullPath, { recursive: true });
  } catch (error) {
    console.error('CRITICAL: Failed to create upload directory structure:', fullPath, error);
    throw new Error(`Failed to prepare upload directory: ${fullPath}. Check server logs and directory permissions.`);
  }
  return fullPath; 
}


export interface UploadedImageServerData {
  name: string; // The generated unique filename on the server
  url: string; // The public URL to access the image
  originalName: string; // The original name of the uploaded file
}

export async function uploadImage(
  formData: FormData
): Promise<{ success: boolean; data?: UploadedImageServerData; error?: string }> {
  let currentActualUploadPath: string;
  try {
    currentActualUploadPath = await ensureUploadDirsExist();
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
    // This case should ideally be caught by the ACCEPTED_IMAGE_TYPES check,
    // but it's a defensive measure.
    return { success: false, error: `File type (${file.type}) is not supported or cannot be mapped to an extension.` };
  }

  if (file.size > MAX_FILE_SIZE) {
    return { success: false, error: `File too large. Maximum allowed size is 10MB. Your file is ${(file.size / (1024 * 1024)).toFixed(2)}MB.` };
  }

  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);

  const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1E9)}`;
  // Use the extension derived from the validated MIME type for security
  const filename = `${uniqueSuffix}${fileExtension}`;
  const filePath = path.join(currentActualUploadPath, filename);
  const dateFolder = getFormattedDateFolder(); // get it again for the URL, ensure consistency

  try {
    await fs.writeFile(filePath, buffer);
    const imageUrl = `/uploads/${dateFolder}/${filename}`;
    
    revalidatePath('/'); // Revalidate the home page to show new images
    revalidatePath('/uploads'); // If there's a gallery page for all uploads
    
    return {
      success: true,
      data: { name: filename, url: imageUrl, originalName: file.name },
    };
  } catch (error) {
    console.error('Failed to save file to disk:', filePath, error);
    return { success: false, error: 'Failed to save file on server. Please try again or contact support if the issue persists.' };
  }
}


export interface RecentImage {
  id: string; 
  name: string; 
  url: string;
  ctime: number; 
}

export async function getRecentImages(): Promise<RecentImage[]> {
  try {
    // Ensure base upload directory exists. If not, it will be created by ensureUploadDirsExist on first upload.
    // For reading, we can proceed if it exists, or return empty if not.
    await fs.access(UPLOAD_DIR_BASE); 
  } catch (error) {
    // Base directory doesn't exist or is not accessible, so no images to list.
    // This is not necessarily an error if no uploads have occurred yet.
    console.warn('Base upload directory not found or accessible while fetching recent images. This is normal if no images have been uploaded yet.');
    return []; 
  }

  const allImages: RecentImage[] = [];
  const dateFolderRegex = /^\d{2}\.\d{4}$/; // Matches MM.YYYY format

  try {
    const yearMonthDirs = await fs.readdir(UPLOAD_DIR_BASE, { withFileTypes: true });

    for (const dirent of yearMonthDirs) {
      if (dirent.isDirectory() && dateFolderRegex.test(dirent.name)) {
        const dateFolderPath = path.join(UPLOAD_DIR_BASE, dirent.name);
        try {
          const filesInDateFolder = await fs.readdir(dateFolderPath);
          const imageFileDetails = await Promise.all(
            filesInDateFolder.map(async (file) => {
              const filePath = path.join(dateFolderPath, file);
              try {
                const stats = await stat(filePath);
                // Securely check extensions based on MIME_TO_EXTENSION values
                const validExtensions = Object.values(MIME_TO_EXTENSION);
                if (stats.isFile() && validExtensions.some(ext => file.toLowerCase().endsWith(ext))) {
                  return {
                    id: `${dirent.name}/${file}`, 
                    name: file,
                    url: `/uploads/${dirent.name}/${file}`,
                    ctime: stats.ctimeMs,
                  };
                }
              } catch (statError) {
                console.error(`Failed to stat file ${filePath}:`, statError);
                return null;
              }
              return null;
            })
          );
          allImages.push(...imageFileDetails.filter((file): file is RecentImage => file !== null));
        } catch (readDirError) {
          console.warn(`Could not read directory ${dateFolderPath}:`, readDirError);
        }
      }
    }

    allImages.sort((a, b) => b.ctime - a.ctime);
    return allImages.slice(0, 5);

  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === 'ENOENT' && nodeError.path === UPLOAD_DIR_BASE) {
      // This specific ENOENT for UPLOAD_DIR_BASE was handled by the initial fs.access check.
      // However, if it occurs during readdir, it implies the dir vanished between checks, which is unlikely but possible.
      console.warn('Base upload directory disappeared while fetching recent images.');
      return [];
    }
    console.error('Failed to read or process image directories:', error);
    return []; // Return empty on other errors to prevent crashes
  }
}

/**
 * Note on Security:
 * - This script handles file uploads. Ensure the Nginx/web server configuration for the `/public/uploads` directory:
 *   - Disables script execution (e.g., PHP, Python, CGI) for all files within `/public/uploads`.
 *   - Serves files with appropriate `Content-Type` headers and `X-Content-Type-Options: nosniff`.
 *   - Limits request body size at the web server level to prevent denial-of-service via large uploads.
 * - The application server process (Node.js for Next.js) needs write permissions to the `public/uploads` directory
 *   and its subdirectories. The web server (Nginx) needs read permissions to serve these files.
 * - Regularly update dependencies to patch known vulnerabilities.
 * - Consider implementing rate limiting for image uploads to prevent abuse.
 * - For very high security, consider image sanitization/rewriting libraries (e.g. Sharp on server-side if feasible)
 *   to remove malicious metadata or re-encode images, though this adds complexity and processing overhead.
 */
