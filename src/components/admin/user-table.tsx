// src/components/admin/user-table.tsx
'use client';

import React, { useEffect, useActionState, startTransition, useState } from 'react';
import type { UserWithActivity, AdminUserActionResponse } from '@/app/actions/userActions';
import { approveUserAction, rejectUserAction, unbanUserAction, deleteUserAction } from '@/app/actions/userActions';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, CheckCircle, XCircle, RotateCcw, Trash2, ShieldAlert, Settings2 } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { UserLimitsDialog } from './user-limits-dialog';
import type { UserStatus, UserRole } from '@/lib/auth/types'; // Import UserStatus and UserRole

interface UserTableProps {
  users: UserWithActivity[];
}

const initialActionState: AdminUserActionResponse = { success: false };

function UserActionButtons({ user, currentAdminId }: { user: UserWithActivity, currentAdminId: string | undefined }) {
  const { toast } = useToast();
  
  const [approveState, approveFormAction, isApprovePending] = useActionState(approveUserAction, initialActionState);
  const [rejectState, rejectFormAction, isRejectPending] = useActionState(rejectUserAction, initialActionState);
  const [unbanState, unbanFormAction, isUnbanPending] = useActionState(unbanUserAction, initialActionState);
  const [deleteState, deleteFormAction, isDeletePending] = useActionState(deleteUserAction, initialActionState);
  
  const [isLimitsDialogOpen, setIsLimitsDialogOpen] = useState(false);

  useEffect(() => {
    if (!isApprovePending && approveState.success && approveState.user) {
      toast({ title: 'User Approved', description: `${approveState.user.email} has been approved.` });
    } else if (!isApprovePending && approveState.error) {
      toast({ variant: 'destructive', title: 'Approval Failed', description: approveState.error });
    }
  }, [approveState, isApprovePending, toast]);

  useEffect(() => {
    if (!isRejectPending && rejectState.success && rejectState.user) {
       toast({ title: 'User Status Updated', description: `${rejectState.user.email} has been ${rejectState.user.status}.` });
    } else if (!isRejectPending && rejectState.error) {
       toast({ variant: 'destructive', title: 'Update Failed', description: rejectState.error });
    }
  }, [rejectState, isRejectPending, toast]);

  useEffect(() => {
    if (!isUnbanPending && unbanState.success && unbanState.user) {
      toast({ title: 'User Unbanned', description: `${unbanState.user.email} status set to 'Pending' for re-approval.` });
    } else if (!isUnbanPending && unbanState.error) {
      toast({ variant: 'destructive', title: 'Unban Failed', description: unbanState.error });
    }
  }, [unbanState, isUnbanPending, toast]);
  
  useEffect(() => {
    if (!isDeletePending && deleteState.success && deleteState.userId) {
      toast({ title: 'User Deleted', description: `User ${deleteState.userId} has been deleted.` });
    } else if (!isDeletePending && deleteState.error) {
      toast({ variant: 'destructive', title: 'Deletion Failed', description: deleteState.error });
    }
  }, [deleteState, isDeletePending, toast]);

  const createFormData = (userId: string) => {
    const formData = new FormData();
    formData.append('userId', userId);
    return formData;
  };

  const isCurrentUserTheAdmin = user.id === currentAdminId;
  const anyActionPending = isApprovePending || isRejectPending || isUnbanPending || isDeletePending;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Status Action Buttons - check against capitalized status from Prisma enum */}
      {user.status === 'Pending' && (
        <>
          <Button 
            size="sm" 
            variant="outline" 
            onClick={() => startTransition(() => approveFormAction(createFormData(user.id)))} 
            disabled={anyActionPending}
            className="text-green-600 border-green-600 hover:bg-green-50 hover:text-green-700"
            title={`Approve ${user.email}`}
          >
            {isApprovePending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle className="mr-2 h-4 w-4" />} Approve
          </Button>
          <Button 
            size="sm" 
            variant="outline" 
            onClick={() => startTransition(() => rejectFormAction(createFormData(user.id)))} 
            disabled={anyActionPending}
            className="text-red-600 border-red-600 hover:bg-red-50 hover:text-red-700"
            title={`Reject ${user.email}`}
          >
            {isRejectPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <XCircle className="mr-2 h-4 w-4" />} Reject
          </Button>
        </>
      )}
      {user.status === 'Approved' && !isCurrentUserTheAdmin && (
        <Button 
          size="sm" 
          variant="outline" 
          onClick={() => startTransition(() => rejectFormAction(createFormData(user.id)))} 
          disabled={anyActionPending}
          className="text-orange-600 border-orange-600 hover:bg-orange-50 hover:text-orange-700"
           title={`Ban ${user.email}`}
        >
          {isRejectPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldAlert className="mr-2 h-4 w-4" />} Ban User
        </Button>
      )}
      {user.status === 'Rejected' && !isCurrentUserTheAdmin && (
         <Button 
          size="sm" 
          variant="outline" 
          onClick={() => startTransition(() => unbanFormAction(createFormData(user.id)))} 
          disabled={anyActionPending}
          className="text-blue-600 border-blue-600 hover:bg-blue-50 hover:text-blue-700"
           title={`Unban ${user.email}`}
        >
          {isUnbanPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RotateCcw className="mr-2 h-4 w-4" />} Unban
        </Button>
      )}

       <UserLimitsDialog 
            user={user} 
            open={isLimitsDialogOpen} 
            onOpenChange={setIsLimitsDialogOpen}
            triggerButton={
                 <Button 
                    size="sm" 
                    variant="outline" 
                    disabled={anyActionPending || isCurrentUserTheAdmin} // Also disable for self
                    title={isCurrentUserTheAdmin ? "Cannot set limits for own admin account" : `Manage limits for ${user.email}`}
                    className="text-foreground border-border hover:bg-accent"
                >
                    <Settings2 className="mr-2 h-4 w-4" /> Limits
                </Button>
            }
         />

      {!isCurrentUserTheAdmin && (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button 
              size="sm" 
              variant="destructive" 
              disabled={anyActionPending}
              className="hover:bg-destructive/90"
               title={`Delete ${user.email}`}
            >
              {isDeletePending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />} Delete
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirm Deletion</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete user {user.email}? This action is permanent and will also delete all their uploaded images and reset limits.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isDeletePending}>Cancel</AlertDialogCancel>
              <AlertDialogAction 
                onClick={() => startTransition(() => deleteFormAction(createFormData(user.id)))} 
                disabled={isDeletePending}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {isDeletePending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Delete Permanently
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}

export function UserTable({ users }: UserTableProps) {
  const { user: currentAdmin } = useAuth(); 

  if (!users || users.length === 0) {
    return <p className="text-muted-foreground">No users found.</p>;
  }

  const getStatusBadgeVariant = (status: UserStatus): "default" | "secondary" | "destructive" | "outline" => {
     // Match against capitalized status from Prisma enum
     switch (status) {
      case 'Approved': return 'default'; 
      case 'Pending': return 'secondary'; 
      case 'Rejected': return 'destructive'; 
      default: return 'outline';
    }
  };
  
  const formatLimit = (value: number | null | undefined, unit: string = '', defaultText = 'Global'): string => {
    if (value === null || value === undefined) {
      return defaultText;
    }
    return `${value}${unit}`;
  };

  return (
    <div className="rounded-md border shadow-sm overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="min-w-[150px] break-words">Email</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Images</TableHead>
            <TableHead className="text-right">Storage (MB)</TableHead>
            <TableHead className="text-center">Limits (Img / Single MB / Total MB)</TableHead>
            <TableHead className="min-w-[350px]">Actions</TableHead> 
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((user) => (
            <TableRow key={user.id}>
              <TableCell className="font-medium break-words">{user.email}</TableCell>
              <TableCell>
                 {/* Role is 'Admin' or 'User' from Prisma enum */}
                <Badge variant={user.role === 'Admin' ? 'default' : 'secondary'}>
                  {user.role}
                </Badge>
              </TableCell>
               <TableCell>
                 {/* Status is 'Pending', 'Approved', or 'Rejected' */}
                <Badge variant={getStatusBadgeVariant(user.status)} className="capitalize">
                  {user.status}
                </Badge>
              </TableCell>
              <TableCell className="text-right">{user.imageCount}</TableCell>
              <TableCell className="text-right">{user.totalStorageUsedMB}</TableCell>
               <TableCell className="text-center text-xs whitespace-nowrap"> 
                 {formatLimit(user.maxImages, '', 'Unlimited')} / {formatLimit(user.maxSingleUploadSizeMB)} / {formatLimit(user.maxTotalStorageMB, '', 'Unlimited')}
               </TableCell>
              <TableCell>
                <UserActionButtons user={user} currentAdminId={currentAdmin?.id} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
