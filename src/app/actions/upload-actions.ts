'use server';

import fs from 'node:fs/promises';
import path from 'node:path';
import { ZodError, z } from 'zod';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
// process.cwd() is the root of the Next.js project
const UPLOAD_DIR = path.join(process.cwd(), 'public/uploads');

const UploadFileSchema = z.object({
  file: z
    .instanceof(File)
    .refine((file) => file.size > 0, 'File cannot be empty.')
    .refine((file) => file.size <= MAX_FILE_SIZE, `File size should be less than 10MB.`)
    .refine(
      (file) => ACCEPTED_IMAGE_TYPES.includes(file.type),
      'Only .jpg, .jpeg, .png, .gif and .webp formats are supported.'
    ),
});

export interface UploadImageResponse {
  success: boolean;
  name?: string;
  url?: string;
  error?: string;
  errors?: { file?: string[]; _form?: string[] }; // Zod error flattening
}

// Ensure upload directory exists
async function ensureUploadDirExists() {
  try {
    await fs.access(UPLOAD_DIR);
  } catch (error: any) {
    // Directory does not exist, or is not accessible.
    if (error.code === 'ENOENT') {
      try {
        await fs.mkdir(UPLOAD_DIR, { recursive: true });
        console.log(`Upload directory created: ${UPLOAD_DIR}`);
      } catch (mkdirError) {
        console.error(`Error creating upload directory ${UPLOAD_DIR}:`, mkdirError);
        // This is a server configuration issue, so we throw to prevent operation
        throw new Error('Server configuration error: Could not create upload directory.');
      }
    } else {
      // Other access error (e.g. permissions)
      console.error(`Error accessing upload directory ${UPLOAD_DIR}:`, error);
      throw new Error('Server configuration error: Cannot access upload directory.');
    }
  }
}

// Attempt to ensure the directory exists when the module is loaded.
// If this fails, the action will also attempt to create it.
ensureUploadDirExists().catch(err => {
    console.error("Failed to ensure upload directory on module load:", err.message);
    // Depending on policy, you might want to prevent the app from starting or log critical error.
});


export async function uploadImageAction(
  prevState: UploadImageResponse | undefined,
  formData: FormData
): Promise<UploadImageResponse> {
  const file = formData.get('file') as File | null;

  if (!file || file.size === 0) {
    return { success: false, error: 'No file provided or file is empty.' };
  }

  try {
    UploadFileSchema.parse({ file });
  } catch (error) {
    if (error instanceof ZodError) {
      return { success: false, errors: error.flatten().fieldErrors };
    }
    return { success: false, error: 'Invalid file data.' };
  }

  const originalFilename = file.name;
  // Sanitize filename: take base, replace spaces, remove unsafe chars, add timestamp and original extension
  const filenameBase = path.basename(originalFilename, path.extname(originalFilename));
  const sanitizedFilenameBase = filenameBase
    .replace(/\s+/g, '_') // Replace spaces with underscores
    .replace(/[^a-zA-Z0-9_.-]/g, ''); // Remove potentially unsafe characters

  const extension = path.extname(originalFilename).toLowerCase();
  if (!ACCEPTED_IMAGE_TYPES.map(t => `.${t.split('/')[1]}`).includes(extension) && extension !== '.jpeg') {
     // Double check extension based on MIME type from client, though server MIME check is primary.
     // This handles cases where file.type might be image/jpeg but extension is .jfif etc.
     // We stick to common extensions.
     return { success: false, error: `File extension ${extension} is not supported based on its type.` };
  }


  const uniqueFilename = `${sanitizedFilenameBase}_${Date.now()}${extension}`;
  const filePath = path.join(UPLOAD_DIR, uniqueFilename);

  try {
    // Attempt to ensure directory exists again, in case it wasn't created on module load or for serverless environments
    await fs.mkdir(UPLOAD_DIR, { recursive: true });

    const bytes = await file.arrayBuffer();
    await fs.writeFile(filePath, Buffer.from(bytes));

    const publicUrl = `/uploads/${uniqueFilename}`;

    return {
      success: true,
      name: originalFilename, // Return original name for display purposes
      url: publicUrl,
    };
  } catch (e: any) {
    console.error('Error uploading file to server:', e);
    if (e.message.includes('Server configuration error')) {
        return { success: false, error: e.message };
    }
    return { success: false, error: 'Failed to save file on server. Please try again later.' };
  }
}