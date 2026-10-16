import { createHash } from "node:crypto";
import { z } from "zod";
import type { PrismaClient } from "@prisma/client";
import type { SessionPrincipal } from "@/lib/platform/session";
import { validateCpf, validateCnpj } from "@/lib/identifiers/brazilian-identifiers";
import { writeAuditEvent, auditEventTypes } from "@/lib/platform/audit-evidence";
import { openCitizenChannelProcess } from "./citizen-channel-process";

export async function requestCitizenAccess(db: PrismaClient, principal: SessionPrincipal, document: unknown) {
  const declaredDocument = z.string().transform((value) => value.replace(/\D/g, "")).refine((value) => validateCpf(value).valid || validateCnpj(value).valid, "CPF/CNPJ inválido.").parse(document);
  const hash = createHash("sha256").update(JSON.stringify({ uid: principal.firebaseUid, email: principal.email, declaredDocument })).digest("hex");
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`CITIZEN_ACCESS:${principal.firebaseUid}`}))`;
    const previous = await tx.citizenAccessApplication.findUnique({ where: { firebaseUid: principal.firebaseUid }, include: { process: { select: { protocolNumber: true } } } });
    if (previous) { if (previous.requestHash !== hash) throw new Error("Solicitação existente com dados diferentes. Contate o atendimento para correção."); return { protocolNumber: previous.process.protocolNumber, status: previous.status, reason: previous.reason }; }
    const process = await openCitizenChannelProcess(tx, "ACESSO", null, null);
    const application = await tx.citizenAccessApplication.create({ data: { firebaseUid: principal.firebaseUid, email: principal.email, name: principal.name, declaredDocument, requestHash: hash, processId: process.id } });
    return { protocolNumber: process.protocolNumber, status: application.status, reason: null };
  });
}

export async function decideCitizenAccess(db: PrismaClient, actorId: string, raw: unknown) {
  const input = z.object({ id: z.string().min(1), approved: z.boolean(), taxpayerId: z.string().default(""), scopes: z.array(z.enum(["EXTRATO", "DAM", "CERTIDOES", "IPTU", "PARCELAMENTO", "DIVIDA", "PROCESSOS", "EMPRESA", "IMOVEL", "ITBI", "NOTIFICACOES", "PAGAMENTOS", "DOCUMENTOS", "ALVARAS", "NFSE", "CADASTRO"])).max(30), reason: z.string().trim().min(10).max(2000) }).strict().parse(raw);
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`CITIZEN_ACCESS_DECISION:${input.id}`}))`;
    const application = await tx.citizenAccessApplication.findUniqueOrThrow({ where: { id: input.id } });
    if (application.status !== "PENDENTE") throw new Error("Solicitação já decidida.");
    if (input.approved) {
      const profile = await tx.configuracaoPerfil.upsert({ where: { codigo: "PORTAL_CIDADAO_EXTERNO_RESTRITO" }, create: { codigo: "PORTAL_CIDADAO_EXTERNO_RESTRITO", nome: "Cidadão — Autoatendimento", descricao: "Acesso externo, sem permissões ERP", permissoes: JSON.stringify({ modules: {} }), ativo: true }, update: {} });
      if (!profile.ativo || profile.permissoes !== JSON.stringify({ modules: {} })) throw new Error("Revise o perfil externo restrito antes de liberar novas contas.");
      let user = await tx.usuario.findUnique({ where: { email: application.email } });
      if (user && (user.firebaseUid !== application.firebaseUid || !user.ativo)) throw new Error("Conta existente divergente ou inativa. Concilie na administração de usuários.");
      if (!user) user = await tx.usuario.create({ data: { nome: application.name, email: application.email, firebaseUid: application.firebaseUid, perfilId: profile.id } });
      const person = await tx.person.findFirst({ where: { cpf: application.declaredDocument, status: "Ativo" }, select: { id: true } });
      const company = await tx.company.findFirst({ where: { cnpj: application.declaredDocument, status: "Ativo" }, select: { id: true } });
      if (person || company) {
        const existingIdentity = await tx.citizenRegistryIdentity.findUnique({ where: { usuarioId: user.id } });
        if (existingIdentity && (existingIdentity.personId !== (person?.id || null) || existingIdentity.companyId !== (company?.id || null))) throw new Error("Vínculo cadastral existente divergente. Concilie antes de aprovar.");
        await tx.citizenRegistryIdentity.upsert({ where: { usuarioId: user.id }, create: { usuarioId: user.id, personId: person?.id, companyId: company?.id, grantedById: actorId, evidence: input.reason }, update: { revokedAt: null, grantedById: actorId, evidence: input.reason } });
      }
      if (input.taxpayerId) {
        const taxpayer = await tx.taxpayer.findFirst({ where: { id: input.taxpayerId, status: "Ativo" }, include: { person: { select: { cpf: true } }, company: { select: { cnpj: true } } } });
        const identifier = (taxpayer?.person?.cpf || taxpayer?.company?.cnpj || "").replace(/\D/g, "");
        if (!taxpayer || identifier !== application.declaredDocument) throw new Error("O contribuinte selecionado não corresponde ao CPF/CNPJ conferido. Representação exige autorização própria.");
        await tx.taxpayerPortalAccess.upsert({ where: { usuarioId_taxpayerId: { usuarioId: user.id, taxpayerId: taxpayer.id } }, create: { usuarioId: user.id, taxpayerId: taxpayer.id, scopes: input.scopes, grantedByUsuarioId: actorId }, update: { status: "ATIVO", revokedAt: null, scopes: input.scopes, grantedByUsuarioId: actorId, grantedAt: new Date() } });
      }
    }
    await tx.citizenAccessApplication.update({ where: { id: application.id }, data: { status: input.approved ? "APROVADO" : "INDEFERIDO", reason: input.reason, decidedById: actorId, decidedAt: new Date() } });
    await tx.process.update({ where: { id: application.processId }, data: { status: "Concluído", completedAt: new Date() } });
    await writeAuditEvent(tx, { actorUsuarioId: actorId, eventType: auditEventTypes.administrativeMutation, targetType: "CITIZEN_ACCESS_DECISION", targetId: application.id });
    return { recorded: true };
  });
}
