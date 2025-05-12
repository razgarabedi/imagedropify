// src/app/actions/userActions.ts
'use server';

import { revalidatePath } from 'next/cache';
import { getCurrentUserAction } from '@/app/actions/authActions';
import { 
    getAllUsersForAdmin, 
    updateUserStatusService,
    deleteUserAndRelatedData as deleteUserAndRelatedDataService // Renamed for clarity
} from '@/lib/auth/service';
import type { User, UserStatus } from '@/lib/auth/types';
import { countUserImages } from '@/app/actions/imageActions';

export interface UserWithActivity extends User {
  imageCount: number;
  // Status is already part of User type
}

export interface AdminUserListResponse {
  success: boolean;
  users?: UserWithActivity[];
  error?: string;
}

export interface AdminUserActionResponse {
  success: boolean;
  error?: string;
  user?: User; // Return updated user on success for status changes
  userId?: string; // Return userId on successful deletion
  message?: string; // General message
}


export async function getAllUsersWithActivityAction(): Promise<AdminUserListResponse> {
  const currentUser = await getCurrentUserAction();
  if (!currentUser || currentUser.role !== 'admin') {
    return { success: false, error: 'Unauthorized: Admin access required.' };
  }

  try {
    const users = await getAllUsersForAdmin(); // This function already returns users without passwords
    const usersWithActivity: UserWithActivity[] = await Promise.all(
      users.map(async (user) => {
        const imageCount = await countUserImages(user.id);
        return { ...user, imageCount }; // User object includes id, email, role, status
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

// New action to "Unban" a user (set status to 'pending' for re-vetting)
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


// New action to delete a user
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
