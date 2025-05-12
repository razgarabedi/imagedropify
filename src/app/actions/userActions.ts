// src/app/actions/userActions.ts
'use server';

import { revalidatePath } from 'next/cache';
import { getCurrentUserAction } from '@/app/actions/authActions';
import { getAllUsersForAdmin, updateUserStatus as updateUserStatusService } from '@/lib/auth/service';
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
  user?: User; // Return updated user on success
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

// Action to approve a user
export async function approveUserAction(
  prevState: AdminUserActionResponse,
  formData: FormData
): Promise<AdminUserActionResponse> {
  const adminUser = await getCurrentUserAction();
  if (!adminUser || adminUser.role !== 'admin') {
    return { success: false, error: 'Unauthorized: Admin access required.' };
  }

  const userId = formData.get('userId') as string;
  if (!userId) {
    return { success: false, error: 'User ID is required.' };
  }

  try {
    const updatedUser = await updateUserStatusService(userId, 'approved');
    if (!updatedUser) {
        return { success: false, error: `User with ID ${userId} not found.` };
    }
    revalidatePath('/admin/dashboard'); // Revalidate the dashboard to show updated status
    return { success: true, user: updatedUser };
  } catch (error: any) {
    console.error(`Error approving user ${userId}:`, error);
    return { success: false, error: error.message || 'Failed to approve user.' };
  }
}

// Action to reject a user
export async function rejectUserAction(
   prevState: AdminUserActionResponse,
   formData: FormData
): Promise<AdminUserActionResponse> {
  const adminUser = await getCurrentUserAction();
  if (!adminUser || adminUser.role !== 'admin') {
    return { success: false, error: 'Unauthorized: Admin access required.' };
  }

  const userId = formData.get('userId') as string;
  if (!userId) {
    return { success: false, error: 'User ID is required.' };
  }
  
  // Optional: Add check to prevent rejecting the currently logged-in admin
  if (userId === adminUser.id) {
    return { success: false, error: 'Cannot reject your own admin account.' };
  }

  try {
    // Strategy: Change status to 'rejected'. Alternatively, could delete the user.
    const updatedUser = await updateUserStatusService(userId, 'rejected');
     if (!updatedUser) {
        return { success: false, error: `User with ID ${userId} not found.` };
    }
    revalidatePath('/admin/dashboard'); // Revalidate the dashboard
    return { success: true, user: updatedUser };
  } catch (error: any) {
    console.error(`Error rejecting user ${userId}:`, error);
    return { success: false, error: error.message || 'Failed to reject user.' };
  }
}
