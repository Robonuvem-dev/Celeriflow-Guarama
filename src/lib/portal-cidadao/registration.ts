import { createHash } from "node:crypto";
import { z } from "zod";
import { and, eq, sql } from "drizzle-orm";
import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction } from "@/db/transaction";
import { citizenAccessApplications, citizenRegistryIdentities, citizenTaxpayerAccesses } from "@/db/schema/citizen-access";
import { accessProfiles, users } from "@/db/schema/identity";
import { people } from "@/db/schema/people";
import { companies, taxpayers } from "@/db/schema/registry";
import { processes } from "@/db/schema/processes";
import type { SessionPrincipal } from "@/lib/platform/session";
import { validateCpf, validateCnpj } from "@/lib/identifiers/brazilian-identifiers";
import { auditEventTypes } from "@/lib/contracts/audit";
import { insertAuditEvent } from "@/db/repositories/platform/audit";
import { openCitizenChannelProcess } from "./citizen-channel-process";

export async function requestCitizenAccess(db: DatabaseConnection, principal: SessionPrincipal, document: unknown) {
  const declaredDocument = z.string().transform((value) => value.replace(/\D/g, "")).refine((value) => validateCpf(value).valid || validateCnpj(value).valid, "CPF/CNPJ inválido.").parse(document);
  const hash = createHash("sha256").update(JSON.stringify({ uid: principal.firebaseUid, email: principal.email, declaredDocument })).digest("hex");
  return withDatabaseTransaction(db, async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`CITIZEN_ACCESS:${principal.firebaseUid}`}))`);
    const [previous] = await tx.select({ application: citizenAccessApplications, protocolNumber: processes.protocolNumber }).from(citizenAccessApplications).innerJoin(processes, eq(processes.id, citizenAccessApplications.processId)).where(eq(citizenAccessApplications.firebaseUid, principal.firebaseUid)).limit(1);
    if (previous) { if (previous.application.requestHash !== hash) throw new Error("Solicitação existente com dados diferentes. Contate o atendimento para correção."); return { protocolNumber: previous.protocolNumber, status: previous.application.status, reason: previous.application.reason }; }
    const process = await openCitizenChannelProcess(tx, "ACESSO", null, null);
    const [application] = await tx.insert(citizenAccessApplications).values({ firebaseUid: principal.firebaseUid, email: principal.email, name: principal.name, declaredDocument, requestHash: hash, processId: process.id }).returning({ status: citizenAccessApplications.status });
    return { protocolNumber: process.protocolNumber, status: application.status, reason: null };
  }, { timeoutMs: 5_000 });
}

export async function decideCitizenAccess(db: DatabaseConnection, actorId: string, raw: unknown) {
  const input = z.object({ id: z.string().min(1), approved: z.boolean(), taxpayerId: z.string().default(""), scopes: z.array(z.enum(["EXTRATO", "DAM", "CERTIDOES", "IPTU", "PARCELAMENTO", "DIVIDA", "PROCESSOS", "EMPRESA", "IMOVEL", "ITBI", "NOTIFICACOES", "PAGAMENTOS", "DOCUMENTOS", "ALVARAS", "NFSE", "DESIF", "DECLARACOES_DIVERSOS", "DECLARACOES_CARTORIO", "CADASTRO"])).max(30), reason: z.string().trim().min(10).max(2000) }).strict().parse(raw);
  return withDatabaseTransaction(db, async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`CITIZEN_ACCESS_DECISION:${input.id}`}))`);
    const [application] = await tx.select().from(citizenAccessApplications).where(eq(citizenAccessApplications.id, input.id)).limit(1);
    if (!application) throw new Error("Solicitação não encontrada.");
    if (application.status !== "PENDENTE") throw new Error("Solicitação já decidida.");
    if (input.approved) {
      await tx.insert(accessProfiles).values({ codigo: "PORTAL_CIDADAO_EXTERNO_RESTRITO", nome: "Cidadão — Autoatendimento", descricao: "Acesso externo, sem permissões ERP", permissoes: JSON.stringify({ modules: {} }), ativo: true }).onConflictDoNothing({ target: accessProfiles.codigo });
      const [profile] = await tx.select().from(accessProfiles).where(eq(accessProfiles.codigo, "PORTAL_CIDADAO_EXTERNO_RESTRITO")).limit(1);
      if (!profile.ativo || profile.permissoes !== JSON.stringify({ modules: {} })) throw new Error("Revise o perfil externo restrito antes de liberar novas contas.");
      let [user] = await tx.select({ id: users.id, firebaseUid: users.firebaseUid, ativo: users.ativo }).from(users).where(eq(users.email, application.email)).limit(1);
      if (user && (user.firebaseUid !== application.firebaseUid || !user.ativo)) throw new Error("Conta existente divergente ou inativa. Concilie na administração de usuários.");
      if (!user) [user] = await tx.insert(users).values({ nome: application.name, email: application.email, firebaseUid: application.firebaseUid, perfilId: profile.id }).returning({ id: users.id, firebaseUid: users.firebaseUid, ativo: users.ativo });
      const [person] = await tx.select({ id: people.id }).from(people).where(and(eq(people.cpf, application.declaredDocument), eq(people.status, "Ativo"))).limit(1);
      const [company] = await tx.select({ id: companies.id }).from(companies).where(and(eq(companies.cnpj, application.declaredDocument), eq(companies.status, "Ativo"))).limit(1);
      if (person || company) {
        const [existingIdentity] = await tx.select().from(citizenRegistryIdentities).where(eq(citizenRegistryIdentities.usuarioId, user.id)).limit(1);
        if (existingIdentity && (existingIdentity.personId !== (person?.id || null) || existingIdentity.companyId !== (company?.id || null))) throw new Error("Vínculo cadastral existente divergente. Concilie antes de aprovar.");
        await tx.insert(citizenRegistryIdentities).values({ usuarioId: user.id, personId: person?.id, companyId: company?.id, grantedById: actorId, evidence: input.reason }).onConflictDoUpdate({ target: citizenRegistryIdentities.usuarioId, set: { revokedAt: null, grantedById: actorId, evidence: input.reason } });
      }
      if (input.taxpayerId) {
        const [taxpayer] = await tx.select({ id: taxpayers.id, cpf: people.cpf, cnpj: companies.cnpj }).from(taxpayers).leftJoin(people, eq(people.id, taxpayers.personId)).leftJoin(companies, eq(companies.id, taxpayers.companyId)).where(and(eq(taxpayers.id, input.taxpayerId), eq(taxpayers.status, "Ativo"))).limit(1);
        const identifier = (taxpayer?.cpf || taxpayer?.cnpj || "").replace(/\D/g, "");
        if (!taxpayer || identifier !== application.declaredDocument) throw new Error("O contribuinte selecionado não corresponde ao CPF/CNPJ conferido. Representação exige autorização própria.");
        await tx.insert(citizenTaxpayerAccesses).values({ usuarioId: user.id, taxpayerId: taxpayer.id, scopes: input.scopes, grantedByUsuarioId: actorId }).onConflictDoUpdate({ target: [citizenTaxpayerAccesses.usuarioId, citizenTaxpayerAccesses.taxpayerId], set: { status: "ATIVO", revokedAt: null, scopes: input.scopes, grantedByUsuarioId: actorId, grantedAt: new Date() } });
      }
    }
    await tx.update(citizenAccessApplications).set({ status: input.approved ? "APROVADO" : "INDEFERIDO", reason: input.reason, decidedById: actorId, decidedAt: new Date() }).where(eq(citizenAccessApplications.id, application.id));
    await tx.update(processes).set({ status: "Concluído", completedAt: new Date() }).where(eq(processes.id, application.processId));
    await insertAuditEvent(tx, { actorUsuarioId: actorId, eventType: auditEventTypes.administrativeMutation, targetType: "CITIZEN_ACCESS_DECISION", targetId: application.id });
    return { recorded: true };
  }, { timeoutMs: 5_000 });
}
