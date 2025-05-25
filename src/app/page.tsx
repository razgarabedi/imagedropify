// src/app/page.tsx (New Server Component)
import React, { Suspense } from 'react';
import { HomePageClientContent } from '@/components/page-content/home-page-client-content';
import { HomepageImageLoader } from '@/components/homepage-image-loader';
import { Skeleton } from '@/components/ui/skeleton';
import { getCurrentUserAction } from '@/app/actions/authActions'; // To pass user state initially

export default async function Page() {
  // Fetch initial user state on the server if possible, or let client handle it.
  // For simplicity with AuthProvider, we primarily rely on client-side auth state for UI logic.
  // However, we can pass an initial hint or the server-rendered component conditionally.
  const user = await getCurrentUserAction();

  // Conditionally prepare the serverImageContent
  const serverImageContent = !user ? (
    <Suspense fallback={<Skeleton className="mx-auto rounded-lg mb-8 shadow-lg w-[300px] h-[200px]" />}>
      <HomepageImageLoader />
    </Suspense>
  ) : null;

  return <HomePageClientContent serverImageContent={serverImageContent} />;
}
