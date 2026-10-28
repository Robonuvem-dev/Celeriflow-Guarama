import { generateKeyPairSync } from "node:crypto";

// Synthetic identity settings for transitive server imports. Every database
// operation in these suites explicitly receives its own loopback connection.
const { privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});
process.env.DATABASE_URL = "postgresql://fixture:fixture@127.0.0.1:1/diagnostics_fixture";
process.env.FIREBASE_PROJECT_ID = "diagnostics-fixture";
process.env.FIREBASE_CLIENT_EMAIL = "fixture@diagnostics-fixture.iam.gserviceaccount.com";
process.env.FIREBASE_PRIVATE_KEY = privateKey;
