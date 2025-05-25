
// src/app/actions/shareActions.ts
'use server';

import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { getCurrentUserIdFromSession } from '@/lib/auth/service';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';

const FOLDER_SHARES_FILE_PATH = path.join(process.cwd(), 'folder-shares.json');

export interface FolderShare {
  shareId: string;
  userId: string;
  folderName: string;
  createdAt: string;
}

export interface ShareActionResponse {
  success: boolean;
  shareUrl?: string;
  shareId?: string;
  error?: string;
  folderInfo?: { userId: string; folderName: string };
}

async function readFolderShares(): Promise<FolderShare[]> {
  try {
    await fs.access(FOLDER_SHARES_FILE_PATH);
    const data = await fs.readFile(FOLDER_SHARES_FILE_PATH, 'utf-8');
    return JSON.parse(data) as FolderShare[];
  } catch (error) {
    // If file doesn't exist or is invalid, return empty array, or create it
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      await writeFolderShares([]); // Create the file if it doesn't exist
      return [];
    }
    console.error("Error reading folder-shares.json:", error);
    return [];
  }
}

async function writeFolderShares(shares: FolderShare[]): Promise<void> {
  try {
    await fs.writeFile(FOLDER_SHARES_FILE_PATH, JSON.stringify(shares, null, 2), 'utf-8');
  } catch (error) {
    console.error("Failed to write folder-shares.json:", error);
    throw new Error("Server error: Could not save folder share data.");
  }
}

const folderNameSchema = z.string().min(1, "Folder name cannot be empty.").max(100, "Folder name too long.");

export async function createShareLinkAction(
  prevState: ShareActionResponse,
  formData: FormData
): Promise<ShareActionResponse> {
  const userId = await getCurrentUserIdFromSession();
  if (!userId) {
    return { success: false, error: 'User authentication required.' };
  }

  const rawFolderName = formData.get('folderName');
  const validation = folderNameSchema.safeParse(rawFolderName);

  if (!validation.success) {
    return { success: false, error: validation.error.errors.map(e => e.message).join(', ') };
  }
  const folderName = validation.data;

  try {
    const shares = await readFolderShares();
    
    // For simplicity, one active share link per folder. Find existing first.
    let existingShare = shares.find(s => s.userId === userId && s.folderName === folderName);

    if (existingShare) {
      return { 
        success: true, 
        shareId: existingShare.shareId,
        shareUrl: `/share/${existingShare.shareId}` 
      };
    }

    const newShareId = uuidv4();
    const newShare: FolderShare = {
      shareId: newShareId,
      userId,
      folderName,
      createdAt: new Date().toISOString(),
    };

    shares.push(newShare);
    await writeFolderShares(shares);

    revalidatePath('/my-images'); // Revalidate to show the new share link status

    return { 
      success: true, 
      shareId: newShareId,
      shareUrl: `/share/${newShareId}`
    };
  } catch (error: any) {
    console.error('Error creating share link:', error);
    return { success: false, error: error.message || 'Failed to create share link.' };
  }
}

export async function getSharedFolderInfoAction(shareId: string): Promise<ShareActionResponse> {
  if (!shareId || typeof shareId !== 'string') {
    return { success: false, error: 'Invalid Share ID provided.' };
  }
  try {
    const shares = await readFolderShares();
    const shareInfo = shares.find(s => s.shareId === shareId);

    if (!shareInfo) {
      return { success: false, error: 'Share link not found or expired.' };
    }
    return { success: true, folderInfo: { userId: shareInfo.userId, folderName: shareInfo.folderName } };
  } catch (error: any) {
    console.error('Error retrieving shared folder info:', error);
    return { success: false, error: 'Server error retrieving share information.' };
  }
}


export async function revokeShareLinkAction(
  prevState: ShareActionResponse,
  formData: FormData
): Promise<ShareActionResponse> {
  const userId = await getCurrentUserIdFromSession();
  if (!userId) {
    return { success: false, error: 'User authentication required.' };
  }

  const rawFolderName = formData.get('folderName');
  const validation = folderNameSchema.safeParse(rawFolderName);

  if (!validation.success) {
    return { success: false, error: validation.error.errors.map(e => e.message).join(', ') };
  }
  const folderName = validation.data;
  
  try {
    let shares = await readFolderShares();
    const initialLength = shares.length;
    shares = shares.filter(s => !(s.userId === userId && s.folderName === folderName));

    if (shares.length < initialLength) {
      await writeFolderShares(shares);
      revalidatePath('/my-images');
      return { success: true, shareUrl: '' }; // Indicate link is revoked
    } else {
      return { success: false, error: 'No active share link found for this folder to revoke.' };
    }
  } catch (error: any) {
    console.error('Error revoking share link:', error);
    return { success: false, error: error.message || 'Failed to revoke share link.' };
  }
}

export async function getActiveShareLinkForFolder(folderName: string): Promise<ShareActionResponse> {
    const userId = await getCurrentUserIdFromSession();
    if (!userId) {
        // Not an error, just means no user logged in to have shares
        return { success: false }; 
    }
     if (!folderName || typeof folderName !== 'string') {
        return { success: false, error: 'Invalid folder name for checking share status.' };
    }

    try {
        const shares = await readFolderShares();
        const existingShare = shares.find(s => s.userId === userId && s.folderName === folderName);
        if (existingShare) {
            return { 
                success: true, 
                shareId: existingShare.shareId, 
                shareUrl: `/share/${existingShare.shareId}` 
            };
        }
        return { success: false }; // No active share found
    } catch (error: any) {
        console.error('Error checking for active share link:', error);
        return { success: false, error: 'Server error checking share status.' };
    }
}
