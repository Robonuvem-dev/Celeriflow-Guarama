import "server-only";
import { createHash } from "node:crypto";
import { Prisma, type PrismaClient, type TransparencyNativeBinding } from "@prisma/client";
import { positionPlanSchema, positionContractSegments, assessPositionPlan } from "@/lib/rh/position-plan";
import { resolveContractRevision } from "@/lib/rh/contract-timeline";
import { nativePublicDetailsSchema, nativeSourceCollections, type NativeSourceType } from "./native-binding-policy";
import type { PublicRecord, TransparencyQuery } from "./query-contract";
import type { TransparencySettings } from "./presentation-settings";

const iso = (value: Date | null | undefined) => value?.toISOString().slice(0, 10) || null;
const money = (value: Prisma.Decimal.Value | null | undefined) => value === null || value === undefined ? null : new Prisma.Decimal(value).toFixed(2);
const range = (year: number) => ({ gte: new Date(Date.UTC(year, 0, 1)), lt: new Date(Date.UTC(year + 1, 0, 1)) });
const publicKey = (binding: TransparencyNativeBinding, natural: string) => createHash("sha256").update(`${binding.publicKey}:${natural}`).digest("hex").slice(0, 40);
const plain = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const string = (value: unknown) => typeof value === "string" ? value : null;

export async function readNativePublicBinding(db: PrismaClient, binding: TransparencyNativeBinding, entity: "prefeitura" | "camara", query: TransparencyQuery, settings: TransparencySettings): Promise<PublicRecord[]> {
  const type = binding.sourceType as NativeSourceType;
  if (!nativeSourceCollections[type] || !(nativeSourceCollections[type] as readonly string[]).includes(binding.collectionSlug)) throw new Error("Vínculo de fonte nativa inválido.");
  const details = nativePublicDetailsSchema.parse(binding.details), records: PublicRecord[] = [];
  let nativeUpdatedAt=binding.updatedAt.toISOString();
  const attachmentRows = await db.transparencyPublication.findMany({ where: { publicKey: { in: details.attachments }, status: "PUBLISHED", entity, year: query.year }, select: { publicKey: true, title: true } });
  const links = attachmentRows.map(row => ({ title: row.title, url: `/api/transparencia/publicacoes/${row.publicKey}` }));
  const emit = (natural: string, values: PublicRecord["values"], extra: Pick<PublicRecord, "events" | "items"> = {}) => records.push({ key: publicKey(binding, natural), entity, year: query.year, values: { ...values,nativeUpdatedAt, sourceReference: binding.sourceReference, legalReference: values.legalReference ?? details.legalReference ?? null }, links, ...extra });
  const checkEntity = async (costCenterId: string | null | undefined) => {
    if (!costCenterId) return;
    const center = await db.costCenter.findUniqueOrThrow({ where: { id: costCenterId }, select: { governmentEntityId: true } });
    if (center.governmentEntityId && center.governmentEntityId !== binding.governmentEntityId) throw new Error("Fonte nativa pertence a outra entidade.");
  };
  const until = new Date(Math.min(query.until?new Date(`${query.until}T23:59:59.999Z`).getTime():new Date(Date.UTC(query.year + 1, 0, 1)).getTime() - 1, Date.now()));
  if (type === "EMPLOYMENT_CONTRACT" || type === "PAYROLL_STATEMENT") {
    if (!settings.nativePersonnelPublication) throw new Error("Habilite a publicação nominal nativa na configuração da Transparência.");
    const statement = type === "PAYROLL_STATEMENT" ? await db.hrPayrollStatement.findUniqueOrThrow({ where: { id: binding.sourceId }, select: { contractId: true, gross: true, releaseAt: true, revokedAt: true, run: { select: { mode: true, scope: true, status: true, cancelledAt: true, payroll: { select: { competence: true, type: true } } } } } }) : null;
    if (statement && (statement.revokedAt || !statement.releaseAt || statement.releaseAt > new Date() || statement.run.cancelledAt || statement.run.mode !== "OFICIAL" || statement.run.scope !== "PRODUCAO" || statement.run.status !== "FECHADA")) return [];
    const competence = statement?.run.payroll.competence || query.filters.competence || `${String(until.getUTCMonth() + 1).padStart(2, "0")}/${query.year}`;
    if (!/^\d{2}\/\d{4}$/.test(competence) || Number(competence.slice(3)) !== query.year) return [];
    const asOf = new Date(Date.UTC(query.year, Number(competence.slice(0, 2)), 0, 23, 59, 59));
    const stored = await db.hrEmploymentContract.findUniqueOrThrow({ where: { id: statement?.contractId || binding.sourceId }, include: { revisions: true, employee: { select: { name: true } } } });
    nativeUpdatedAt=stored.updatedAt.toISOString();
    if (stored.admittedAt > asOf) return [];
    const contract = stored.revisions.length ? resolveContractRevision(stored, stored.revisions, { start: asOf, end: asOf }).contract : stored;
    await checkEntity(contract.costCenterId);
    const [role, regime] = await Promise.all([db.role.findUnique({ where: { id: contract.roleId }, select: { name: true } }), db.hrEmploymentRegime.findUnique({ where: { id: contract.regimeId }, select: { name: true, employmentNature: true,ruleSet:{select:{scope:true,isDemo:true}} } })]);
    if(regime?.ruleSet.scope!=="PRODUCAO"||regime.ruleSet.isDemo)return [];
    emit(`${contract.registration}:${competence}:${statement?.run.payroll.type || "vinculo"}`, { name: stored.employee.name, registration: contract.registration, role: role?.name || null, unit: contract.workLocation, regime: regime?.name || null, type: regime?.employmentNature || null, class: contract.salaryLevel, monthlyHours: contract.monthlyHours, weeklyHours: details.weeklyHours ?? null, workSchedule: details.workSchedule || null, date: iso(contract.admittedAt), competence, competenceDate: `${query.year}-${competence.slice(0, 2)}-01`, terminationDate: iso(contract.endsAt), terminationReason: details.terminationReason || null, retirementType: details.retirementType || null, cededTo: details.cededTo || null, status: contract.status === "ATIVO" ? "Ativo" : contract.status, value: statement ? money(statement.gross) : null, baseSalary: money(contract.salary), payrollType: statement?.run.payroll.type || null });
  } else if (type === "POSITION_PLAN") {
    const rule = await db.hrPayrollRule.findUniqueOrThrow({ where: { id: binding.sourceId }, include: { ruleSet: true } });
    nativeUpdatedAt=rule.updatedAt.toISOString();
    if (rule.code !== "QUADRO_CARGOS" || !rule.isActive || rule.ruleSet.scope !== "PRODUCAO" || rule.ruleSet.isDemo || !rule.ruleSet.approvedAt) return [];
    const plan = positionPlanSchema.parse(rule.value), centers = await db.costCenter.findMany({ where: { governmentEntityId: binding.governmentEntityId }, select: { id: true } });
    const regimes = await db.hrEmploymentRegime.findMany({ where: { ruleSetId: rule.ruleSetId }, select: { id: true } });
    const contracts = await db.hrEmploymentContract.findMany({ where: { costCenterId: { in: centers.map(center => center.id) } }, include: { revisions: true } });
    const assessed = assessPositionPlan(plan, contracts.flatMap(contract => positionContractSegments(contract, contract.revisions)), regimes.map(regime => regime.id), { start: until, end: until });
    const roles = await db.role.findMany({ where: { id: { in: plan.periods.flatMap(period => period.roles.map(role => role.roleId)) } }, select: { id: true, name: true } });
    for (const row of assessed) {
      const role = plan.periods.find(period => period.startsAt === row.startsAt)!.roles.find(role => role.roleId === row.roleId)!;
      if (binding.collectionSlug === "vagas") emit(`${row.roleId}:${row.startsAt}`, { number: row.roleId.slice(-8), role: roles.find(role => role.id === row.roleId)?.name || null, date: iso(until), type: role.classification, created: row.authorized, occupied: row.peakOccupied, available: row.minimumAvailable, legalReference: role.legalReference });
      else for (const level of role.levels) emit(`${row.roleId}:${row.startsAt}:${level.code}`, { number: level.code, role: roles.find(role => role.id === row.roleId)?.name || null, date: row.startsAt, class: level.code, type: role.classification, monthlyHours: level.monthlyHours, weeklyHours: null, value: money(level.salary), legalReference: role.legalReference });
    }
  } else if (type === "TRAVEL_REQUEST" || type === "ADVANCE_REQUEST") {
    const row = await db.hrPortalRequest.findUniqueOrThrow({ where: { id: binding.sourceId }, select: { kind: true, status: true, payload: true, decidedAt: true,employeeId:true } });
    const employee=await db.employee.findUniqueOrThrow({where:{id:row.employeeId},select:{name:true,role:{select:{name:true}}}});
    const payload = plain(row.payload), input = plain(payload.input), assessment = plain(payload.assessment), policy = plain(payload.policy);
    if (payload.scope !== "PRODUCAO" || row.status !== "DEFERIDA") return [];
    const unit = typeof input.budgetUnitId === "string" ? await db.planningEntityUnit.findUnique({ where: { budgetUnitId: input.budgetUnitId } }) : null;
    if (!unit || unit.governmentEntityId !== binding.governmentEntityId) throw new Error("Diária/adiantamento sem entidade compatível.");
    const date = string(input.departureAt) || iso(row.decidedAt); if (!date || new Date(date).getUTCFullYear() !== query.year) return [];
    const commitments = await db.commitment.findMany({ where: { reservation: { expense: { sourceModule: "RH", sourceId: binding.sourceId } } }, select: { number: true, payments: { where: { status: "Paga" }, select: { valueDecimal: true } } } });
    const paid = commitments.flatMap(row => row.payments).reduce((sum, entry) => sum.add(entry.valueDecimal || 0), new Prisma.Decimal(0));
    emit(binding.sourceId, { number: binding.sourceId.slice(-8), date: date.slice(0, 10), endDate: string(input.returnAt)?.slice(0, 10) || null, beneficiary: employee.name, role: employee.role?.name || null, destination: string(input.destination), description: string(input.purpose), quantity: string(assessment.quantity), unitPrice: money(string(assessment.unitValue)), value: money(string(assessment.amountBRL)), paid: money(paid), status: paid.gt(0) ? "Pago" : "Autorizado", type: type === "TRAVEL_REQUEST" ? "Diária" : "Adiantamento", commitment: commitments.map(row => row.number).join(", ") || null, legalReference: string(policy.legalReference), currency: string(assessment.currency), exchangeRate: string(assessment.exchangeRate) });
  } else if (type === "PURCHASE_RECEIPT") {
    const row = await db.purchaseReceipt.findUniqueOrThrow({ where: { id: binding.sourceId }, include: { items: { include: { material: { select: { name: true } } } }, contract: { include: { supplier: { include: { company: { select: { corporateName: true } }, person: { select: { fullName: true } } } } } }, commitment: { select: { number: true,settlements:{select:{documentId:true,fiscalDocumentNumber:true,fiscalDocumentSeries:true}} } } } });
    nativeUpdatedAt=row.updatedAt.toISOString();
    if (row.status !== "APPROVED" || row.receivedAt.getUTCFullYear() !== query.year) return [];
    if (row.contract.sourceBudgetUnitId) { const scope = await db.planningEntityUnit.findUnique({ where: { budgetUnitId: row.contract.sourceBudgetUnitId } }); if (scope?.governmentEntityId !== binding.governmentEntityId) throw new Error("Compra vinculada a outra entidade."); }
    const invoice=row.commitment?.settlements.find(entry=>entry.documentId===row.documentId);
    for (const item of row.items) emit(item.id, { number: row.number, date: iso(row.receivedAt), name: item.material.name, beneficiary: row.contract.supplier.company?.corporateName || row.contract.supplier.person?.fullName || null, quantity: item.quantity, unitPrice: String(item.unitCost), value: money(new Prisma.Decimal(item.unitCost).mul(item.quantity)), commitment: row.commitment?.number || null, contractNumber: row.contract.number, status: row.status, invoice: invoice?.fiscalDocumentNumber||null,invoiceSeries:invoice?.fiscalDocumentSeries||null });
  } else if (type === "ASSET") {
    const row = await db.asset.findUniqueOrThrow({ where: { id: binding.sourceId }, include: { category: { select: { name: true } }, department: { select: { name: true } }, valueHistory: { where: { referenceMonth: { lte: until } }, orderBy: { referenceMonth: "desc" }, take: 1 } } });
    nativeUpdatedAt=row.updatedAt.toISOString();
    if (row.acquisitionDate > until) return [];
    emit(row.patrimonyNumber, { number: row.patrimonyNumber, name: row.name, type: row.category.name, unit: row.department?.name || null, date: iso(row.acquisitionDate), status: row.status, quantity: 1, value: money(row.valueHistory[0]?.closingValue ?? row.acquisitionValue), acquisitionValue: money(row.acquisitionValue), valuationReference: iso(row.valueHistory[0]?.referenceMonth)||iso(row.acquisitionDate) });
  } else if (type === "FLEET_UNIT") {
    const row = await db.fleetUnit.findUniqueOrThrow({ where: { id: binding.sourceId }, select: { code: true, name: true, category: true, status: true, plate: true, brand: true, model: true, year: true, createdAt: true, asset: { select: { currentValue: true } } } });
    if (row.createdAt > until) return [];
    emit(row.code, { number: row.code, name: row.name, type: row.category, status: row.status, date: iso(row.createdAt), quantity: 1, value: money(row.asset?.currentValue), plate: row.plate, brand: row.brand, model: row.model, manufactureYear: row.year });
  } else if (type === "WAREHOUSE") {
    const warehouse = await db.warehouse.findUniqueOrThrow({ where: { id: binding.sourceId }, select: { name: true, costCenterId: true } }); await checkEntity(warehouse.costCenterId);
    if(binding.collectionSlug==="medicamentos"){
      if(query.year!==new Date().getUTCFullYear())throw new Error("Estoque corrente não representa histórico de outro exercício; consulte os documentos preservados.");
      const stocks=await db.materialStock.findMany({where:{warehouseId:binding.sourceId,material:{medicine:{isNot:null}}},select:{id:true,quantity:true,blockedAt:true,expirationDate:true,updatedAt:true,material:{select:{code:true,name:true,unitOfMeasure:true}}},orderBy:{id:"asc"},take:20001});if(stocks.length>20000)throw new Error("Estoque público acima do limite.");
      for(const stock of stocks){nativeUpdatedAt=stock.updatedAt.toISOString();emit(stock.id,{number:stock.material.code,name:stock.material.name,unit:warehouse.name,quantity:stock.quantity,unitOfMeasure:stock.material.unitOfMeasure,date:iso(stock.updatedAt),status:stock.blockedAt?"Bloqueado":stock.expirationDate&&stock.expirationDate<new Date()?"Vencido":"Disponível"});}return records;
    }
    const period={gte:new Date(Math.max(range(query.year).gte.getTime(),query.from?new Date(`${query.from}T00:00:00Z`).getTime():0)),lt:new Date(Math.min(range(query.year).lt.getTime(),query.until?new Date(`${query.until}T00:00:00Z`).getTime()+86400000:Infinity))};
    const rows = await db.materialMovement.findMany({ where: { warehouseId: binding.sourceId, date: period }, select: { id: true, type: true, operation: true, quantity: true, unitValue: true, date: true,updatedAt:true, material: { select: { code: true, name: true, unitOfMeasure: true } } }, orderBy: [{ date: "asc" }, { id: "asc" }], take: 20001 });
    if (rows.length > 20000) throw new Error("Movimentos de estoque acima do limite; restrinja o período.");
    for (const row of rows) emit(row.id, { number: row.material.code, name: row.material.name, unit: warehouse.name, type: row.type, status: row.operation, date: iso(row.date), quantity: row.quantity, unitOfMeasure: row.material.unitOfMeasure, unitPrice: money(row.unitValue), value: row.unitValue === null ? null : money(new Prisma.Decimal(row.unitValue).mul(row.quantity)) });
  } else if (type === "WORK") {
    const row = await db.obrasObra.findUniqueOrThrow({ where: { id: binding.sourceId }, include: { medicoes: { where: { active: true, data: range(query.year) }, orderBy: { data: "asc" } } } });
    nativeUpdatedAt=row.updatedAt.toISOString();
    emit(row.numero, { number: row.numero, name: row.nome, description: row.descricao, location: row.local, type: row.tipo, status: row.status, date: details.startDate || iso(row.createdAt), endDate: details.endDate || null, inspector: details.inspector || null, progress: details.progress ?? null, value: money(row.valorEstimado), complementOrigin: "Cronograma/fiscal/itens complementados pela gestão com referência documental" }, { items: details.items.map(item => ({ ...item, total: new Prisma.Decimal(item.quantity).mul(item.unitPrice).toFixed(2) })), events: row.medicoes.map(entry => ({ stage: "Medição", number: String(entry.numero), date: iso(entry.data)!, value: money(entry.valorMedido)!, status: entry.status })) });
  } else if (type === "COVENANT") {
    const row = await db.covenant.findUniqueOrThrow({ where: { id: binding.sourceId }, include: { installments: { include: { payment: { select: { status: true, date: true, valueDecimal: true } } } } } });
    nativeUpdatedAt=row.updatedAt.toISOString();
    if (row.startDate > until || row.endDate < range(query.year).gte) return [];
    if (binding.collectionSlug === "convenios") emit(row.number, { number: row.number, beneficiary: row.grantor, description: row.description, date: iso(row.startDate), endDate: iso(row.endDate), status: row.status, value: money(row.totalValueDecimal), type: details.type || "Convênio" });
    else for (const installment of row.installments.filter(entry => entry.payment?.status === "Paga" && entry.payment.date.getUTCFullYear() === query.year)) emit(`${row.number}:${installment.number}`, { number: row.number, date: iso(installment.payment!.date), name: row.description, beneficiary: row.grantor, type: details.type || "Repasse vinculado", value: money(installment.payment!.valueDecimal), internalTransfer: details.internalTransfer, status: installment.status });
  } else if (type === "TAX_BENEFIT_RULE" || type === "TAX_BENEFIT_GRANT") {
    if (type === "TAX_BENEFIT_RULE") {
      const row = await db.taxBenefitRule.findUniqueOrThrow({ where: { id: binding.sourceId }, include: { grants: { where: { status: "CONCEDIDO", grantedAt: range(query.year) }, select: { renunciationDecimal: true } } } });
      emit(`${row.code}:${query.year}`, { number: row.code, beneficiary: "Total agregado por benefício", type: row.benefitType, date: iso(row.effectiveFrom), legalReference: row.legalReference, value: money(row.grants.reduce((sum, grant) => sum.add(grant.renunciationDecimal), new Prisma.Decimal(0))), name: row.name, status: row.active ? "Vigente" : "Inativo" });
    } else {
      const row = await db.taxBenefitGrant.findUniqueOrThrow({ where: { id: binding.sourceId }, include: { rule: { select: { code: true, benefitType: true, legalReference: true } } } });
      if (row.grantedAt.getUTCFullYear() !== query.year || row.status !== "CONCEDIDO") return [];
      const taxpayer = details.nominalPublication ? await db.taxpayer.findUnique({ where: { id: row.taxpayerId }, select: { person:{select:{fullName:true}},company:{select:{corporateName:true}} } }) : null;
      emit(binding.sourceId, { number: row.rule.code, beneficiary: taxpayer?.person?.fullName||taxpayer?.company?.corporateName || "Beneficiário não nominalizado nesta publicação", type: row.rule.benefitType, date: iso(row.grantedAt), legalReference: row.rule.legalReference, value: money(row.renunciationDecimal), status: row.status });
    }
  } else if(type==="HEALTH_REGULATION_SECTOR"){
    if(query.year!==new Date().getUTCFullYear())throw new Error("Fila corrente não substitui histórico de exercícios anteriores.");
    const rows=await db.healthRegulationRequest.findMany({where:{sectorId:binding.sourceId,status:{in:["RECEBIDA","EM_ANALISE","AUTORIZADA"]}},select:{id:true,createdAt:true,updatedAt:true,priority:true,status:true,specialty:{select:{name:true}},service:{select:{name:true}}},orderBy:[{createdAt:"asc"},{id:"asc"}],take:20001});if(rows.length>20000)throw new Error("Fila acima do limite.");
    const rank:Record<string,number>={Alta:0,Media:1,Média:1,Normal:2};rows.sort((a,b)=>(rank[a.priority]??3)-(rank[b.priority]??3)||a.createdAt.getTime()-b.createdAt.getTime()||a.id.localeCompare(b.id));const positions=new Map<string,number>();
    for(const row of rows){const service=row.specialty?.name||row.service?.name||"Serviço não identificado",position=(positions.get(service)||0)+1;positions.set(service,position);nativeUpdatedAt=row.updatedAt.toISOString();emit(row.id,{number:publicKey(binding,`queue:${row.id}`).slice(0,12).toUpperCase(),name:service,position,type:row.priority,date:iso(row.createdAt),status:row.status});}
  } else if(type==="PRE_ENROLLMENT_PROCESS"){
    const process=await db.preEnrollmentProcess.findUniqueOrThrow({where:{id:binding.sourceId},select:{year:true,stage:true,name:true,school:{select:{name:true}}}});if(process.year!==query.year)return [];
    const rows=await db.preEnrollment.findMany({where:{processId:binding.sourceId,year:query.year,status:"Pendente",canceledAt:null},select:{id:true,createdAt:true,updatedAt:true,position:true,rankingScore:true,grade:true,shift:true,status:true},orderBy:[{rankingScore:"desc"},{createdAt:"asc"},{id:"asc"}],take:20001});if(rows.length>20000)throw new Error("Fila acima do limite.");
    rows.forEach((row,index)=>{nativeUpdatedAt=row.updatedAt.toISOString();emit(row.id,{number:publicKey(binding,`queue:${row.id}`).slice(0,12).toUpperCase(),name:process.name,unit:process.school.name,type:`${process.stage} · ${row.grade} · ${row.shift}`,position:row.position??index+1,date:iso(row.createdAt),status:row.status});});
  } else if (type === "OFFICIAL_DIARY") {
    const row = await db.officialDiary.findUniqueOrThrow({ where: { id: binding.sourceId }, select: { editionNumber: true, publishDate: true, status: true, pdfUrl: true } });
    if (row.publishDate.getUTCFullYear() !== query.year || !["Publicado", "Publicada", "PUBLISHED"].includes(row.status)) return [];
    emit(String(row.editionNumber), { number: row.editionNumber, name: `Diário Oficial — edição ${row.editionNumber}`, type: "Diário Oficial", date: iso(row.publishDate), format: "PDF", status: row.status });
    records[records.length-1].links=[...links,{title:"Íntegra da edição",url:`/api/transparencia/fontes/${binding.publicKey}/documento`}];
  }
  return records;
}
