import { config } from "dotenv";

config({ path: ".env.local", quiet: true });
config({ quiet: true });
const apply = process.argv.includes("--apply");
const key = "aurora-health-identifiers-2026-v1";
const decision = "Identificadores CNS sintéticos autorizados para os pacientes fictícios documentados das jornadas; dígito verificador local, sem consulta, inscrição ou confirmação CADSUS. Não são documentos oficiais de pessoas reais.";

function syntheticCns(index: number) {
  for (let offset = 0; offset < 10; offset++) {
    const base = `8980000000${String(index).padStart(3, "0")}${offset}`;
    const sum = [...base].reduce((total, digit, position) => total + Number(digit) * (15 - position), 0);
    const check = (11 - sum % 11) % 11;
    if (check < 10) return `${base}${check}`;
  }
  throw new Error("Não foi possível gerar identificador sintético local.");
}

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  try {
    const results = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))::text`;
      const actor = await tx.usuario.findUniqueOrThrow({ where: { email: "admin@email.com" }, select: { id: true, ativo: true } });
      if (!actor.ativo) throw new Error("Administrador autorizado inativo.");
      const rows = [];
      for (let index = 1; index <= 3; index++) {
        const id = `aurora-shared-catalogs-2026-v1:patient:p1-poc-person-${index}`;
        const patient = await tx.patient.findUniqueOrThrow({ where: { id } });
        if (patient.personId !== `p1-poc-person-${index}`) throw new Error("Paciente não corresponde à identidade fictícia documentada.");
        const cns = syntheticCns(index);
        if (cns.length !== 15 || [...cns].reduce((sum, digit, position) => sum + Number(digit) * (15 - position), 0) % 11) throw new Error("Checksum do identificador sintético divergente.");
        if (patient.cns && patient.cns !== cns) throw new Error("Paciente já possui CNS distinto; preservar o documento cadastrado.");
        const other = await tx.patient.findUnique({ where: { cns } });
        if (other && other.id !== id) throw new Error("Identificador já utilizado por outra pessoa.");
        if (apply && !patient.cns) {
          await tx.patient.update({ where: { id }, data: { cns } });
          await tx.financialAuditLog.create({ data: { action: "PREPARE_SYNTHETIC_HEALTH_IDENTIFIER", entityType: "Patient", entityId: id, authorUsuarioId: actor.id, payload: { decision, configurationKey: key, identifierNature: "SYNTHETIC_NOT_CADSUS_VERIFIED", personId: patient.personId } } });
        }
        rows.push({ patientId: id, replay: Boolean(patient.cns), identifierNature: "SYNTHETIC_NOT_CADSUS_VERIFIED" });
      }
      return rows;
    });
    console.log(JSON.stringify({ mode: apply ? "ADDITIVE_IDEMPOTENT" : "READ_ONLY", decision, patients: results }, null, 2));
  } finally { await prisma.$disconnect(); }
}

main().catch(error => { console.error(error instanceof Error ? error.message : "Falha na preparação de identificadores."); process.exitCode = 1; });
