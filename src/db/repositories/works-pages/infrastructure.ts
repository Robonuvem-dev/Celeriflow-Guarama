import { and, asc, count, desc, eq, getTableColumns, inArray, isNotNull, isNull, like, or, sum } from "drizzle-orm";
import type { DatabaseExecutor } from "@/db/transaction";
import { infrastructureWorks as works, infrastructureMeasurements as measurements, infrastructureServices as services, infrastructureTeams as teams, infrastructureTeamMembers as members, infrastructureServiceTeams as serviceTeams, infrastructureServiceEquipment as equipment, infrastructureServiceDocuments as links } from "@/db/schema/infrastructure";
import { assets, assetCategories } from "@/db/schema/assets";
import { departments, employees, roles } from "@/db/schema/administration";
import { materialMovements } from "@/db/schema/assets-stock";
import { documents } from "@/db/schema/registry";
import { documentFolders } from "@/db/schema/document-workflow";

export async function loadWorksDashboard(database: DatabaseExecutor) {
  const [totalObras, totalMedicoes, totalServicos] = await Promise.all([
    database.select({ value: count() }).from(works).where(and(eq(works.active, true), eq(works.status, "Em Execução"))).then(rows => rows[0].value),
    database.select({ value: count() }).from(measurements).where(eq(measurements.active, true)).then(rows => rows[0].value),
    database.select({ value: count() }).from(services).where(and(eq(services.active, true), inArray(services.status, ["Aberto", "Em Andamento"]))).then(rows => rows[0].value),
  ]);
  return { totalObras, totalMedicoes, totalServicos };
}
export function listWorksProjects(database: DatabaseExecutor) {
  return database.select({ id: works.id, numero: works.numero, nome: works.nome, descricao: works.descricao, local: works.local, tipo: works.tipo, valorEstimado: works.valorEstimado, status: works.status, active: works.active }).from(works).orderBy(asc(works.numero), asc(works.id));
}
export function listWorksServices(database: DatabaseExecutor) { return database.select().from(services).orderBy(desc(services.createdAt)); }
export async function loadWorksMeasurements(database: DatabaseExecutor) {
  const [medicoes, obras] = await Promise.all([
    database.select({ ...getTableColumns(measurements), obra: { numero: works.numero, nome: works.nome } }).from(measurements).innerJoin(works, eq(works.id, measurements.obraId)).orderBy(desc(measurements.data), desc(measurements.numero)),
    database.select({ id: works.id, numero: works.numero, nome: works.nome, status: works.status }).from(works).where(eq(works.active, true)).orderBy(asc(works.numero)),
  ]);
  return { medicoes, obras };
}
export function listWorksDocuments(database: DatabaseExecutor) {
  return database.select({ link: links, obrasServico: services, document: getTableColumns(documents), folder: getTableColumns(documentFolders) }).from(links).innerJoin(services, eq(services.id, links.obrasServicoId)).innerJoin(documents, eq(documents.id, links.documentId)).leftJoin(documentFolders, eq(documentFolders.id, documents.folderId)).orderBy(desc(links.createdAt)).then(rows => rows.map(row => ({ ...row.link, obrasServico: row.obrasServico, document: { ...row.document, folder: row.folder } })));
}
export async function loadWorksReports(database: DatabaseExecutor) {
  const [obrasPorStatus, medicoes, servicosPorStatusETipo, materiaisEmitidos] = await Promise.all([
    database.select({ status: works.status, count: count() }).from(works).where(eq(works.active, true)).groupBy(works.status).orderBy(asc(works.status)).then(rows => rows.map(row => ({ status: row.status, _count: { _all: row.count } }))),
    database.select({ count: count(), amount: sum(measurements.valorMedido) }).from(measurements).where(eq(measurements.active, true)).then(rows => ({ _count: { _all: rows[0].count }, _sum: { valorMedido: rows[0].amount === null ? null : Number(rows[0].amount) } })),
    database.select({ status: services.status, tipo: services.tipo, count: count() }).from(services).where(eq(services.active, true)).groupBy(services.status, services.tipo).orderBy(asc(services.status), asc(services.tipo)).then(rows => rows.map(row => ({ status: row.status, tipo: row.tipo, _count: { _all: row.count } }))),
    database.select({ unitValue: materialMovements.unitValue, count: count(), quantity: sum(materialMovements.quantity) }).from(materialMovements).where(and(eq(materialMovements.type, "Saída"), isNotNull(materialMovements.obrasServicoId))).groupBy(materialMovements.unitValue).then(rows => rows.map(row => ({ unitValue: row.unitValue, _count: { _all: row.count }, _sum: { quantity: row.quantity === null ? null : Number(row.quantity) } }))),
  ]);
  return { obrasPorStatus, medicoes, servicosPorStatusETipo, materiaisEmitidos };
}
export async function loadWorksTeams(database: DatabaseExecutor) {
  const service = { protocolo: services.protocolo, descricao: services.descricao, status: services.status, active: services.active };
  const [teamRows, assetRows] = await Promise.all([
    database.select({ id: teams.id, code: teams.code, name: teams.name, isActive: teams.isActive, department: { name: departments.name } }).from(teams).leftJoin(departments, eq(departments.id, teams.departmentId)).orderBy(desc(teams.isActive), asc(teams.name)),
    database.select({ asset: { id: assets.id, patrimonyNumber: assets.patrimonyNumber, name: assets.name, brand: assets.brand, model: assets.model, status: assets.status }, category: { name: assetCategories.name }, department: { name: departments.name }, responsible: { name: employees.name } }).from(assets).innerJoin(assetCategories, eq(assetCategories.id, assets.categoryId)).leftJoin(departments, eq(departments.id, assets.departmentId)).leftJoin(employees, eq(employees.id, assets.responsibleId)).where(or(like(assetCategories.name, "%Obras%"), like(assetCategories.name, "%Iluminação%"))).orderBy(asc(assets.name)),
  ]);
  const [memberRows, assignmentRows, equipmentRows] = await Promise.all([
    database.select({ equipeId: members.equipeId, isLeader: members.isLeader, isActive: members.isActive, employee: { id: employees.id, name: employees.name, registration: employees.registration }, role: { name: roles.name } }).from(members).innerJoin(employees, eq(employees.id, members.employeeId)).leftJoin(roles, eq(roles.id, employees.roleId)).where(inArray(members.equipeId, teamRows.map(row => row.id))).orderBy(desc(members.isLeader)),
    database.select({ equipeId: serviceTeams.equipeId, obrasServico: service }).from(serviceTeams).innerJoin(services, eq(services.id, serviceTeams.obrasServicoId)).where(and(inArray(serviceTeams.equipeId, teamRows.map(row => row.id)), isNull(serviceTeams.releasedAt))),
    database.select({ assetId: equipment.assetId, obrasServico: service }).from(equipment).innerJoin(services, eq(services.id, equipment.obrasServicoId)).where(and(inArray(equipment.assetId, assetRows.map(row => row.asset.id)), isNull(equipment.releasedAt))),
  ]);
  return { teams: teamRows.map(row => ({ ...row, members: memberRows.filter(member => member.equipeId === row.id).map(member => ({ isLeader: member.isLeader, isActive: member.isActive, employee: { ...member.employee, role: member.role } })), assignments: assignmentRows.filter(assignment => assignment.equipeId === row.id).map(assignment => ({ obrasServico: assignment.obrasServico })) })),
    assets: assetRows.map(row => ({ ...row.asset, category: row.category, department: row.department, responsible: row.responsible, serviceEquipment: equipmentRows.filter(assignment => assignment.assetId === row.asset.id).map(assignment => ({ obrasServico: assignment.obrasServico })) })),
  };
}
