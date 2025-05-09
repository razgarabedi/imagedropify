// src/lib/firebase/config.ts
// This configuration is for Firebase services OTHER than Authentication,
// as Authentication is now handled locally.

const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
const authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN; // Kept for potential other uses, but not for local auth
const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
const storageBucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
const messagingSenderId = process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID;
const appId = process.env.NEXT_PUBLIC_FIREBASE_APP_ID;
const measurementId = process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID; // Optional

// For non-auth Firebase services, API key and Project ID are usually the most critical.
// Adjust this list based on other Firebase services you might be using.
const essentialKeysForOtherFirebaseServices: Record<string, string | undefined> = {
  NEXT_PUBLIC_FIREBASE_API_KEY: apiKey,
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: projectId,
};

const missingEssentialKeys: string[] = [];
for (const [key, value] of Object.entries(essentialKeysForOtherFirebaseServices)) {
  if (!value) {
    missingEssentialKeys.push(key);
  }
}

if (missingEssentialKeys.length > 0) {
  console.warn(
    `WARNING: Firebase Configuration for non-auth services might be incomplete. Missing environment variables: ${missingEssentialKeys.join(', ')}. ` +
    'If you are using Firebase services like Firestore, Storage (non-auth parts), etc., ensure relevant NEXT_PUBLIC_FIREBASE_* variables are set. ' +
    'Authentication is handled locally and does not depend on these.'
  );
}

export const firebaseConfig = {
  apiKey: apiKey,
  authDomain: authDomain,
  projectId: projectId,
  storageBucket: storageBucket,
  messagingSenderId: messagingSenderId,
  appId: appId,
  measurementId: measurementId,
};

// This flag indicates if Firebase config for OTHER services is present.
// Auth does not depend on this.
export const isFirebaseConfigured = missingEssentialKeys.length === 0;
