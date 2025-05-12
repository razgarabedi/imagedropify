// src/app/actions/userActions.ts
'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getCurrentUserAction } from '@/app/actions/authActions';
import { 
    getAllUsersForAdmin, 
    updateUserStatusService,
    updateUserLimitsService, // Import the new service
    deleteUserAndRelatedData as deleteUserAndRelatedDataService 
} from '@/lib/auth/service';
import type { User, UserStatus, UserLimits } from '@/lib/auth/types'; // Import UserLimits
import { countUserImages, calculateUserTotalStorage } from '@/app/actions/imageActions'; // Import calculateUserTotalStorage

// Extends User to include activity and limits
export interface UserWithActivity extends User {
  imageCount: number;
  totalStorageUsedMB: number; // Add storage used
  // Limits are already optional properties of User type:
  // maxImages?: number | null; 
  // maxSingleUploadSizeMB?: number | null;
  // maxTotalStorageMB?: number | null;
}

export interface AdminUserListResponse {
  success: boolean;
  users?: UserWithActivity[];
  error?: string;
}

export interface AdminUserActionResponse {
  success: boolean;
  error?: string;
  user?: User; // Return updated user on success for status/limit changes
  userId?: string; // Return userId on successful deletion
  message?: string; // General message
}

// Schema for updating limits. Use coerce for numbers, nullable for removal.
const updateUserLimitsSchema = z.object({
  userId: z.string().uuid("Invalid User ID"),
  // Coerce empty string or non-numeric to null/undefined before parsing as number
  maxImages: z.preprocess(
    (val) => (val === '' || val === null || isNaN(Number(val))) ? null : Number(val),
    z.number().int().min(0, "Cannot be negative").nullable().optional()
  ),
  maxSingleUploadSizeMB: z.preprocess(
    (val) => (val === '' || val === null || isNaN(Number(val))) ? null : Number(val),
    z.number().min(0.1, "Must be at least 0.1MB").max(100).nullable().optional() // Allow float, reasonable max
  ),
  maxTotalStorageMB: z.preprocess(
    (val) => (val === '' || val === null || isNaN(Number(val))) ? null : Number(val),
     z.number().min(1, "Must be at least 1MB").nullable().optional() 
  ),
});


export async function getAllUsersWithActivityAction(): Promise<AdminUserListResponse> {
  const currentUser = await getCurrentUserAction();
  if (!currentUser || currentUser.role !== 'admin') {
    return { success: false, error: 'Unauthorized: Admin access required.' };
  }

  try {
    // getAllUsersForAdmin now returns User[] including optional limits
    const users = await getAllUsersForAdmin(); 
    const usersWithActivity: UserWithActivity[] = await Promise.all(
      users.map(async (user) => {
        const [imageCount, totalStorageUsedBytes] = await Promise.all([
           countUserImages(user.id),
           calculateUserTotalStorage(user.id) // Get total storage in bytes
        ]);
        const totalStorageUsedMB = parseFloat((totalStorageUsedBytes / (1024 * 1024)).toFixed(2)); // Convert to MB
        return { 
            ...user, 
            imageCount, 
            totalStorageUsedMB // Add storage used
        }; 
      })
    );
    return { success: true, users: usersWithActivity };
  } catch (error: any) {
    console.error('Error fetching users with activity:', error);
    return { success: false, error: 'Failed to fetch user data.' };
  }
}

// Action to update user status (approve, reject/ban, unban)
async function updateUserStatusInternal(
  userId: string, 
  newStatus: UserStatus,
  adminUser: User
): Promise<AdminUserActionResponse> {
  if (userId === adminUser.id && newStatus !== 'approved') {
    return { success: false, error: `Cannot change your own admin account status to '${newStatus}'.` };
  }

  try {
    const updatedUser = await updateUserStatusService(userId, newStatus);
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
  if (!adminUser || adminUser.role !== 'admin') {
    return { success: false, error: 'Unauthorized: Admin access required.' };
  }
  const userId = formData.get('userId') as string;
  if (!userId) return { success: false, error: 'User ID is required.' };
  
  return updateUserStatusInternal(userId, 'approved', adminUser);
}

// "Reject" also serves as "Ban"
export async function rejectUserAction(
   prevState: AdminUserActionResponse,
   formData: FormData
): Promise<AdminUserActionResponse> {
  const adminUser = await getCurrentUserAction();
  if (!adminUser || adminUser.role !== 'admin') {
    return { success: false, error: 'Unauthorized: Admin access required.' };
  }
  const userId = formData.get('userId') as string;
  if (!userId) return { success: false, error: 'User ID is required.' };

  return updateUserStatusInternal(userId, 'rejected', adminUser);
}

// Action to "Unban" a user (set status to 'pending' for re-vetting)
export async function unbanUserAction(
  prevState: AdminUserActionResponse,
  formData: FormData
): Promise<AdminUserActionResponse> {
  const adminUser = await getCurrentUserAction();
  if (!adminUser || adminUser.role !== 'admin') {
    return { success: false, error: 'Unauthorized: Admin access required.' };
  }
  const userId = formData.get('userId') as string;
  if (!userId) return { success: false, error: 'User ID is required.' };

  return updateUserStatusInternal(userId, 'pending', adminUser);
}


// Action to delete a user
export async function deleteUserAction(
  prevState: AdminUserActionResponse,
  formData: FormData
): Promise<AdminUserActionResponse> {
  const adminUser = await getCurrentUserAction();
  if (!adminUser || adminUser.role !== 'admin') {
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
      // This might mean user was not found, or some part of deletion failed (logged in service)
      return { success: false, error: `Failed to delete user ${userIdToDelete}. User may not exist or data deletion encountered issues.` };
    }
    revalidatePath('/admin/dashboard'); 
    return { success: true, userId: userIdToDelete, message: `User ${userIdToDelete} and their data have been deleted.` };
  } catch (error: any) {
    console.error(`Error deleting user ${userIdToDelete}:`, error);
    return { success: false, error: error.message || 'Failed to delete user.' };
  }
}


// New Action to update user limits
export async function updateUserLimitsAction(
  prevState: AdminUserActionResponse,
  formData: FormData
): Promise<AdminUserActionResponse> {
  const adminUser = await getCurrentUserAction();
  if (!adminUser || adminUser.role !== 'admin') {
    return { success: false, error: 'Unauthorized: Admin access required.' };
  }

  // Extract raw data from FormData
   const rawData = {
     userId: formData.get('userId'),
     maxImages: formData.get('maxImages'),
     maxSingleUploadSizeMB: formData.get('maxSingleUploadSizeMB'),
     maxTotalStorageMB: formData.get('maxTotalStorageMB'),
   };
  
  // Validate the extracted data
  const validation = updateUserLimitsSchema.safeParse(rawData);

  if (!validation.success) {
    // Combine Zod error messages
    const errorMessages = validation.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ');
    return { success: false, error: `Validation failed: ${errorMessages}` };
  }

  const { userId, ...limitsToUpdate } = validation.data;

  // Construct the limits object, explicitly setting fields to null if they were parsed as null
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
