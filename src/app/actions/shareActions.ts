
// src/app/actions/shareActions.ts
'use server';

import prisma from '@/lib/prisma';
import { v4 as uuidv4 } from 'uuid';
import { getCurrentUserIdFromSession } from '@/lib/auth/service';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import type { FolderShare as PrismaFolderShare } from '@prisma/client'; // Use Prisma's generated type

// Using Prisma's FolderShare type now, so this interface might be redundant
// export interface FolderShare {
//   shareId: string;
//   userId: string;
//   folderName: string;
//   createdAt: string; // Prisma uses DateTime, so string conversion might be needed for display
// }

export interface ShareActionResponse {
  success: boolean;
  shareUrl?: string;
  shareId?: string;
  error?: string;
  folderInfo?: { userId: string; folderName: string };
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
    // Check if a share link for this user and folder already exists
    const existingShare = await prisma.folderShare.findFirst({
      where: {
        userId: userId,
        folderName: folderName,
      },
    });

    if (existingShare) {
      return {
        success: true,
        shareId: existingShare.shareId,
        shareUrl: `/share/${existingShare.shareId}`,
      };
    }

    const newShareId = uuidv4();
    const newShare = await prisma.folderShare.create({
      data: {
        shareId: newShareId,
        userId: userId,
        folderName: folderName,
        // createdAt is handled by Prisma's default @db.Timestamp(0) or default now()
      },
    });

    revalidatePath('/my-images');

    return {
      success: true,
      shareId: newShare.shareId,
      shareUrl: `/share/${newShare.shareId}`,
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
    const shareInfo = await prisma.folderShare.findUnique({
      where: { shareId: shareId },
    });

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
    const result = await prisma.folderShare.deleteMany({
      where: {
        userId: userId,
        folderName: folderName,
      },
    });

    if (result.count > 0) {
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
    return { success: false };
  }
  if (!folderName || typeof folderName !== 'string') {
    return { success: false, error: 'Invalid folder name for checking share status.' };
  }

  try {
    const existingShare = await prisma.folderShare.findFirst({
      where: {
        userId: userId,
        folderName: folderName,
      },
    });
    if (existingShare) {
      return {
        success: true,
        shareId: existingShare.shareId,
        shareUrl: `/share/${existingShare.shareId}`,
      };
    }
    return { success: false }; // No active share found
  } catch (error: any) {
    console.error('Error checking for active share link:', error);
    return { success: false, error: 'Server error checking share status.' };
  }
}
