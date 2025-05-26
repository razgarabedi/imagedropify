// src/components/image-pagination.tsx
"use client";

import React from 'react';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface ImagePaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  totalImages: number;
  itemsPerPage: number;
}

export function ImagePagination({
  currentPage,
  totalPages,
  onPageChange,
  totalImages,
  itemsPerPage,
}: ImagePaginationProps) {
  if (totalPages <= 1) {
    return null; // Don't render pagination if there's only one page or no pages
  }

  const startImage = (currentPage - 1) * itemsPerPage + 1;
  const endImage = Math.min(currentPage * itemsPerPage, totalImages);

  return (
    <div className="mt-8 flex flex-col sm:flex-row items-center justify-between gap-4">
      <p className="text-sm text-muted-foreground">
        Showing {totalImages > 0 ? startImage : 0} - {endImage} of {totalImages} image(s)
      </p>
      <div className="flex items-center space-x-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage <= 1}
          aria-label="Go to previous page"
        >
          <ChevronLeft className="h-4 w-4" />
          <span className="ml-2 hidden sm:inline">Previous</span>
        </Button>
        <span className="text-sm font-medium p-2 rounded-md border bg-accent text-accent-foreground">
          Page {currentPage} of {totalPages}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= totalPages}
          aria-label="Go to next page"
        >
          <span className="mr-2 hidden sm:inline">Next</span>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
