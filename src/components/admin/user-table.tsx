// src/components/admin/user-table.tsx
'use client';

import React, { useEffect, useActionState, startTransition } from 'react';
import type { UserWithActivity, AdminUserActionResponse } from '@/app/actions/userActions';
import { approveUserAction, rejectUserAction } from '@/app/actions/userActions';
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
import { Loader2, CheckCircle, XCircle } from 'lucide-react';

interface UserTableProps {
  users: UserWithActivity[];
}

const initialActionState: AdminUserActionResponse = { success: false };

function UserActionButtons({ user }: { user: UserWithActivity }) {
  const { toast } = useToast();
  
  const [approveState, approveFormAction, isApprovePending] = useActionState(approveUserAction, initialActionState);
  const [rejectState, rejectFormAction, isRejectPending] = useActionState(rejectUserAction, initialActionState);

  useEffect(() => {
    if (!isApprovePending && approveState.success && approveState.user) {
      toast({ title: 'User Approved', description: `${approveState.user.email} has been approved.` });
      // Revalidation should update the table, no client-side state update needed here
    } else if (!isApprovePending && approveState.error) {
      toast({ variant: 'destructive', title: 'Approval Failed', description: approveState.error });
    }
  }, [approveState, isApprovePending, toast]);

  useEffect(() => {
    if (!isRejectPending && rejectState.success && rejectState.user) {
       toast({ title: 'User Rejected', description: `${rejectState.user.email} has been rejected.` });
       // Revalidation should update the table
    } else if (!isRejectPending && rejectState.error) {
       toast({ variant: 'destructive', title: 'Rejection Failed', description: rejectState.error });
    }
  }, [rejectState, isRejectPending, toast]);


  const handleApprove = () => {
    const formData = new FormData();
    formData.append('userId', user.id);
    startTransition(() => {
      approveFormAction(formData);
    });
  };

  const handleReject = () => {
    const formData = new FormData();
    formData.append('userId', user.id);
     startTransition(() => {
      rejectFormAction(formData);
    });
  };

  if (user.status === 'pending') {
    return (
      <div className="flex space-x-2">
        <Button 
          size="sm" 
          variant="outline" 
          onClick={handleApprove} 
          disabled={isApprovePending || isRejectPending}
          className="text-green-600 border-green-600 hover:bg-green-50 hover:text-green-700"
        >
          {isApprovePending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle className="mr-2 h-4 w-4" />} Approve
        </Button>
        <Button 
          size="sm" 
          variant="outline" 
          onClick={handleReject} 
          disabled={isApprovePending || isRejectPending}
          className="text-red-600 border-red-600 hover:bg-red-50 hover:text-red-700"
        >
          {isRejectPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <XCircle className="mr-2 h-4 w-4" />} Reject
        </Button>
      </div>
    );
  }

  // No actions needed for approved or rejected users in this context
  return null; 
}


export function UserTable({ users }: UserTableProps) {
  if (!users || users.length === 0) {
    return <p className="text-muted-foreground">No users found.</p>;
  }

  const getStatusBadgeVariant = (status: UserWithActivity['status']): "default" | "secondary" | "destructive" | "outline" => {
     switch (status) {
      case 'approved': return 'default'; // Use primary color for approved
      case 'pending': return 'secondary'; // Use secondary for pending
      case 'rejected': return 'destructive'; // Use destructive for rejected
      default: return 'outline';
    }
  };

  return (
    <div className="rounded-md border shadow-sm overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="min-w-[200px]">User ID</TableHead>
            <TableHead className="min-w-[150px]">Email</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Images</TableHead>
            <TableHead className="min-w-[200px]">Actions</TableHead> 
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((user) => (
            <TableRow key={user.id}>
              <TableCell className="font-medium truncate max-w-xs">{user.id}</TableCell>
              <TableCell className="truncate max-w-xs">{user.email}</TableCell>
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
                {/* Render action buttons component */}
                <UserActionButtons user={user} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
