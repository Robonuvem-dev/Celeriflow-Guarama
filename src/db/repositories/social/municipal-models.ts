import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { DatabaseTransaction } from "../../transaction";
import * as m from "../../schema/social-operation-models";
import { socialWorkflowRevisions } from "../../schema/social-workflows";
import type { SocialAccess } from "@/lib/social/access-policy";
import { municipalParameterSchema, socialLayoutSchema, socialCaseSections } from "@/lib/social/municipal-contract";
import { socialDocumentTemplates } from "@/lib/social/document-templates";
import type { SocialWorkflowArea } from "@/lib/social/workflow-contract";
import { readSocialParameters } from "./parameters";
import { requireSocialProfessional, socialSubject } from "./workflow-access";
import { calculateSocialMonthly } from "./monthly-statements";

export async function saveMunicipalWorkflow(tx: DatabaseTransaction, access: SocialAccess, area: SocialWorkflowArea, id: string | undefined, v: Record<string, string>): Promise<string | null> {
  if (!["parametros", "layouts", "prontuarios", "mensal", "documentos"].includes(area)) return null;
  if (area === "parametros") {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended('social-municipal-settings',0))`);
    const current = await readSocialParameters(tx);
    if (Number(v.revision || 0) !== current.revision) throw new Error("Parâmetros alterados por outra sessão; atualize antes de salvar.");
    const parameters = municipalParameterSchema.parse({ ...v, deliveryTypes: JSON.parse(v.deliveryTypes || "[]") });
    const url = new URL(parameters.smsBaseUrl); if (url.protocol !== "https:" || url.username || url.password) throw new Error("Configure uma URL HTTPS de integração sem credenciais embutidas.");
    await tx.insert(m.socialMunicipalSettings).values({ id: "municipal", parameters, revision: 1, updatedBy: access.userId! }).onConflictDoUpdate({ target: m.socialMunicipalSettings.id, set: { parameters, revision: current.revision + 1, updatedBy: access.userId! } });
    return "municipal";
  }
  if (area === "layouts") {
    const configuration = socialLayoutSchema.parse({ ...v, delimiter: v.delimiter === "TAB" ? "\t" : v.delimiter, mapping: JSON.parse(v.mapping || "{}") });
    const values = { name: v.name, version: v.version, configuration, createdBy: access.userId! };
    if (id) {
      // A changed layout gets a new version; previously imported batches keep their configuration identifier.
      await tx.update(m.socialImportLayouts).set({ isActive: false }).where(eq(m.socialImportLayouts.id, id));
      if ((await tx.select().from(m.socialImportLayouts).where(and(eq(m.socialImportLayouts.name, v.name), eq(m.socialImportLayouts.version, v.version)))).length) throw new Error("Informe uma nova versão para alterar o layout.");
    }
    return (await tx.insert(m.socialImportLayouts).values(values).returning())[0].id;
  }
  const settings = await readSocialParameters(tx);
  if (area === "prontuarios") {
    await socialSubject(tx, v.familyId, v.personId); await requireSocialProfessional(tx, access, v.professionalId, v.unitId, v.receivedAt);
    const values = { unitId: v.unitId, familyId: v.familyId || null, personId: v.personId || null, professionalId: v.professionalId, receivedAt: v.receivedAt, enteredVia: v.enteredVia, initialDemand: v.initialDemand, secrecyLevel: v.secrecyLevel, status: v.status, sections: Object.fromEntries(socialCaseSections.map(([key]) => [key, v[key] || ""])), createdBy: access.userId! };
    if (id) {
      const [current] = await tx.select().from(m.socialCaseFiles).where(eq(m.socialCaseFiles.id, id));
      if (!current || current.familyId !== values.familyId || current.personId !== values.personId || current.unitId !== values.unitId) throw new Error("Preserve a família/pessoa e unidade do prontuário existente.");
      await tx.update(m.socialCaseFiles).set(values).where(eq(m.socialCaseFiles.id, id)); return id;
    }
    return (await tx.insert(m.socialCaseFiles).values({ ...values, modelVersion: settings.parameters.modelVersion }).returning())[0].id;
  }
  if (area === "mensal") {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`social-monthly:${v.unitId}:${v.competence}`},0))`);
    const declaredValues = z.record(z.string(), z.number().int().min(0).max(10000000)).parse(JSON.parse(v.declaredValues || "{}"));
    const snapshot = await calculateSocialMonthly(tx, v.unitId, v.competence, declaredValues);
    const on = `${v.competence}-01`;
    await requireSocialProfessional(tx, access, v.professionalId, v.unitId, on);
    if (v.status === "FINAL" && snapshot.indicators.some(i => i.value === null)) throw new Error("Informe os indicadores sem apuração automática antes de concluir. Use zero somente quando a unidade confirmou ausência de ocorrências.");
    const [prior] = await tx.select().from(m.socialMonthlyStatements).where(and(eq(m.socialMonthlyStatements.unitId, v.unitId), eq(m.socialMonthlyStatements.competence, v.competence)));
    if (id && prior?.id !== id) throw new Error("Unidade/competência não correspondem ao registro.");
    if (!id && prior) throw new Error("Já existe registro nesta competência. Edite-o para registrar uma revisão.");
    const values = { unitId: v.unitId, competence: v.competence, professionalId: v.professionalId, status: v.status, declaredValues, observations: v.observations || "", snapshot, version: prior ? prior.version + 1 : 1, createdBy: access.userId! };
    const [row] = prior ? await tx.update(m.socialMonthlyStatements).set(values).where(eq(m.socialMonthlyStatements.id, prior.id)).returning() : await tx.insert(m.socialMonthlyStatements).values(values).returning();
    await tx.insert(socialWorkflowRevisions).values({ area: "mensal-apuracao", recordId: row.id, actorId: access.userId!, values: { version: String(row.version), snapshot: JSON.stringify(snapshot), observations: row.observations } });
    return row.id;
  }
  const model = socialDocumentTemplates.find(model => model.code === v.templateCode);
  if (!model) throw new Error("Modelo documental inválido.");
  if (v.familyId || v.personId) await socialSubject(tx, v.familyId, v.personId);
  const values = z.record(z.string(), z.string().max(10000)).parse(JSON.parse(v.documentData || "{}"));
  const allowed = new Set(model.sections.flatMap(s => s.fields.map(f => f.key)));
  if (Object.keys(values).some(key => !allowed.has(key))) throw new Error("Campo fora do modelo documental.");
  if (v.status === "ISSUED" && (!values.person || !values.professional || !values.date)) throw new Error("Para emitir, preencha pessoa/responsável, profissional e data no modelo.");
  const data = { unitId: v.unitId, familyId: v.familyId || null, personId: v.personId || null, templateCode: v.templateCode, model: { ...model, version: settings.parameters.modelVersion }, values, status: v.status, issuedAt: v.status === "ISSUED" ? new Date() : null, createdBy: access.userId! };
  if (id) {
    const [current] = await tx.select().from(m.socialIssuedDocuments).where(eq(m.socialIssuedDocuments.id, id));
    if (!current || current.status === "ISSUED") throw new Error("Documento emitido é preservado; registre um novo documento para corrigir.");
    await tx.update(m.socialIssuedDocuments).set(data).where(eq(m.socialIssuedDocuments.id, id)); return id;
  }
  return (await tx.insert(m.socialIssuedDocuments).values(data).returning())[0].id;
}
