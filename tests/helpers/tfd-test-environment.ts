import { generateKeyPairSync } from "node:crypto";

// Synthetic credentials for transitive identity imports; tests inject only the
// local Neon/Drizzle connection and never authenticate or access a remote DB.
const { privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});
process.env.DATABASE_URL = "postgresql://fixture:fixture@127.0.0.1:1/tfd_fixture";
process.env.FIREBASE_PROJECT_ID = "tfd-fixture";
process.env.FIREBASE_CLIENT_EMAIL = "fixture@tfd-fixture.iam.gserviceaccount.com";
process.env.FIREBASE_PRIVATE_KEY = privateKey;
