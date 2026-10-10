import { initializeApp, getApps, cert, App } from "firebase-admin/app";
import { getAuth, Auth } from "firebase-admin/auth";
import { getFirestore, Firestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import { getServerEnv } from "@/lib/env";

let adminApp: App;
let adminAuthInstance: Auth;
let adminDbInstance: Firestore;

function getFirebaseAdmin(): { app: App; auth: Auth; db: Firestore } {
  if (typeof window !== "undefined") {
    throw new Error("firebase-admin cannot be used in browser client code.");
  }

  if (!adminApp) {
    const env = getServerEnv();
    const formattedPrivateKey = env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, "\n");

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
  }

  return {
    app: adminApp,
    auth: adminAuthInstance,
    db: adminDbInstance,
  };
}

export const adminAuth = () => getFirebaseAdmin().auth;
export const adminDb = () => getFirebaseAdmin().db;
export { FieldValue, Timestamp };
