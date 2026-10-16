import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { taxScopeSnapshot } from "./scope";
import { serviceReportPdf } from "@/lib/portal-cidadao/report";
import { createHash } from "node:crypto";

const kindSchema = z.enum(["REGISTRATION", "CESSATION"]);
async function access(tx: Prisma.TransactionClient, usuarioId: string, registrationId: string, kind: z.infer<typeof kindSchema>) {
  if (!await tx.usuario.findFirst({ where: { id: usuarioId, ativo: true, perfil: { ativo: true } } })) throw new Error("Conta indisponível.");
  const registration = await tx.economicRegistration.findUniqueOrThrow({ where: { id: registrationId }, include: { taxpayer: { include: { person: true, company: true } } } });
  const grant = await tx.taxpayerPortalAccess.findFirst({ where: { usuarioId, taxpayerId: registration.taxpayerId, accessType: "TITULAR", status: "ATIVO", revokedAt: null, grantedAt: { lte: new Date() } } });
  const requiredScope = kind === "CESSATION" ? "CERTIDOES" : "EMPRESA";
  if (!grant || !Array.isArray(grant.scopes) || !grant.scopes.includes(requiredScope)) throw new Error(`Acesso ${requiredScope} vigente para o titular é obrigatório.`);
  const profile = await tx.taxRegistryEntry.findFirstOrThrow({ where: { entityType: "ECONOMIC_REGISTRATION", entityId: registrationId, category: "ECONOMIC_PROFILE" }, orderBy: { version: "desc" } });
  const scope = taxScopeSnapshot(profile.data);
  if (typeof scope.governmentEntityId !== "string" || typeof scope.budgetUnitId !== "string") throw new Error("Cadastro sem origem municipal conciliada.");
  const unit = await tx.planningEntityUnit.findFirstOrThrow({ where: { governmentEntityId: scope.governmentEntityId, budgetUnitId: scope.budgetUnitId }, include: { governmentEntity: true, budgetUnit: true } });
  const fingerprint = createHash("sha256").update(JSON.stringify({ registrationUpdatedAt: registration.updatedAt.toISOString(), profileId: profile.id, taxpayerId: registration.taxpayerId, taxpayerName: registration.taxpayer.company?.corporateName ?? registration.taxpayer.person?.fullName ?? registration.taxpayerId, taxpayerDocument: registration.taxpayer.company?.cnpj ?? registration.taxpayer.person?.cpf ?? "", taxpayerStatus: registration.taxpayer.status, personStatus: registration.taxpayer.person?.status ?? null, companyStatus: registration.taxpayer.company?.status ?? null, entityName: unit.governmentEntity.name, unitCode: unit.budgetUnit.code })).digest("hex");
  return { registration, profile, unit, fingerprint, scope: { governmentEntityId: scope.governmentEntityId, budgetUnitId: scope.budgetUnitId } };
}

export async function issuePortalEconomicDocument(db: PrismaClient, usuarioId: string, raw: { registrationId: string; expectedUpdatedAt: string; kind: "REGISTRATION" | "CESSATION"; requestKey: string }) {
  const input = z.object({ registrationId: z.string().min(1), expectedUpdatedAt: z.iso.datetime(), kind: kindSchema, requestKey: z.uuid() }).parse(raw);
  return db.$transaction(async tx => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`ECONOMIC_DOCUMENT:${input.requestKey}`},0))::text`;
    await tx.$queryRaw`SELECT id FROM "EconomicRegistration" WHERE id=${input.registrationId} FOR UPDATE`;
    const { registration, profile, unit, scope, fingerprint } = await access(tx, usuarioId, input.registrationId, input.kind);
    const previous = await tx.taxRegistryEntry.findFirst({ where: { entityType: "ECONOMIC_DOCUMENT", entityId: input.requestKey, category: "ECONOMIC_DOCUMENT_ISSUANCE" } });
    if (previous) {
      const data = taxScopeSnapshot(previous.data);
      if (previous.actorUsuarioId !== usuarioId || data.registrationId !== input.registrationId || data.kind !== input.kind || data.registrationUpdatedAt !== input.expectedUpdatedAt) throw new Error("Chave da emissão já utilizada com outros dados.");
      return { issuanceId: previous.id };
    }
    if (registration.updatedAt.toISOString() !== input.expectedUpdatedAt) throw new Error("Cadastro alterado. Recarregue antes de emitir.");
    if (registration.taxpayer.status !== "Ativo" || registration.taxpayer.person?.status === "Inativo" || registration.taxpayer.company?.status === "Inativo") throw new Error("Titular indisponível para emissão de documento cadastral.");
    if (input.kind === "CESSATION" && registration.status !== "Baixado") throw new Error("A certidão de baixa exige inscrição com situação Baixado.");
    const config = taxScopeSnapshot(profile.data);
    const address = taxScopeSnapshot(config.companyAddress);
    const histories = input.kind === "CESSATION" ? await tx.taxRegistryEntry.findMany({ where: { entityType: "ECONOMIC_REGISTRATION", entityId: registration.id, category: "CADASTRAL_HISTORY" }, orderBy: { version: "desc" } }) : [];
    const cessation = histories.find(row => { const data = taxScopeSnapshot(row.data); return data.baseline !== true && taxScopeSnapshot(data.after).status === "Baixado" && taxScopeSnapshot(data.before).status !== "Baixado"; });
    const title = input.kind === "CESSATION" ? "Certidão cadastral de baixa de empresa" : "Comprovante de inscrição municipal";
    const entry = await tx.taxRegistryEntry.create({ data: { entityType: "ECONOMIC_DOCUMENT", entityId: input.requestKey, category: "ECONOMIC_DOCUMENT_ISSUANCE", title, actorUsuarioId: usuarioId, data: { ...scope, registrationId: registration.id, taxpayerId: registration.taxpayerId, kind: input.kind, registrationUpdatedAt: input.expectedUpdatedAt, profileId: profile.id, issuedAt: new Date().toISOString(), entityName: unit.governmentEntity.name, unitCode: unit.budgetUnit.code, inscription: registration.municipalInsc, taxpayerName: registration.taxpayer.company?.corporateName ?? registration.taxpayer.person?.fullName ?? registration.taxpayerId, taxpayerDocument: registration.taxpayer.company?.cnpj ?? registration.taxpayer.person?.cpf ?? "", status: registration.status, primaryCnae: registration.primaryCnae, secondaryCnaes: config.secondaryCnaes ?? [], companyType: config.companyType ?? null, taxRegime: registration.taxRegime, startDate: registration.startDate?.toISOString() ?? null, cessationObservedAt: cessation?.effectiveFrom.toISOString() ?? null, address: `${String(address.street ?? "")}, ${String(address.number ?? "")} ${String(address.complement ?? "")} · ${String(address.neighborhood ?? "")} · ${String(address.city ?? "")}/${String(address.state ?? "")} · CEP ${String(address.zipCode ?? "")}` } } });
    await tx.taxRegistryEntry.create({ data: { entityType: "ECONOMIC_DOCUMENT", entityId: entry.id, category: "ECONOMIC_DOCUMENT_POSITION", title, actorUsuarioId: usuarioId, data: { ...scope, fingerprint } } });
    await tx.taxAuditLog.create({ data: { action: "ISSUE_PORTAL_ECONOMIC_DOCUMENT", entityType: "TaxRegistryEntry", entityId: entry.id, authorUsuarioId: usuarioId, payload: { ...scope, registrationId: registration.id, profileId: profile.id, kind: input.kind, fingerprint } } });
    return { issuanceId: entry.id };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 60000 });
}

export async function renderPortalEconomicDocument(db: PrismaClient, usuarioId: string, issuanceId: string) {
  const snapshot = await db.$transaction(async tx => {
    const entry = await tx.taxRegistryEntry.findFirstOrThrow({ where: { id: issuanceId, entityType: "ECONOMIC_DOCUMENT", category: "ECONOMIC_DOCUMENT_ISSUANCE" } });
    const data = taxScopeSnapshot(entry.data); const kind = kindSchema.parse(data.kind);
    const current = await access(tx, usuarioId, String(data.registrationId), kind);
    if (data.taxpayerId !== current.registration.taxpayerId || data.governmentEntityId !== current.scope.governmentEntityId || data.budgetUnitId !== current.scope.budgetUnitId) throw new Error("Origem documental divergente do cadastro atual.");
    const position = await tx.taxRegistryEntry.findFirstOrThrow({ where: { entityType: "ECONOMIC_DOCUMENT", entityId: entry.id, category: "ECONOMIC_DOCUMENT_POSITION" } });
    return { title: entry.title, id: entry.id, data, current: current.fingerprint === taxScopeSnapshot(position.data).fingerprint };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  const data = snapshot.data;
  const lines = [String(data.entityName), `UG ${String(data.unitCode)}`, snapshot.current ? "Posição cadastral atual na data desta emissão." : "POSIÇÃO HISTÓRICA — cadastro alterado após a emissão. Emita documento atualizado para comprovar a situação atual.", `Inscrição municipal: ${String(data.inscription)}`, `Titular: ${String(data.taxpayerName)} · ${String(data.taxpayerDocument)}`, `Situação cadastral: ${String(data.status)}`, `Tipo de empresa: ${String(data.companyType ?? "Não informado")}`, `CNAE principal: ${String(data.primaryCnae ?? "Não informado")}`, `CNAEs secundários: ${Array.isArray(data.secondaryCnaes) ? data.secondaryCnaes.join(", ") : ""}`, `Regime: ${String(data.taxRegime ?? "Não informado")}`, `Início das atividades: ${typeof data.startDate === "string" ? data.startDate.slice(0,10) : "Não conciliado"}`, `Endereço: ${String(data.address)}`];
  if (data.kind === "CESSATION") lines.push(typeof data.cessationObservedAt === "string" ? `Baixa registrada no histórico municipal em ${data.cessationObservedAt}.` : "A inscrição encontra-se baixada. A data histórica de ocorrência da baixa não está conciliada.");
  lines.push("Este documento comprova exclusivamente os dados cadastrais registrados. A baixa da inscrição não extingue débitos e este documento não certifica regularidade fiscal.", `Emissão: ${String(data.issuedAt)}`, `Identificador da emissão: ${snapshot.id}`);
  return serviceReportPdf(snapshot.title, lines);
}
