import { notFound } from "next/navigation";
import { db } from "@/db/client";
import { assertBudgetUnitAccess, getTenantContextForModule, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { eq } from "drizzle-orm";
import { procurementContracts } from "@/db/schema/procurement-core";
import { contractAmendments, purchaseProcesses, priceResearches, purchaseProcessItems } from "@/db/schema/procurement-core";
import { cities } from "@/db/schema/localities";
import { employees, administrativeUnits } from "@/db/schema/administration";
import { users } from "@/db/schema/identity";
import { canAccessFinalRequester } from "@/lib/compras/auxiliary-catalogs";
import { listPriceResearchSuppliers, listPriceResearches } from "@/db/repositories/procurement/price-research";
import { catalogItems } from "@/db/schema/master-data";
import { materials } from "@/db/schema/assets-stock";
import { procurementAuxiliaryCatalogs } from "@/lib/compras/auxiliary-catalogs";
import { isProcurementAuxiliaryCatalog } from "@/lib/compras/auxiliary-catalogs";
import { listProcurementAuxiliaryRecords } from "@/db/repositories/procurement/auxiliary-catalogs";
import { AuxiliaryCatalogClient } from "../AuxiliaryCatalogClient";
export const dynamic = "force-dynamic";
export default async function Page({ params, searchParams }: { params: Promise<{ catalogo: string }>; searchParams: Promise<{ processoId?: string; contratoId?: string }> }) {
  const { catalogo } = await params;
  const filters = await searchParams;
  if (!isProcurementAuxiliaryCatalog(catalogo)) notFound();
  const context = await getTenantContextForModule("COMPRAS");
  const database = context.database ?? db;
  const loaded = await listProcurementAuxiliaryRecords(database, catalogo);
  const records = [];
  for (const record of loaded) {
    if (filters.processoId && record.fields.processoId !== filters.processoId) continue;
    if (filters.contratoId && record.fields.contratoId !== filters.contratoId) continue;
    if (catalogo === "requisitantes-finais" && !canAccessFinalRequester(context.user.id, isSystemAdministrator(context.user), record.fields)) continue;
    if (catalogo === "usuarios-unidades" && !isSystemAdministrator(context.user) && record.fields.usuarioId !== context.user.id) continue;
    if (record.fields.contratoId) {
      const [contract] = await database.select().from(procurementContracts).where(eq(procurementContracts.id, record.fields.contratoId)).limit(1);
      if (!contract) continue;
      try { if (contract.sourceBudgetUnitId) assertBudgetUnitAccess(context.user, contract.sourceBudgetUnitId); } catch { continue; }
    }
    records.push(record);
  }
  const fields = procurementAuxiliaryCatalogs[catalogo].fields;
  const options: Record<string, { value: string; label: string }[]> = {};
  if (Object.hasOwn(fields, "cidadeId")) options.cidadeId = (await database.select().from(cities)).map(row => ({ value: row.id, label: `${row.name} (${row.ibgeCode})` }));
  if (Object.hasOwn(fields, "funcionarioId")) options.funcionarioId = (await database.select().from(employees)).map(row => ({ value: row.id, label: row.name }));
  if (Object.hasOwn(fields, "usuarioId") || Object.hasOwn(fields, "usuarios")) {
    const allUsers = (await database.select({ id: users.id, name: users.nome }).from(users).where(eq(users.ativo, true))).map(row => ({ value: row.id, label: row.name }));
    options.usuarioId = allUsers; options.usuarios = allUsers;
  }
  if (Object.hasOwn(fields, "unidadeAdministrativaId")) options.unidadeAdministrativaId = (await database.select().from(administrativeUnits).where(eq(administrativeUnits.isActive, true))).map(row => ({ value: row.id, label: row.name }));
  if (Object.hasOwn(fields, "fornecedorId") || Object.hasOwn(fields, "fornecedores")) {
    const suppliers = (await listPriceResearchSuppliers(database)).map(row => ({ value: row.id, label: row.person?.fullName || row.company?.tradeName || row.company?.corporateName || "Fornecedor" }));
    options.fornecedorId = suppliers; options.fornecedores = suppliers;
  }
  if (Object.hasOwn(fields, "contratoId")) {
    const contracts = await database.select().from(procurementContracts);
    options.contratoId = contracts.filter(row => { try { if (row.sourceBudgetUnitId) assertBudgetUnitAccess(context.user, row.sourceBudgetUnitId); return true; } catch { return false; } }).map(row => ({ value: row.id, label: `${row.number} — ${row.object}` }));
    if (Object.hasOwn(fields, "aditivoId")) options.aditivoId = (await database.select().from(contractAmendments)).filter(row => options.contratoId.some(contract => contract.value === row.contractId)).map(row => ({ value: row.id, label: `${options.contratoId.find(contract => contract.value === row.contractId)?.label} — ${row.type}: ${row.justification}` }));
  }
  if (Object.hasOwn(fields, "processoId")) options.processoId = (await database.select().from(purchaseProcesses)).map(row => ({ value: row.id, label: `${row.number} — ${row.object}` }));
  if (Object.hasOwn(fields, "processoAlienacaoId")) options.processoAlienacaoId = (await listProcurementAuxiliaryRecords(database, "alienacoes")).map(row => ({ value: row.id, label: `${row.code} — ${row.name}` }));
  if (Object.hasOwn(fields, "pesquisaId")) options.pesquisaId = (await listPriceResearches(database)).map(row => ({ value: row.id, label: `${row.process.number} — ${row.process.object} — ${row.date.toLocaleDateString("pt-BR")}` }));
  if (Object.hasOwn(fields, "itemProcessoId")) options.itemProcessoId = (await database.select({ id: purchaseProcessItems.id, customName: purchaseProcessItems.customName, quantity: purchaseProcessItems.quantity, processNumber: purchaseProcesses.number, catalogName: catalogItems.name, materialName: materials.name }).from(purchaseProcessItems).innerJoin(purchaseProcesses, eq(purchaseProcesses.id, purchaseProcessItems.purchaseProcessId)).leftJoin(catalogItems, eq(catalogItems.id, purchaseProcessItems.catalogItemId)).leftJoin(materials, eq(materials.id, purchaseProcessItems.materialId))).map(row => ({ value: row.id, label: `${row.processNumber} — ${row.catalogName || row.materialName || row.customName || "Item"} — quantidade ${row.quantity}` }));
  if (catalogo === "remanejamentos") {
    const people = await database.select({ id: employees.id, name: employees.name }).from(employees);
    const allocations = (await listProcurementAuxiliaryRecords(database, "cotas-requisitantes")).filter(row => options.contratoId.some(contract => contract.value === row.fields.contratoId)).map(row => ({ value: row.id, label: `${row.code} — ${row.name} — ${people.find(person => person.id === row.fields.funcionarioId)?.name || "Requisitante"} — saldo ${row.fields.quantidade}` }));
    options.cotaOrigemId = allocations; options.cotaDestinoId = allocations;
  }
  return <AuxiliaryCatalogClient catalog={catalogo} records={records} options={options} readOnly={["usuarios-unidades", "requisitantes-finais"].includes(catalogo) && !isSystemAdministrator(context.user)} />;
}
