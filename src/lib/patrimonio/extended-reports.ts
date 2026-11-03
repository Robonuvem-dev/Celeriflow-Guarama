import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { DatabaseConnection } from "@/db/connection";
import { assets, assetCategories, assetTransfers, assetValueAdjustments, assetValueHistories, assetWriteOffs } from "@/db/schema/assets";
import { departments, employees, secretariats } from "@/db/schema/administration";
import { assetCatalogRecords } from "@/db/schema/assets-catalogs";

type Query = { report: string; q: string; status: string; category: string; from: string; to: string; department: string; responsible: string; unit: string; account: string; session: string; period: string; year: number };
const day = (value: Date | null) => value?.toISOString().slice(0, 10) || "";
export async function extendedAssetReport(database: DatabaseConnection, scope: { departmentId?: string }, query: Query) {
  const records = await database.select({ asset: assets, category: assetCategories.name, department: departments.name, responsible: employees.name, unit: secretariats.name, unitId: secretariats.id }).from(assets).leftJoin(assetCategories, eq(assetCategories.id, assets.categoryId)).leftJoin(departments, eq(departments.id, assets.departmentId)).leftJoin(employees, eq(employees.id, assets.responsibleId)).leftJoin(secretariats, eq(secretariats.id, departments.secretariatId)).where(and(scope.departmentId ? eq(assets.departmentId, scope.departmentId) : undefined, query.department ? eq(assets.departmentId, query.department) : undefined, query.responsible ? eq(assets.responsibleId, query.responsible) : undefined, query.category ? eq(assets.categoryId, query.category) : undefined, query.unit ? eq(secretariats.id, query.unit) : undefined, query.status && !["baixas", "transferencias", "ajustes", "movimentacao"].includes(query.report) ? eq(assets.status, query.status) : undefined)).orderBy(asc(assets.patrimonyNumber));
  const selected = records.filter(r => !query.q || `${r.asset.name} ${r.asset.patrimonyNumber}`.toLocaleLowerCase().includes(query.q.toLocaleLowerCase()));
  const ids = selected.map(r => r.asset.id), byId = new Map(selected.map(r => [r.asset.id, r]));
  const within = (date: Date) => (!query.from || day(date) >= query.from) && (!query.to || day(date) <= query.to);
  const catalogs = await database.select().from(assetCatalogRecords).where(and(eq(assetCatalogRecords.active, true), eq(assetCatalogRecords.year, query.year), scope.departmentId ? eq(assetCatalogRecords.departmentId, scope.departmentId) : undefined));
  let columns: string[] = [], rows: unknown[][] = [];
  if (query.report === "localizados" || query.report === "divergentes") {
    columns = ["Inventário", "Placa", "Bem", "Setor de origem", "Setor localizado", "Responsável", "Conformidade"];
    rows = catalogs.filter(r => r.kind === "inventarioBem" && (!query.session || r.details.sessionId === query.session) && r.details.foundDepartmentId && (!query.department || r.details.expectedDepartmentId === query.department) && (!query.responsible || r.details.responsibleId === query.responsible) && (query.report === "divergentes" ? r.details.expectedDepartmentId !== r.details.foundDepartmentId : r.details.expectedDepartmentId === r.details.foundDepartmentId) && (!query.q || `${r.details.patrimonyNumber} ${r.details.name}`.toLowerCase().includes(query.q.toLowerCase()))).map(r => [r.details.sessionId, r.details.patrimonyNumber, r.details.name, r.details.expectedDepartmentId, r.details.foundDepartmentId, r.details.responsibleId, r.details.conformity || "Pendente"]);
  } else if (query.report === "imoveis") {
    columns = ["Código", "Imóvel / arrendamento", "Endereço", "BIC", "Locador / arrendatário", "Início", "Fim", "Valor"];
    rows = catalogs.filter(r => ["imoveis", "arrendamentos"].includes(r.kind) && (!query.department || r.departmentId === query.department) && (!query.q || `${r.code} ${r.name} ${r.details.address}`.toLowerCase().includes(query.q.toLowerCase()))).map(r => [r.code, r.name, r.details.address || catalogs.find(p => p.id === r.details.propertyId)?.details.address, r.details.bic || catalogs.find(p => p.id === r.details.propertyId)?.details.bic, r.details.party, r.details.startsAt, r.details.endsAt, r.details.amount]);
  } else if (query.report === "pcasp") {
    columns = ["Conta PCASP", "Classificação", "Placa", "Bem", "Valor atual"];
    rows = catalogs.filter(r => r.kind === "contas" && (!query.account || r.details.account === query.account) && byId.has(r.details.assetId)).map(r => [r.details.account, r.details.classification, byId.get(r.details.assetId)!.asset.patrimonyNumber, byId.get(r.details.assetId)!.asset.name, byId.get(r.details.assetId)!.asset.currentValueDecimal ?? byId.get(r.details.assetId)!.asset.currentValue]);
  } else if (query.report === "pendencias") {
    columns = ["Pendência", "Identificador", "Bem / material", "Quantidade pendente"];
    rows = selected.filter(r => !r.category || !r.asset.patrimonyNumber.trim()).map(r => [!r.category ? "Não categorizado" : "Não tombado", r.asset.id, r.asset.name, 1]);
    const pending = (await database.execute<{ id: string; name: string; remaining: number; liquidated: boolean }>(sql`SELECT i.id,m.name,i.quantity-i."quantityIncorporated" AS remaining, EXISTS(SELECT 1 FROM "Commitment" c JOIN "Settlement" s ON s."commitmentId"=c.id WHERE c."purchaseReceiptId"=r.id AND s.status='Liquidado') AS liquidated FROM "PurchaseReceiptItem" i JOIN "PurchaseReceipt" r ON r.id=i."purchaseReceiptId" JOIN "Material" m ON m.id=i."materialId" WHERE r.status='APPROVED' AND m.type='PATRIMONIO' AND i.quantity>i."quantityIncorporated" ${scope.departmentId || query.department ? sql`AND EXISTS(SELECT 1 FROM "Commitment" c JOIN "BudgetAppropriation" a ON a.id=c."appropriationId" JOIN "BudgetUnit" u ON u.id=a."budgetUnitId" JOIN "Department" d ON d."secretariatId"=u."secretariatId" WHERE c."purchaseReceiptId"=r.id AND d.id=${scope.departmentId || query.department})` : sql``}`)).rows;
    rows.push(...pending.filter(r => !query.q || r.name.toLowerCase().includes(query.q.toLowerCase())).map(r => [r.liquidated ? "Liquidado não cadastrado" : "Não tombado", r.id, r.name, r.remaining]));
  } else if (["baixas", "transferencias", "ajustes", "movimentacao"].includes(query.report)) {
    const [writeOffs, transfers, adjustments, depreciation] = ids.length ? await Promise.all([
      database.select().from(assetWriteOffs).where(inArray(assetWriteOffs.assetId, ids)), database.select().from(assetTransfers).where(inArray(assetTransfers.assetId, ids)),
      database.select().from(assetValueAdjustments).where(and(inArray(assetValueAdjustments.assetId, ids), sql`NOT EXISTS (SELECT 1 FROM "AccountingTransaction" r WHERE r."reversalOfId"=${assetValueAdjustments.accountingTransactionId})`)),
      database.select().from(assetValueHistories).where(and(inArray(assetValueHistories.assetId, ids), sql`NOT EXISTS (SELECT 1 FROM "AccountingTransaction" r WHERE r."reversalOfId"=${assetValueHistories.accountingTransactionId})`)),
    ]) : [[], [], [], []];
    if (query.report === "baixas") {
      columns = ["Data", "Placa", "Bem", "Tipo", "Motivo", "Justificativa", "Situação", "Valor contábil", "Valor de alienação"];
      rows = writeOffs.filter(r => within(r.date) && (!query.status || r.status === query.status)).map(r => [day(r.date), byId.get(r.assetId)!.asset.patrimonyNumber, byId.get(r.assetId)!.asset.name, r.type, r.reason, r.justification, r.status, r.bookValue, r.disposalValue]);
    } else if (query.report === "transferencias") {
      columns = ["Data", "Placa", "Bem", "Setor anterior", "Setor atual", "Responsável anterior", "Responsável atual", "Motivo"];
      rows = transfers.filter(r => within(r.date)).sort((a,b) => a.date.valueOf()-b.date.valueOf()).map(r => [day(r.date), byId.get(r.assetId)!.asset.patrimonyNumber, byId.get(r.assetId)!.asset.name, r.fromDepartmentId, r.toDepartmentId, r.fromResponsibleId, r.toResponsibleId, r.reason]);
    } else if (query.report === "ajustes") {
      columns = ["Data", "Placa", "Bem", "Movimento", "Valor anterior", "Variação", "Valor final", "Fundamento / evidência"];
      rows = [...adjustments.filter(r => within(r.date)).map(r => [day(r.date), byId.get(r.assetId)!.asset.patrimonyNumber, byId.get(r.assetId)!.asset.name, r.type, r.openingValueDecimal ?? r.openingValue, r.adjustmentValueDecimal ?? r.adjustmentValue, r.closingValueDecimal ?? r.closingValue, `${r.justification} — ${r.evidence}`]), ...depreciation.filter(r => within(r.referenceMonth)).map(r => [day(r.referenceMonth), byId.get(r.assetId)!.asset.patrimonyNumber, byId.get(r.assetId)!.asset.name, "Depreciação", r.openingValueDecimal ?? r.openingValue, -(Number(r.depreciationDecimal ?? r.depreciation)), r.closingValueDecimal ?? r.closingValue, ""])].sort((a,b) => String(a[0]).localeCompare(String(b[0])));
    } else {
      columns = ["Período", "Saldo anterior", "Entradas", "Saídas", "Saldo atual"];
      const events = [...selected.map(r => ({ date: r.asset.incorporationDate || r.asset.acquisitionDate, value: Number(r.asset.acquisitionValueDecimal ?? r.asset.acquisitionValue) })), ...adjustments.map(r => ({ date: r.date, value: Number(r.adjustmentValueDecimal ?? r.adjustmentValue) })), ...depreciation.map(r => ({ date: r.referenceMonth, value: -Number(r.depreciationDecimal ?? r.depreciation) })), ...writeOffs.filter(r => r.status === "Aprovada").map(r => ({ date: r.date, value: -r.bookValue }))].sort((a,b) => a.date.valueOf()-b.date.valueOf());
      let balance = 0;
      const groups = new Map<string, { opening: number; incoming: number; outgoing: number; closing: number }>();
      for (const event of events) {
        if (query.to && day(event.date) > query.to) continue;
        const opening = balance; balance += event.value;
        if (!within(event.date)) continue;
        const key = day(event.date).slice(0, query.period === "annual" ? 4 : 7), group = groups.get(key) || { opening, incoming: 0, outgoing: 0, closing: balance };
        group.incoming += Math.max(event.value, 0); group.outgoing += Math.max(-event.value, 0); group.closing = balance; groups.set(key, group);
      }
      rows = [...groups].map(([period, g]) => [period, g.opening.toFixed(2), g.incoming.toFixed(2), g.outgoing.toFixed(2), g.closing.toFixed(2)]);
      if (!rows.length) rows = [[query.from || "Saldo", balance.toFixed(2), "0.00", "0.00", balance.toFixed(2)]];
    }
  } else {
    columns = ["Placa", "Bem", "Categoria / tipo", "Unidade administrativa", "Setor", "Responsável", "Situação", "Aquisição", "Incorporação", "Valor de aquisição", "Valor atual"];
    rows = selected.filter(r => within(query.report === "incorporados" ? r.asset.incorporationDate || r.asset.acquisitionDate : r.asset.acquisitionDate)).map(r => [r.asset.patrimonyNumber, r.asset.name, r.category, r.unit, r.department, r.responsible, r.asset.status, day(r.asset.acquisitionDate), day(r.asset.incorporationDate), r.asset.acquisitionValueDecimal ?? r.asset.acquisitionValue, r.asset.currentValueDecimal ?? r.asset.currentValue]);
  }
  return { columns, rows, labels: selected.map(r => ({ id: r.asset.id, code: r.asset.patrimonyNumber, name: r.asset.name })) };
}
