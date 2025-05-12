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
import { Loader2, CheckCircle, XCircle, RotateCcw, Trash2, ShieldAlert } from 'lucide-react';
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

interface UserTableProps {
  users: UserWithActivity[];
}

const initialActionState: AdminUserActionResponse = { success: false };

function UserActionButtons({ user, currentAdminId }: { user: UserWithActivity, currentAdminId: string | undefined }) {
  const { toast } = useToast();
  
  const [approveState, approveFormAction, isApprovePending] = useActionState(approveUserAction, initialActionState);
  const [rejectState, rejectFormAction, isRejectPending] = useActionState(rejectUserAction, initialActionState); // Reject/Ban
  const [unbanState, unbanFormAction, isUnbanPending] = useActionState(unbanUserAction, initialActionState);
  const [deleteState, deleteFormAction, isDeletePending] = useActionState(deleteUserAction, initialActionState);
  
  // Local state to manage optimistic UI updates or reflect server state
  // This is not strictly necessary if revalidationPath works perfectly and instantly.
  // However, it can improve perceived responsiveness. For now, we rely on revalidation.

  useEffect(() => {
    if (!isApprovePending && approveState.success && approveState.user) {
      toast({ title: 'User Approved', description: `${approveState.user.email} has been approved.` });
    } else if (!isApprovePending && approveState.error) {
      toast({ variant: 'destructive', title: 'Approval Failed', description: approveState.error });
    }
  }, [approveState, isApprovePending, toast]);

  useEffect(() => {
    if (!isRejectPending && rejectState.success && rejectState.user) {
       toast({ title: 'User Status Updated', description: `${rejectState.user.email} has been ${rejectState.user.status}.` }); // More generic message
    } else if (!isRejectPending && rejectState.error) {
       toast({ variant: 'destructive', title: 'Update Failed', description: rejectState.error });
    }
  }, [rejectState, isRejectPending, toast]);

  useEffect(() => {
    if (!isUnbanPending && unbanState.success && unbanState.user) {
      toast({ title: 'User Unbanned', description: `${unbanState.user.email} status set to 'pending' for re-approval.` });
    } else if (!isUnbanPending && unbanState.error) {
      toast({ variant: 'destructive', title: 'Unban Failed', description: unbanState.error });
    }
  }, [unbanState, isUnbanPending, toast]);
  
  useEffect(() => {
    if (!isDeletePending && deleteState.success && deleteState.userId) {
      toast({ title: 'User Deleted', description: `User ${deleteState.userId} has been deleted.` });
      // Table will re-render due to revalidatePath.
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
    <div className="flex flex-wrap gap-2">
      {user.status === 'pending' && (
        <>
          <Button 
            size="sm" 
            variant="outline" 
            onClick={() => startTransition(() => approveFormAction(createFormData(user.id)))} 
            disabled={anyActionPending}
            className="text-green-600 border-green-600 hover:bg-green-50 hover:text-green-700"
          >
            {isApprovePending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle className="mr-2 h-4 w-4" />} Approve
          </Button>
          <Button 
            size="sm" 
            variant="outline" 
            onClick={() => startTransition(() => rejectFormAction(createFormData(user.id)))} 
            disabled={anyActionPending}
            className="text-red-600 border-red-600 hover:bg-red-50 hover:text-red-700"
          >
            {isRejectPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <XCircle className="mr-2 h-4 w-4" />} Reject
          </Button>
        </>
      )}

      {user.status === 'approved' && !isCurrentUserTheAdmin && (
        <Button 
          size="sm" 
          variant="outline" 
          onClick={() => startTransition(() => rejectFormAction(createFormData(user.id)))} 
          disabled={anyActionPending}
          className="text-orange-600 border-orange-600 hover:bg-orange-50 hover:text-orange-700"
        >
          {isRejectPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldAlert className="mr-2 h-4 w-4" />} Ban User
        </Button>
      )}
      
      {user.status === 'rejected' && !isCurrentUserTheAdmin && (
         <Button 
          size="sm" 
          variant="outline" 
          onClick={() => startTransition(() => unbanFormAction(createFormData(user.id)))} 
          disabled={anyActionPending}
          className="text-blue-600 border-blue-600 hover:bg-blue-50 hover:text-blue-700"
        >
          {isUnbanPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RotateCcw className="mr-2 h-4 w-4" />} Unban (Set to Pending)
        </Button>
      )}

      {!isCurrentUserTheAdmin && (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button 
              size="sm" 
              variant="destructive" 
              disabled={anyActionPending}
              className="hover:bg-destructive/90"
            >
              {isDeletePending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />} Delete User
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirm Deletion</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete user {user.email}? This action is permanent and will also delete all their uploaded images.
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
  const { user: currentAdmin } = useAuth(); // Get current admin user from context

  if (!users || users.length === 0) {
    return <p className="text-muted-foreground">No users found.</p>;
  }

  const getStatusBadgeVariant = (status: UserWithActivity['status']): "default" | "secondary" | "destructive" | "outline" => {
     switch (status) {
      case 'approved': return 'default'; 
      case 'pending': return 'secondary'; 
      case 'rejected': return 'destructive'; 
      default: return 'outline';
    }
  };

  return (
    <div className="rounded-md border shadow-sm overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="min-w-[180px] break-all">User ID</TableHead>
            <TableHead className="min-w-[150px] break-all">Email</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Images</TableHead>
            <TableHead className="min-w-[300px]">Actions</TableHead> 
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((user) => (
            <TableRow key={user.id}>
              <TableCell className="font-medium break-all">{user.id}</TableCell>
              <TableCell className="break-all">{user.email}</TableCell>
              <TableCell>
                <Badge variant={user.role === 'admin' ? 'default' : 'secondary'}>
                  {user.role}
                </Badge>
              </TableCell>
               <TableCell>
                <Badge variant={getStatusBadgeVariant(user.status)} className="capitalize">
                  {user.status}
                </Badge>
              </TableCell>
              <TableCell className="text-right">{user.imageCount}</TableCell>
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
