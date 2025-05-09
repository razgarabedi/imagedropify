// src/lib/firebase/client.ts
import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
// import { getAuth, type Auth } from 'firebase/auth'; // Firebase Auth is no longer used
import { firebaseConfig, isFirebaseConfigured } from './config';

let app: FirebaseApp | undefined;
// let auth: Auth | undefined; // Firebase Auth is no longer used

if (isFirebaseConfigured) {
  if (!getApps().length) {
    app = initializeApp(firebaseConfig);
  } else {
    app = getApps()[0];
  }
  // auth = getAuth(app); // Firebase Auth is no longer used
} else {
  console.warn(
    "Firebase is not configured due to missing environment variables. " +
    "Firebase-dependent (non-auth) features might not be available. " +
    "Please ensure all NEXT_PUBLIC_FIREBASE_* environment variables are set if you use other Firebase services."
  );
  // app and auth remain undefined
}

export { app }; // auth is no longer exported
