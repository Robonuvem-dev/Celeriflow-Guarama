import { config } from "dotenv";

config({ path: ".env.local", quiet: true });
config({ quiet: true });
const apply = process.argv.includes("--apply");
const definitions = [
  { id: "p0-current-exe", type: "PREFEITURA", previousCode: "POC-P0-EXE", code: "AURORA-EXEC", previousName: "POC P0 — Prefeitura (ensaio)", name: "Prefeitura Municipal de Aurora das Veredas", secretariatId: "p0-current-secretariat-exe", previousSecretariat: "POC P0 — Administração exe", secretariat: "Secretaria Municipal de Administração" },
  { id: "p0-current-leg", type: "CAMARA", previousCode: "POC-P0-LEG", code: "AURORA-LEG", previousName: "POC P0 — Câmara (ensaio)", name: "Câmara Municipal de Aurora das Veredas", secretariatId: "p0-current-secretariat-leg", previousSecretariat: "POC P0 — Administração leg", secretariat: "Diretoria Administrativa da Câmara Municipal" },
];

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  try {
    const report = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended('AURORA_MUNICIPAL_IDENTITY_V1', 0))::text`;
      const actor = apply ? await tx.usuario.findFirstOrThrow({ where: { ativo: true, perfil: { codigo: "SYSTEM_ADMINISTRATOR" } }, select: { id: true } }) : null;
      const changes = [];
      for (const definition of definitions) {
        const entity = await tx.governmentEntity.findUniqueOrThrow({ where: { id: definition.id } });
        const secretariat = await tx.secretariat.findUniqueOrThrow({ where: { id: definition.secretariatId } });
        if (entity.type !== definition.type || ![definition.previousCode, definition.code].includes(entity.code) || ![definition.previousName, definition.name].includes(entity.name) || ![definition.previousSecretariat, definition.secretariat].includes(secretariat.name)) throw new Error(`Identidade alterada para ${definition.id}; preservar a configuração e conciliar antes da adoção.`);
        const changed = entity.code !== definition.code || entity.name !== definition.name || secretariat.name !== definition.secretariat;
        if (apply && changed) {
          await tx.governmentEntity.update({ where: { id: entity.id }, data: { code: definition.code, name: definition.name } });
          await tx.secretariat.update({ where: { id: secretariat.id }, data: { name: definition.secretariat } });
          await tx.financialAuditLog.create({ data: { action: "CONFIGURE_MUNICIPAL_IDENTITY", entityType: "GovernmentEntity", entityId: entity.id, authorUsuarioId: actor!.id, payload: { municipality: "Aurora das Veredas", source: "OWNER_CONFIGURATION", before: { code: entity.code, name: entity.name, secretariatId: secretariat.id, secretariatName: secretariat.name }, after: { code: definition.code, name: definition.name, secretariatName: definition.secretariat }, preservedEntityId: entity.id } } });
        }
        changes.push({ id: entity.id, code: definition.code, name: definition.name, secretariatId: secretariat.id, secretariatName: definition.secretariat, changed });
      }
      return { mode: apply ? "APPLIED" : "READ_ONLY", entities: changes };
    }, { timeout: 60000 });
    console.log(JSON.stringify(report, null, 2));
  } finally { await prisma.$disconnect(); }
}

main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
