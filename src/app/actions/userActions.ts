// src/app/actions/userActions.ts
'use server';

import { getCurrentUserAction } from '@/app/actions/authActions';
import { getAllUsersForAdmin } from '@/lib/auth/service';
import type { User } from '@/lib/auth/types';
import { countUserImages } from '@/app/actions/imageActions'; // Assuming this will be added to imageActions

export interface UserWithActivity extends User {
  imageCount: number;
}

export interface AdminUserActionResponse {
  success: boolean;
  users?: UserWithActivity[];
  error?: string;
}

export async function getAllUsersWithActivityAction(): Promise<AdminUserActionResponse> {
  const currentUser = await getCurrentUserAction();
  if (!currentUser || currentUser.role !== 'admin') {
    return { success: false, error: 'Unauthorized: Admin access required.' };
  }

  try {
    const users = await getAllUsersForAdmin();
    const usersWithActivity: UserWithActivity[] = await Promise.all(
      users.map(async (user) => {
        const imageCount = await countUserImages(user.id);
        return { ...user, imageCount };
      })
    );
    return { success: true, users: usersWithActivity };
  } catch (error: any) {
    console.error('Error fetching users with activity:', error);
    return { success: false, error: 'Failed to fetch user data.' };
  }
}
