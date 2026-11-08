import { config } from "dotenv";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { and, eq, sql } from "drizzle-orm";
import { databaseConnection } from "../src/db/client";
import { withDatabaseTransaction } from "../src/db/transaction";
import { people } from "../src/db/schema/people";
import { employees } from "../src/db/schema/administration";
import { financialAuditLogs } from "../src/db/schema/finance-identity";
import * as s from "../src/db/schema/social";
import * as w from "../src/db/schema/social-workflows";
import * as m from "../src/db/schema/social-operation-models";
import { saveSocialWorkflow } from "../src/db/repositories/social/workflow-operations";
import { previewSocialImport, applySocialImport } from "../src/db/repositories/social/imports";
import { localCadunicoHeaders } from "../src/lib/social/cadunico-import";
import { createSuasRmaRecord, queryCadUnicoMds } from "../src/lib/social/social-engine";
import { populationContext } from "./lib/population-context";

config({ path: ".env.local", quiet: true }); config({ quiet: true });
const apply = process.argv.includes("--apply"), key = "MUNICIPAL_SOCIAL_COMPLETION_20261108";
const report = { mode: apply ? "APPLY" : "PREVIEW_ROLLED_BACK", startedAt: new Date().toISOString(), references: {} as Record<string, unknown>, checks: [] as string[], reused: false, status: "RUNNING", error: "" };
async function main() {
  try {
    const context = await populationContext(), rollback = new Error("POPULATION_PREVIEW_ROLLBACK");
    try {
      await withDatabaseTransaction(databaseConnection, async tx => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${key}))`);
        const [prior] = await tx.select().from(financialAuditLogs).where(and(eq(financialAuditLogs.action, "MUNICIPAL_POPULATION_PACKAGE"), eq(financialAuditLogs.entityId, key)));
        if (prior) { report.reused = true; report.references = { receiptId: prior.id }; return; }
        const [professional] = await tx.select().from(employees).where(eq(employees.id, "aurora-system-v1:employee:003")); assert.ok(professional);
        const access = { administrator: true, employeeId: professional.id, userId: context.user.id, links: [] };
        const units = await tx.select().from(s.socialUnits).where(eq(s.socialUnits.isActive, true));
        const documents: string[] = [], visits: string[] = [], batches: string[] = [], rma: string[] = [];
        for (const unit of units) {
          const [family] = await tx.select({ family: s.socialFamilies, person: people }).from(s.socialFamilies).innerJoin(w.socialFamilyRegistrations, eq(w.socialFamilyRegistrations.familyId, s.socialFamilies.id)).innerJoin(people, eq(people.id, s.socialFamilies.representativeId)).where(eq(w.socialFamilyRegistrations.unitId, unit.id)).orderBy(s.socialFamilies.id).limit(1);
          assert.ok(family?.person.cpf && family.person.birthDate);
          const [profile] = await tx.select().from(s.socialPersonProfiles).where(eq(s.socialPersonProfiles.personId, family.person.id)); assert.ok(profile?.nis);
          const members = await tx.select({ person: people, kinship: s.socialFamilyMembers.kinship, nis: s.socialPersonProfiles.nis }).from(s.socialFamilyMembers).innerJoin(people, eq(people.id, s.socialFamilyMembers.personId)).leftJoin(s.socialPersonProfiles, eq(s.socialPersonProfiles.personId, people.id)).where(eq(s.socialFamilyMembers.familyId, family.family.id));
          const csvRow = (person: typeof family.person, nis: string, kinship: string) => [person.cpf!.replace(/\D/g, ""), nis, person.fullName, family.family.familyCode!, kinship, person.birthDate!.toISOString().slice(0, 10), String(family.family.income), person.phonePrimary || "", unit.streetAddress || "Rua das Veredas, 100, Centro", "Aurora das Veredas", "MG"].map(value => `"${value.replaceAll('"', '""')}"`).join(";");
          const content = localCadunicoHeaders.join(";") + "\n" + [csvRow(family.person, profile.nis, "RESPONSAVEL"), ...members.filter(member => member.person.id !== family.person.id).map(member => csvRow(member.person, member.nis || "", member.kinship?.toUpperCase() === "FILHO" ? "FILHO" : "OUTRO_PARENTE"))].join("\n");
          const batchId = await previewSocialImport(tx, { unitId: unit.id, filename: `familias-${unit.type.toLowerCase()}-novembro-2026.csv`, content, actorId: context.user.id });
          await applySocialImport(tx, batchId, context.user.id); batches.push(batchId);
          const imported = await queryCadUnicoMds(tx, family.person.cpf);
          assert.equal(imported.nomeCompleto, family.person.fullName); assert.equal(imported.composicaoFamiliar, members.filter(member => member.person.id !== family.person.id).length + 1);
          const visitId = await saveSocialWorkflow(tx, access, "visitas", undefined, { unitId: unit.id, familyId: family.family.id, professionalId: professional.id, scheduledDate: "2026-11-06T09:00", realizedDate: "2026-11-06T09:10", objective: "Acompanhar o acesso da família à rede e conferir a atualização cadastral.", status: "Realizada", report: "A família apresentou os documentos solicitados, confirmou os contatos e pactuou retorno à unidade para continuidade do acompanhamento." }); visits.push(visitId);
          assert.equal((await tx.select().from(m.socialVisitAttendances).where(eq(m.socialVisitAttendances.visitId, visitId))).length, 1);
          for (const templateCode of ["PRONTUARIO_SUAS", "PAF", "REFERRAL"]) {
            const documentData: Record<string, string> = { person: family.person.fullName, cpf: family.person.cpf, nis: profile.nis, unit: unit.name, professional: professional.name, date: "2026-11-08", address: unit.streetAddress || "Rua das Veredas, 100, Centro", protocol: `SUAS/2026/${String(9401 + documents.length).padStart(6, "0")}` };
            if (templateCode === "REFERRAL") Object.assign(documentData, { destination: "Posto Municipal do Cadastro Único", objective: "Conferir os documentos da família e orientar sobre a atualização do cadastro.", observations: "Retornar à unidade de referência após o atendimento." });
            else Object.assign(documentData, { diagnosis: "Necessidade de orientação para acesso à rede e organização da documentação familiar.", objectives: "Fortalecer a rede de apoio e manter os cadastros atualizados.", actions: "Orientação documental, visita domiciliar e retorno à unidade em trinta dias.", evolution: "Documentação apresentada e retorno pactuado com a pessoa de referência." });
            documents.push(await saveSocialWorkflow(tx, access, "documentos", undefined, { unitId: unit.id, familyId: family.family.id, personId: "", templateCode, documentData: JSON.stringify(documentData), status: "ISSUED" }));
          }
          const record = await createSuasRmaRecord(tx, { nis: profile.nis, nomeCidadao: family.person.fullName, unidadeAtendimento: unit.name, tipoAtendimento: "Acompanhamento familiar", detalhesRma: "Orientação documental, visita domiciliar e encaminhamento para atualização do cadastro, com continuidade do acompanhamento na unidade de referência.", tecnicoResponsavel: professional.name }); rma.push(record.id);
        }
        report.references = { documentIds: documents, visitIds: visits, importBatchIds: batches, rmaIds: rma };
        report.checks.push("Importação aplicada com composição integral das famílias existentes", "Consulta CadÚnico devolve os snapshots importados", "Visitas realizadas geraram atendimentos vinculados pelo serviço", "Seis documentos emitidos com pessoa, CPF, NIS, unidade, profissional e data");
        await tx.insert(financialAuditLogs).values({ action: "MUNICIPAL_POPULATION_PACKAGE", entityType: "DATASET", entityId: key, authorUsuarioId: context.user.id, payload: { fictional: true, references: JSON.parse(JSON.stringify(report.references)), checks: report.checks } });
        if (!apply) throw rollback;
      }, { timeoutMs: 240_000 });
    } catch (error) { if (error !== rollback) throw error; }
    report.status = "PASS";
  } catch (error) { report.status = "FAIL"; report.error = error instanceof Error ? error.message.slice(0, 600) : "Falha no complemento social"; process.exitCode = 1; }
  finally { const output = "docs/plano-populacao-2026-11-08/execucao/social"; mkdirSync(output, { recursive: true }); writeFileSync(`${output}/${apply ? "completion-applied" : "completion-preview"}.json`, JSON.stringify(report, null, 2) + "\n"); console.log(JSON.stringify(report, null, 2)); await databaseConnection.pool.end(); }
}
void main();
