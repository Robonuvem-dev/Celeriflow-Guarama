import "dotenv/config";
import { eq } from "drizzle-orm";
import { createDatabaseConnection } from "../src/db/connection.ts";
import { accessProfiles, users } from "../src/db/schema/identity.ts";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

const SYSTEM_ADMIN_PROFILE_CODE = "SYSTEM_ADMINISTRATOR";

function requiredEnvironment(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} nao configurada.`);
  return value;
}

async function main() {
  const email = requiredEnvironment("SYSTEM_ADMIN_EMAIL").toLowerCase();
  const name = process.env.SYSTEM_ADMIN_NAME?.trim() || email;

  if (!getApps().length) {
    initializeApp({
      credential: cert({
        projectId: requiredEnvironment("FIREBASE_PROJECT_ID"),
        clientEmail: requiredEnvironment("FIREBASE_CLIENT_EMAIL"),
        privateKey: requiredEnvironment("FIREBASE_PRIVATE_KEY").replace(/\\n/g, "\n"),
      }),
    });
  }
  const firebaseUser = await getAuth().getUserByEmail(email);

  const { db, pool } = createDatabaseConnection(requiredEnvironment("DATABASE_URL"));

  try {
    await db.insert(accessProfiles).values({
        id: "system-administrator",
        codigo: SYSTEM_ADMIN_PROFILE_CODE,
        nome: "Administrador",
        descricao: "Acesso administrativo inicial do sistema.",
        permissoes: JSON.stringify({ acesso: "total" }),
        ativo: true,
      }).onConflictDoUpdate({ target: accessProfiles.codigo, set: {
        codigo: SYSTEM_ADMIN_PROFILE_CODE,
        nome: "Administrador",
        descricao: "Acesso administrativo inicial do sistema.",
        permissoes: JSON.stringify({ acesso: "total" }),
        ativo: true,
      } });
    const [profile] = await db.select({ id: accessProfiles.id }).from(accessProfiles).where(eq(accessProfiles.codigo, SYSTEM_ADMIN_PROFILE_CODE));

    await db.insert(users).values({
        nome: name,
        email,
        senha: "firebase",
        firebaseUid: firebaseUser.uid,
        ativo: true,
        perfilId: profile.id,
      }).onConflictDoUpdate({ target: users.email, set: {
        nome: name,
        firebaseUid: firebaseUser.uid,
        ativo: true,
        perfilId: profile.id,
      } });

    console.log(`Administrador ${email} configurado.`);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
