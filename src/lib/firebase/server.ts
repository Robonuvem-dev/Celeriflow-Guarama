import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_PRIVATE_KEY
  ?.replace(/^"|"$/g, "")
  .replace(/\\n/g, "\n");

const app = getApps()[0] ?? initializeApp(
  projectId && clientEmail && privateKey
    ? { credential: cert({ projectId, clientEmail, privateKey }) }
    : { projectId: projectId || "celeriflow-build" },
);

export const adminAuth = getAuth(app);

