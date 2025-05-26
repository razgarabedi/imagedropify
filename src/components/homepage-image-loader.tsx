
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
        key={homepageImageUrl} 
        priority 
        unoptimized={true} // <--- Added this line
      />
    );
  } catch (error) {
    console.error("Failed to load homepage image:", error);
    return (
        <Image
        src="https://placehold.co/300x200.png" 
        alt="Image sharing concept placeholder"
        width={300}
        height={200}
        className="mx-auto rounded-lg mb-8 shadow-lg"
        data-ai-hint="placeholder image"
        priority
        unoptimized={true} // Also for the fallback placeholder
      />
    );
  }
}


    