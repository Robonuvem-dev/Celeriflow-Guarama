import "./helpers/fleet-test-environment";
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { and, eq } from "drizzle-orm";
import { withDatabaseTransaction } from "../src/db/transaction";
import { countFleetRecords, readFleetUnit, requiredFleetRecord as one } from "../src/db/repositories/fleet/records";
import { accessProfiles, users } from "../src/db/schema/identity";
import { departments, employees, secretariats } from "../src/db/schema/administration";
import { people } from "../src/db/schema/people";
import { assetCategories, assets, assetMaintenances, assetTransfers } from "../src/db/schema/assets";
import { inventorySessions, materialCategories, materials, materialStocks, materialMovements, warehouses } from "../src/db/schema/assets-stock";
import { auditEvents } from "../src/db/schema/audit";
import * as f from "../src/db/schema/fleet";
import type { FleetContext as AppContext } from "../src/lib/contracts/fleet";
import { createFleetTestDatabase } from "./fleet-fixture";
import { dateOnly, fleetQuerySchema, nextOccurrence, type FleetMutationInput } from "../src/lib/frotas/contract";
import { mutateFleet as mutateFleetService, fleetScope } from "../src/lib/frotas/service";
import { queryFleet, fleetReferences } from "../src/lib/frotas/queries";
import { createFleetReportDataset, renderFleetPdf } from "../src/lib/frotas/report";
import { createDefaultReportTemplate } from "../src/lib/reports/report-template";
import { renderTabularCsv, renderTabularXlsx } from "../src/lib/reports/tabular-renderers";
import { canPerformModuleOperation, canViewModule } from "../src/lib/platform/tenant-context";
import { operateAsset as operateAssetService } from "../src/lib/patrimonio/asset-operations";
import { recordAssetDisposal } from "../src/lib/patrimonio/asset-lifecycle";
import { applyStockMovement } from "../src/lib/patrimonio/stock-service";
import { syntheticCpf } from "../src/lib/poc/fixture-catalog";

test("Frotas · persistência e cenários da POC em banco isolado", { timeout: 180000 }, async t => {
  const fixture = await createFleetTestDatabase(), { connection, database: memory } = fixture, db = connection.db;
  const count = countFleetRecords.bind(null, db);
  const mutateFleet = (context: AppContext, raw: unknown) => mutateFleetService(context, raw, connection);
  const operateAsset = (context: AppContext, raw: unknown) => operateAssetService(context, raw, connection);
  try {
    const secretariat = one(await db.insert(secretariats).values({ name: "Secretaria DEMO" }).returning());
    const department = one(await db.insert(departments).values({ name: "Setor DEMO", secretariatId: secretariat.id }).returning());
    const otherDepartment = one(await db.insert(departments).values({ name: "Outro setor DEMO", secretariatId: secretariat.id }).returning());
    const profile = one(await db.insert(accessProfiles).values({ codigo: "FLEET_FIXTURE", nome: "Operador DEMO", permissoes: "{}", ativo: true }).returning());
    const actor = one(await db.insert(users).values({ nome: "Operador DEMO", email: "fleet-fixture@example.invalid", senha: "fixture-not-login", perfilId: profile.id }).returning());
    const permission = { showDashboardCard: true, blocked: false, create: true, update: true, delete: false, issueReports: true };
    const context: AppContext = { database: db, user: { id: actor.id, firebaseUid: "fixture-not-authenticated", email: actor.email, name: actor.nome, role: "Operador DEMO", profileCode: profile.codigo, permissions: JSON.stringify({ modules: { FROTAS: permission } }), modulePermissions: [], allowedBudgetUnitIds: [], employeeId: null, departmentId: department.id, secretariatId: secretariat.id } };
    const mutation = (value: Omit<FleetMutationInput, "requestId">) => mutateFleet(context, { ...value, requestId: randomUUID() });
    const query = (input: Record<string, string | number> = {}) => fleetQuerySchema.parse(input);
    assert.equal(query().pageSize, 20);
    assert.equal(query({ pageSize: 5 }).pageSize, 20);
    const ids: string[] = [], planIds: string[] = [], orderIds: string[] = [];
    const driverPerson = one(await db.insert(people).values({ fullName: "Condutor canônico DEMO", cpf: syntheticCpf(500) }).returning());
    const demoDriver = one(await db.insert(f.fleetDrivers).values({ personId: driverPerson.id, departmentId: department.id, outsourced: true, cnhNumber: "12345678901", cnhCategories: ["B"], cnhExpiresAt: dateOnly("2030-12-31"), policyReference: "Política sintética do banco isolado", createdById: actor.id }).returning());
    const codes = ["V-DEMO-01", "V-DEMO-02", "M-DEMO-01", "E-DEMO-01", "A-DEMO-01"];
    const categories = ["VEICULO", "VEICULO", "MAQUINA", "EQUIPAMENTO", "AGREGADO"] as const;
    await t.test("FRO-001/011 · quatro categorias, reabertura e atualização protegida", async () => {
      for (let i = 0; i < 5; i++) { const r = await mutation({ kind: "unit", data: { code: codes[i], name: `${codes[i]} unidade DEMO`, category: categories[i], status: "ATIVO", departmentId: department.id, ...(i === 4 ? { parentId: ids[2] } : {}) } } as Omit<FleetMutationInput, "requestId">); ids.push(r.id); }
      const list = await queryFleet(context, query()); assert.equal(list.total, 5);
      assert.deepEqual(new Set(list.rows.map(r => r.cells.category)), new Set(["Veículo", "Máquina", "Equipamento", "Agregado"]));
      const unlinked = await readFleetUnit(db, fleetScope(context), ids[0]);
      assert.ok(unlinked); assert.equal(unlinked.asset, null); assert.equal(unlinked.control, null); assert.equal(unlinked.parent, null);
      assert.equal(one(await db.select().from(f.fleetUnits).where(eq(f.fleetUnits.id, ids[4])).limit(1)).parentId, ids[2]);
      assert.equal(one(await db.select().from(f.fleetUnits).where(eq(f.fleetUnits.id, ids[2])).limit(1)).plate, null);
      await assert.rejects(mutateFleet(context, { requestId: randomUUID(), kind: "unit", data: { code: "INVALID", name: "Inválido", category: "AGREGADO", status: "ATIVO", departmentId: department.id, parentId: ids[4] } }), /unidade principal/i);
      const assetCategory = one(await db.insert(assetCategories).values({ name: "Veículos DEMO", code: "FLEET-ASSET-FIXTURE" }).returning());
      const asset = one(await db.insert(assets).values({ patrimonyNumber: "PAT-DEMO-01", name: "Veículo patrimonial DEMO", acquisitionDate: dateOnly("2026-01-01"), acquisitionValue: 1000, currentValue: 1000, categoryId: assetCategory.id, departmentId: department.id }).returning());
      const administrator: AppContext = { ...context, user: { ...context.user, profileCode: "SYSTEM_ADMINISTRATOR" } };
      const first = one(await db.select().from(f.fleetUnits).where(eq(f.fleetUnits.id, ids[0])).limit(1));
      await mutateFleet(administrator, { requestId: randomUUID(), kind: "unit", data: { id: first.id, version: first.updatedAt.toISOString(), code: first.code, name: first.name, category: first.category, status: first.status, departmentId: department.id, assetId: asset.id } });
      const linked = one(await db.select().from(f.fleetUnits).where(eq(f.fleetUnits.id, first.id)).limit(1));
      const hydrated = await readFleetUnit(db, fleetScope(context), first.id);
      assert.ok(hydrated?.asset); assert.equal(hydrated.asset.responsible, null);
      assert.equal(hydrated.asset.acquisitionDate.toISOString(), "2026-01-01T00:00:00.000Z");
      const command = { requestId: randomUUID(), kind: "unit", data: { id: linked.id, version: linked.updatedAt.toISOString(), code: linked.code, name: linked.name, category: linked.category, status: linked.status, departmentId: department.id, assetId: asset.id, notes: "Ficha local atualizada sem alterar vínculo patrimonial DEMO" } };
      await mutateFleet(context, command);
      assert.equal(one(await db.select().from(f.fleetUnits).where(eq(f.fleetUnits.id, first.id)).limit(1)).assetId, asset.id);
      await assert.rejects(mutateFleet({ ...context, user: { ...context.user, departmentId: otherDepartment.id } }, command), /setor/i);
      const second = one(await db.select().from(f.fleetUnits).where(eq(f.fleetUnits.id, ids[1])).limit(1));
      await assert.rejects(mutateFleet(context, { requestId: randomUUID(), kind: "unit", data: { id: second.id, version: second.updatedAt.toISOString(), code: second.code, name: second.name, category: second.category, status: second.status, departmentId: department.id, assetId: asset.id } }), /consultar Patrimônio/i);
    });
    await t.test("FRO-004/010 · rotas, utilizações e leituras coerentes", async () => {
      const route = await mutation({ kind: "route", data: { code: "R-DEMO-01", name: "Rota DEMO", origin: "Centro DEMO", destination: "Escola DEMO", itinerary: "Percurso original DEMO", departmentId: department.id, active: "true" } } as Omit<FleetMutationInput, "requestId">);
      for (const unitId of [ids[0], ids[1]]) await db.insert(f.fleetUnitControls).values({ unitId, allowedLicenseCategories: ["B"] });
      const trips = [[ids[0], "2026-09-03T08:00", "2026-09-03T10:00", "10000", "10060"], [ids[0], "2026-09-05T13:00", "2026-09-05T15:00", "10060", "10100"], [ids[1], "2026-09-06T09:00", "2026-09-06T12:00", "5000", "5120"]];
      for (const [unitId, startedAt, endedAt, initialReading, finalReading] of trips) await mutation({ kind: "usage", data: { unitId, driverId: demoDriver.id, startedAt, endedAt, initialReading, finalReading, routeId: route.id, purpose: "Deslocamento administrativo DEMO" } } as Omit<FleetMutationInput, "requestId">);
      const list = await queryFleet(context, query({ area: "utilizacao", unitId: ids[0] })); assert.equal(list.total, 2); assert.deepEqual(new Set(list.rows.map(r => r.cells.distance)), new Set(["60 km", "40 km"]));
      const old = one(await db.select().from(f.fleetRoutes).where(eq(f.fleetRoutes.id, route.id)).limit(1));
      await mutation({ kind: "route", data: { id: old.id, version: old.updatedAt.toISOString(), code: old.code, name: old.name, origin: old.origin, destination: old.destination, itinerary: "Percurso alterado DEMO", departmentId: department.id, active: "true" } } as Omit<FleetMutationInput, "requestId">);
      assert.match(one(await db.select().from(f.fleetUsages).limit(1)).routeSnapshot!, /Percurso original/);
      await assert.rejects(mutateFleet(context, { requestId: randomUUID(), kind: "usage", data: { unitId: ids[0], startedAt: trips[0][1], endedAt: trips[0][2], initialReading: "100", finalReading: "90", purpose: "Inválido" } }), /final deve/i);
    });
    await t.test("FRO-003/008 · plano → OS → execução, recorrência e confirmação repetida", async () => {
      const costs = ["350.00", "600.00", "450.00", "180.00", "120.00"];
      for (let i = 0; i < 5; i++) {
        const scheduledAt = `2026-09-${10 + i}`;
        const plan = await mutation({ kind: "plan", data: { unitId: ids[i], title: `PL-${i + 1} DEMO`, type: i % 2 ? "PREVENTIVA" : "REVISAO", services: "Revisar componentes DEMO\nConferir serviço DEMO", firstDueAt: scheduledAt, intervalDays: "30", estimatedCost: "999.00" } } as Omit<FleetMutationInput, "requestId">); planIds.push(plan.id);
        const order = await mutation({ kind: "generateOrder", planId: plan.id, scheduledAt } as Omit<FleetMutationInput, "requestId">); orderIds.push(order.id);
        const repeated = await mutation({ kind: "generateOrder", planId: plan.id, scheduledAt } as Omit<FleetMutationInput, "requestId">); assert.equal(repeated.id, order.id);
        await mutation({ kind: "startOrder", orderId: order.id } as Omit<FleetMutationInput, "requestId">);
        const input = { requestId: randomUUID(), kind: "completeOrder", data: { orderId: order.id, completedAt: scheduledAt, performed: "Serviços DEMO executados", result: "Conferido DEMO", actualCost: costs[i] } };
        await mutateFleet(context, input); await mutateFleet(context, input);
        await mutateFleet(context, { ...input, requestId: randomUUID() });
      }
      assert.equal(one(await db.select().from(f.fleetPlans).where(eq(f.fleetPlans.id, planIds[0])).limit(1)).nextDueAt.toISOString().slice(0, 10), "2026-10-10");
      assert.equal((await queryFleet(context, query({ area: "manutencoes" }))).amount, "1700.00");
      await mutation({ kind: "generateOrder", planId: planIds[0], scheduledAt: "2026-10-10" } as Omit<FleetMutationInput, "requestId">);
      assert.equal((await queryFleet(context, query({ area: "manutencoes" }))).amount, "1700.00");
      assert.equal(await count(f.fleetExpenses, eq(f.fleetExpenses.nature, "MANUTENCAO")), 5);
      await assert.rejects(mutateFleet(context, { requestId: randomUUID(), kind: "generateOrder", planId: planIds[0], scheduledAt: "2026-09-11" }), /periodicidade/);
    });
    await t.test("FRO-009/002 · quatro combinações e conciliação R$ 2.955,00", async () => {
      const consumes = [[0, "2026-09-02", "COMBUSTIVEL", "TERCEIRO", "40", "240.00"], [0, "2026-09-04", "COMBUSTIVEL", "PROPRIO", "30", "174.00"], [1, "2026-09-06", "COMBUSTIVEL", "TERCEIRO", "60", "360.00"], [2, "2026-09-08", "COMBUSTIVEL", "PROPRIO", "20", "116.00"], [0, "2026-09-10", "LUBRIFICANTE", "PROPRIO", "4", "100.00"], [1, "2026-09-11", "LUBRIFICANTE", "TERCEIRO", "2", "60.00"], [2, "2026-09-12", "LUBRIFICANTE", "TERCEIRO", "2", "60.00"], [3, "2026-09-13", "LUBRIFICANTE", "PROPRIO", "1", "25.00"], [4, "2026-09-14", "LUBRIFICANTE", "TERCEIRO", "1", "30.00"]];
      for (const [index, occurredAt, type, origin, quantity, cost] of consumes) { const input = { requestId: randomUUID(), kind: "consumption", data: { unitId: ids[Number(index)], occurredAt, type, origin, quantity, cost, material: "Material DEMO", measurementUnit: "L" } }; await mutateFleet(context, input); await mutateFleet(context, input); }
      await mutation({ kind: "expense", data: { unitId: ids[0], occurredAt: "2026-09-15", amount: "90.00", description: "Outro gasto operacional DEMO" } } as Omit<FleetMutationInput, "requestId">);
      const totals = ["954.00", "1020.00", "626.00", "205.00", "150.00"];
      for (let i = 0; i < 5; i++) assert.equal((await queryFleet(context, query({ area: "gastos", unitId: ids[i] }))).amount, totals[i]);
      assert.equal((await queryFleet(context, query({ area: "gastos" }))).amount, "2955.00");
      assert.equal(new Set((await db.select().from(f.fleetConsumptions)).map(v => `${v.type}/${v.origin}`)).size, 4);
    });
    await t.test("FRO-005/006/013 · seguros, IPVA, licenciamento e vencimento sem duplicação", async () => {
      const docs = [
        { unitId: ids[0], kind: "SEGURO", type: "SEGURO", reference: "S-01", title: "Apólice DEMO", startsAt: "2025-09-21", dueAt: "2026-09-20" },
        { unitId: ids[0], kind: "OBRIGACAO", type: "LICENCIAMENTO", reference: "O-01", title: "Licenciamento DEMO", scheduledAt: "2026-09-18", dueAt: "2026-09-25" },
        { unitId: ids[1], kind: "DOCUMENTO", type: "OPERACIONAL", reference: "D-01", title: "Documento DEMO", dueAt: "2026-09-30" },
        { unitId: ids[1], kind: "SEGURO", type: "SEGURO", reference: "S-02", title: "Apólice fora do período DEMO", startsAt: "2025-10-02", dueAt: "2026-10-01" },
        { unitId: ids[1], kind: "OBRIGACAO", type: "LICENCIAMENTO", reference: "O-02", title: "Licenciamento anterior DEMO", scheduledAt: "2026-08-25", dueAt: "2026-08-31" },
        { unitId: ids[1], kind: "OBRIGACAO", type: "IPVA", reference: "O-03", title: "IPVA fictício DEMO", scheduledAt: "2026-11-10", dueAt: "2026-11-15" },
      ];
      let obligation = ""; for (const d of docs) { const r = await mutateFleet(context, { requestId: randomUUID(), kind: "document", data: d }); if (d.reference === "O-01") obligation = r.id; }
      const q = query({ area: "relatorios", report: "vencimentos", from: "2026-09-01", to: "2026-09-30" });
      assert.equal((await queryFleet(context, q)).total, 3);
      await mutation({ kind: "fulfillDocument", data: { documentId: obligation, fulfilledAt: "2026-09-18", fulfillmentNote: "Cumprimento administrativo DEMO" } } as Omit<FleetMutationInput, "requestId">);
      const list = await queryFleet(context, q); assert.equal(list.total, 3); assert.equal(list.rows.find(r => r.id === obligation)?.cells.status, "Cumprida");
      assert.equal(one(await db.select().from(f.fleetDocuments).where(eq(f.fleetDocuments.id, obligation)).limit(1)).dueAt.toISOString().slice(0, 10), "2026-09-25");
      assert.equal((await createFleetReportDataset(context, { query: q })).sections[0].rows.length, 3);
    });
    await t.test("FRO-007 · ocorrências preservam datas/valores e não geram despesa automática", async () => {
      for (const [index, type, involvedValue] of [[0, "MULTA", "160.00"], [1, "ACIDENTE", "4500.00"], [3, "OUTRO", "300.00"], [4, "OUTRO", "120.00"]]) await mutateFleet(context, { requestId: randomUUID(), kind: "occurrence", data: { unitId: ids[Number(index)], type, occurredAt: `2026-09-${12 + Number(index)}`, involvedValue, description: "Ocorrência DEMO" } });
      assert.equal((await queryFleet(context, query({ area: "ocorrencias" }))).total, 4);
      assert.equal((await queryFleet(context, query({ area: "gastos" }))).amount, "2955.00");
    });
    await t.test("FRO-014 · abastecimentos por veículo, tipo correto e recorte completo", async () => {
      const base = { area: "relatorios", report: "abastecimentos", from: "2026-09-01", to: "2026-09-30" };
      const first = await queryFleet(context, query({ ...base, unitId: ids[0] })); assert.equal(first.amount, "414.00"); assert.equal(first.quantities.L, "70");
      const second = await queryFleet(context, query({ ...base, unitId: ids[1] })); assert.equal(second.amount, "360.00"); assert.equal(second.quantities.L, "60");
      const both = await queryFleet(context, query(base)); assert.equal(both.amount, "774.00"); assert.equal(both.quantities.L, "130"); assert.equal(both.total, 3);
      const selected = await queryFleet(context, query({ ...base, unitIds: `${ids[0]},${ids[1]}` })); assert.equal(selected.amount, "774.00"); assert.equal(selected.quantities.L, "130");
      assert.equal((await queryFleet(context, query({ ...base, category: "MAQUINA" }))).total, 0);
    });
    await t.test("FRO-012 · 27 registros, busca global e emissão além da primeira página", async () => {
      for (let i = 1; i <= 27; i++) await mutateFleet(context, { requestId: randomUUID(), kind: "unit", data: { code: `PAG-${String(i).padStart(2, "0")}`, name: `Unidade de paginação DEMO ${i}`, category: i <= 20 ? "VEICULO" : i <= 24 ? "MAQUINA" : "EQUIPAMENTO", status: "ATIVO", departmentId: department.id } });
      const q = query({ q: "PAG-", pageSize: 20 });
      assert.equal((await queryFleet(context, q)).rows.length, 20); assert.equal((await queryFleet(context, query({ q: "PAG-", pageSize: 20, page: 2 }))).rows.length, 7);
      assert.equal((await queryFleet(context, query({ q: "PAG-27" }))).total, 1);
      const dataset = await createFleetReportDataset(context, { query: q }); assert.equal(dataset.sections[0].rows.length, 27);
      const presentation = { institution: null, template: createDefaultReportTemplate(), emission: { issuedAt: "2026-09-18", issuedBy: "Operador DEMO" } };
      const csv = renderTabularCsv(dataset, presentation); assert.match(csv, /PAG-27/);
      assert.ok((await renderTabularXlsx(dataset, presentation)).byteLength > 1000);
      assert.ok((await renderFleetPdf(dataset, presentation)).byteLength > 1000);
    });
    await t.test("Emissões de plano/OS conservam 12 serviços e cópia da programação", async () => {
      const services = Array.from({ length: 12 }, (_, i) => `Serviço ${i + 1} DEMO · descrição completa para impressão`).join("\n");
      const plan = await mutateFleet(context, { requestId: randomUUID(), kind: "plan", data: { unitId: ids[0], title: "Plano longo DEMO", type: "PREVENTIVA", services, firstDueAt: "2026-09-18", intervalDays: "30" } });
      const order = await mutateFleet(context, { requestId: randomUUID(), kind: "generateOrder", planId: plan.id, scheduledAt: "2026-09-18" });
      for (const [documentType, documentId] of [["plan", plan.id], ["order", order.id]] as const) { const report = await createFleetReportDataset(context, { query: query(), documentType, documentId }); assert.equal(report.sections[1].rows.length, 12); assert.match(JSON.stringify(report), /Serviço 12/); }
      await db.update(f.fleetPlans).set({ services: "Modelo de plano alterado" }).where(eq(f.fleetPlans.id, plan.id));
      assert.equal(one(await db.select().from(f.fleetWorkOrders).where(eq(f.fleetWorkOrders.id, order.id)).limit(1)).services, services);
    });
    await t.test("Datas inclusivas, exportação de 12 fatos e custo não informado", async () => {
      const unit = await mutateFleet(context, { requestId: randomUUID(), kind: "unit", data: { code: "BORDAS-DEMO", name: "Unidade isolada de limites DEMO", category: "VEICULO", status: "ATIVO", departmentId: department.id } });
      for (let i = 0; i < 14; i++) await mutateFleet(context, { requestId: randomUUID(), kind: "consumption", data: { unitId: unit.id, type: "COMBUSTIVEL", origin: "PROPRIO", occurredAt: i === 0 ? "2026-08-31" : i === 13 ? "2026-10-01" : i === 12 ? "2026-09-30" : "2026-09-01", material: "Combustível de limites DEMO", measurementUnit: "L", quantity: "1", ...(i !== 5 ? { cost: "1.00" } : {}) } });
      const q = query({ area: "relatorios", report: "abastecimentos", unitId: unit.id, from: "2026-09-01", to: "2026-09-30", pageSize: 20 });
      const list = await queryFleet(context, q); assert.equal(list.total, 12); assert.equal(list.rows.length, 12); assert.equal(list.missingCosts, 1); assert.equal(list.amount, "11.00");
      const report = await createFleetReportDataset(context, { query: q }); assert.equal(report.sections[0].rows.length, 12); assert.equal(report.warnings.length, 1);
      assert.equal((await queryFleet(context, query({ area: "consumos", unitId: unit.id, from: "2026-07-01", to: "2026-07-31" }))).total, 0);
      assert.equal(nextOccurrence(dateOnly("2026-09-10"), 30).toISOString().slice(0, 10), "2026-10-10");
    });
    await t.test("Permissões próprias, escopo de setor, integridade e atomicidade", async () => {
      assert.equal(canViewModule(context.user, "FROTAS"), true); assert.equal(canViewModule(context.user, "OBRAS"), false);
      const readonly: AppContext = { ...context, user: { ...context.user, permissions: JSON.stringify({ modules: { FROTAS: { ...permission, create: false, update: false, issueReports: false } } }) } };
      assert.equal(canPerformModuleOperation(readonly.user, "FROTAS", "issueReports"), false);
      await assert.rejects(mutateFleet(readonly, { requestId: randomUUID(), kind: "expense", data: { unitId: ids[0], occurredAt: "2026-09-18", amount: "1", description: "Não autorizado" } }), /perfil não permite/);
      const outside: AppContext = { ...context, user: { ...context.user, departmentId: otherDepartment.id } };
      assert.equal((await queryFleet(outside, query())).total, 0); assert.equal((await fleetReferences(outside, "units", "DEMO")).length, 0);
      await assert.rejects(mutateFleet(outside, { requestId: randomUUID(), kind: "expense", data: { unitId: ids[0], occurredAt: "2026-09-18", amount: "1", description: "Fora do setor" } }), /fora do seu setor/);
      assert.throws(() => fleetScope({ ...context, user: { ...context.user, departmentId: null } }), /setor/);
      const before = await count(f.fleetConsumptions);
      await memory.exec('CREATE FUNCTION fleet_test_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION \'Falha de teste\'; END $$; CREATE TRIGGER fleet_fail_expense BEFORE INSERT ON "FleetExpense" FOR EACH ROW EXECUTE FUNCTION fleet_test_failure();');
      await assert.rejects(mutateFleet(context, { requestId: randomUUID(), kind: "consumption", data: { unitId: ids[0], type: "COMBUSTIVEL", origin: "PROPRIO", occurredAt: "2026-09-18", quantity: "1", measurementUnit: "L", material: "Falha atômica DEMO", cost: "2" } }));
      await memory.exec('DROP TRIGGER fleet_fail_expense ON "FleetExpense"; DROP FUNCTION fleet_test_failure();');
      assert.equal(await count(f.fleetConsumptions), before);
      assert.ok(await count(auditEvents, eq(auditEvents.eventType, "FLEET_OPERATION_REGISTERED")) > 0);
    });
    await t.test("Duas confirmações concorrentes da mesma ocorrência produzem uma OS", async () => {
      const input = { kind: "generateOrder", planId: planIds[1], scheduledAt: "2026-10-11" };
      const result = await Promise.all([mutateFleet(context, { ...input, requestId: randomUUID() }), mutateFleet(context, { ...input, requestId: randomUUID() })]);
      assert.equal(result[0].id, result[1].id);
      assert.equal(await count(f.fleetWorkOrders, and(eq(f.fleetWorkOrders.planId, planIds[1]), eq(f.fleetWorkOrders.scheduledAt, dateOnly("2026-10-11")))), 1);
    });
    await t.test("DEP-03 · manutenção compartilhada, conclusão em ambos os módulos e uma apropriação", async () => {
      const withPat: AppContext = { ...context, user: { ...context.user, permissions: JSON.stringify({ modules: { FROTAS: permission, PATRIMONIO: permission } }) } };
      const category = one(await db.select().from(assetCategories).limit(1));
      const asset = one(await db.insert(assets).values({ patrimonyNumber: "PAT-INTEGRACAO", name: "Veículo integrado DEMO", brand: "Marca DEMO", model: "Modelo DEMO", status: "Ocioso", acquisitionDate: dateOnly("2026-01-01"), acquisitionValue: 1000, currentValue: 1000, categoryId: category.id, departmentId: department.id }).returning());
      const historic = one(await db.insert(assetMaintenances).values({ assetId: asset.id, description: "Manutenção anterior ao vínculo DEMO", status: "Concluída", startDate: dateOnly("2026-01-02"), endDate: dateOnly("2026-01-03"), cost: 55 }).returning());
      const unit = await mutateFleet(withPat, { requestId: randomUUID(), kind: "unit", data: { code: "V-INTEGRACAO", name: "Unidade integrada DEMO", category: "VEICULO", status: "ATIVO", departmentId: department.id, assetId: asset.id } });
      assert.equal(await count(f.fleetExpenses, eq(f.fleetExpenses.sourceKey, `asset-maintenance:${historic.id}`)), 1);
      assert.equal((await queryFleet(withPat, query({ unitId: unit.id }))).rows[0].detail["Bem · Patrimônio"], "PAT-INTEGRACAO · Veículo integrado DEMO");
      const version = one(await db.select().from(assets).where(eq(assets.id, asset.id)).limit(1));
      await assert.rejects(operateAsset(context, { kind: "startMaintenance", assetId: asset.id, version: version.updatedAt.toISOString(), description: "Sem permissão DEMO", startDate: "2026-09-18" }), /acessar Patrimônio/);
      await operateAsset(withPat, { kind: "startMaintenance", assetId: asset.id, version: version.updatedAt.toISOString(), description: "Serviço iniciado em Patrimônio DEMO", startDate: "2026-09-18" });
      await assert.rejects(operateAsset(withPat, { kind: "startMaintenance", assetId: asset.id, version: version.updatedAt.toISOString(), description: "Serviço iniciado em Patrimônio DEMO", startDate: "2026-09-18" }), /outra sessão/);
      const first = one(await db.select().from(assetMaintenances).where(and(eq(assetMaintenances.assetId, asset.id), eq(assetMaintenances.status, "Em manutenção"))).limit(1));
      assert.equal(one(await db.select().from(f.fleetUnits).where(eq(f.fleetUnits.id, unit.id)).limit(1)).status, "EM_MANUTENCAO");
      await assert.rejects(mutateFleet(context, { requestId: randomUUID(), kind: "usage", data: { unitId: unit.id, startedAt: "2026-09-18T08:00", endedAt: "2026-09-18T09:00", purpose: "Uso durante manutenção" } }), /em manutenção/);
      await assert.rejects(recordAssetDisposal(connection, { assetId: asset.id, date: dateOnly("2026-09-18"), type: "Baixa", reason: "DEMO", justification: "DEMO" }), /manutenções abertas/);
      const another = one(await db.insert(assetMaintenances).values({ assetId: asset.id, description: "Segundo serviço DEMO", startDate: dateOnly("2026-09-18"), status: "Em manutenção" }).returning());
      await operateAsset(withPat, { kind: "completeMaintenance", maintenanceId: first.id, endDate: "2026-09-18", description: "Primeiro serviço executado DEMO", cost: "17.50" });
      assert.equal(one(await db.select().from(assets).where(eq(assets.id, asset.id)).limit(1)).status, "Em manutenção");
      await operateAsset(withPat, { kind: "completeMaintenance", maintenanceId: another.id, endDate: "2026-09-18", description: "Segundo serviço executado DEMO", cost: "0" });
      assert.equal(one(await db.select().from(assets).where(eq(assets.id, asset.id)).limit(1)).status, "Ocioso");
      assert.equal(one(await db.select().from(f.fleetUnits).where(eq(f.fleetUnits.id, unit.id)).limit(1)).status, "ATIVO");
      assert.equal((await queryFleet(withPat, query({ area: "manutencoes", unitId: unit.id }))).amount, "72.50");
      const plan = await mutateFleet(withPat, { requestId: randomUUID(), kind: "plan", data: { unitId: unit.id, title: "Plano integrado DEMO", type: "PREVENTIVA", services: "Serviços DEMO", firstDueAt: "2026-09-18", intervalDays: "30" } });
      const order = await mutateFleet(withPat, { requestId: randomUUID(), kind: "generateOrder", planId: plan.id, scheduledAt: "2026-09-18" });
      const startCommand = { requestId: randomUUID(), kind: "startOrder", orderId: order.id };
      await mutateFleet(context, startCommand); await mutateFleet(context, startCommand);
      const started = one(await db.select().from(f.fleetWorkOrders).where(eq(f.fleetWorkOrders.id, order.id)).limit(1));
      assert.ok(started.assetMaintenanceId);
      assert.equal(await count(assetMaintenances, eq(assetMaintenances.id, started.assetMaintenanceId!)), 1);
      const complete = { kind: "completeMaintenance", maintenanceId: started.assetMaintenanceId!, endDate: "2026-09-18", description: "Execução concluída em Patrimônio DEMO", cost: "200.00" };
      await operateAsset(withPat, complete); await operateAsset(withPat, complete);
      const completed = one(await db.select().from(f.fleetWorkOrders).where(eq(f.fleetWorkOrders.id, order.id)).limit(1));
      assert.equal(completed.status, "CONCLUIDA"); assert.equal(completed.actualCost?.toString(), "200"); assert.match(completed.result!, /Patrimônio/);
      assert.equal(one(await db.select().from(f.fleetPlans).where(eq(f.fleetPlans.id, plan.id)).limit(1)).nextDueAt.toISOString().slice(0, 10), "2026-10-18");
      assert.equal(await count(f.fleetExpenses, eq(f.fleetExpenses.sourceKey, `asset-maintenance:${started.assetMaintenanceId}`)), 1);
      await mutateFleet(context, { requestId: randomUUID(), kind: "completeOrder", data: { orderId: order.id, completedAt: "2026-09-18", performed: completed.performed!, result: completed.result!, actualCost: "200" } });
      assert.equal((await queryFleet(withPat, query({ area: "manutencoes", unitId: unit.id }))).amount, "272.50");
      const child = await mutateFleet(context, { requestId: randomUUID(), kind: "unit", data: { code: "A-INTEGRACAO", name: "Agregado DEMO", category: "AGREGADO", status: "ATIVO", departmentId: department.id, parentId: unit.id } });
      const beforeTransfer = one(await db.select().from(assets).where(eq(assets.id, asset.id)).limit(1));
      const responsible = one(await db.insert(employees).values({ name: "Responsável destino DEMO", departmentId: otherDepartment.id }).returning());
      await operateAsset(withPat, { kind: "transfer", assetId: asset.id, version: beforeTransfer.updatedAt.toISOString(), departmentId: otherDepartment.id, responsibleId: responsible.id, reason: "Transferência integrada DEMO" });
      assert.equal(one(await db.select().from(f.fleetUnits).where(eq(f.fleetUnits.id, unit.id)).limit(1)).responsibleId, responsible.id);
      assert.equal((await queryFleet(context, query({ unitId: unit.id }))).total, 0);
      await assert.rejects(mutateFleet(context, startCommand), /fora do seu setor/);
      const destination: AppContext = { ...withPat, user: { ...withPat.user, departmentId: otherDepartment.id } };
      assert.equal((await queryFleet(destination, query({ area: "manutencoes", unitId: unit.id }))).amount, "272.50");
      assert.equal(one(await db.select().from(f.fleetUnits).where(eq(f.fleetUnits.id, child.id)).limit(1)).parentId, null);
      assert.equal(await count(assetTransfers, eq(assetTransfers.assetId, asset.id)), 1);
      assert.ok(await count(f.fleetAssetEvents, and(eq(f.fleetAssetEvents.unitId, unit.id), eq(f.fleetAssetEvents.fromDepartmentId, department.id), eq(f.fleetAssetEvents.toDepartmentId, otherDepartment.id))));
      await db.update(assets).set({ departmentId: null }).where(eq(assets.id, asset.id));
      assert.equal((await queryFleet(destination, query({ unitId: unit.id }))).total, 0);
      await db.update(assets).set({ departmentId: otherDepartment.id }).where(eq(assets.id, asset.id));
      await recordAssetDisposal(connection, { assetId: asset.id, date: dateOnly("2026-09-18"), type: "Baixa", reason: "DEMO", justification: "Baixa integrada DEMO" });
      const writtenOff = one(await db.select().from(f.fleetUnits).where(eq(f.fleetUnits.id, unit.id)).limit(1));
      assert.equal(writtenOff.status, "INATIVO"); assert.equal(writtenOff.patrimonyStatus, "Baixado"); assert.equal(writtenOff.operationalStatus, "ATIVO");
      await assert.rejects(mutateFleet(destination, { requestId: randomUUID(), kind: "plan", data: { unitId: unit.id, title: "Inválido", type: "PREVENTIVA", services: "Inválido", firstDueAt: "2026-09-18", intervalDays: "30" } }), /baixada/);
      assert.equal((await queryFleet(destination, query({ area: "manutencoes", unitId: unit.id }))).amount, "272.50");
    });
    await t.test("DEP-04 · baixa real de estoque, saída existente, custo de origem e rollback completo", async () => {
      const withPat: AppContext = { ...context, user: { ...context.user, permissions: JSON.stringify({ modules: { FROTAS: permission, PATRIMONIO: permission } }) } };
      const category = one(await db.insert(materialCategories).values({ name: "Insumos DEMO", code: "FLEET-MATERIAL-DEMO" }).returning());
      const material = one(await db.insert(materials).values({ code: "FUEL-INTEGRACAO", name: "Combustível DEMO", unitOfMeasure: "L", categoryId: category.id }).returning());
      const warehouse = one(await db.insert(warehouses).values({ name: "Almoxarifado DEMO" }).returning());
      const stock = one(await db.insert(materialStocks).values({ materialId: material.id, warehouseId: warehouse.id, batchNumber: "DEMO", quantity: 100, unitCost: 5.25 }).returning());
      const command = { requestId: randomUUID(), kind: "consumption", data: { unitId: ids[1], type: "COMBUSTIVEL", origin: "PROPRIO", stockMode: "STOCK_EXIT", stockId: stock.id, material: "Texto informado ignorado", quantity: "20.5", measurementUnit: "KG", cost: "999", occurredAt: "2026-09-18" } };
      await assert.rejects(mutateFleet(context, command), /Almoxarifado/);
      const result = await mutateFleet(withPat, command); await mutateFleet(withPat, command);
      const consumption = one(await db.select().from(f.fleetConsumptions).where(eq(f.fleetConsumptions.id, result.id)).limit(1));
      assert.ok(consumption.stockMovementId); assert.equal(consumption.quantity.toString(), "20.5"); assert.equal(consumption.cost?.toFixed(2), "107.63"); assert.equal(consumption.measurementUnit, "L"); assert.match(consumption.material, /FUEL-INTEGRACAO/);
      assert.equal(one(await db.select().from(materialStocks).where(eq(materialStocks.id, stock.id)).limit(1)).quantity, 79.5);
      assert.equal(await count(materialMovements, eq(materialMovements.stockId, stock.id)), 1);
      assert.equal(await count(f.fleetExpenses, eq(f.fleetExpenses.sourceId, consumption.id)), 1);
      assert.equal(one(await db.select().from(f.fleetExpenses).where(eq(f.fleetExpenses.sourceId, consumption.id)).limit(1)).amount?.toFixed(2), "107.63");
      const reappropriate = { requestId: randomUUID(), kind: "consumption", data: { ...command.data, stockId: undefined, stockMode: "STOCK_MOVEMENT", stockMovementId: consumption.stockMovementId } };
      assert.equal((await mutateFleet(withPat, reappropriate)).id, consumption.id);
      await assert.rejects(mutateFleet(withPat, { ...reappropriate, requestId: randomUUID(), data: { ...reappropriate.data, unitId: ids[0] } }), /já foi apropriada/);
      assert.equal((await fleetReferences(withPat, "stockMovements", "", ids[1])).some(v => v.id === consumption.stockMovementId), false);
      const { movement } = await withDatabaseTransaction(connection, tx => applyStockMovement(tx, { kind: "EXIT", materialId: material.id, warehouseId: warehouse.id, batchNumber: "DEMO", quantity: 10, departmentId: department.id, reason: "Saída anterior DEMO", actor: { usuarioId: actor.id } }));
      const before = one(await db.select().from(materialStocks).where(eq(materialStocks.id, stock.id)).limit(1)).quantity;
      const existing = await mutateFleet(withPat, { ...reappropriate, requestId: randomUUID(), data: { ...reappropriate.data, stockMovementId: movement.id } });
      assert.equal(one(await db.select().from(materialStocks).where(eq(materialStocks.id, stock.id)).limit(1)).quantity, before);
      assert.equal(one(await db.select().from(f.fleetConsumptions).where(eq(f.fleetConsumptions.id, existing.id)).limit(1)).quantity.toString(), "10");
      const counts = [await count(materialMovements), await count(f.fleetConsumptions), await count(f.fleetExpenses)];
      await assert.rejects(mutateFleet(withPat, { ...command, requestId: randomUUID(), data: { ...command.data, quantity: "1000" } }), /insuficiente/);
      assert.deepEqual([await count(materialMovements), await count(f.fleetConsumptions), await count(f.fleetExpenses)], counts);
      await memory.exec('CREATE FUNCTION fleet_test_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION \'Falha de teste\'; END $$; CREATE TRIGGER fleet_fail_expense BEFORE INSERT ON "FleetExpense" FOR EACH ROW EXECUTE FUNCTION fleet_test_failure();');
      await assert.rejects(mutateFleet(withPat, { ...command, requestId: randomUUID(), data: { ...command.data, quantity: "1" } }));
      await memory.exec('DROP TRIGGER fleet_fail_expense ON "FleetExpense"; DROP FUNCTION fleet_test_failure();');
      assert.equal(one(await db.select().from(materialStocks).where(eq(materialStocks.id, stock.id)).limit(1)).quantity, before);
      assert.deepEqual([await count(materialMovements), await count(f.fleetConsumptions), await count(f.fleetExpenses)], counts);
      await db.update(materialStocks).set({ unitCost: null }).where(eq(materialStocks.id, stock.id));
      const unknown = await mutateFleet(withPat, { ...command, requestId: randomUUID(), data: { ...command.data, quantity: "1", type: "LUBRIFICANTE" } });
      assert.equal(one(await db.select().from(f.fleetConsumptions).where(eq(f.fleetConsumptions.id, unknown.id)).limit(1)).cost, null);
      const session = one(await db.insert(inventorySessions).values({ warehouseId: warehouse.id, status: "COUNTING", lockMovements: true, createdByUsuarioId: actor.id }).returning());
      await assert.rejects(mutateFleet(withPat, { ...command, requestId: randomUUID(), data: { ...command.data, quantity: "1" } }), /inventário/);
      await db.update(inventorySessions).set({ status: "CLOSED", lockMovements: false }).where(eq(inventorySessions.id, session.id));
      await db.update(materialStocks).set({ expirationDate: dateOnly("2026-01-01") }).where(eq(materialStocks.id, stock.id));
      await assert.rejects(mutateFleet(withPat, { ...command, requestId: randomUUID() }), /vencido/);
    });
    // The complete installed history is replayed; retain the original additive bootstrap assertion.
    assert.match(readFileSync("prisma/migrations/20260918193000_add_independent_fleet_module/migration.sql", "utf8"), /ON CONFLICT \("codigo"\) DO NOTHING/);
  } finally { await fixture.close(); }
});
