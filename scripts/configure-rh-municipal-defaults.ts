import "dotenv/config";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { Decimal } from "../src/db/decimal";
import { readFile, writeFile } from "node:fs/promises";
import { and, eq, sql } from "drizzle-orm";
import { createDatabaseConnection } from "../src/db/connection";
import { withDatabaseTransaction } from "../src/db/transaction";
import { hrPayrollRuleSets, hrPayrollRules, hrPayrollRubrics, hrPayrollRubricIncidences } from "../src/db/schema/personnel-configuration";
import { hrFunctionalRecords } from "../src/db/schema/personnel-functional-management";
import { userBudgetUnits } from "../src/db/schema/identity";
import { findIdentityByFirebaseUid } from "../src/db/repositories/platform/identity";
import { enqueueHrIntegration, lockPersonnel, stablePersonnelJson } from "../src/db/repositories/personnel/integration";
import { saveFunctionalRecord } from "../src/lib/rh/functional-record-service";
import { parseFunctionalData, type FunctionalKind } from "../src/lib/rh/functional-records";
import { certifyHistoricalPayrollAccounting } from "../src/lib/rh/payroll-accounting-evidence";
import type { AppContext } from "../src/lib/platform/tenant-context";

const packageId = "VEREDA_RH_PADROES_2026_V1";
const startsAt = "2026-11-01";
const legalReference = "Estatuto de pessoal de Vereda das Auroras — parâmetros municipais de apresentação, versão 1, autorizados em 03/11/2026.";
const source = "docs/RH_VEREDA_FONTES_2026.json";

async function main() {
  const connection = createDatabaseConnection(process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL!);
  try {
    const [actor] = (await connection.db.execute<{ id: string; firebaseUid: string }>(sql`SELECT u.id,u."firebaseUid" FROM "Usuario" u JOIN "ConfiguracaoPerfil" p ON p.id=u."perfilId" WHERE u.ativo AND p.ativo AND p.codigo='SYSTEM_ADMINISTRATOR' AND u."firebaseUid" IS NOT NULL ORDER BY u.id LIMIT 1`)).rows;
    assert.ok(actor, "Administrador municipal ativo não encontrado.");
    const identity = await findIdentityByFirebaseUid(connection.db, actor.firebaseUid);
    assert.ok(identity);
    const context: AppContext = { database: connection.db, user: {
      id: identity.id, firebaseUid: actor.firebaseUid, email: identity.email, name: identity.nome, role: identity.perfil.nome, profileCode: identity.perfil.codigo,
      permissions: identity.perfil.permissoes, additionalProfiles: identity.additionalProfiles?.map(p => ({ id: p.id, code: p.codigo, name: p.nome, permissions: p.permissoes })),
      modulePermissions: identity.modulePermissions, allowedBudgetUnitIds: identity.allowedBudgetUnitIds, employeeId: identity.employee?.id ?? null, departmentId: identity.employee?.departmentId ?? null, secretariatId: identity.employee?.secretariatId ?? null,
    } };
    const [set] = await connection.db.select().from(hrPayrollRuleSets).where(eq(hrPayrollRuleSets.code, "RH_POC_DOCUMENTAL_2026_V1"));
    assert.ok(set?.isDemo && set.scope === "DEMONSTRACAO", "Pacote municipal de apresentação não encontrado.");
    const holders = (await connection.db.execute<{ id: string }>(sql`SELECT DISTINCT c."employeeId" id FROM "HrEmploymentContract" c WHERE c.details->>'seedPackage'='RH_PORTAL_2026_V1' ORDER BY id`)).rows;
    assert.equal(holders.length, 198);
    const [regime] = (await connection.db.execute<{ id: string }>(sql`SELECT id FROM "HrEmploymentRegime" WHERE code='EFETIVO_POC'`)).rows;
    assert.ok(regime);
    const definitions: Array<{ key: string; kind: FunctionalKind; name: string; data: Record<string, string> }> = [];
    const rule = (key: string, kind: FunctionalKind, name: string, data: Record<string, string>) => definitions.push({ key: `${packageId}:${key}`, kind, name, data: parseFunctionalData(kind, { regimeId: "", roleId: "", ...data, legalReference }) });
    rule("ats", "REGRA_ATS", "Adicional quinquenal municipal", { regimeId: regime.id, rubricCode: "ATS", intervalYears: "5", rate: "5", maximumRate: "35", priorCredit: "SIM" });
    const careerRoles = (await connection.db.execute<{ id: string; name: string; salary: string }>(sql`SELECT c."roleId" id,r.name,max(c.salary)::text salary FROM "HrEmploymentContract" c JOIN "Role" r ON r.id=c."roleId" WHERE c.details->>'seedPackage'='RH_PORTAL_2026_V1' AND c."regimeId"=${regime.id} GROUP BY c."roleId",r.name ORDER BY c."roleId"`)).rows;
    for (const role of careerRoles) rule(`progressao-${role.id}`, "REGRA_PROGRESSAO", `Progressão municipal — ${role.name}`, { regimeId: regime.id, roleId: role.id, intervalYears: "3", targetRoleId: role.id, targetLevel: "B-01", salary: new Decimal(role.salary).mul("1.05").toFixed(2), minimumScore: "70", priorCredit: "SIM", evaluationKind: "DESEMPENHO", evaluationMethod: "PERCENTUAL_NORMALIZADO" });
    rule("ferias-magisterio", "FERIAS_ESPECIAIS", "Férias do magistério municipal", { regimeId: regime.id, roleId: (await connection.db.execute<{ id: string }>(sql`SELECT r.id FROM "Role" r WHERE r.name ILIKE '%professor%' ORDER BY r.id LIMIT 1`)).rows[0]?.id ?? "", acquisitionMonths: "12", days: "45", useWithinMonths: "12" });
    assert.ok(definitions.at(-1)!.data.roleId, "Cargo do magistério não encontrado.");
    for (const category of ["APOSENTADO", "PENSIONISTA"]) {
      rule(`contribuicao-${category}`, "REGRA_PREVIDENCIA_BENEFICIO", `Contribuição de ${category === "APOSENTADO" ? "aposentados" : "pensionistas"}`, { category, payrollTypes: "Mensal;13º;Diferença 13º", personalMode: "EXCEDENTE", exemptAmount: "8157.41", ceilingMode: "SEM_TETO", employer: "NAO" });
      rule(`incidencias-${category}`, "REGRA_INCIDENCIAS_CATEGORIA", `Incidências de ${category === "APOSENTADO" ? "aposentados" : "pensionistas"}`, { category, payrollTypes: "Mensal;13º;Diferença 13º", IRRF: "MANTER", RGPS: "EXCLUIR", RPPS: "MANTER", FGTS: "EXCLUIR", PIS_PASEP: "EXCLUIR" });
    }
    const limit = { floor: "1518", ceiling: "30000", includedCodes: "VENCIMENTO", floorRubric: "VEREDA_PISO", ceilingRubric: "VEREDA_TETO", ceilingMode: "ABATER" };
    rule("limites", "REGRA_LIMITE", "Piso e teto remuneratório municipal", limit);
    rule("limites-beneficios", "REGRA_LIMITE_BENEFICIO", "Piso e teto de benefícios municipais", limit);
    rule("abono", "REGRA_ABONO", "Abono-família municipal", { regimeId: regime.id, rubricCode: "VEREDA_ABONO", quota: "65", incomeLimit: "3000", maximumAge: "14" });
    for (const gender of ["Feminino", "Masculino"]) rule(`aposentadoria-${gender}`, "REGRA_APOSENTADORIA", `Aposentadoria municipal — ${gender.toLowerCase()}`, { regimeId: regime.id, gender, minimumAge: gender === "Feminino" ? "62" : "65", contributionDays: "9125", publicDays: "3650", roleDays: "1825", minimumPoints: "0", tollRate: "0", averageMonths: "300", benefitRate: "60", topPercentage: "100", extraYearRate: "2", extraAfterYears: "20", benefitFloor: "1518", benefitCeiling: "8157.41", issuer: "Prefeitura Municipal de Vereda das Auroras", benefitMode: "MEDIA" });
    for (const reason of ["TERMINO_CONTRATO", "EXONERACAO", "DEMISSAO", "APOSENTADORIA", "FALECIMENTO"]) rule(`rescisao-${reason}`, "REGRA_RESCISAO", `Direitos rescisórios — ${reason.toLowerCase().replaceAll("_", " ")}`, { reason, salaryBalance: "SIM", thirteenth: "SIM", vacation: "SIM", overdueVacation: "SIM", noticeDays: "0", fgtsFineRate: "0" });
    const allocations = (await connection.db.execute(sql`SELECT id,details FROM "HrReferenceRecord" WHERE kind='RATEIO_FOLHA' ORDER BY id`)).rows;
    const courses = (await connection.db.execute<{ id: string }>(sql`SELECT id FROM "HrPayrollRule" WHERE "ruleSetId"=${set.id} AND "isActive" AND category='PORTAL' AND value->>'origin'='CAPACITACAO_FUNCIONAL' ORDER BY id`)).rows;
    const training = courses.flatMap(course => [
      { code: "APLICABILIDADE", question: "Aplicabilidade do aprendizado nas atividades municipais", weight: "2" },
      { code: "CLAREZA", question: "Clareza da exposição e dos materiais", weight: "1" },
      { code: "CONTEUDO", question: "Adequação do conteúdo aos objetivos da capacitação", weight: "1" },
    ].map(item => ({ key: `${packageId}:TREINAMENTO:${course.id}:${item.code}`, kind: "TREINAMENTO_INSTRUMENTO" as const, name: item.question, data: parseFunctionalData("TREINAMENTO_INSTRUMENTO", { ...item, courseId: course.id, minimumScore: "0", maximumScore: "100", legalReference: `${legalReference} Instrumento geral: docs/RH_VEREDA_REGRAS_GERAIS_2026.md.` }) })));
    const runs = (await connection.db.execute<{ id: string }>(sql`SELECT r.id FROM "HrPayrollRun" r JOIN "Payroll" p ON p.id=r."payrollId" WHERE r.mode='OFICIAL' AND r.status='FECHADA' AND r.scope='DEMONSTRACAO' AND right(p.competence,4)='2026' AND r.snapshot->'accountingAllocations' IS NULL AND EXISTS(SELECT 1 FROM "HrPayrollStatement" s JOIN "HrEmploymentContract" c ON c.id=s."contractId" WHERE s."runId"=r.id AND c.details->>'seedPackage'='RH_PORTAL_2026_V1') ORDER BY r.id`)).rows;
    if (!process.argv.includes("--apply")) { console.log(JSON.stringify({ mode: "PREVIEW", packageId, actorId: actor.id, rules: definitions, training, holders: holders.length, accountingRuns: runs.length })); return; }
    // Documentary source is retained separately; closed payroll snapshots remain untouched.
    const document = { packageId, issuer: "Prefeitura Municipal de Vereda das Auroras", nature: "PARÂMETROS E FONTES DO MUNICÍPIO DE APRESENTAÇÃO", authorizationDate: "2026-11-03", allocationMethod: "Classificação municipal por setor, remuneração e encargos em dotações próprias; ratificação explícita das referências de apresentação já existentes, sem execução financeira.", allocations, laborIdentificationMethod: "Identificação municipal de apresentação, sequencial por titular; não originada de consulta externa. Não substitui documentação na migração de prefeitura.", rules: definitions };
    const hash = createHash("sha256").update(stablePersonnelJson(document)).digest("hex");
    try {
      const preserved = JSON.parse(await readFile(source, "utf8"));
      assert.equal(stablePersonnelJson(preserved), stablePersonnelJson(document), "A fonte municipal mudou. Preserve a versão certificada e crie outra versão explícita.");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      await writeFile(source, JSON.stringify(document, null, 2) + "\n");
    }
    await withDatabaseTransaction(connection, async tx => {
      await lockPersonnel(tx, "functional-configuration");
      await tx.execute(sql`SELECT set_config('celeriflow.actor_id',${actor.id},true)`);
      const [fgts] = await tx.select().from(hrPayrollRules).where(and(eq(hrPayrollRules.ruleSetId, set.id), eq(hrPayrollRules.code, "FGTS_ALIQUOTA")));
      if (fgts) assert.ok(fgts.isActive && new Decimal(String(fgts.value)).eq(8), "Alíquota municipal alterada; concilie sem sobrescrever.");
      else {
        const [parameter] = await tx.insert(hrPayrollRules).values({ ruleSetId: set.id, category: "GERAL", code: "FGTS_ALIQUOTA", name: "Alíquota de FGTS", valueType: "PERCENTAGE", value: 8, legalReference, description: "Alíquota de 8% aplicada somente quando houver base FGTS; os vínculos administrativos atuais não a possuem." }).returning();
        await enqueueHrIntegration(tx, { sourceKey: `${packageId}:FGTS_ALIQUOTA`, domain: "AUDITORIA", environment: "INTERNO", eventType: "PARAMETRO_MUNICIPAL_REGISTRADO", payload: { actorId: actor.id, ruleId: parameter.id, value: 8, source: "docs/RH_VEREDA_REGRAS_GERAIS_2026.md" } });
      }
      const budgetUnits = (await tx.execute<{ id: string }>(sql`SELECT DISTINCT a."budgetUnitId" id FROM "HrReferenceRecord" r JOIN "BudgetAppropriation" a ON a.id=r.details->>'appropriationId' WHERE r.kind='RATEIO_FOLHA' AND EXISTS(SELECT 1 FROM "HrEmploymentContract" c WHERE c.id=r.details->>'contractId' AND c.details->>'seedPackage'='RH_PORTAL_2026_V1')`)).rows;
      for (const unit of budgetUnits) {
        const inserted = await tx.insert(userBudgetUnits).values({ usuarioId: actor.id, budgetUnitId: unit.id }).onConflictDoNothing().returning();
        if (inserted.length) await enqueueHrIntegration(tx, { sourceKey: `${packageId}:AGENDA_UNIDADE:${unit.id}`, domain: "AUDITORIA", environment: "INTERNO", eventType: "ATOR_AGENDAMENTO_UNIDADE_VINCULADA", payload: { actorId: actor.id, budgetUnitId: unit.id, source, hash } });
      }
      for (const [code, name, type] of [["VEREDA_PISO", "Complemento do piso municipal", "PROVENTO"], ["VEREDA_TETO", "Abatimento do teto municipal", "DESCONTO"], ["VEREDA_ABONO", "Abono-família municipal", "PROVENTO"]] as const) {
        const existing = await tx.select().from(hrPayrollRubrics).where(and(eq(hrPayrollRubrics.ruleSetId, set.id), eq(hrPayrollRubrics.code, code)));
        if (existing.length) {
          assert.equal(existing[0].type, type); assert.equal(existing[0].calculationMethod, "MANUAL");
          if (code === "VEREDA_PISO" && existing[0].notes === packageId) {
            // These municipal regimes are statutory/administrative, without FGTS.
            const removed = await tx.delete(hrPayrollRubricIncidences).where(and(eq(hrPayrollRubricIncidences.rubricId, existing[0].id), eq(hrPayrollRubricIncidences.incidenceType, "FGTS"))).returning();
            if (removed.length) await enqueueHrIntegration(tx, { sourceKey: `${packageId}:PISO_INCIDENCIAS:2`, domain: "AUDITORIA", environment: "INTERNO", eventType: "PARAMETRO_MUNICIPAL_CORRIGIDO", payload: { actorId: actor.id, before: removed, reason: "Complemento do piso de vínculos administrativos sem incidência FGTS", source } });
          }
          continue;
        }
        const [rubric] = await tx.insert(hrPayrollRubrics).values({ ruleSetId: set.id, code, name, type, calculationMethod: "MANUAL", priority: 800, legalReference, notes: packageId }).returning();
        if (code === "VEREDA_PISO") await tx.insert(hrPayrollRubricIncidences).values(["IRRF", "RPPS", "RGPS", "FERIAS", "DECIMO_TERCEIRO"].map(incidenceType => ({ rubricId: rubric.id, incidenceType })));
        await enqueueHrIntegration(tx, { sourceKey: `${packageId}:RUBRICA:${code}`, domain: "AUDITORIA", environment: "INTERNO", eventType: "PARAMETRO_MUNICIPAL_REGISTRADO", payload: { actorId: actor.id, rubricId: rubric.id, source, hash } });
      }
    });
    const existingRecords = new Map((await connection.db.select().from(hrFunctionalRecords).where(sql`starts_with(${hrFunctionalRecords.key},${packageId + ":"})`)).map(record => [record.key, record]));
    for (const definition of [...definitions, ...training]) {
      const previous = existingRecords.get(definition.key);
      if (previous) { assert.equal(stablePersonnelJson(previous.data), stablePersonnelJson(definition.data), definition.key); continue; }
      await saveFunctionalRecord(connection, context, { ...definition, startsAt });
    }
    for (const [index, holder] of holders.entries()) {
      const key = `${packageId}:IDENTIFICACAO:${holder.id}`;
      if (existingRecords.has(key)) continue;
      const base = `19${String(index + 1).padStart(8, "0")}`;
      const remainder = [...base].reduce((sum, value, i) => sum + Number(value) * [3, 2, 9, 8, 7, 6, 5, 4, 3, 2][i], 0) % 11;
      const pisPasep = `${base}${remainder < 2 ? 0 : 11 - remainder}`;
      await saveFunctionalRecord(connection, context, { kind: "IDENTIFICACAO_TRABALHISTA", key, name: "Identificação trabalhista municipal", employeeId: holder.id, startsAt: "2026-11-03", data: { pisPasep, ctps: String(7000000 + index + 1), ctpsSeries: "001", ctpsState: "MG", legalReference: `${legalReference} Fonte: ${source}; hash ${hash}.` } });
    }
    for (const run of runs) await certifyHistoricalPayrollAccounting(connection, context, { requestKey: `${packageId}:${run.id}`, runId: run.id, source: `${source}; SHA-256 ${hash}`, responsible: "Administração de pessoal de Vereda das Auroras", reason: "Ratificação explícita da classificação orçamentária do município de apresentação, autorizada em 03/11/2026; preservados os demonstrativos e cálculos encerrados." });
    console.log(JSON.stringify({ result: "PASS", packageId, rules: definitions.length, trainingCriteria: training.length, holders: holders.length, accountingRuns: runs.length, source, hash, actorId: actor.id }));
  } finally { await connection.pool.end(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
