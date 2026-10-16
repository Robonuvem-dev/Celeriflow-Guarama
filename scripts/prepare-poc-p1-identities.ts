import { config } from "dotenv";
import { writeFileSync } from "node:fs";
import { cadastroPeople } from "./plausible-cadastro-data";

config({ path: ".env.local", quiet: true });
config({ quiet: true });
const apply = process.argv.includes("--apply");

function syntheticCpf(index: number) {
  let digits = String(980000000 + index);
  for (const weight of [10, 11]) {
    const sum = [...digits].reduce((total, digit, position) => total + Number(digit) * (weight - position), 0);
    const remainder = sum % 11;
    digits += remainder < 2 ? "0" : String(11 - remainder);
  }
  return digits;
}

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  try {
    const actor = await prisma.usuario.findFirst({ where: { ativo: true }, orderBy: { createdAt: "asc" }, select: { id: true } });
    if (!actor) throw new Error("Usuário autor não encontrado.");
    const links = [];
    for (let index = 1; index <= 21; index++) {
      const ids = { taxpayerId: `p0-current-taxpayer-${index}`, personId: `p1-poc-person-${index}`, supplierId: `p1-poc-supplier-${index}`, creditorId: `p1-poc-creditor-${index}` };
      const taxpayer = await prisma.taxpayer.findUnique({ where: { id: ids.taxpayerId } });
      if (!taxpayer || taxpayer.taxpayerType !== "PF" || taxpayer.companyId || (taxpayer.personId && taxpayer.personId !== ids.personId)) throw new Error(`Contribuinte de ensaio ${index} diverge do vínculo esperado.`);
      if (apply) await prisma.$transaction(async (tx) => {
        const existingPerson = await tx.person.findUnique({ where: { cpf: syntheticCpf(index) }, select: { id: true } });
        if (existingPerson && existingPerson.id !== ids.personId) throw new Error("Documento sintético já utilizado por outra identidade; nenhuma mesclagem automática executada.");
        const contact = cadastroPeople[index - 1];
        await tx.person.upsert({ where: { id: ids.personId }, update: {}, create: { id: ids.personId, cpf: syntheticCpf(index), fullName: contact.name, email: contact.email, phonePrimary: contact.phone, status: "Ativo" } });
        await tx.taxpayer.update({ where: { id: ids.taxpayerId }, data: { personId: ids.personId } });
        const supplier = await tx.supplier.findUnique({ where: { personId: ids.personId } });
        if (supplier && supplier.id !== ids.supplierId) throw new Error("Identidade de ensaio vinculada a fornecedor inesperado.");
        await tx.supplier.upsert({ where: { id: ids.supplierId }, update: {}, create: { id: ids.supplierId, personId: ids.personId, status: "Ativo", notes: "POC P1: pessoa e documento fictícios; uso exclusivo em ensaio." } });
        const creditor = await tx.creditor.findUnique({ where: { personId: ids.personId } });
        if (creditor && creditor.id !== ids.creditorId) throw new Error("Identidade de ensaio vinculada a credor inesperado.");
        await tx.creditor.upsert({ where: { id: ids.creditorId }, update: {}, create: { id: ids.creditorId, personId: ids.personId, supplierId: ids.supplierId, name: contact.name, document: syntheticCpf(index), status: "Ativo" } });
        const marker = await tx.financialAuditLog.findFirst({ where: { action: "POC_P1_IDENTITY_LINK", entityId: ids.taxpayerId } });
        if (!marker) await tx.financialAuditLog.create({ data: { action: "POC_P1_IDENTITY_LINK", entityType: "Taxpayer", entityId: ids.taxpayerId, authorUsuarioId: actor.id, payload: { ...ids, synthetic: true, source: "POC_P0_CURRENT_V1", taxpayerIdPreserved: true } } });
      });
      links.push(ids);
    }
    const evidence = { generatedAt: new Date().toISOString(), mode: apply ? "ADDITIVE_IDEMPOTENT" : "READ_ONLY", nature: "FICTITIOUS_POC_ONLY", documentGeneration: "Deterministic synthetic CPF with checksum, prefix 980000; not verified against any official taxpayer registry.", links, conclusion: "IDs dos contribuintes, imóveis e inscrições preservados; PF compartilhada por contribuinte, fornecedor e credor de ensaio." };
    if (apply) writeFileSync("docs/poc-p0/IDENTIDADES_ENSAIO_P1.json", `${JSON.stringify(evidence, null, 2)}\n`);
    console.log(JSON.stringify({ mode: evidence.mode, canonicalIdentityChains: links.length, synthetic: true }, null, 2));
  } finally { await prisma.$disconnect(); }
}

main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : "Falha nas identidades de ensaio P1."); process.exitCode = 1; });
