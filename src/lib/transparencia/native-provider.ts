import "server-only";
import { createHash } from "node:crypto";
import { and, asc, desc, eq, gte, inArray, lt, notInArray, or, sql } from "drizzle-orm";
import { Decimal } from "@/db/decimal";
import type { DatabaseExecutor } from "@/db/transaction";
import { publicCommitments, publicSettlements, publicPayments, publicRevenues, publicResourceSources } from "@/db/schema/transparency-financial";
import { readPublicCommitments, readPublicCarryForwards, publicCommitmentScope } from "@/db/repositories/transparency/financial";
import { financialYears } from "@/db/schema/finance-years";
import { governmentEntities, legalTexts } from "@/db/schema/master-data";
import { planningEntityUnits } from "@/db/schema/planning-catalog";
import { transparencyRevenueNatures } from "@/db/schema/transparency-planning";
import { suppliers, companies } from "@/db/schema/registry";
import { people } from "@/db/schema/people";
import { employees } from "@/db/schema/administration";
import { procurementContracts, contractAmendments, biddings, purchaseProcesses } from "@/db/schema/procurement-core";
import { transparencyNativeBindings, transparencyPublications } from "@/db/schema/transparency";
import type { PublicCollection, PublicDataset, PublicRecord, TransparencyQuery } from "./query-contract";
import type { TransparencySettings } from "./presentation-settings";
import { publicPublicationValues } from "./document-provider";
import { readNativePublicBinding } from "./native-domain-provider";
import {nativeRevenueForecasts} from "./native-revenue-forecast";
import {nativePersonnelCounts} from "./native-personnel-counts";
const date = (value: Date | null | undefined) => value?.toISOString().slice(0, 10) || null;
const money = (value: ConstructorParameters<typeof Decimal>[0] | null | undefined) => value === null || value === undefined ? null : new Decimal(value).toFixed(2);
const key = (entity: string, collection: string, natural: string) => createHash("sha256").update(`${entity}:${collection}:${natural}`).digest("hex").slice(0, 40);
const yearRange = (year: number) => ({ gte: new Date(Date.UTC(year, 0, 1)), lt: new Date(Date.UTC(year + 1, 0, 1)) });

export async function nativeTransparencyDataset(db: DatabaseExecutor, collection: PublicCollection, query: TransparencyQuery, settings: TransparencySettings): Promise<PublicDataset> {
   const entities = settings.entities.filter(entity => entity.enabled && (query.entity === "consolidado" || entity.key === query.entity));
   if(["servidores","estagiarios","autonomos","inativos","cessoes"].includes(collection.slug)&&!settings.nativePersonnelPublication)return {records:[],status:"UNAVAILABLE",source:"NATIVO",updatedAt:null,complete:false,provenance:"Publicação nominal nativa Celeriflow",message:"A publicação nominal está desativada pela gestão. Documentos pessoais e folhas privadas não são disponibilizados automaticamente."};
  if (!entities.length || entities.some(entity => !entity.nativeIds.length)) return { records: [], status: "UNAVAILABLE", source: "NATIVO", provenance: "Registros nativos Celeriflow", updatedAt: null, complete: false, message: "Configure a correspondência de entidades nativas na gestão da Transparência antes de consultar esta fonte." };
  const records: PublicRecord[] = []; let updatedAt: string | null = null;
  for (const entity of entities) {
    const entityIds = entity.nativeIds;
    if(collection.slug==="quantitativo-pessoal")records.push(...await nativePersonnelCounts(db,entity.key,entityIds,query));
    else if (collection.slug === "restos-a-pagar") {
      const rows=await readPublicCarryForwards(db,entityIds,query.year);
      if(rows.length>20000) throw new Error("Conjunto de restos a pagar amplo demais.");
      for(const row of rows){
        const paid=row.events.reduce((sum,event)=>event.action==="PAGAMENTO_RASTREADO"&&event.payment&&event.payment.date.getUTCFullYear()<=query.year&&["Paga","Pago"].includes(event.payment.status)?sum.add(event.valueDecimal??0):sum,new Decimal(0));
        const canceled=row.status==="CANCELADO"?row.valueDecimal.sub(paid):new Decimal(0);
        records.push({key:key(entity.key,collection.slug,row.id),entity:entity.key,year:query.year,values:{number:row.commitment.number,originalYear:row.originFinancialYear.year,date:date(row.createdAt),beneficiary:row.commitment.creditor?.name||row.commitment.supplier.company?.corporateName||row.commitment.supplier.person?.fullName||null,type:row.type,status:row.status,registered:money(row.valueDecimal),paid:money(paid),canceled:money(canceled),balance:money(row.valueDecimal.sub(paid).sub(canceled))},events:row.events.map(event=>({stage:event.action,number:event.payment?"Pagamento vinculado":"Evento de inscrição",date:date(event.payment?.date||event.createdAt)!,value:money(event.valueDecimal)??"0.00",status:row.status}))});
        const time=row.updatedAt.toISOString();if(!updatedAt||time>updatedAt) updatedAt=time;
      }
    } else if (["despesas", "liquidacoes", "pagamentos"].includes(collection.slug)) {
      const cutoff=new Date(Date.UTC(query.year+1,0,1));
      const period = yearRange(query.year);
      const matchingDate = collection.slug === "despesas" ? and(gte(publicCommitments.date, period.gte), lt(publicCommitments.date, period.lt)) : collection.slug === "liquidacoes" ? sql`EXISTS(SELECT 1 FROM ${publicSettlements} WHERE ${publicSettlements.commitmentId}=${publicCommitments.id} AND ${publicSettlements.status}='Liquidado' AND ${publicSettlements.date}>=${period.gte} AND ${publicSettlements.date}<${period.lt})` : sql`EXISTS(SELECT 1 FROM ${publicPayments} WHERE ${publicPayments.commitmentId}=${publicCommitments.id} AND ${inArray(publicPayments.status,["Paga","Pago"])} AND ${publicPayments.date}>=${period.gte} AND ${publicPayments.date}<${period.lt})`;
      const rows = await readPublicCommitments(db, and(publicCommitmentScope(entityIds), inArray(publicCommitments.status,["Emitido","Liquidado","Pago","Anulado"]), matchingDate), { limit: 20001, cutoff, deterministic: true });
      if (rows.length > 20000) throw new Error("Restrinja o escopo nativo para exportar integralmente mais de 20.000 empenhos.");
      for (const row of rows) {
        const beneficiary = row.creditor?.name || row.supplier?.company?.corporateName || row.supplier?.person?.fullName || "Não informado";
        const initial=new Decimal(row.valueDecimal??row.value),canceled=row.movements.filter(movement=>movement.type==="Anulação").reduce((sum,movement)=>sum.add(movement.valueDecimal),new Decimal(0)),reinforced=row.movements.filter(movement=>movement.type==="Reforço").reduce((sum,movement)=>sum.add(movement.valueDecimal),new Decimal(0));
        const committed = initial.add(reinforced).sub(canceled), settled = row.settlements.reduce((sum, entry) => sum.add(entry.valueDecimal ?? entry.value), new Decimal(0)), paid = row.payments.reduce((sum, entry) => sum.add(entry.valueDecimal ?? entry.value), new Decimal(0));
        const protectedOrigin=["RH","SAUDE","SOCIAL"].includes(row.reservation?.expense?.sourceModule||"");
        const common = { number: row.number, date: date(row.date), beneficiary, description: protectedOrigin?`Despesa de ${row.reservation?.expense?.sourceModule}; detalhamento conforme classificação pública, sem narrativa pessoal/clínica`:row.history || "Histórico não cadastrado", unit: row.appropriation.budgetUnit.name, sourceCode: row.appropriation.resourceSource.code, nature: row.appropriation.expenseNature.code, program: row.appropriation.programPPA?.name || null, action: row.appropriation.actionPPA?.name || null,function:row.appropriation.planningLine?.functionCode||null,subfunction:row.appropriation.planningLine?.subfunctionCode||null, originalYear: row.date.getUTCFullYear(),initialValue:initial.toFixed(2),canceled:canceled.toFixed(2),reinforced:reinforced.toFixed(2),committed: committed.toFixed(2), settled: settled.toFixed(2), paid: paid.toFixed(2), balance: committed.sub(paid).toFixed(2), status: row.status };
        const events = [...row.settlements.map(entry => ({ stage: "Liquidação", number: entry.id.slice(-8), date: date(entry.date)!, value: money(entry.valueDecimal ?? entry.value)!, status: entry.status })), ...row.payments.map(entry => ({ stage: "Pagamento", number: entry.orderNumber, date: date(entry.date)!, value: money(entry.valueDecimal ?? entry.value)!, status: entry.status }))];
        if (collection.slug === "despesas") records.push({ key: key(entity.key, collection.slug, row.number), entity: entity.key, year: query.year, values: common, events });
        else if (collection.slug === "liquidacoes") for (const entry of row.settlements.filter(entry => entry.date.getUTCFullYear() === query.year)) records.push({ key: key(entity.key, collection.slug, entry.id), entity: entity.key, year: query.year, values: { ...common, commitment: row.number, number: entry.id.slice(-8), date: date(entry.date), value: money(entry.valueDecimal ?? entry.value) }, events });
        else if (collection.slug === "pagamentos") for (const entry of row.payments.filter(entry => entry.date.getUTCFullYear() === query.year)) records.push({ key: key(entity.key, collection.slug, entry.orderNumber), entity: entity.key, year: query.year, values: { ...common, commitment: row.number, number: entry.orderNumber, date: date(entry.date), value: money(entry.valueDecimal ?? entry.value), netPaid: money(entry.netValueDecimal), withheld: entry.valueDecimal && entry.netValueDecimal ? entry.valueDecimal.sub(entry.netValueDecimal).toFixed(2) : null }, events });
        else if (row.date.getUTCFullYear() < query.year) for (const entry of row.payments.filter(entry => entry.date.getUTCFullYear() === query.year)) records.push({ key: key(entity.key, collection.slug, entry.id), entity: entity.key, year: query.year, values: { ...common, date: date(entry.date), type: "Movimento de exercício anterior", paid: money(entry.valueDecimal ?? entry.value) }, events });
        const time = row.updatedAt.toISOString(); if (!updatedAt || time > updatedAt) updatedAt = time;
      }
    } else if (collection.slug === "receitas") {
      const revenueRows = await db.select({ revenue: publicRevenues, revenueNature: transparencyRevenueNatures, resourceSource: publicResourceSources, governmentEntity: { code: governmentEntities.code } }).from(publicRevenues).innerJoin(financialYears, eq(financialYears.id, publicRevenues.financialYearId)).leftJoin(governmentEntities, eq(governmentEntities.id, financialYears.governmentEntityId)).innerJoin(transparencyRevenueNatures, eq(transparencyRevenueNatures.id, publicRevenues.revenueNatureId)).innerJoin(publicResourceSources, eq(publicResourceSources.id, publicRevenues.resourceSourceId)).where(and(inArray(financialYears.governmentEntityId, entityIds), gte(publicRevenues.date, yearRange(query.year).gte), lt(publicRevenues.date, yearRange(query.year).lt), eq(publicRevenues.stage, "ARRECADADA"))).orderBy(desc(publicRevenues.date), desc(publicRevenues.id)).limit(20001);
      const rows = revenueRows.map(row => ({ ...row.revenue, revenueNature: row.revenueNature, resourceSource: row.resourceSource, financialYear: { governmentEntity: row.governmentEntity } }));
      if (rows.length > 20000) throw new Error("Consulta ampla demais para confirmação integral.");
      const revenueMovements:PublicRecord[]=[];
      for (const row of rows) { revenueMovements.push({ key: key(entity.key, collection.slug, row.id), entity: entity.key, year: query.year,excludedFromTotals:["predicted","updated"], values: { number: row.revenueNature.code, name: row.revenueNature.name, date: date(row.collectionDate || row.date), sourceCode: row.resourceSource.code,nativeEntityCode:row.financialYear?.governmentEntity?.code||null, type: row.classification,stage:"ARRECADACAO", status: row.status, value: money(row.valueDecimal ?? row.value), predicted: null, updated: null, description: null } }); const time = row.updatedAt.toISOString(); if (!updatedAt || time > updatedAt) updatedAt = time; }
      const filtered=revenueMovements.filter(row=>(!query.from||String(row.values.date)>=query.from)&&(!query.until||String(row.values.date)<=query.until));
      records.push(...revenueMovements,...await nativeRevenueForecasts(db,entity.key,entityIds,query,filtered));
    } else if (collection.slug === "contratos" || collection.slug === "licitacoes") {
      const units = await db.select({ budgetUnitId: planningEntityUnits.budgetUnitId }).from(planningEntityUnits).where(inArray(planningEntityUnits.governmentEntityId, entityIds));
      const ids = units.map(unit => unit.budgetUnitId);
      if (collection.slug === "contratos") {
        const contractRows = await db.select({ contract: procurementContracts, company: { corporateName: companies.corporateName }, person: { fullName: people.fullName }, inspector: { name: employees.name } }).from(procurementContracts).innerJoin(suppliers, eq(suppliers.id, procurementContracts.supplierId)).leftJoin(companies, eq(companies.id, suppliers.companyId)).leftJoin(people, eq(people.id, suppliers.personId)).leftJoin(employees, eq(employees.id, procurementContracts.inspectorId)).where(and(inArray(procurementContracts.sourceBudgetUnitId, ids), notInArray(procurementContracts.status,["Minuta","Rascunho","Em Elaboração"]), lt(procurementContracts.startDate, yearRange(query.year).lt), gte(procurementContracts.endDate, yearRange(query.year).gte))).orderBy(asc(procurementContracts.number));
        const amendments = contractRows.length ? await db.select().from(contractAmendments).where(inArray(contractAmendments.contractId, contractRows.map(row => row.contract.id))) : [];
        const rows = contractRows.map(row => ({ ...row.contract, supplier: { company: row.company, person: row.person }, inspector: row.inspector, amendments: amendments.filter(amendment => amendment.contractId === row.contract.id) }));
        for (const row of rows) records.push({ key: key(entity.key, collection.slug, row.number), entity: entity.key, year: query.year, values: { number: row.number, date: date(row.startDate), endDate: date(row.endDate), beneficiary: row.supplier.company?.corporateName || row.supplier.person?.fullName || "Não informado", description: row.object, status: row.status, value: money(row.updatedValue), initialValue: money(row.initialValue), inspector: row.inspector?.name || null }, events: row.amendments.filter(amendment => amendment.status !== "Minuta").map(amendment => ({ stage: "Aditivo", number: "Número não cadastrado na fonte", date: date(amendment.createdAt)!, value: amendment.newValue !== null ? new Decimal(amendment.newValue).sub(amendment.previousValue || 0).toFixed(2) : "0.00", status: amendment.type })) });
      } else {
        const budgetIds = ids.length ? sql.join(ids.map(id => sql`${id}`), sql`,`) : sql`NULL`;
        const processes = await db.select({ id: purchaseProcesses.id }).from(purchaseProcesses).where(or(sql`EXISTS(SELECT 1 FROM "Commitment" c JOIN "BudgetAppropriation" a ON a.id=c."appropriationId" WHERE c."purchaseProcessId"=${purchaseProcesses.id} AND a."budgetUnitId" IN (${budgetIds}))`, sql`EXISTS(SELECT 1 FROM "PurchaseProcessItem" i JOIN "PurchaseProcessItemOrigin" o ON o."purchaseProcessItemId"=i.id JOIN "PurchaseRequestItem" r ON r.id=o."purchaseRequestItemId" JOIN "PurchaseRequestItemBudgetAllocation" b ON b."purchaseRequestItemId"=r.id JOIN "BudgetAppropriation" a ON a.id=b."budgetAppropriationId" WHERE i."purchaseProcessId"=${purchaseProcesses.id} AND a."budgetUnitId" IN (${budgetIds}))`));
        const rows = await db.select({ number: biddings.number, publicationDate: biddings.publicationDate, sessionDate: biddings.sessionDate, modality: biddings.modality, status: biddings.status, process: { number: purchaseProcesses.number, object: purchaseProcesses.object, estimatedValue: purchaseProcesses.estimatedValue } }).from(biddings).innerJoin(purchaseProcesses, eq(purchaseProcesses.id, biddings.processId)).where(and(inArray(biddings.processId, processes.map(process => process.id)), gte(biddings.publicationDate, yearRange(query.year).gte), lt(biddings.publicationDate, yearRange(query.year).lt), notInArray(biddings.status,["Rascunho","Em Elaboração"]))).orderBy(asc(biddings.number));
        for (const row of rows) records.push({ key: key(entity.key, collection.slug, row.number), entity: entity.key, year: query.year, values: { number: row.number, date: date(row.publicationDate), openingDate: date(row.sessionDate), process: row.process.number, description: row.process.object, modality: row.modality, status: row.status, value: money(row.process.estimatedValue) } });
      }
    } else if (collection.slug === "legislacao") {
      const rows = await db.select({ id: legalTexts.id, type: legalTexts.type, number: legalTexts.number, summary: legalTexts.summary, publicationDate: legalTexts.publicationDate, status: legalTexts.status }).from(legalTexts).where(and(inArray(legalTexts.governmentEntityId, entityIds), gte(legalTexts.publicationDate, yearRange(query.year).gte), lt(legalTexts.publicationDate, yearRange(query.year).lt))).orderBy(asc(legalTexts.number));
      for (const row of rows) records.push({ key: key(entity.key, collection.slug, row.id), entity: entity.key, year: query.year, values: { number: row.number, name: row.summary, type: row.type, date: date(row.publicationDate), status: row.status, format: "Texto de origem" } });
      const diaryBindings=await db.select().from(transparencyNativeBindings).where(and(eq(transparencyNativeBindings.collectionSlug,collection.slug),eq(transparencyNativeBindings.sourceType,"OFFICIAL_DIARY"),eq(transparencyNativeBindings.enabled,true),inArray(transparencyNativeBindings.governmentEntityId,entityIds)));
      for(const binding of diaryBindings)records.push(...await readNativePublicBinding(db,binding,entity.key,query,settings));
    } else {
      const bindings=await db.select().from(transparencyNativeBindings).where(and(eq(transparencyNativeBindings.collectionSlug,collection.slug),eq(transparencyNativeBindings.enabled,true),inArray(transparencyNativeBindings.governmentEntityId,entityIds))).orderBy(asc(transparencyNativeBindings.publicKey)).limit(10001);
      if(bindings.length>10000)throw new Error("Escopo nativo acima de 10.000 vínculos.");
      for(const binding of bindings){records.push(...await readNativePublicBinding(db,binding,entity.key,query,settings));const time=binding.updatedAt.toISOString();if(!updatedAt||time>updatedAt)updatedAt=time;}
      const publications = (await db.select().from(transparencyPublications).where(and(eq(transparencyPublications.entity,entity.key),eq(transparencyPublications.year,query.year),eq(transparencyPublications.collectionSlug,collection.slug),eq(transparencyPublications.status,"PUBLISHED"),eq(transparencyPublications.source,"NATIVO"))).orderBy(desc(transparencyPublications.publishedAt),asc(transparencyPublications.publicKey))).filter(publication=>collection.slug==="publicacoes"||(publication.values as Record<string,unknown>).artifactKind!=="CONSULTATION_REPORT");
      if(!publications.length&&!bindings.length) return {records:[],status:"UNAVAILABLE",source:"NATIVO",provenance:"Registros nativos Celeriflow",updatedAt:null,complete:false,message:"Nenhum registro desta família está vinculado ao escopo público. Configure os registros e suas entidades em Gestão → Fontes nativas."};
      for (const publication of publications) records.push({ key: publication.publicKey, entity: entity.key, year: query.year, values: publicPublicationValues(publication.values), links: [{ title: publication.title, url: `/api/transparencia/publicacoes/${publication.publicKey}` }] });
    }
  }
  const remunerationKeys=new Set(records.filter(row=>row.values.payrollType).map(row=>`${row.entity}:${row.values.registration}:${row.values.competence}`));
  for(const row of records){const time=typeof row.values.nativeUpdatedAt==="string"?row.values.nativeUpdatedAt:null;if(time&&(!updatedAt||time>updatedAt))updatedAt=time;}
  const distinct=records.filter(row=>!row.values.registration||row.values.value!==null||!remunerationKeys.has(`${row.entity}:${row.values.registration}:${row.values.competence}`));
  return { records:distinct, source: "NATIVO", status: "AVAILABLE", updatedAt, provenance: "Dados lidos dos módulos Celeriflow, nas entidades e vínculos de publicação configurados. Complementos públicos preservam referência documental; campos ausentes não são completados com valores fictícios.", complete: true };
}
