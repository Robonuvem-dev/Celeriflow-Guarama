import { generateKeyPairSync } from "node:crypto";

// Synthetic import-time configuration. Operations receive the exclusive local
// connection; no environment-supplied municipal database or identity is used.
const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048, privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } });
process.env.DATABASE_URL = "postgresql://fixture:fixture@127.0.0.1:1/health_checklist_fixture";
process.env.FIREBASE_PROJECT_ID = "health-checklist-fixture";
process.env.FIREBASE_CLIENT_EMAIL = "fixture@health-checklist-fixture.iam.gserviceaccount.com";
process.env.FIREBASE_PRIVATE_KEY = privateKey;
