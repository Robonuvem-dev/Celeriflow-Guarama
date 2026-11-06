/** Reviewed, additive presentation examples. Preview executes the same transaction and rolls it back. */
import { config } from "dotenv";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { eq, sql } from "drizzle-orm";
import { Decimal } from "../src/db/decimal";
import { withDatabaseTransaction } from "../src/db/transaction";
import { inDatabaseTransactionScope } from "../src/db/transaction-scope";
import { financialAuditLogs } from "../src/db/schema/finance-identity";
import { purchaseProcesses, procurementContracts } from "../src/db/schema/procurement-core";
import { procurementCovenants } from "../src/db/schema/procurement-instruments";
import { procurementLifecycleEvents } from "../src/db/schema/procurement-requests";
import { suppliers } from "../src/db/schema/registry";
import { hearings, laws, minutes, sessions } from "../src/db/schema/chamber";
import { cemeteries, cemeterySectors, cemeteryChapels, cemeteryOssuaries, cemeteryLots, cemeteryGraves, cemeteryIdentificationFields } from "../src/db/schema/cemeteries";
import { savePortalContent, ownPortalContents } from "../src/lib/portal-servidor/content-catalog";
import { configureTaxServiceActivity } from "../src/lib/tributacao";
import { databaseConnection } from "../src/db/client";
import { findIdentityByFirebaseUid } from "../src/db/repositories/platform/identity";
import type { AppContext } from "../src/lib/platform/tenant-context";
import { mutateFleetInTransaction } from "../src/lib/frotas/service";
import { fleetUnits } from "../src/db/schema/fleet";
import { saveFunctionalRecord } from "../src/lib/rh/functional-record-service";
import { saveReferenceRecord } from "../src/lib/rh/reference-records";
import { saveFunctionalService } from "../src/lib/portal-servidor/service-catalog";
import { saveCareerPolicy, enrollOwnCourse } from "../src/lib/portal-servidor/career-service";
import { legalTexts } from "../src/db/schema/master-data";
import { saveLegalText } from "../src/db/repositories/registry/master-data-operations";
import { saveSecurityItem } from "../src/db/repositories/security-mobility/commands";
import { mobilityRecords } from "../src/db/schema/security-mobility";

config({ path: ".env.local", quiet: true }); config({ quiet: true });
const packageId = "CHECKUP_APRESENTACAO_2026_V1";
const id = (key: string) => `${packageId}:${key}`;
const date = (value: string) => new Date(`${value}T12:00:00Z`);
const apply = process.argv.includes("--apply");
const rollback = new Error("CHECKUP_PREVIEW_ROLLBACK");
const source = "Amostra fictícia autorizada no checkup de 06/11/2026; origem técnica preservada neste pacote e na auditoria.";

async function main() {
  // Use the shared connection because the portal's canonical service owns its transaction.
  const connection = databaseConnection;
  const report = { packageId, mode: apply ? "APPLIED" : "PREVIEW_ROLLED_BACK", startedAt: new Date().toISOString(), changes: [] as { table: string; id: string; operation: string }[], portalContents: [] as string[] };
  try {
    const [actor] = (await connection.db.execute<{ id: string; firebaseUid: string }>(sql`SELECT u.id,u."firebaseUid" FROM "Usuario" u JOIN "ConfiguracaoPerfil" p ON p.id=u."perfilId" WHERE u.ativo AND p.ativo AND p.codigo='SYSTEM_ADMINISTRATOR' AND u.id='cmvba36v700007kqmdslbwhkk'`)).rows;
    assert.ok(actor?.firebaseUid, "Administrador vinculado não encontrado.");
    const identity = await findIdentityByFirebaseUid(connection.db, actor.firebaseUid);
    assert.ok(identity);
    const context: AppContext = { database: connection.db, user: { id: identity.id, firebaseUid: actor.firebaseUid, email: identity.email, name: identity.nome, role: identity.perfil.nome, profileCode: identity.perfil.codigo, permissions: identity.perfil.permissoes, modulePermissions: identity.modulePermissions, allowedBudgetUnitIds: identity.allowedBudgetUnitIds, employeeId: identity.employee?.id ?? null, departmentId: identity.employee?.departmentId ?? null, secretariatId: identity.employee?.secretariatId ?? null } };
    const record = (table: string, rows: { id: string }[]) => report.changes.push(...rows.map(row => ({ table, id: row.id, operation: "INSERT" })));
    try {
      await withDatabaseTransaction(connection, async tx => inDatabaseTransactionScope(connection, tx, async () => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${packageId}))`);
        // Each source record and field was inspected, including its relationships.
        // Immutable BiddingAct history, source PDFs and certified RH source keys are retained.
        const corrections = [
          ["BiddingAppointment", "cmw2nii9q000708jr1t7xby3l", "name", "Teste", "Comissão de contratação de equipamentos de informática"],
          ["BiddingLot", "cmw2nj544000708l61ykx742r", "description", "Teste", "Notebooks de 14 polegadas para as unidades administrativas"],
          ["OmbudsmanConfiguration", "cmw46wqgz000s08ifnmvep7r9", "name", "Situação Teste", "Concluído"],
          ["OmbudsmanConfiguration", "cmw45245e001208jyj5jz39gs", "name", "2323", "Encerrado"],
          ["OmbudsmanConfiguration", "cmw451t2z000u08jy4r9l2837", "name", "232323232323232323", "Cancelado"],
          ["OmbudsmanConfiguration", "cmw451uc5000y08jydqxwmgks", "name", "232323232323232323", "Cancelado"],
          ["Secretariat", "cmw3fehvx000508js6r53e682", "name", "Secretaria da POC", "Secretaria de Apoio Administrativo"],
          ["Secretariat", "cmw3fehvx000508js6r53e682", "acronym", "SPOC", "SEAP"],
        ] as const;
        for (const [table, recordId, column, previous, current] of corrections) {
          const [row] = (await tx.execute<{ value: string }>(sql`SELECT ${sql.identifier(column)} AS value FROM ${sql.identifier(table)} WHERE id=${recordId} FOR UPDATE`)).rows;
          assert.ok(row, `Cadastro ausente: ${table}/${recordId}`);
          if (row.value === current) continue;
          assert.equal(row.value, previous, `Cadastro alterado desde a inspeção: ${table}/${recordId}`);
          await tx.execute(sql`INSERT INTO "MunicipalPresentationRevision" (id,"tableName","recordId","columnName","previousValue","currentValue") VALUES (${randomUUID()},${table},${recordId},${column},${previous},${current})`);
          await tx.execute(sql`UPDATE ${sql.identifier(table)} SET ${sql.identifier(column)}=${current} WHERE id=${recordId} AND ${sql.identifier(column)}=${previous}`);
          report.changes.push({ table, id: recordId, operation: `UPDATE:${column}` });
        }
        const reviseLabel = async (table: "Document" | "Family" | "Person" | "Taxpayer", column: "title" | "code" | "email" | "municipalInsc", recordId: string, previous: string, current: string) => {
          await tx.execute(sql`INSERT INTO "MunicipalPresentationRevision" (id,"tableName","recordId","columnName","previousValue","currentValue") VALUES (${randomUUID()},${table},${recordId},${column},${previous},${current})`);
          const rows = (await tx.execute<{ id: string }>(sql`UPDATE ${sql.identifier(table)} SET ${sql.identifier(column)}=${current} WHERE id=${recordId} AND ${sql.identifier(column)}=${previous} RETURNING id`)).rows;
          assert.equal(rows.length, 1, `Rótulo alterado desde a leitura: ${table}/${recordId}`);
          report.changes.push({ table, id: recordId, operation: `UPDATE:${column}` });
        };
        for (const [previous, current] of [["Planejamento SCFV - comprovacao POC", "Planejamento do Serviço de Convivência e Fortalecimento de Vínculos"], ["Registro profissional POC - homologacao", "Registro profissional — conferência cadastral"]]) {
          const documents = (await tx.execute<{ id: string; title: string }>(sql`SELECT id,title FROM "Document" WHERE title=${previous} FOR UPDATE`)).rows;
          for (const document of documents) await reviseLabel("Document", "title", document.id, document.title, current);
        }
        // Only the sixteen family identifiers inspected in this census; relational IDs stay stable.
        for (const [previous, current] of [...Array.from({ length: 15 }, (_, index) => [`AV-POC-${11 + index}`, `FAM-2026-${String(11 + index).padStart(3, "0")}`]), ["POC-IMPORT-1", "FAM-2026-101"]]) {
          const families = (await tx.execute<{ id: string; code: string }>(sql`SELECT id,code FROM "Family" WHERE code=${previous} FOR UPDATE`)).rows;
          assert.ok(families.length <= 1);
          for (const family of families) await reviseLabel("Family", "code", family.id, family.code, current);
        }
        const municipalInscription = (await tx.execute<{ id: string; municipalInsc: string }>(sql`SELECT id,"municipalInsc" FROM "Taxpayer" WHERE id='THIAGO_MORCATTY_DEMO_2026_V1:taxpayer' AND "municipalInsc"='DEMO-TM-2026-001' FOR UPDATE`)).rows;
        for (const taxpayer of municipalInscription) await reviseLabel("Taxpayer", "municipalInsc", taxpayer.id, taxpayer.municipalInsc, "TM-2026-001");
        // This reviewed seed used fake contact addresses. Never touch an address used by an identity.
        const contacts = (await tx.execute<{ id: string; fullName: string; email: string }>(sql`SELECT p.id,p."fullName",p.email FROM "Person" p WHERE p.email ~ '^social[.]poc[.][0-9]{1,2}[.][0-2]@auroradasveredas[.]example$' AND NOT EXISTS (SELECT 1 FROM "Usuario" u WHERE lower(u.email)=lower(p.email)) AND NOT EXISTS (SELECT 1 FROM "Employee" e JOIN "Usuario" u ON u."employeeId"=e.id WHERE e."personId"=p.id) ORDER BY p.id FOR UPDATE OF p`)).rows;
        for (const person of contacts) {
          const name = person.fullName.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, ".").replace(/^\.|\.$/g, "");
          const suffix = createHash("sha256").update(person.id).digest("hex").slice(0, 6);
          await reviseLabel("Person", "email", person.id, person.email, `${name}.${suffix}@example.com`);
        }

        // Contract examples use actual planning processes, their secretariats and matching catalog suppliers.
        for (const [index, processIndex, supplierIndex] of [[0, 0, 0], [1, 3, 1], [2, 5, 8]]) {
          const [process] = await tx.select().from(purchaseProcesses).where(eq(purchaseProcesses.id, `aurora-system-v1:purchase-process:${String(processIndex).padStart(3, "0")}`));
          const [supplier] = await tx.select().from(suppliers).where(eq(suppliers.id, `aurora-system-v1:supplier:${String(supplierIndex).padStart(3, "0")}`));
          assert.ok(process && supplier);
          const [unit] = (await tx.execute<{ id: string }>(sql`SELECT id FROM "BudgetUnit" WHERE "secretariatId"=${process.secretariatId} ORDER BY id LIMIT 1`)).rows;
          assert.ok(unit);
          const contractId = id(`contract:${index}`);
          const rows = await tx.insert(procurementContracts).values({ id: contractId, number: `CT-2026-${8201 + index}`, object: process.object, initialValue: process.estimatedValue ?? 0, updatedValue: process.estimatedValue ?? 0, startDate: date("2027-01-01"), endDate: date("2027-12-31"), status: "Minuta", processId: process.id, supplierId: supplier.id, secretariatId: process.secretariatId, sourceBudgetUnitId: unit.id }).onConflictDoNothing({ target: procurementContracts.id }).returning({ id: procurementContracts.id });
          record("Contract", rows);
          if (rows.length) await tx.insert(procurementLifecycleEvents).values({ eventType: "CONTRACT_CREATED", entityType: "CONTRACT", entityId: contractId, sourceType: "CONTRACT", sourceId: contractId, actorUsuarioId: actor.id, idempotencyKey: id(`contract-created:${index}`) });
        }
        for (const [index, description, amount] of [[0, "Cooperação para oficinas de formação profissional e inclusão digital", "85000.00"], [1, "Apoio à programação cultural dos bairros e espaços comunitários", "120000.00"]] as const) {
          const covenantId = id(`covenant:${index}`);
          const rows = await tx.insert(procurementCovenants).values({ id: covenantId, number: `CV-2026-${8201 + index}`, grantor: index === 0 ? "Instituto Regional de Desenvolvimento das Veredas" : "Associação Cultural Vale Verde", description, totalValueDecimal: new Decimal(amount), startDate: date("2027-01-01"), endDate: date("2027-12-31"), status: "Em análise" }).onConflictDoNothing({ target: procurementCovenants.id }).returning({ id: procurementCovenants.id });
          record("Covenant", rows);
          if (rows.length) await tx.insert(procurementLifecycleEvents).values({ eventType: "COVENANT_CREATED", entityType: "COVENANT", entityId: covenantId, sourceType: "COVENANT", sourceId: covenantId, actorUsuarioId: actor.id, idempotencyKey: id(`covenant-created:${index}`) });
        }

        // Draft chamber documents have no publication, approval or effective-date claims.
        for (let index = 0; index < 2; index++) {
          const [session] = await tx.select().from(sessions).where(eq(sessions.id, `aurora-system-v1:session:00${index}`));
          assert.ok(session?.legislaturaId);
          record("CamAta", await tx.insert(minutes).values({ id: id(`minutes:${index}`), numero: `ATA-2026-${8201 + index}`, sessaoId: session.id, status: "Rascunho", conteudo: "Minuta para registro da abertura, leitura do expediente, encaminhamento das matérias e encerramento da sessão. A redação será conferida antes da apreciação em plenário." }).onConflictDoNothing({ target: minutes.id }).returning({ id: minutes.id }));
          record("CamAudiencia", await tx.insert(hearings).values({ id: id(`hearing:${index}`), tema: index === 0 ? "Prioridades de infraestrutura e mobilidade dos bairros" : "Programação cultural e utilização dos espaços públicos", descricao: "Escuta comunitária para levantamento de propostas e encaminhamento às comissões responsáveis.", data: date(index === 0 ? "2026-11-18" : "2026-11-25"), local: "Plenário das Veredas", tipo: "Pública", status: "Agendada", legislaturaId: session.legislaturaId }).onConflictDoNothing({ target: hearings.id }).returning({ id: hearings.id }));
          record("CamLei", await tx.insert(laws).values({ id: id(`law:${index}`), numero: `MINUTA-2026-${8201 + index}`, tipo: "Lei Ordinária", ementa: index === 0 ? "Diretrizes para utilização e conservação dos espaços comunitários" : "Organização das ações municipais de inclusão digital", texto: "Minuta em elaboração para análise das comissões e discussão legislativa. Sem publicação ou vigência.", status: "Em elaboração" }).onConflictDoNothing({ target: laws.id }).returning({ id: laws.id }));
        }

        // Fill the existing cemetery's structural screens, preserving the cemetery already registered.
        const [cemetery] = await tx.select().from(cemeteries).where(eq(cemeteries.id, "cmw51j3a8003p07kxncl16u0r"));
        const [sector] = await tx.select().from(cemeterySectors).where(eq(cemeterySectors.cemeteryId, cemetery?.id ?? ""));
        assert.ok(cemetery && sector);
        const ownerId = "aurora-system-v1:taxpayer:000";
        assert.equal((await tx.execute(sql`SELECT id FROM "Taxpayer" WHERE id=${ownerId}`)).rows.length, 1);
        record("CemeteryChapel", await tx.insert(cemeteryChapels).values({ id: id("chapel"), cemeteryId: cemetery.id, name: "Capela da Paz", address: cemetery.address, responsibleTaxpayerId: ownerId }).onConflictDoNothing({ target: cemeteryChapels.id }).returning({ id: cemeteryChapels.id }));
        record("CemeteryOssuary", await tx.insert(cemeteryOssuaries).values({ id: id("ossuary"), cemeteryId: cemetery.id, code: "OSS-01", address: "Ala central do cemitério municipal", capacity: 24 }).onConflictDoNothing({ target: cemeteryOssuaries.id }).returning({ id: cemeteryOssuaries.id }));
        record("CemeteryIdentificationField", await tx.insert(cemeteryIdentificationFields).values({ id: id("cemetery-field"), cemeteryId: cemetery.id, targetType: "LOTE", fieldKey: "referenciaLocalizacao", label: "Referência de localização", valueType: "DESCRITIVO", required: false }).onConflictDoNothing({ target: cemeteryIdentificationFields.id }).returning({ id: cemeteryIdentificationFields.id }));
        for (let index = 0; index < 4; index++) {
          const lotId = id(`lot:${index}`);
          record("CemeteryLot", await tx.insert(cemeteryLots).values({ id: lotId, cemeteryId: cemetery.id, identifier: `L-${String(101 + index).padStart(3, "0")}`, ownerTaxpayerId: ownerId, graveLimit: 2, status: "LIVRE", additionalData: { seedPackage: packageId } }).onConflictDoNothing({ target: cemeteryLots.id }).returning({ id: cemeteryLots.id }));
          record("TaxGrave", await tx.insert(cemeteryGraves).values({ id: id(`grave:${index}`), cemeteryId: cemetery.id, sectorId: sector.id, lotId, code: `S-${String(101 + index).padStart(3, "0")}`, graveType: index % 2 === 0 ? "COVA" : "GAVETA", capacity: 2, ownerTaxpayerId: ownerId, additionalData: { seedPackage: packageId } }).onConflictDoNothing({ target: cemeteryGraves.id }).returning({ id: cemeteryGraves.id }));
          // Reconcile the first applied revision with the form's owner requirement for lóculos.
          const [grave] = await tx.select().from(cemeteryGraves).where(eq(cemeteryGraves.id, id(`grave:${index}`)));
          if (grave.graveType === "GAVETA" && grave.ownerTaxpayerId === null && grave.lotId === lotId) {
            await tx.execute(sql`INSERT INTO "MunicipalPresentationRevision" (id,"tableName","recordId","columnName","previousValue","currentValue") VALUES (${randomUUID()},'TaxGrave',${grave.id},'ownerTaxpayerId',NULL,${ownerId})`);
            await tx.update(cemeteryGraves).set({ ownerTaxpayerId: ownerId }).where(eq(cemeteryGraves.id, grave.id));
            report.changes.push({ table: "TaxGrave", id: grave.id, operation: "UPDATE:ownerTaxpayerId" });
          }
        }

        for (const [code, name, issRate] of [["01.01", "Análise e desenvolvimento de sistemas", "2.00"], ["01.07", "Suporte técnico em informática", "2.00"], ["17.01", "Assessoria e consultoria administrativa", "3.00"]]) {
          const existing = (await tx.execute<{ id: string }>(sql`SELECT id FROM "TaxServiceActivity" WHERE "taxId"='tax_issqn' AND code=${code}`)).rows;
          if (existing.length) continue;
          const activity = await configureTaxServiceActivity(connection, { usuarioId: actor.id, employeeId: context.user.employeeId }, { taxId: "tax_issqn", code, name, issRate });
          record("TaxServiceActivity", [{ id: activity.id }]);
        }
        const portalUnit = "aurora-system-v1:budget-unit:000";
        const currentContents = await ownPortalContents(tx, "THIAGO_MORCATTY_DEMO_2026_V1:employee");
        for (const [title, address, hours] of [["Atendimento de Gestão de Pessoas", "Centro Administrativo — Rua das Acácias, 150", "Segunda a sexta, das 8h às 12h e das 13h às 17h"], ["Apoio de Tecnologia da Informação", "Centro Administrativo — sala de suporte", "Segunda a sexta, das 8h às 17h"]]) {
          if (currentContents.some(row => row.data.kind === "LOCAL" && row.data.title === title && row.data.budgetUnitId === portalUnit)) continue;
          const contentId = await savePortalContent(context, { kind: "LOCAL", title, budgetUnitId: portalUnit, address, hours, contact: "Atendimento presencial no Centro Administrativo" });
          report.portalContents.push(contentId);
          record("HrIntegrationEvent", [{ id: contentId }]);
        }

        // Use canonical fleet mutations so maintenance, expenses and audit stay linked.
        const fleet = async (key: string, input: Record<string, unknown>) => {
          const hash = createHash("sha256").update(id(key)).digest("hex");
          const requestId = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
          const result = await mutateFleetInTransaction(tx, context, { requestId, ...input });
          if (!result.repeated) report.changes.push({ table: result.type, id: result.id, operation: String(input.kind) });
          return result;
        };
        for (let index = 0; index < 3; index++) {
          const [unit] = await tx.select().from(fleetUnits).where(eq(fleetUnits.id, `aurora-mg-50k-v1:fleet:00${index}`));
          assert.ok(unit?.departmentId);
          await fleet(`route:${index}`, { kind: "route", data: { code: `ROT-2026-${8201 + index}`, name: ["Centro Administrativo — unidades municipais", "Centro — comunidade Vale Verde", "Centro — Jardim das Acácias"][index], origin: "Garagem Municipal", destination: ["Unidades administrativas", "Comunidade Vale Verde", "Jardim das Acácias"][index], itinerary: "Garagem Municipal, Centro Administrativo, unidade de destino e retorno pela via principal.", departmentId: unit.departmentId, active: "true" } });
          const plan = await fleet(`plan:${index}`, { kind: "plan", data: { unitId: unit.id, title: "Revisão de óleo, filtros e itens de segurança", type: "PREVENTIVA", services: "Troca de óleo e filtro; inspeção de freios, iluminação e pneus.", firstDueAt: index === 0 ? "2026-11-06" : "2026-11-16", intervalDays: "180", estimatedCost: "420.00" } });
          const order = await fleet(`order:${index}`, { kind: "generateOrder", planId: plan.id, scheduledAt: index === 0 ? "2026-11-06" : "2026-11-16" });
          if (index === 0) {
            await fleet("order-started", { kind: "startOrder", orderId: order.id });
            await fleet("order-completed", { kind: "completeOrder", data: { orderId: order.id, completedAt: "2026-11-06", performed: "Óleo e filtro substituídos; freios, iluminação e pneus inspecionados.", result: "Veículo liberado para utilização.", actualCost: "398.00", reference: "OS-GAR-2026-8201" } });
          }
          await fleet(`consumption:${index}`, { kind: "consumption", data: { unitId: unit.id, type: "COMBUSTIVEL", origin: "TERCEIRO", occurredAt: "2026-11-06", material: "Gasolina comum", quantity: String(25 + index * 5), measurementUnit: "L", cost: String(155 + index * 31), stockMode: "LOCAL", reference: `AB-2026-${8201 + index}` } });
          await fleet(`insurance:${index}`, { kind: "document", data: { unitId: unit.id, kind: "SEGURO", type: "FACULTATIVO", title: "Cobertura compreensiva do veículo", reference: `AP-2026-${8201 + index}`, startsAt: "2026-11-01", dueAt: "2027-10-31", value: "2450.00" } });
          await fleet(`occurrence:${index}`, { kind: "occurrence", data: { unitId: unit.id, type: "OUTRO", occurredAt: "2026-11-06", description: "Conferência de equipamentos de segurança e atualização da ficha do veículo.", reference: `VIST-2026-${8201 + index}` } });
        }

        const holders = (await tx.execute<{ contractId: string; employeeId: string; name: string }>(sql`SELECT c.id "contractId",c."employeeId",e.name FROM "HrEmploymentContract" c JOIN "Employee" e ON e.id=c."employeeId" WHERE c.details->>'seedPackage'='RH_PORTAL_2026_V1' AND c.status='ATIVO' ORDER BY c.id LIMIT 2`)).rows;
        assert.equal(holders.length, 2);
        for (const [index, holder] of holders.entries()) {
          const key = id(`functional-assignment:${index}`);
          if ((await tx.execute(sql`SELECT id FROM "HrFunctionalRecord" WHERE key=${key}`)).rows.length) continue;
          const saved = await saveFunctionalRecord(connection, context, { kind: "CESSAO", key, name: `Cooperação administrativa — ${holder.name}`, contractId: holder.contractId, employeeId: holder.employeeId, startsAt: "2027-02-01", endsAt: "2027-03-31", status: "ATIVO", data: { direction: "CEDIDO", origin: "Prefeitura Municipal de Vereda das Auroras", destination: "Consórcio de Serviços das Veredas", payer: "ORIGEM", payPercentage: "100", affectedCodes: "VENCIMENTO", vacation: "SIM", thirteenth: "SIM", ats: "SIM", retirement: "SIM", progression: "SIM", serviceAward: "CONTAR", legalReference: source } });
          record("HrFunctionalRecord", [{ id: saved.id }]);
        }
        if (!(await tx.execute(sql`SELECT id FROM "HrReferenceRecord" WHERE kind='LICENCA_EDUCACAO' AND code='LIC-EDU-2026-01'`)).rows.length) {
          const saved = await saveReferenceRecord(tx, undefined, { kind: "LICENCA_EDUCACAO", code: "LIC-EDU-2026-01", name: "Afastamento para formação pedagógica", details: { maximumDays: "5", legalReference: source } });
          record("HrReferenceRecord", [{ id: saved.id }]);
        }
        const [set] = (await tx.execute<{ id: string }>(sql`SELECT id FROM "HrPayrollRuleSet" WHERE code='RH_POC_DOCUMENTAL_2026_V1' AND status='ATIVA'`)).rows;
        assert.ok(set);
        const [route] = (await tx.execute<{ processTypeId: string; subjectId: string }>(sql`SELECT t.id "processTypeId",s.id "subjectId" FROM "ProcessType" t JOIN "Subject" s ON s."processTypeId"=t.id LEFT JOIN "Department" d ON d.id=coalesce(s."initialDepartmentId",t."initialDepartmentId") WHERE t."isActive" AND t."allowsInternalOpening" AND s."isActive" AND s."allowsInternalOpening" AND (d.id IS NULL OR d."isActive" AND d."secretariatId"='aurora-system-v1:secretariat:000') ORDER BY t.id,s.id LIMIT 1`)).rows;
        assert.ok(route, "Roteiro interno compatível com a UG de pessoal não encontrado.");
        for (const [code, name, operation] of [["PORTAL_SERVICO_ORIENTACAO_RH", "Orientação cadastral e funcional", "SOLICITACAO_RH"], ["PORTAL_SERVICO_PROGRAMACAO_FERIAS", "Solicitação de programação de férias", "FERIAS"], ["PORTAL_SERVICO_REVISAO_PONTO", "Solicitação de revisão do ponto", "AJUSTE_PONTO"]]) {
          if ((await tx.execute(sql`SELECT id FROM "HrPayrollRule" WHERE "ruleSetId"=${set.id} AND code=${code}`)).rows.length) continue;
          const saved = await saveFunctionalService(context, { ruleSetId: set.id, code, name, description: "Encaminhamento da solicitação do servidor para análise da equipe de Gestão de Pessoas.", requirements: "Vínculo funcional ativo e informações do pedido.", steps: "Preencher, conferir e encaminhar para análise do setor.", deadline: "Acompanhamento pelo protocolo funcional.", isActive: true, configuration: { budgetUnitId: portalUnit, group: "Gestão de Pessoas", processTypeId: route.processTypeId, subjectId: route.subjectId, operation, employeeIds: [], fields: [], requiredDocuments: [], acceptance: "Confirmo as informações do pedido." } }, connection);
          record("HrPayrollRule", [{ id: saved }]);
        }

        // Reviewed empty catalogs: legal text drafts and operational orders.
        for (const [number, summary, content] of [
          ["MINUTA-ADM-2026-01", "Organização do atendimento no Centro Administrativo", "Minuta para análise: estabelecer canais de atendimento, orientação cadastral e encaminhamento aos setores responsáveis. Texto em elaboração, sem publicação ou vigência."],
          ["MINUTA-TI-2026-01", "Diretrizes de uso dos recursos de tecnologia da informação", "Minuta para análise: orientar o uso dos equipamentos, a abertura de chamados e a conservação dos recursos municipais. Texto em elaboração, sem publicação ou vigência."],
        ]) {
          if ((await tx.select({ id: legalTexts.id }).from(legalTexts).where(eq(legalTexts.number, number))).length) continue;
          const saved = await saveLegalText(tx, null, { type: "Minuta de instrução normativa", number, summary, governmentLevel: "MUNICIPAL", issuingBody: "Prefeitura Municipal de Vereda das Auroras", publicationDate: null, effectiveFrom: null, effectiveUntil: null, governmentEntityId: null }, content);
          await tx.update(legalTexts).set({ status: "RASCUNHO" }).where(eq(legalTexts.id, saved));
          record("LegalText", [{ id: saved }]);
        }
        for (const [code, title, type, category] of [
          ["OS-2026-8301", "Revisão dos rádios de comunicação da equipe", "Reparo de Radio", "Ordem de Servico"],
          ["OS-2026-8302", "Conferência dos cones e barreiras de sinalização", "Vistoria de Equipamento", "Ordem de Servico"],
          ["EQ-2026-8301", "Kit de sinalização para apoio em eventos comunitários", "Vistoria de Equipamento", "Equipamento"],
        ]) {
          if ((await tx.select({ id: mobilityRecords.id }).from(mobilityRecords).where(eq(mobilityRecords.codigo, code))).length) continue;
          await saveSecurityItem(tx, "registro", { code, title, type, category, status: "Aberta", isActive: true, date: "2026-11-06T12:00:00Z", location: "Base de Apoio Operacional", responsible: "Equipe de Apoio Operacional", priority: "Normal", description: `${title}. ${source}` });
          record("SegurancaMobilidadeRegistro", await tx.select({ id: mobilityRecords.id }).from(mobilityRecords).where(eq(mobilityRecords.codigo, code)));
        }
        const courseCode = "PORTAL_CURSO_ATENDIMENTO_DIGITAL_2026";
        let [course] = (await tx.execute<{ id: string }>(sql`SELECT id FROM "HrPayrollRule" WHERE "ruleSetId"=${set.id} AND code=${courseCode}`)).rows;
        if (!course) {
          const courseId = await saveCareerPolicy(context, { ruleSetId: set.id, code: courseCode, name: "Atendimento digital e organização do serviço público", isActive: true, value: { origin: "CAPACITACAO_FUNCIONAL", budgetUnitId: portalUnit, employeeIds: ["THIAGO_MORCATTY_DEMO_2026_V1:employee"], enrollmentStartsAt: "2026-11-01T00:00:00-03:00", enrollmentEndsAt: "2026-11-30T17:00:00-03:00", startsAt: "2026-12-02T08:00:00-03:00", endsAt: "2026-12-02T12:00:00-03:00", capacity: 20, hours: 4, minAttendancePercentage: 75, location: "Centro Administrativo — sala de capacitação", issuerName: "Prefeitura Municipal de Vereda das Auroras", instructions: "Programação de apresentação: acolhimento, organização dos pedidos e utilização dos canais digitais. Inscrição de servidor para acompanhamento da atividade." } }, connection);
          course = { id: courseId }; record("HrPayrollRule", [course]);
        }
        if (!(await tx.execute(sql`SELECT id FROM "HrPortalRequest" WHERE "requestKey"=${`PORTAL:CURSO:${course.id}:THIAGO_MORCATTY_DEMO_2026_V1:employee`}`)).rows.length) {
          const requestId = await enrollOwnCourse(context, { courseId: course.id }, connection);
          record("HrPortalRequest", [{ id: requestId }]);
        }
        if (report.changes.length) await tx.insert(financialAuditLogs).values({ action: "CHECKUP_PRESENTATION_DATA_REPAIRED", entityType: "DATASET", entityId: packageId, authorUsuarioId: actor.id, payload: { fictional: true, source, changes: report.changes } });
        if (!apply) throw rollback;
      }), { timeoutMs: 180000 });
    } catch (error) { if (error !== rollback) throw error; }
    mkdirSync("docs/checkup/demonstration-data", { recursive: true });
    writeFileSync(`docs/checkup/demonstration-data/${apply ? "applied" : "preview"}-${Date.now()}.json`, JSON.stringify(report, null, 2) + "\n");
    console.log(JSON.stringify({ packageId, mode: report.mode, changes: report.changes.length, byTable: report.changes.reduce<Record<string, number>>((counts, row) => ({ ...counts, [row.table]: (counts[row.table] ?? 0) + 1 }), {}), portalContents: report.portalContents.length }, null, 2));
  } finally { await connection.pool.end(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
