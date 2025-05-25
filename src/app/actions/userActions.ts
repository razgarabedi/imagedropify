// src/app/actions/userActions.ts
'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getCurrentUserAction } from '@/app/actions/authActions';
import { 
    getAllUsersForAdmin, 
    updateUserStatusService,
    updateUserLimitsService,
    deleteUserAndRelatedDataService 
} from '@/lib/auth/service';
import type { User, UserStatus, UserLimits, UserRole } from '@/lib/auth/types';
import { countUserImages, calculateUserTotalStorage } from '@/app/actions/imageActions';

export interface UserWithActivity extends User {
  imageCount: number;
  totalStorageUsedMB: number;
}

export interface AdminUserListResponse {
  success: boolean;
  users?: UserWithActivity[];
  error?: string;
}

export interface AdminUserActionResponse {
  success: boolean;
  error?: string;
  user?: User;
  userId?: string;
  message?: string;
}

const updateUserLimitsSchema = z.object({
  userId: z.string().uuid("Invalid User ID"),
  maxImages: z.preprocess(
    (val) => (val === '' || val === null || isNaN(Number(val))) ? null : Number(val),
    z.number().int().min(0, "Cannot be negative").nullable().optional()
  ),
  maxSingleUploadSizeMB: z.preprocess(
    (val) => (val === '' || val === null || isNaN(Number(val))) ? null : Number(val),
    z.number().min(0.1, "Must be at least 0.1MB").max(100).nullable().optional()
  ),
  maxTotalStorageMB: z.preprocess(
    (val) => (val === '' || val === null || isNaN(Number(val))) ? null : Number(val),
     z.number().min(1, "Must be at least 1MB").nullable().optional()
  ),
});

export async function getAllUsersWithActivityAction(): Promise<AdminUserListResponse> {
  const currentUser = await getCurrentUserAction();
  if (!currentUser || currentUser.role !== 'Admin') { // Role check for 'Admin' (capitalized from Prisma enum)
    return { success: false, error: 'Unauthorized: Admin access required.' };
  }

  try {
    const users = await getAllUsersForAdmin();
    const usersWithActivity: UserWithActivity[] = await Promise.all(
      users.map(async (user) => {
        const [imageCount, totalStorageUsedBytes] = await Promise.all([
           countUserImages(user.id),
           calculateUserTotalStorage(user.id)
        ]);
        const totalStorageUsedMB = parseFloat((totalStorageUsedBytes / (1024 * 1024)).toFixed(2));
        return { 
            ...user, 
            imageCount, 
            totalStorageUsedMB
        }; 
      })
    );
    return { success: true, users: usersWithActivity };
  } catch (error: any) {
    console.error('Error fetching users with activity:', error);
    return { success: false, error: 'Failed to fetch user data.' };
  }
}

async function updateUserStatusInternal(
  userId: string, 
  newStatus: UserStatus, // UserStatus is now 'Pending' | 'Approved' | 'Rejected'
  adminUser: User
): Promise<AdminUserActionResponse> {
  // Check against capitalized status 'Approved'
  if (userId === adminUser.id && newStatus !== 'Approved') {
    return { success: false, error: `Cannot change your own admin account status to '${newStatus}'.` };
  }

  try {
    const updatedUser = await updateUserStatusService(userId, newStatus); // newStatus is already capitalized
    if (!updatedUser) {
        return { success: false, error: `User with ID ${userId} not found.` };
    }
    revalidatePath('/admin/dashboard'); 
    return { success: true, user: updatedUser, message: `User status updated to ${newStatus}.` };
  } catch (error: any) {
    console.error(`Error updating user ${userId} status to ${newStatus}:`, error);
    return { success: false, error: error.message || `Failed to update user status to ${newStatus}.` };
  }
}

export async function approveUserAction(
  prevState: AdminUserActionResponse,
  formData: FormData
): Promise<AdminUserActionResponse> {
  const adminUser = await getCurrentUserAction();
  if (!adminUser || adminUser.role !== 'Admin') {
    return { success: false, error: 'Unauthorized: Admin access required.' };
  }
  const userId = formData.get('userId') as string;
  if (!userId) return { success: false, error: 'User ID is required.' };
  
  return updateUserStatusInternal(userId, 'Approved', adminUser); // Use capitalized 'Approved'
}

export async function rejectUserAction(
   prevState: AdminUserActionResponse,
   formData: FormData
): Promise<AdminUserActionResponse> {
  const adminUser = await getCurrentUserAction();
  if (!adminUser || adminUser.role !== 'Admin') {
    return { success: false, error: 'Unauthorized: Admin access required.' };
  }
  const userId = formData.get('userId') as string;
  if (!userId) return { success: false, error: 'User ID is required.' };

  return updateUserStatusInternal(userId, 'Rejected', adminUser); // Use capitalized 'Rejected'
}

export async function unbanUserAction(
  prevState: AdminUserActionResponse,
  formData: FormData
): Promise<AdminUserActionResponse> {
  const adminUser = await getCurrentUserAction();
  if (!adminUser || adminUser.role !== 'Admin') {
    return { success: false, error: 'Unauthorized: Admin access required.' };
  }
  const userId = formData.get('userId') as string;
  if (!userId) return { success: false, error: 'User ID is required.' };

  return updateUserStatusInternal(userId, 'Pending', adminUser); // Use capitalized 'Pending'
}

export async function deleteUserAction(
  prevState: AdminUserActionResponse,
  formData: FormData
): Promise<AdminUserActionResponse> {
  const adminUser = await getCurrentUserAction();
  if (!adminUser || adminUser.role !== 'Admin') {
    return { success: false, error: 'Unauthorized: Admin access required.' };
  }

  const userIdToDelete = formData.get('userId') as string;
  if (!userIdToDelete) {
    return { success: false, error: 'User ID is required for deletion.' };
  }

  if (userIdToDelete === adminUser.id) {
    return { success: false, error: 'Cannot delete your own admin account.' };
  }

  try {
    const deletionSuccess = await deleteUserAndRelatedDataService(userIdToDelete);
    if (!deletionSuccess) {
      return { success: false, error: `Failed to delete user ${userIdToDelete}. User may not exist or data deletion encountered issues.` };
    }
    revalidatePath('/admin/dashboard'); 
    return { success: true, userId: userIdToDelete, message: `User ${userIdToDelete} and their data have been deleted.` };
  } catch (error: any) {
    console.error(`Error deleting user ${userIdToDelete}:`, error);
    return { success: false, error: error.message || 'Failed to delete user.' };
  }
}

export async function updateUserLimitsAction(
  prevState: AdminUserActionResponse,
  formData: FormData
): Promise<AdminUserActionResponse> {
  const adminUser = await getCurrentUserAction();
  if (!adminUser || adminUser.role !== 'Admin') {
    return { success: false, error: 'Unauthorized: Admin access required.' };
  }

   const rawData = {
     userId: formData.get('userId'),
     maxImages: formData.get('maxImages'),
     maxSingleUploadSizeMB: formData.get('maxSingleUploadSizeMB'),
     maxTotalStorageMB: formData.get('maxTotalStorageMB'),
   };
  
  const validation = updateUserLimitsSchema.safeParse(rawData);

  if (!validation.success) {
    const errorMessages = validation.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ');
    return { success: false, error: `Validation failed: ${errorMessages}` };
  }

  const { userId, ...limitsToUpdate } = validation.data;

   const finalLimits: UserLimits = {
      maxImages: limitsToUpdate.maxImages === undefined ? undefined : limitsToUpdate.maxImages,
      maxSingleUploadSizeMB: limitsToUpdate.maxSingleUploadSizeMB === undefined ? undefined : limitsToUpdate.maxSingleUploadSizeMB,
      maxTotalStorageMB: limitsToUpdate.maxTotalStorageMB === undefined ? undefined : limitsToUpdate.maxTotalStorageMB,
   };

  try {
    const updatedUser = await updateUserLimitsService(userId, finalLimits);
    if (!updatedUser) {
      return { success: false, error: `User with ID ${userId} not found.` };
    }
    revalidatePath('/admin/dashboard');
    return { success: true, user: updatedUser, message: `Limits updated for user ${updatedUser.email}.` };
  } catch (error: any) {
    console.error(`Error updating limits for user ${userId}:`, error);
    return { success: false, error: error.message || 'Failed to update user limits.' };
  }
}
