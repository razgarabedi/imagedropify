// src/components/homepage-image-loader.tsx
import Image from 'next/image';
import { getHomepageImageUrl as getHomepageImageUrlServiceCall } from '@/lib/settingsService';
import { Skeleton } from '@/components/ui/skeleton'; // For potential error state

export async function HomepageImageLoader() {
  try {
    const homepageImageUrl = await getHomepageImageUrlServiceCall();
    return (
      <Image
        src={homepageImageUrl}
        alt="Image sharing concept"
        width={300}
        height={200}
        className="mx-auto rounded-lg mb-8 shadow-lg"
        data-ai-hint="image sharing illustration"
        key={homepageImageUrl} // Key to force re-render if URL changes
        priority // Since it's likely above the fold for logged-out users
      />
    );
  } catch (error) {
    console.error("Failed to load homepage image:", error);
    // Fallback to a placeholder or skeleton if the service call fails
    return (
        <Image
        src="https://placehold.co/300x200.png" // Default placeholder
        alt="Image sharing concept placeholder"
        width={300}
        height={200}
        className="mx-auto rounded-lg mb-8 shadow-lg"
        data-ai-hint="placeholder image"
        priority
      />
    );
  }
}
