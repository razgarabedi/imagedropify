// src/lib/firebase/client.ts
import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { firebaseConfig, isFirebaseConfigured } from './config';

let app: FirebaseApp | undefined;
let auth: Auth | undefined;

if (isFirebaseConfigured) {
  if (!getApps().length) {
    app = initializeApp(firebaseConfig);
  } else {
    app = getApps()[0];
  }
  auth = getAuth(app);
} else {
  console.warn(
    "Firebase is not configured due to missing environment variables. " +
    "Firebase-dependent features (like authentication) will not be available. " +
    "Please ensure all NEXT_PUBLIC_FIREBASE_* environment variables are set."
  );
  // app and auth remain undefined
}

export { app, auth };
