// src/lib/firebase/config.ts

const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
const authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN;
const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
const storageBucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
const messagingSenderId = process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID;
const appId = process.env.NEXT_PUBLIC_FIREBASE_APP_ID;
const measurementId = process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID; // Optional

const essentialKeys = {
  NEXT_PUBLIC_FIREBASE_API_KEY: apiKey,
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: authDomain,
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: projectId,
};

const missingEssentialKeys: string[] = [];
for (const [key, value] of Object.entries(essentialKeys)) {
  if (!value) {
    missingEssentialKeys.push(key);
  }
}

if (missingEssentialKeys.length > 0) {
  // Log a more severe error to the console, but do not throw.
  // This allows the application to continue loading, though Firebase will likely fail to initialize.
  console.error(
    `CRITICAL Firebase Configuration Error: Missing essential environment variables: ${missingEssentialKeys.join(', ')}. ` +
    'Firebase will not initialize or function correctly. ' +
    'Ensure your .env.local file has all required NEXT_PUBLIC_FIREBASE_* variables set. ' +
    'Refer to your Firebase project settings to obtain these values.'
  );
}

// Your web app's Firebase configuration
// It's exported even if incomplete, Firebase SDK will handle errors during initializeApp.
export const firebaseConfig = {
  apiKey: apiKey,
  authDomain: authDomain,
  projectId: projectId,
  storageBucket: storageBucket,
  messagingSenderId: messagingSenderId,
  appId: appId,
  measurementId: measurementId,
};

// Export a flag indicating if the essential Firebase config is present.
// This can be used elsewhere in the app to gracefully degrade features if Firebase is not configured.
export const isFirebaseConfigured = missingEssentialKeys.length === 0;
