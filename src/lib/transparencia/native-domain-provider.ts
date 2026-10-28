import "server-only";
import { createHash } from "node:crypto";
import { and, asc, desc, eq, gte, inArray, isNull, lt, lte, sql } from "drizzle-orm";
import { Decimal } from "@/db/decimal";
import type { DatabaseExecutor } from "@/db/transaction";
import type { TransparencyNativeBinding } from "@/lib/contracts/transparency";
import { transparencyPublications } from "@/db/schema/transparency";
import { costCenters } from "@/db/schema/master-data";
import { employees, roles, departments } from "@/db/schema/administration";
import { hrEmploymentContracts, hrEmploymentRevisions, hrPayrollStatements, hrPayrollRuns, payrolls, hrPortalRequests } from "@/db/schema/personnel-workforce";
import { hrPayrollRuleSets, hrPayrollRules, hrEmploymentRegimes } from "@/db/schema/personnel-configuration";
import { listEmploymentContracts } from "@/db/repositories/personnel/workforce";
import { planningEntityUnits } from "@/db/schema/planning-catalog";
import { publicCommitments, publicBudgetReservations, publicPayments, publicSettlements } from "@/db/schema/transparency-financial";
import { expenses } from "@/db/schema/finance-expenses";
import { purchaseReceipts, purchaseReceiptItems } from "@/db/schema/procurement-requests";
import { procurementContracts } from "@/db/schema/procurement-core";
import { suppliers, companies, taxpayers } from "@/db/schema/registry";
import { people } from "@/db/schema/people";
import { assets, assetCategories, assetValueHistories } from "@/db/schema/assets";
import { warehouses, materialStocks, materialMovements, materials } from "@/db/schema/assets-stock";
import { infrastructureWorks, infrastructureMeasurements } from "@/db/schema/infrastructure";
import { publicFleetUnits, publicCovenants, publicInstrumentInstallments, publicBenefitRules, publicBenefitGrants } from "@/db/schema/transparency-sources";
import { healthRegulationRequests } from "@/db/schema/health-regulation";
import { healthSpecialties, healthServices } from "@/db/schema/health-administration";
import { preEnrollmentProcesses, preEnrollments } from "@/db/schema/education-admissions";
import { schools } from "@/db/schema/education-core";
import { officialDiaries } from "@/db/schema/portal-content";
import { positionPlanSchema, positionContractSegments, assessPositionPlan } from "@/lib/rh/position-plan";
import { resolveContractRevision } from "@/lib/rh/contract-timeline";
import { nativePublicDetailsSchema, nativeSourceCollections, type NativeSourceType } from "./native-binding-policy";
import type { PublicRecord, TransparencyQuery } from "./query-contract";
import type { TransparencySettings } from "./presentation-settings";

const iso = (value: Date | null | undefined) => value?.toISOString().slice(0, 10) || null;
const money = (value: ConstructorParameters<typeof Decimal>[0] | null | undefined) => value === null || value === undefined ? null : new Decimal(value).toFixed(2);
const required = <T>(rows: T[]) => { if (!rows.length) throw new Error("Registro da fonte não encontrado."); return rows[0]; };
const range = (year: number) => ({ gte: new Date(Date.UTC(year, 0, 1)), lt: new Date(Date.UTC(year + 1, 0, 1)) });
const publicKey = (binding: TransparencyNativeBinding, natural: string) => createHash("sha256").update(`${binding.publicKey}:${natural}`).digest("hex").slice(0, 40);
const plain = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const string = (value: unknown) => typeof value === "string" ? value : null;

export async function readNativePublicBinding(db: DatabaseExecutor, binding: TransparencyNativeBinding, entity: "prefeitura" | "camara", query: TransparencyQuery, settings: TransparencySettings): Promise<PublicRecord[]> {
  const type = binding.sourceType as NativeSourceType;
  if (!nativeSourceCollections[type] || !(nativeSourceCollections[type] as readonly string[]).includes(binding.collectionSlug)) throw new Error("Vínculo de fonte nativa inválido.");
  const details = nativePublicDetailsSchema.parse(binding.details), records: PublicRecord[] = [];
  let nativeUpdatedAt=binding.updatedAt.toISOString();
  const attachmentRows = await db.select({ publicKey: transparencyPublications.publicKey, title: transparencyPublications.title }).from(transparencyPublications).where(and(inArray(transparencyPublications.publicKey, details.attachments), eq(transparencyPublications.status, "PUBLISHED"), eq(transparencyPublications.entity, entity), eq(transparencyPublications.year, query.year)));
  const links = attachmentRows.map(row => ({ title: row.title, url: `/api/transparencia/publicacoes/${row.publicKey}` }));
  const emit = (natural: string, values: PublicRecord["values"], extra: Pick<PublicRecord, "events" | "items"> = {}) => records.push({ key: publicKey(binding, natural), entity, year: query.year, values: { ...values,nativeUpdatedAt, sourceReference: binding.sourceReference, legalReference: values.legalReference ?? details.legalReference ?? null }, links, ...extra });
  const checkEntity = async (costCenterId: string | null | undefined) => {
    if (!costCenterId) return;
    const center = required(await db.select({ governmentEntityId: costCenters.governmentEntityId }).from(costCenters).where(eq(costCenters.id, costCenterId)).limit(1));
    if (center.governmentEntityId && center.governmentEntityId !== binding.governmentEntityId) throw new Error("Fonte nativa pertence a outra entidade.");
  };
  const until = new Date(Math.min(query.until?new Date(`${query.until}T23:59:59.999Z`).getTime():new Date(Date.UTC(query.year + 1, 0, 1)).getTime() - 1, Date.now()));
  if (type === "EMPLOYMENT_CONTRACT" || type === "PAYROLL_STATEMENT") {
    if (!settings.nativePersonnelPublication) throw new Error("Habilite a publicação nominal nativa na configuração da Transparência.");
    const statementRow = type === "PAYROLL_STATEMENT" ? required(await db.select({ statement: { contractId: hrPayrollStatements.contractId, gross: hrPayrollStatements.gross, releaseAt: hrPayrollStatements.releaseAt, revokedAt: hrPayrollStatements.revokedAt }, run: { mode: hrPayrollRuns.mode, scope: hrPayrollRuns.scope, status: hrPayrollRuns.status, cancelledAt: hrPayrollRuns.cancelledAt }, payroll: { competence: payrolls.competence, type: payrolls.type } }).from(hrPayrollStatements).innerJoin(hrPayrollRuns, eq(hrPayrollRuns.id, hrPayrollStatements.runId)).innerJoin(payrolls, eq(payrolls.id, hrPayrollRuns.payrollId)).where(eq(hrPayrollStatements.id, binding.sourceId)).limit(1)) : null;
    const statement = statementRow ? { ...statementRow.statement, run: { ...statementRow.run, payroll: statementRow.payroll } } : null;
    if (statement && (statement.revokedAt || !statement.releaseAt || statement.releaseAt > new Date() || statement.run.cancelledAt || statement.run.mode !== "OFICIAL" || statement.run.scope !== "PRODUCAO" || statement.run.status !== "FECHADA")) return [];
    const competence = statement?.run.payroll.competence || query.filters.competence || `${String(until.getUTCMonth() + 1).padStart(2, "0")}/${query.year}`;
    if (!/^\d{2}\/\d{4}$/.test(competence) || Number(competence.slice(3)) !== query.year) return [];
    const asOf = new Date(Date.UTC(query.year, Number(competence.slice(0, 2)), 0, 23, 59, 59));
    const storedRow = required(await db.select({ contract: hrEmploymentContracts, employee: { name: employees.name } }).from(hrEmploymentContracts).innerJoin(employees, eq(employees.id, hrEmploymentContracts.employeeId)).where(eq(hrEmploymentContracts.id, statement?.contractId || binding.sourceId)).limit(1));
    const stored = { ...storedRow.contract, employee: storedRow.employee, revisions: await db.select().from(hrEmploymentRevisions).where(eq(hrEmploymentRevisions.contractId, storedRow.contract.id)) };
    nativeUpdatedAt=stored.updatedAt.toISOString();
    if (stored.admittedAt > asOf) return [];
    const contract = stored.revisions.length ? resolveContractRevision(stored, stored.revisions, { start: asOf, end: asOf }).contract : stored;
    await checkEntity(contract.costCenterId);
    const [roleRows, regimeRows] = await Promise.all([db.select({ name: roles.name }).from(roles).where(eq(roles.id, contract.roleId)).limit(1), db.select({ name: hrEmploymentRegimes.name, employmentNature: hrEmploymentRegimes.employmentNature, ruleSet: { scope: hrPayrollRuleSets.scope, isDemo: hrPayrollRuleSets.isDemo } }).from(hrEmploymentRegimes).innerJoin(hrPayrollRuleSets, eq(hrPayrollRuleSets.id, hrEmploymentRegimes.ruleSetId)).where(eq(hrEmploymentRegimes.id, contract.regimeId)).limit(1)]);
    const role = roleRows[0], regime = regimeRows[0];
    if(regime?.ruleSet.scope!=="PRODUCAO"||regime.ruleSet.isDemo)return [];
    emit(`${contract.registration}:${competence}:${statement?.run.payroll.type || "vinculo"}`, { name: stored.employee.name, registration: contract.registration, role: role?.name || null, unit: contract.workLocation, regime: regime?.name || null, type: regime?.employmentNature || null, class: contract.salaryLevel, monthlyHours: contract.monthlyHours, weeklyHours: details.weeklyHours ?? null, workSchedule: details.workSchedule || null, date: iso(contract.admittedAt), competence, competenceDate: `${query.year}-${competence.slice(0, 2)}-01`, terminationDate: iso(contract.endsAt), terminationReason: details.terminationReason || null, retirementType: details.retirementType || null, cededTo: details.cededTo || null, status: contract.status === "ATIVO" ? "Ativo" : contract.status, value: statement ? money(statement.gross) : null, baseSalary: money(contract.salary), payrollType: statement?.run.payroll.type || null });
  } else if (type === "POSITION_PLAN") {
    const ruleRow = required(await db.select({ rule: hrPayrollRules, ruleSet: hrPayrollRuleSets }).from(hrPayrollRules).innerJoin(hrPayrollRuleSets, eq(hrPayrollRuleSets.id, hrPayrollRules.ruleSetId)).where(eq(hrPayrollRules.id, binding.sourceId)).limit(1));
    const rule = { ...ruleRow.rule, ruleSet: ruleRow.ruleSet };
    nativeUpdatedAt=rule.updatedAt.toISOString();
    if (rule.code !== "QUADRO_CARGOS" || !rule.isActive || rule.ruleSet.scope !== "PRODUCAO" || rule.ruleSet.isDemo || !rule.ruleSet.approvedAt) return [];
    const plan = positionPlanSchema.parse(rule.value), centers = await db.select({ id: costCenters.id }).from(costCenters).where(eq(costCenters.governmentEntityId, binding.governmentEntityId));
    const regimes = await db.select({ id: hrEmploymentRegimes.id }).from(hrEmploymentRegimes).where(eq(hrEmploymentRegimes.ruleSetId, rule.ruleSetId));
    const contracts = await listEmploymentContracts(db, inArray(hrEmploymentContracts.costCenterId, centers.map(center => center.id)));
    const assessed = assessPositionPlan(plan, contracts.flatMap(contract => positionContractSegments(contract, contract.revisions)), regimes.map(regime => regime.id), { start: until, end: until });
    const roleRows = await db.select({ id: roles.id, name: roles.name }).from(roles).where(inArray(roles.id, plan.periods.flatMap(period => period.roles.map(role => role.roleId))));
    for (const row of assessed) {
      const role = plan.periods.find(period => period.startsAt === row.startsAt)!.roles.find(role => role.roleId === row.roleId)!;
      if (binding.collectionSlug === "vagas") emit(`${row.roleId}:${row.startsAt}`, { number: row.roleId.slice(-8), role: roleRows.find(role => role.id === row.roleId)?.name || null, date: iso(until), type: role.classification, created: row.authorized, occupied: row.peakOccupied, available: row.minimumAvailable, legalReference: role.legalReference });
      else for (const level of role.levels) emit(`${row.roleId}:${row.startsAt}:${level.code}`, { number: level.code, role: roleRows.find(role => role.id === row.roleId)?.name || null, date: row.startsAt, class: level.code, type: role.classification, monthlyHours: level.monthlyHours, weeklyHours: null, value: money(level.salary), legalReference: role.legalReference });
    }
  } else if (type === "TRAVEL_REQUEST" || type === "ADVANCE_REQUEST") {
    const row = required(await db.select({ kind: hrPortalRequests.kind, status: hrPortalRequests.status, payload: hrPortalRequests.payload, decidedAt: hrPortalRequests.decidedAt, employeeId: hrPortalRequests.employeeId }).from(hrPortalRequests).where(eq(hrPortalRequests.id, binding.sourceId)).limit(1));
    const employee = required(await db.select({ name: employees.name, role: { name: roles.name } }).from(employees).leftJoin(roles, eq(roles.id, employees.roleId)).where(eq(employees.id, row.employeeId)).limit(1));
    const payload = plain(row.payload), input = plain(payload.input), assessment = plain(payload.assessment), policy = plain(payload.policy);
    if (payload.scope !== "PRODUCAO" || row.status !== "DEFERIDA") return [];
    const unit = typeof input.budgetUnitId === "string" ? (await db.select().from(planningEntityUnits).where(eq(planningEntityUnits.budgetUnitId, input.budgetUnitId)).limit(1))[0] : null;
    if (!unit || unit.governmentEntityId !== binding.governmentEntityId) throw new Error("Diária/adiantamento sem entidade compatível.");
    const date = string(input.departureAt) || iso(row.decidedAt); if (!date || new Date(date).getUTCFullYear() !== query.year) return [];
    const commitments = await db.select({ id: publicCommitments.id, number: publicCommitments.number }).from(publicCommitments).innerJoin(publicBudgetReservations, eq(publicBudgetReservations.id, publicCommitments.reservationId)).innerJoin(expenses, eq(expenses.id, publicBudgetReservations.expenseId)).where(and(eq(expenses.sourceModule, "RH"), eq(expenses.sourceId, binding.sourceId)));
    const payments = commitments.length ? await db.select({ valueDecimal: publicPayments.valueDecimal }).from(publicPayments).where(and(inArray(publicPayments.commitmentId, commitments.map(row => row.id)), eq(publicPayments.status, "Paga"))) : [];
    const paid = payments.reduce((sum, entry) => sum.add(entry.valueDecimal || 0), new Decimal(0));
    emit(binding.sourceId, { number: binding.sourceId.slice(-8), date: date.slice(0, 10), endDate: string(input.returnAt)?.slice(0, 10) || null, beneficiary: employee.name, role: employee.role?.name || null, destination: string(input.destination), description: string(input.purpose), quantity: string(assessment.quantity), unitPrice: money(string(assessment.unitValue)), value: money(string(assessment.amountBRL)), paid: money(paid), status: paid.gt(0) ? "Pago" : "Autorizado", type: type === "TRAVEL_REQUEST" ? "Diária" : "Adiantamento", commitment: commitments.map(row => row.number).join(", ") || null, legalReference: string(policy.legalReference), currency: string(assessment.currency), exchangeRate: string(assessment.exchangeRate) });
  } else if (type === "PURCHASE_RECEIPT") {
    const receiptRow = required(await db.select({ receipt: purchaseReceipts, contract: { number: procurementContracts.number, sourceBudgetUnitId: procurementContracts.sourceBudgetUnitId }, company: { corporateName: companies.corporateName }, person: { fullName: people.fullName }, commitment: { id: publicCommitments.id, number: publicCommitments.number } }).from(purchaseReceipts).innerJoin(procurementContracts, eq(procurementContracts.id, purchaseReceipts.contractId)).innerJoin(suppliers, eq(suppliers.id, procurementContracts.supplierId)).leftJoin(companies, eq(companies.id, suppliers.companyId)).leftJoin(people, eq(people.id, suppliers.personId)).leftJoin(publicCommitments, eq(publicCommitments.purchaseReceiptId, purchaseReceipts.id)).where(eq(purchaseReceipts.id, binding.sourceId)).limit(1));
    const items = await db.select({ id: purchaseReceiptItems.id, quantity: purchaseReceiptItems.quantity, unitCost: purchaseReceiptItems.unitCost, material: { name: materials.name } }).from(purchaseReceiptItems).innerJoin(materials, eq(materials.id, purchaseReceiptItems.materialId)).where(eq(purchaseReceiptItems.purchaseReceiptId, binding.sourceId));
    const settlements = receiptRow.commitment ? await db.select({ documentId: publicSettlements.documentId, fiscalDocumentNumber: publicSettlements.fiscalDocumentNumber, fiscalDocumentSeries: publicSettlements.fiscalDocumentSeries }).from(publicSettlements).where(eq(publicSettlements.commitmentId, receiptRow.commitment.id)) : [];
    const row = { ...receiptRow.receipt, items, contract: { ...receiptRow.contract, supplier: { company: receiptRow.company, person: receiptRow.person } }, commitment: receiptRow.commitment ? { ...receiptRow.commitment, settlements } : null };
    nativeUpdatedAt=row.updatedAt.toISOString();
    if (row.status !== "APPROVED" || row.receivedAt.getUTCFullYear() !== query.year) return [];
    if (row.contract.sourceBudgetUnitId) { const [scope] = await db.select().from(planningEntityUnits).where(eq(planningEntityUnits.budgetUnitId, row.contract.sourceBudgetUnitId)).limit(1); if (scope?.governmentEntityId !== binding.governmentEntityId) throw new Error("Compra vinculada a outra entidade."); }
    const invoice=row.commitment?.settlements.find(entry=>entry.documentId===row.documentId);
    for (const item of row.items) emit(item.id, { number: row.number, date: iso(row.receivedAt), name: item.material.name, beneficiary: row.contract.supplier.company?.corporateName || row.contract.supplier.person?.fullName || null, quantity: item.quantity, unitPrice: String(item.unitCost), value: money(new Decimal(item.unitCost).mul(item.quantity)), commitment: row.commitment?.number || null, contractNumber: row.contract.number, status: row.status, invoice: invoice?.fiscalDocumentNumber||null,invoiceSeries:invoice?.fiscalDocumentSeries||null });
  } else if (type === "ASSET") {
    const assetRow = required(await db.select({ asset: assets, category: { name: assetCategories.name }, department: { name: departments.name } }).from(assets).innerJoin(assetCategories, eq(assetCategories.id, assets.categoryId)).leftJoin(departments, eq(departments.id, assets.departmentId)).where(eq(assets.id, binding.sourceId)).limit(1));
    const valueHistory = await db.select({ closingValue: assetValueHistories.closingValue, referenceMonth: assetValueHistories.referenceMonth }).from(assetValueHistories).where(and(eq(assetValueHistories.assetId, binding.sourceId), lte(assetValueHistories.referenceMonth, until))).orderBy(desc(assetValueHistories.referenceMonth)).limit(1);
    const row = { ...assetRow.asset, category: assetRow.category, department: assetRow.department, valueHistory };
    nativeUpdatedAt=row.updatedAt.toISOString();
    if (row.acquisitionDate > until) return [];
    emit(row.patrimonyNumber, { number: row.patrimonyNumber, name: row.name, type: row.category.name, unit: row.department?.name || null, date: iso(row.acquisitionDate), status: row.status, quantity: 1, value: money(row.valueHistory[0]?.closingValue ?? row.acquisitionValue), acquisitionValue: money(row.acquisitionValue), valuationReference: iso(row.valueHistory[0]?.referenceMonth)||iso(row.acquisitionDate) });
  } else if (type === "FLEET_UNIT") {
    const fleetRow = required(await db.select({ unit: publicFleetUnits, asset: { currentValue: assets.currentValue } }).from(publicFleetUnits).leftJoin(assets, eq(assets.id, publicFleetUnits.assetId)).where(eq(publicFleetUnits.id, binding.sourceId)).limit(1));
    const row = { ...fleetRow.unit, asset: fleetRow.asset };
    if (row.createdAt > until) return [];
    emit(row.code, { number: row.code, name: row.name, type: row.category, status: row.status, date: iso(row.createdAt), quantity: 1, value: money(row.asset?.currentValue), plate: row.plate, brand: row.brand, model: row.model, manufactureYear: row.year });
  } else if (type === "WAREHOUSE") {
    const warehouse = required(await db.select({ name: warehouses.name, costCenterId: warehouses.costCenterId }).from(warehouses).where(eq(warehouses.id, binding.sourceId)).limit(1)); await checkEntity(warehouse.costCenterId);
    if(binding.collectionSlug==="medicamentos"){
      if(query.year!==new Date().getUTCFullYear())throw new Error("Estoque corrente não representa histórico de outro exercício; consulte os documentos preservados.");
      const stocks=await db.select({id:materialStocks.id,quantity:materialStocks.quantity,blockedAt:materialStocks.blockedAt,expirationDate:materialStocks.expirationDate,updatedAt:materialStocks.updatedAt,material:{code:materials.code,name:materials.name,unitOfMeasure:materials.unitOfMeasure}}).from(materialStocks).innerJoin(materials,eq(materials.id,materialStocks.materialId)).where(and(eq(materialStocks.warehouseId,binding.sourceId),sql`EXISTS(SELECT 1 FROM "Medicine" medicine WHERE medicine."materialId"=${materials.id})`)).orderBy(asc(materialStocks.id)).limit(20001);if(stocks.length>20000)throw new Error("Estoque público acima do limite.");
      for(const stock of stocks){nativeUpdatedAt=stock.updatedAt.toISOString();emit(stock.id,{number:stock.material.code,name:stock.material.name,unit:warehouse.name,quantity:stock.quantity,unitOfMeasure:stock.material.unitOfMeasure,date:iso(stock.updatedAt),status:stock.blockedAt?"Bloqueado":stock.expirationDate&&stock.expirationDate<new Date()?"Vencido":"Disponível"});}return records;
    }
    const period={gte:new Date(Math.max(range(query.year).gte.getTime(),query.from?new Date(`${query.from}T00:00:00Z`).getTime():0)),lt:new Date(Math.min(range(query.year).lt.getTime(),query.until?new Date(`${query.until}T00:00:00Z`).getTime()+86400000:Infinity))};
    const rows = await db.select({ id: materialMovements.id, type: materialMovements.type, operation: materialMovements.operation, quantity: materialMovements.quantity, unitValue: materialMovements.unitValue, date: materialMovements.date, updatedAt: materialMovements.updatedAt, material: { code: materials.code, name: materials.name, unitOfMeasure: materials.unitOfMeasure } }).from(materialMovements).innerJoin(materials, eq(materials.id, materialMovements.materialId)).where(and(eq(materialMovements.warehouseId, binding.sourceId), gte(materialMovements.date, period.gte), lt(materialMovements.date, period.lt))).orderBy(asc(materialMovements.date), asc(materialMovements.id)).limit(20001);
    if (rows.length > 20000) throw new Error("Movimentos de estoque acima do limite; restrinja o período.");
    for (const row of rows) emit(row.id, { number: row.material.code, name: row.material.name, unit: warehouse.name, type: row.type, status: row.operation, date: iso(row.date), quantity: row.quantity, unitOfMeasure: row.material.unitOfMeasure, unitPrice: money(row.unitValue), value: row.unitValue === null ? null : money(new Decimal(row.unitValue).mul(row.quantity)) });
  } else if (type === "WORK") {
    const work = required(await db.select().from(infrastructureWorks).where(eq(infrastructureWorks.id, binding.sourceId)).limit(1));
    const medicoes = await db.select().from(infrastructureMeasurements).where(and(eq(infrastructureMeasurements.obraId, binding.sourceId), eq(infrastructureMeasurements.active, true), gte(infrastructureMeasurements.data, range(query.year).gte), lt(infrastructureMeasurements.data, range(query.year).lt))).orderBy(asc(infrastructureMeasurements.data));
    const row = { ...work, medicoes };
    nativeUpdatedAt=row.updatedAt.toISOString();
    emit(row.numero, { number: row.numero, name: row.nome, description: row.descricao, location: row.local, type: row.tipo, status: row.status, date: details.startDate || iso(row.createdAt), endDate: details.endDate || null, inspector: details.inspector || null, progress: details.progress ?? null, value: money(row.valorEstimado), complementOrigin: "Cronograma/fiscal/itens complementados pela gestão com referência documental" }, { items: details.items.map(item => ({ ...item, total: new Decimal(item.quantity).mul(item.unitPrice).toFixed(2) })), events: row.medicoes.map(entry => ({ stage: "Medição", number: String(entry.numero), date: iso(entry.data)!, value: money(entry.valorMedido)!, status: entry.status })) });
  } else if (type === "COVENANT") {
    const covenant = required(await db.select().from(publicCovenants).where(eq(publicCovenants.id, binding.sourceId)).limit(1));
    const installments = await db.select({ number: publicInstrumentInstallments.number, status: publicInstrumentInstallments.status, payment: { status: publicPayments.status, date: publicPayments.date, valueDecimal: publicPayments.valueDecimal } }).from(publicInstrumentInstallments).leftJoin(publicPayments, eq(publicPayments.id, publicInstrumentInstallments.paymentId)).where(eq(publicInstrumentInstallments.covenantId, binding.sourceId));
    const row = { ...covenant, installments };
    nativeUpdatedAt=row.updatedAt.toISOString();
    if (row.startDate > until || row.endDate < range(query.year).gte) return [];
    if (binding.collectionSlug === "convenios") emit(row.number, { number: row.number, beneficiary: row.grantor, description: row.description, date: iso(row.startDate), endDate: iso(row.endDate), status: row.status, value: money(row.totalValueDecimal), type: details.type || "Convênio" });
    else for (const installment of row.installments.filter(entry => entry.payment?.status === "Paga" && entry.payment.date.getUTCFullYear() === query.year)) emit(`${row.number}:${installment.number}`, { number: row.number, date: iso(installment.payment!.date), name: row.description, beneficiary: row.grantor, type: details.type || "Repasse vinculado", value: money(installment.payment!.valueDecimal), internalTransfer: details.internalTransfer, status: installment.status });
  } else if (type === "TAX_BENEFIT_RULE" || type === "TAX_BENEFIT_GRANT") {
    if (type === "TAX_BENEFIT_RULE") {
      const row = required(await db.select().from(publicBenefitRules).where(eq(publicBenefitRules.id, binding.sourceId)).limit(1));
      const grants = await db.select({ renunciationDecimal: publicBenefitGrants.renunciationDecimal }).from(publicBenefitGrants).where(and(eq(publicBenefitGrants.ruleId, binding.sourceId), eq(publicBenefitGrants.status, "CONCEDIDO"), gte(publicBenefitGrants.grantedAt, range(query.year).gte), lt(publicBenefitGrants.grantedAt, range(query.year).lt)));
      emit(`${row.code}:${query.year}`, { number: row.code, beneficiary: "Total agregado por benefício", type: row.benefitType, date: iso(row.effectiveFrom), legalReference: row.legalReference, value: money(grants.reduce((sum, grant) => sum.add(grant.renunciationDecimal), new Decimal(0))), name: row.name, status: row.active ? "Vigente" : "Inativo" });
    } else {
      const grantRow = required(await db.select({ grant: publicBenefitGrants, rule: { code: publicBenefitRules.code, benefitType: publicBenefitRules.benefitType, legalReference: publicBenefitRules.legalReference } }).from(publicBenefitGrants).innerJoin(publicBenefitRules, eq(publicBenefitRules.id, publicBenefitGrants.ruleId)).where(eq(publicBenefitGrants.id, binding.sourceId)).limit(1));
      const row = { ...grantRow.grant, rule: grantRow.rule };
      if (row.grantedAt.getUTCFullYear() !== query.year || row.status !== "CONCEDIDO") return [];
      const taxpayer = details.nominalPublication ? (await db.select({ person: { fullName: people.fullName }, company: { corporateName: companies.corporateName } }).from(taxpayers).leftJoin(people, eq(people.id, taxpayers.personId)).leftJoin(companies, eq(companies.id, taxpayers.companyId)).where(eq(taxpayers.id, row.taxpayerId)).limit(1))[0] : null;
      emit(binding.sourceId, { number: row.rule.code, beneficiary: taxpayer?.person?.fullName||taxpayer?.company?.corporateName || "Beneficiário não nominalizado nesta publicação", type: row.rule.benefitType, date: iso(row.grantedAt), legalReference: row.rule.legalReference, value: money(row.renunciationDecimal), status: row.status });
    }
  } else if(type==="HEALTH_REGULATION_SECTOR"){
    if(query.year!==new Date().getUTCFullYear())throw new Error("Fila corrente não substitui histórico de exercícios anteriores.");
    const rows=await db.select({id:healthRegulationRequests.id,createdAt:healthRegulationRequests.createdAt,updatedAt:healthRegulationRequests.updatedAt,priority:healthRegulationRequests.priority,status:healthRegulationRequests.status,specialty:{name:healthSpecialties.name},service:{name:healthServices.name}}).from(healthRegulationRequests).leftJoin(healthSpecialties,eq(healthSpecialties.id,healthRegulationRequests.specialtyId)).leftJoin(healthServices,eq(healthServices.id,healthRegulationRequests.serviceId)).where(and(eq(healthRegulationRequests.sectorId,binding.sourceId),inArray(healthRegulationRequests.status,["RECEBIDA","EM_ANALISE","AUTORIZADA"]))).orderBy(asc(healthRegulationRequests.createdAt),asc(healthRegulationRequests.id)).limit(20001);if(rows.length>20000)throw new Error("Fila acima do limite.");
    const rank:Record<string,number>={Alta:0,Media:1,Média:1,Normal:2};rows.sort((a,b)=>(rank[a.priority]??3)-(rank[b.priority]??3)||a.createdAt.getTime()-b.createdAt.getTime()||a.id.localeCompare(b.id));const positions=new Map<string,number>();
    for(const row of rows){const service=row.specialty?.name||row.service?.name||"Serviço não identificado",position=(positions.get(service)||0)+1;positions.set(service,position);nativeUpdatedAt=row.updatedAt.toISOString();emit(row.id,{number:publicKey(binding,`queue:${row.id}`).slice(0,12).toUpperCase(),name:service,position,type:row.priority,date:iso(row.createdAt),status:row.status});}
  } else if(type==="PRE_ENROLLMENT_PROCESS"){
    const process=required(await db.select({year:preEnrollmentProcesses.year,stage:preEnrollmentProcesses.stage,name:preEnrollmentProcesses.name,school:{name:schools.name}}).from(preEnrollmentProcesses).innerJoin(schools,eq(schools.id,preEnrollmentProcesses.schoolId)).where(eq(preEnrollmentProcesses.id,binding.sourceId)).limit(1));if(process.year!==query.year)return [];
    const rows=await db.select({id:preEnrollments.id,createdAt:preEnrollments.createdAt,updatedAt:preEnrollments.updatedAt,position:preEnrollments.position,rankingScore:preEnrollments.rankingScore,grade:preEnrollments.grade,shift:preEnrollments.shift,status:preEnrollments.status}).from(preEnrollments).where(and(eq(preEnrollments.processId,binding.sourceId),eq(preEnrollments.year,query.year),eq(preEnrollments.status,"Pendente"),isNull(preEnrollments.canceledAt))).orderBy(desc(preEnrollments.rankingScore),asc(preEnrollments.createdAt),asc(preEnrollments.id)).limit(20001);if(rows.length>20000)throw new Error("Fila acima do limite.");
    rows.forEach((row,index)=>{nativeUpdatedAt=row.updatedAt.toISOString();emit(row.id,{number:publicKey(binding,`queue:${row.id}`).slice(0,12).toUpperCase(),name:process.name,unit:process.school.name,type:`${process.stage} · ${row.grade} · ${row.shift}`,position:row.position??index+1,date:iso(row.createdAt),status:row.status});});
  } else if (type === "OFFICIAL_DIARY") {
    const row = required(await db.select({ editionNumber: officialDiaries.editionNumber, publishDate: officialDiaries.publishDate, status: officialDiaries.status }).from(officialDiaries).where(eq(officialDiaries.id, binding.sourceId)).limit(1));
    if (row.publishDate.getUTCFullYear() !== query.year || !["Publicado", "Publicada", "PUBLISHED"].includes(row.status)) return [];
    emit(String(row.editionNumber), { number: row.editionNumber, name: `Diário Oficial — edição ${row.editionNumber}`, type: "Diário Oficial", date: iso(row.publishDate), format: "PDF", status: row.status });
    records[records.length-1].links=[...links,{title:"Íntegra da edição",url:`/api/transparencia/fontes/${binding.publicKey}/documento`}];
  }
  return records;
}
