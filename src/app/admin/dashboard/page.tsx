// src/app/admin/dashboard/page.tsx
import { Suspense } from 'react';
import { getAllUsersWithActivityAction } from '@/app/actions/userActions';
import { getCurrentMaxUploadSizeAction } from '@/app/actions/settingsActions';
import { UserTable } from '@/components/admin/user-table';
import { SettingsForm } from '@/components/admin/settings-form';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { AlertCircle, Users, Settings as SettingsIcon } from 'lucide-react';


async function UserManagementSection() {
  // Renamed response variable for clarity
  const usersListResponse = await getAllUsersWithActivityAction();

  if (!usersListResponse.success || !usersListResponse.users) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Users className="w-5 h-5" /> User Management</CardTitle>
          <CardDescription>View and manage application users.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center text-destructive">
            <AlertCircle className="w-5 h-5 mr-2" />
            <p>{usersListResponse.error || 'Could not load users.'}</p>
          </div>
        </CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Users className="w-5 h-5" /> User Management</CardTitle>
        <CardDescription>Overview of registered users, their status, and activity.</CardDescription>
      </CardHeader>
      <CardContent>
        {/* UserTable now handles displaying status and actions */}
        <UserTable users={usersListResponse.users} /> 
      </CardContent>
    </Card>
  );
}

async function SiteSettingsSection() {
  const settingsResponse = await getCurrentMaxUploadSizeAction();
  
  if (!settingsResponse.success || settingsResponse.currentMaxUploadSizeMB === undefined) {
     return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><SettingsIcon className="w-5 h-5" /> Site Settings</CardTitle>
           <CardDescription>Configure global application settings.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center text-destructive">
            <AlertCircle className="w-5 h-5 mr-2" />
            <p>{settingsResponse.error || 'Could not load site settings.'}</p>
          </div>
        </CardContent>
      </Card>
    );
  }
  
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><SettingsIcon className="w-5 h-5" /> Site Settings</CardTitle>
        <CardDescription>Configure global application settings.</CardDescription>
      </CardHeader>
      <CardContent>
        <SettingsForm initialMaxUploadSizeMB={settingsResponse.currentMaxUploadSizeMB} />
      </CardContent>
    </Card>
  );
}


export default function AdminDashboardPage() {
  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Admin Dashboard</h2>
        <p className="text-muted-foreground">Manage users and configure site settings.</p>
      </div>
      
      <Separator />

      {/* Changed grid layout to stack vertically on smaller screens, then one column */}
      <div className="grid gap-8 md:grid-cols-1"> 
        <Suspense fallback={<UserManagementSkeleton />}>
          <UserManagementSection />
        </Suspense>
        <Suspense fallback={<SiteSettingsSkeleton />}>
          <SiteSettingsSection />
        </Suspense>
      </div>
    </div>
  );
}

function UserManagementSkeleton() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Users className="w-5 h-5" /> User Management</CardTitle>
        <CardDescription>View and manage application users.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Adjust skeleton for potentially more columns */}
        <Skeleton className="h-10 w-full" /> 
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
      </CardContent>
    </Card>
  );
}

function SiteSettingsSkeleton() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><SettingsIcon className="w-5 h-5" /> Site Settings</CardTitle>
        <CardDescription>Configure global application settings.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Skeleton className="h-10 w-1/2" />
        <Skeleton className="h-10 w-1/4" />
      </CardContent>
    </Card>
  );
}

// Ensure revalidation if needed when actions within this page modify data.
// This is typically handled by revalidatePath in the server actions themselves.
export const revalidate = 0; // Or a specific time in seconds, or rely on action-based revalidation
