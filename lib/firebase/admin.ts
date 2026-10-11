import { initializeApp, getApps, cert, App } from "firebase-admin/app";
import { getAuth, Auth } from "firebase-admin/auth";
import { getFirestore, Firestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import { getStorage, Storage } from "firebase-admin/storage";
import { getServerEnv } from "@/lib/env";

let adminApp: App;
let adminAuthInstance: Auth;
let adminDbInstance: Firestore;
let adminStorageInstance: Storage;

function getFirebaseAdmin(): { app: App; auth: Auth; db: Firestore; storage: Storage } {
  if (typeof window !== "undefined") {
    throw new Error("firebase-admin cannot be used in browser client code.");
  }

  if (!adminApp) {
    const env = getServerEnv();
    let formattedPrivateKey = env.FIREBASE_ADMIN_PRIVATE_KEY.trim();
    if (
      (formattedPrivateKey.startsWith('"') && formattedPrivateKey.endsWith('"')) ||
      (formattedPrivateKey.startsWith("'") && formattedPrivateKey.endsWith("'"))
    ) {
      formattedPrivateKey = formattedPrivateKey.slice(1, -1);
    }
    formattedPrivateKey = formattedPrivateKey.replace(/\\n/g, "\n");

    const existingApps = getApps();
    if (existingApps.length > 0) {
      adminApp = existingApps[0]!;
    } else {
      adminApp = initializeApp({
        credential: cert({
          projectId: env.FIREBASE_ADMIN_PROJECT_ID,
          clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL,
          privateKey: formattedPrivateKey,
        }),
      });
    }

    adminAuthInstance = getAuth(adminApp);
    adminDbInstance = getFirestore(adminApp);
    adminDbInstance.settings({ ignoreUndefinedProperties: true });
    adminStorageInstance = getStorage(adminApp);
  }

  return {
    app: adminApp,
    auth: adminAuthInstance,
    db: adminDbInstance,
    storage: adminStorageInstance,
  };
}

export const adminAuth = () => getFirebaseAdmin().auth;
export const adminDb = () => getFirebaseAdmin().db;
export const adminStorage = () => getFirebaseAdmin().storage;
export const adminBucket = () => {
  const env = getServerEnv();
  const bucketName = env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || `${env.FIREBASE_ADMIN_PROJECT_ID}.appspot.com`;
  return adminStorage().bucket(bucketName);
};
export { FieldValue, Timestamp };
