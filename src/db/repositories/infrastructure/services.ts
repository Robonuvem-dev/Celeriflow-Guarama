import { desc, eq, inArray, sql } from "drizzle-orm";
import type { DatabaseExecutor } from "../../transaction";
import { assets } from "../../schema/assets";
import { materialMovements, materials, materialStocks } from "../../schema/assets-stock";
import { departments, employees } from "../../schema/administration";
import { documents, realEstates } from "../../schema/registry";
import { infrastructureServices, infrastructureServiceEmployees, infrastructureServiceTeams, infrastructureTeams, infrastructureServiceEquipment, infrastructureServiceMaterials, infrastructureServiceDocuments } from "../../schema/infrastructure";

type PurchaseReference = { number: string; object: string; status: string; estimatedValue: number | null };

/** Operational projection shared by the two existing lighting screens. Dates
 * and monetary scalars retain the column mappings used by their client DTOs. */
export async function listInfrastructureServiceDetails(db: DatabaseExecutor, type?: string) {
  const rows = await db.select({ service: infrastructureServices, department: { name: departments.name }, asset: { id: assets.id, patrimonyNumber: assets.patrimonyNumber, name: assets.name, status: assets.status }, realEstate: { id: realEstates.id, municipalInsc: realEstates.municipalInsc, registration: realEstates.registration, propertyType: realEstates.propertyType, streetName: realEstates.streetName, number: realEstates.number, complement: realEstates.complement },
    budgetAppropriation: sql<{ code: string; initialValue: number; updatedValue: number; committedValue: number } | null>`(SELECT json_build_object('code',b.code,'initialValue',b."initialValue",'updatedValue',b."updatedValue",'committedValue',b."committedValue") FROM "BudgetAppropriation" b WHERE b.id=${infrastructureServices.budgetAppropriationId})`,
    commitment: sql<{ number: string; value: number; status: string; history: string } | null>`(SELECT json_build_object('number',c.number,'value',c.value,'status',c.status,'history',c.history) FROM "Commitment" c WHERE c.id=${infrastructureServices.commitmentId})`,
  }).from(infrastructureServices).leftJoin(departments, eq(departments.id, infrastructureServices.departmentId)).leftJoin(assets, eq(assets.id, infrastructureServices.targetAssetId)).leftJoin(realEstates, eq(realEstates.id, assets.realEstateId))
    .where(type ? eq(infrastructureServices.tipo, type) : undefined).orderBy(desc(infrastructureServices.createdAt));
  const ids = rows.map(row => row.service.id);
  if (!ids.length) return [];
  const [staff, teams, equipment, supplies, documentsLinked, purchases, movements] = await Promise.all([
    db.select({ assignment: infrastructureServiceEmployees, employee: { name: employees.name, registration: employees.registration, isActive: employees.isActive } }).from(infrastructureServiceEmployees).innerJoin(employees, eq(employees.id, infrastructureServiceEmployees.employeeId)).where(inArray(infrastructureServiceEmployees.obrasServicoId, ids)),
    db.select({ assignment: infrastructureServiceTeams, equipe: { code: infrastructureTeams.code, name: infrastructureTeams.name, isActive: infrastructureTeams.isActive } }).from(infrastructureServiceTeams).innerJoin(infrastructureTeams, eq(infrastructureTeams.id, infrastructureServiceTeams.equipeId)).where(inArray(infrastructureServiceTeams.obrasServicoId, ids)),
    db.select({ assignment: infrastructureServiceEquipment, asset: { patrimonyNumber: assets.patrimonyNumber, name: assets.name, status: assets.status } }).from(infrastructureServiceEquipment).innerJoin(assets, eq(assets.id, infrastructureServiceEquipment.assetId)).where(inArray(infrastructureServiceEquipment.obrasServicoId, ids)),
    db.select({ assignment: infrastructureServiceMaterials, material: { code: materials.code, name: materials.name, unitOfMeasure: materials.unitOfMeasure }, stock: { id: materialStocks.id, quantity: materialStocks.quantity, unitCost: materialStocks.unitCost, batchNumber: materialStocks.batchNumber } }).from(infrastructureServiceMaterials).innerJoin(materials, eq(materials.id, infrastructureServiceMaterials.materialId)).leftJoin(materialStocks, eq(materialStocks.id, infrastructureServiceMaterials.stockId)).where(inArray(infrastructureServiceMaterials.obrasServicoId, ids)),
    db.select({ assignment: infrastructureServiceDocuments, document: { title: documents.title, documentType: documents.documentType, status: documents.status } }).from(infrastructureServiceDocuments).innerJoin(documents, eq(documents.id, infrastructureServiceDocuments.documentId)).where(inArray(infrastructureServiceDocuments.obrasServicoId, ids)),
    db.execute<{ obrasServicoId: string; purpose: string; purchaseRequest: PurchaseReference | null; purchaseProcess: PurchaseReference | null }>(sql`SELECT b."obrasServicoId", b.purpose,
      CASE WHEN r.id IS NULL THEN NULL ELSE json_build_object('number',r.number,'object',r.object,'status',r.status,'estimatedValue',r."estimatedValue") END AS "purchaseRequest",
      CASE WHEN p.id IS NULL THEN NULL ELSE json_build_object('number',p.number,'object',p.object,'status',p.status,'estimatedValue',p."estimatedValue") END AS "purchaseProcess"
      FROM "ObrasServicoCompra" b LEFT JOIN "PurchaseRequest" r ON r.id=b."purchaseRequestId" LEFT JOIN "PurchaseProcess" p ON p.id=b."purchaseProcessId" WHERE ${inArray(sql`b."obrasServicoId"`, ids)}`).then(result => result.rows),
    db.select({ obrasServicoId: materialMovements.obrasServicoId, type: materialMovements.type, quantity: materialMovements.quantity, material: { code: materials.code, name: materials.name, unitOfMeasure: materials.unitOfMeasure } }).from(materialMovements).innerJoin(materials, eq(materials.id, materialMovements.materialId)).where(inArray(materialMovements.obrasServicoId, ids)),
  ]);
  return rows.map(row => ({ ...row.service, department: row.department, targetAsset: row.asset ? { ...row.asset, realEstate: row.realEstate } : null, budgetAppropriation: row.budgetAppropriation, commitment: row.commitment,
    employees: staff.filter(item => item.assignment.obrasServicoId === row.service.id).map(item => ({ ...item.assignment, employee: item.employee })),
    teams: teams.filter(item => item.assignment.obrasServicoId === row.service.id).map(item => ({ ...item.assignment, equipe: item.equipe })),
    equipment: equipment.filter(item => item.assignment.obrasServicoId === row.service.id).map(item => ({ ...item.assignment, asset: item.asset })),
    materials: supplies.filter(item => item.assignment.obrasServicoId === row.service.id).map(item => ({ ...item.assignment, material: item.material, stock: item.stock })),
    documents: documentsLinked.filter(item => item.assignment.obrasServicoId === row.service.id).map(item => ({ ...item.assignment, document: item.document })),
    purchases: purchases.filter(item => item.obrasServicoId === row.service.id), materialMoves: movements.filter(item => item.obrasServicoId === row.service.id),
  }));
}
