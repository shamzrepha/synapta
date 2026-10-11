import { initializeApp, getApps, getApp, FirebaseApp } from "firebase/app";
import { getAuth, Auth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore, Firestore } from "firebase/firestore";
import { getStorage, FirebaseStorage } from "firebase/storage";
import { getClientEnv } from "@/lib/env";

let firebaseApp: FirebaseApp;
let auth: Auth;
let db: Firestore;
let storage: FirebaseStorage;

function getClientFirebase() {
  if (typeof window === "undefined") {
    // Return dummy/fallback on server-rendered passes if needed
    const env = getClientEnv();
    const config = {
      apiKey: env.NEXT_PUBLIC_FIREBASE_API_KEY,
      authDomain: env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
      projectId: env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      storageBucket: env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
      appId: env.NEXT_PUBLIC_FIREBASE_APP_ID,
    };
    const app = getApps().length > 0 ? getApp() : initializeApp(config);
    return {
      app,
      auth: getAuth(app),
      db: getFirestore(app),
      storage: getStorage(app),
    };
  }

  if (!firebaseApp) {
    const env = getClientEnv();
    const config = {
      apiKey: env.NEXT_PUBLIC_FIREBASE_API_KEY,
      authDomain: env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
      projectId: env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      storageBucket: env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
      appId: env.NEXT_PUBLIC_FIREBASE_APP_ID,
    };

    firebaseApp = getApps().length > 0 ? getApp() : initializeApp(config);
    auth = getAuth(firebaseApp);
    db = getFirestore(firebaseApp);
    storage = getStorage(firebaseApp);
  }

  return { app: firebaseApp, auth, db, storage };
}

export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

export { getClientFirebase };
export const clientApp = () => getClientFirebase().app;
export const clientAuth = () => getClientFirebase().auth;
export const clientDb = () => getClientFirebase().db;
export const clientStorage = () => getClientFirebase().storage;
