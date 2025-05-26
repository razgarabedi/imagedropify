
// src/app/page.tsx (New Server Component)
import React, { Suspense } from 'react';
import { HomePageClientContent } from '@/components/page-content/home-page-client-content';
import { HomepageImageLoader } from '@/components/homepage-image-loader';
import { Skeleton } from '@/components/ui/skeleton';
import { getCurrentUserAction } from '@/app/actions/authActions'; // To pass user state initially

export default async function Page() {
  const user = await getCurrentUserAction();

  const serverImageContent = !user ? (
    <Suspense fallback={<Skeleton className="mx-auto rounded-lg mb-8 shadow-lg w-[300px] h-[200px]" />}>
      <HomepageImageLoader />
    </Suspense>
  ) : null;

  return <HomePageClientContent serverImageContent={serverImageContent} />;
}

    