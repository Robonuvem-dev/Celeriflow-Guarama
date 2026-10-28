import { createHash } from "node:crypto";
import PDFDocument from "pdfkit";
import { and, asc, eq, sql } from "drizzle-orm";
import type { FleetContext } from "../src/lib/contracts/fleet";
import type { DatabaseConnection } from "../src/db/connection";
import { databaseConnection } from "../src/db/client";
import { departments, employees, secretariats } from "../src/db/schema/administration";
import { accessProfiles, users } from "../src/db/schema/identity";
import { people as canonicalPeople } from "../src/db/schema/people";
import { companies as canonicalCompanies, suppliers } from "../src/db/schema/registry";
import { assetCategories, assets } from "../src/db/schema/assets";
import { costCenters } from "../src/db/schema/master-data";
import { materialCategories, materials, materialStocks, warehouses } from "../src/db/schema/assets-stock";
import { procurementContracts, purchaseProcesses, purchaseProcessItems } from "../src/db/schema/procurement-core";
import { documentVersions } from "../src/db/schema/document-workflow";
import * as f from "../src/db/schema/fleet";
import { readFleetUnit, requiredFleetRecord as one } from "../src/db/repositories/fleet/records";
import { mutateFleet } from "../src/lib/frotas/service";
import { mutateFleetControl } from "../src/lib/frotas/control-service";
import type { FleetControlOperation } from "../src/lib/frotas/control-policy";
import { submitFleetExternal } from "../src/lib/frotas/control-external";
import { ingestGedDocument } from "../src/lib/documents/document-flow-service";
import { syntheticCpf, syntheticCnpj } from "../src/lib/poc/fixture-catalog";
import { dateOnly } from "../src/lib/frotas/contract";

const prefix = "poc-frota-v1";
const note = "Gestão de transportes e equipamentos de Aurora das Veredas — dados de referência para acompanhamento operacional.";
const id = (key: string) => `${prefix}-${key}`;
const key = (name: string) => { const hex = createHash("sha256").update(id(name)).digest("hex"); return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`; };
type Catalog = { kind: "CTB" | "FIPE"; reference: string; sourceReference: string; complete: boolean; entries: { code: string; name: string; details: Record<string, unknown> }[] };
type Options = { ctb: Catalog; fipe?: Catalog; storeFile: (name: string, bytes: Uint8Array) => Promise<{ url: string; pathname: string }> };

export const fleetPocVehicles = [
  { key: "hb20s", code: "AV-001", name: "Hyundai HB20S Comfort Plus 1.0 Turbo", brand: "Hyundai", model: "HB20S Comfort Plus 1.0 Turbo", year: 2024, plate: "BRA2E19", renavam: "011000111", department: "administracao", category: "VEICULO", meter: "HODOMETRO", fuel: "GASOLINA", tank: "50", color: "Prata", value: 109900, movement: "320", expected: "8" },
  { key: "onix", code: "AV-002", name: "Chevrolet Onix Plus LT 1.0 Turbo", brand: "Chevrolet", model: "Onix Plus LT 1.0 Turbo", year: 2023, plate: "RTA4J62", renavam: "01304567182", department: "administracao", category: "VEICULO", meter: "HODOMETRO", fuel: "GASOLINA", tank: "44", color: "Branco", value: 97900, movement: "240", expected: "8" },
  { key: "cronos", code: "AV-003", name: "Fiat Cronos Drive 1.3 Firefly", brand: "Fiat", model: "Cronos Drive 1.3 Firefly", year: 2024, plate: "QXR8B35", renavam: "01401327841", department: "administracao", category: "VEICULO", meter: "HODOMETRO", fuel: "GASOLINA", tank: "48", color: "Cinza", value: 101990, movement: "400", expected: "8" },
  { key: "hilux", code: "AV-004", name: "Toyota Hilux CD SR 2.8 Diesel 4x4", brand: "Toyota", model: "Hilux CD SR 2.8 Diesel 4x4", year: 2022, plate: "RHE5D84", renavam: "01290876543", department: "obras", category: "VEICULO", meter: "HODOMETRO", fuel: "DIESEL S10", tank: "80", color: "Branco", value: 247900, movement: "150", expected: "8" },
  { key: "sprinter", code: "AV-005", name: "Mercedes-Benz Sprinter 416 CDI Ambulância", brand: "Mercedes-Benz", model: "Sprinter 416 CDI", year: 2023, plate: "RUF3H27", renavam: "01300874562", department: "saude", category: "VEICULO", meter: "HODOMETRO", fuel: "DIESEL S10", tank: "71", color: "Branco", value: 389000, movement: "120", expected: "7" },
  { key: "retro", code: "AV-M01", name: "JCB 3CX Eco Retroescavadeira", brand: "JCB", model: "3CX Eco", year: 2021, plate: "", renavam: "", department: "obras", category: "MAQUINA", meter: "HORIMETRO", fuel: "DIESEL S10", tank: "160", color: "Amarelo", value: 485000, movement: "2", expected: "12" },
  { key: "trator", code: "AV-M02", name: "Massey Ferguson 4275 Trator Agrícola", brand: "Massey Ferguson", model: "4275", year: 2020, plate: "", renavam: "", department: "obras", category: "MAQUINA", meter: "SEM_MARCADOR", fuel: "DIESEL S10", tank: "110", color: "Vermelho", value: 209000, movement: "", expected: "" },
  { key: "gerador", code: "AV-E01", name: "Stemac 75 kVA Grupo Gerador", brand: "Stemac", model: "75 kVA", year: 2022, plate: "", renavam: "", department: "saude", category: "EQUIPAMENTO", meter: "HORIMETRO", fuel: "DIESEL S10", tank: "120", color: "Azul", value: 84900, movement: "", expected: "10" },
  { key: "carreta", code: "AV-A01", name: "Randon Reboque Agrícola 6 Toneladas", brand: "Randon", model: "Agrícola 6T", year: 2021, plate: "", renavam: "", department: "obras", category: "AGREGADO", meter: "SEM_MARCADOR", fuel: "", tank: "", color: "Verde", value: 28900, movement: "", expected: "" },
] as const;

async function documentBytes(title: string, content: string) {
  const doc = new PDFDocument({ size: "A4", margin: 48 }), chunks: Buffer[] = [];
  const result = new Promise<Buffer>((resolve, reject) => { doc.on("data", chunk => chunks.push(Buffer.from(chunk))); doc.on("end", () => resolve(Buffer.concat(chunks))); doc.on("error", reject); });
  doc.fontSize(18).text("Aurora das Veredas — Gestão de Frota"); doc.moveDown().fontSize(13).text(title); doc.moveDown().fontSize(11).text(content); doc.moveDown().fontSize(9).text(note); doc.end(); return result;
}

export async function populateFleetPoc(context: FleetContext, options: Options, connection: DatabaseConnection = databaseConnection) {
  const db = connection.db, actorId = context.user.id;
  const fleetContext = { ...context, database: db };
  const [previous] = await db.select().from(f.fleetUnits).where(eq(f.fleetUnits.code, "AV-001")).limit(1);
  if (previous && !previous.notes?.includes(prefix) && !previous.notes?.includes("DATASET=aurora-frota-v1")) throw new Error("Código AV-001 pertence a outro cadastro; preserve a origem existente.");
  const anchor = previous?.createdAt || new Date(), baseDay = previous?.notes?.match(/(?:POC_)?REFERENCE_DATE=(\d{4}-\d{2}-\d{2})/)?.[1] || new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo" }).format(anchor);
  const day = (offset = 0) => new Date(dateOnly(baseDay).getTime() + offset * 86400000).toISOString().slice(0, 10);
  const instant = (days: number, hours = 9) => new Date(`${day(days)}T${String(hours).padStart(2, "0")}:00:00-03:00`).toISOString();
  const validUntil = instant(180), units: Record<string, string> = {}, drivers: Record<string, string> = {}, external: { code: string; cnpj: string; token?: string; kind: string }[] = [];
  const control = (name: string, operation: FleetControlOperation, data: Record<string, unknown>) => mutateFleetControl(fleetContext, { requestId: key(name), operation, data }, connection);
  const fleet = (name: string, input: Record<string, unknown>) => mutateFleet(fleetContext, { requestId: key(name), ...input }, connection);
  await db.insert(secretariats).values({ id: id("secretaria"), name: "Secretaria de Gestão e Serviços Municipais" }).onConflictDoNothing({ target: secretariats.id });
  for (const [suffix, name] of [["administracao", "Departamento de Administração e Transportes"], ["obras", "Departamento de Obras e Conservação Viária"], ["saude", "Departamento de Atenção à Saúde"]]) {
    await db.insert(departments).values({ id: id(suffix), name, secretariatId: id("secretaria") }).onConflictDoNothing({ target: departments.id });
    await db.insert(costCenters).values({ id: id(`centro-${suffix}`), code: `AV-FROTA-${suffix.toUpperCase()}`, name: `Frota — ${name}`, secretariatId: id("secretaria") }).onConflictDoNothing({ target: costCenters.id });
  }
  await db.insert(accessProfiles).values({ codigo: "POC_FROTA_OPERADOR", nome: "Operador de Frota", descricao: "Operação e acompanhamento dos transportes municipais.", permissoes: JSON.stringify({ modules: { FROTAS: { blocked: false, create: true, update: true, issueReports: true } } }) }).onConflictDoNothing({ target: accessProfiles.codigo });
  const operatorProfile = one(await db.select().from(accessProfiles).where(eq(accessProfiles.codigo, "POC_FROTA_OPERADOR")).limit(1));
  const people = [
    { suffix: "marcos", name: "Marcos André Ribeiro", department: "administracao", category: "B", expiry: day(1100), outsourced: false },
    { suffix: "roberto", name: "Roberto Carlos Nogueira", department: "obras", category: "C", expiry: day(900), outsourced: false },
    { suffix: "ana", name: "Ana Paula Ferreira", department: "saude", category: "D", expiry: day(1000), outsourced: false },
    { suffix: "terceiro", name: "Cláudio Henrique Batista", department: "administracao", category: "B", expiry: day(850), outsourced: true },
    { suffix: "vencida", name: "Sérgio Luiz Teixeira", department: "administracao", category: "B", expiry: day(-45), outsourced: false },
    { suffix: "pontos", name: "Eduardo César Martins", department: "administracao", category: "B", expiry: day(800), outsourced: false },
    { suffix: "sem-cnh", name: "Luciana Beatriz Costa", department: "administracao", category: "B", expiry: day(800), outsourced: false },
  ];
  for (const [index, person] of people.entries()) {
    await db.insert(canonicalPeople).values({ id: id(`pessoa-${person.suffix}`), fullName: person.name, cpf: syntheticCpf(8700 + index) }).onConflictDoNothing({ target: canonicalPeople.id });
    if (!person.outsourced) await db.insert(employees).values({ id: id(`servidor-${person.suffix}`), name: person.name, registration: `FT${String(210 + index).padStart(5, "0")}`, personId: id(`pessoa-${person.suffix}`), departmentId: id(person.department), secretariatId: id("secretaria"), email: `${person.suffix}@auroradasveredas.example` }).onConflictDoNothing({ target: employees.id });
    if (person.suffix !== "sem-cnh") drivers[person.suffix] = (await control(`motorista-${person.suffix}`, "driver", { employeeId: person.outsourced ? "" : id(`servidor-${person.suffix}`), personId: person.outsourced ? id(`pessoa-${person.suffix}`) : "", departmentId: id(person.department), outsourced: person.outsourced, cnhNumber: `${String(41876543210 + index)}`, cnhCategories: [person.category], cnhExpiresAt: person.expiry, active: true, pointLimit: 20, pointWindowMonths: 12, policyReference: "Política de condução municipal: bloqueio operacional por 20 pontos na janela de 12 meses." })).id;
  }
  for (const suffix of ["marcos", "roberto", "ana"]) await db.insert(users).values({ id: id(`usuario-${suffix}`), nome: people.find(person => person.suffix === suffix)!.name, email: `${suffix}.frota@auroradasveredas.example`, perfilId: operatorProfile.id, employeeId: id(`servidor-${suffix}`) }).onConflictDoNothing({ target: users.id });
  await db.insert(assetCategories).values({ id: id("bens"), code: "AV-FROTA-BENS", name: "Veículos e equipamentos operacionais", lifeSpan: 120 }).onConflictDoNothing({ target: assetCategories.id });
  const machineType = await control("tipo-maquina", "machineType", { code: "AV-MAQ", name: "Máquinas de conservação viária e agrícola", active: true, fields: [{ code: "potencia", label: "Potência (cv)", type: "NUMBER", required: true, options: [] }, { code: "implemento", label: "Implemento principal", type: "TEXT", required: false, options: [] }] });
  for (const [index, vehicle] of fleetPocVehicles.entries()) {
    await db.insert(assets).values({ id: id(`bem-${vehicle.key}`), patrimonyNumber: `AV-${String(1040 + index)}`, name: vehicle.name, description: note, brand: vehicle.brand, model: vehicle.model, status: "Ativo", acquisitionDate: dateOnly(`${vehicle.year}-03-15`), acquisitionValue: vehicle.value, currentValue: vehicle.value * .9, categoryId: id("bens"), departmentId: id(vehicle.department), responsibleId: id(`servidor-${vehicle.department === "obras" ? "roberto" : vehicle.department === "saude" ? "ana" : "marcos"}`), invoiceNumber: `NF-e ${65000 + index}` }).onConflictDoNothing({ target: assets.id });
    const record = await fleet(`unidade-${vehicle.key}`, { kind: "unit", data: { code: vehicle.code, name: vehicle.name, category: vehicle.category, status: "ATIVO", departmentId: id(vehicle.department), responsibleId: id(`servidor-${vehicle.department === "obras" ? "roberto" : vehicle.department === "saude" ? "ana" : "marcos"}`), plate: vehicle.plate, renavam: vehicle.renavam, brand: vehicle.brand, model: vehicle.model, year: String(vehicle.year), assetId: id(`bem-${vehicle.key}`), notes: `DATASET=aurora-frota-v1 · REFERENCE_DATE=${baseDay} · ${note}`, ...(vehicle.category === "AGREGADO" ? { parentId: units.retro } : {}) } });
    units[vehicle.key] = record.id;
    await control(`ficha-${vehicle.key}`, "unitControl", { unitId: record.id, version: "", species: vehicle.category === "VEICULO" ? "Passageiro / utilitário" : vehicle.category, color: vehicle.color, fuelType: vehicle.fuel, tankCapacity: vehicle.tank, meterType: vehicle.meter, currentReading: vehicle.meter === "SEM_MARCADOR" ? "" : "1000", expectedConsumption: vehicle.expected, tolerancePercent: 10, costCenterId: id(`centro-${vehicle.department}`), machineTypeId: vehicle.category === "MAQUINA" ? machineType.id : "", machineValues: vehicle.category === "MAQUINA" ? { potencia: vehicle.key === "retro" ? "92" : "75", implemento: vehicle.key === "retro" ? "Caçamba dianteira e braço retroescavador" : "Grade aradora" } : {}, allowedLicenseCategories: [vehicle.department === "obras" ? "C" : vehicle.department === "saude" ? "D" : "B"] });
  }
  async function evidence(suffix: string, unitId: string, ownerType: string, ownerId: string, title: string, text: string) {
    const [existing] = await db.select().from(f.fleetAttachments).where(eq(f.fleetAttachments.id, id(`anexo-${suffix}`))).limit(1); if (existing) return existing.versionId;
    const bytes = await documentBytes(title, text), storage = await options.storeFile(`${id(suffix)}.pdf`, bytes);
    const result = await ingestGedDocument(connection, { title, documentType: "Anexo de Frota", documentClassCode: "FLEET_EVIDENCE", fileUrl: storage.url, content: bytes, actorUsuarioId: actorId, afterCreate: async (tx, documentId) => { const version = one(await tx.select().from(documentVersions).where(and(eq(documentVersions.documentId, documentId), eq(documentVersions.versionNumber, 1))).limit(1)); await tx.insert(f.fleetAttachments).values({ id: id(`anexo-${suffix}`), unitId, ownerType, ownerId, documentId, versionId: version.id, pathname: storage.pathname, filename: `aurora-frota-${suffix}.pdf`, size: bytes.length, mimeType: "application/pdf", ownerActorId: actorId }); } });
    return result.version.id;
  }
  const ctb = await control("catalogo-ctb", "catalog", options.ctb);
  const fipe = options.fipe ? await control("catalogo-fipe", "catalog", options.fipe) : null;
  if (fipe && !(await db.select().from(f.fleetControlEvents).where(eq(f.fleetControlEvents.requestId, key("vinculo-fipe"))).limit(1)).length) {
    const model = one(await db.select().from(f.fleetCatalogEntries).where(and(eq(f.fleetCatalogEntries.versionId, fipe.id), eq(f.fleetCatalogEntries.code, "Hyundai-10821"))).limit(1));
    const unit = await readFleetUnit(db, { administrator: true, departmentId: null }, units.hb20s);
    if (!unit) throw new Error("Unidade da carga não encontrada.");
    const info = model.details as { brand: string; model: string };
    // The FIPE sample comes from a published model lookup; reconcile the source
    // first rather than attach a conflicting brand/model to the vehicle.
    await db.update(assets).set({ brand: info.brand, model: info.model }).where(eq(assets.id, unit.assetId!));
    await control("vinculo-fipe", "unitControl", { unitId: unit.id, version: unit.control!.updatedAt.toISOString(), species: unit.control!.species, color: unit.control!.color, fuelType: unit.control!.fuelType, tankCapacity: "50", meterType: "HODOMETRO", currentReading: "1000", expectedConsumption: "8", tolerancePercent: 10, acquisitionDate: "", costCenterId: id("centro-administracao"), fipeModelId: model.id, machineTypeId: "", machineValues: {}, fixedRouteId: "", allowedLicenseCategories: ["B"] });
  }
  const companies = [{ suffix: "posto", name: "Auto Posto Serra Clara Ltda.", trade: "Posto Serra Clara" }, { suffix: "oficina", name: "Mecânica Horizonte Diesel e Auto Center Ltda.", trade: "Horizonte Auto Center" }, { suffix: "seguro", name: "Veredas Companhia de Seguros S.A.", trade: "Veredas Seguros" }];
  for (const [index, company] of companies.entries()) {
    await db.insert(canonicalCompanies).values({ id: id(company.suffix), corporateName: company.name, tradeName: company.trade, cnpj: syntheticCnpj(8800 + index) }).onConflictDoNothing({ target: canonicalCompanies.id });
    await db.insert(suppliers).values({ id: id(`fornecedor-${company.suffix}`), companyId: id(company.suffix) }).onConflictDoNothing({ target: suppliers.id });
  }
  const provider = await control("credenciar-posto", "provider", { supplierId: id("fornecedor-posto"), kind: "POSTO", active: true });
  const workshop = await control("credenciar-oficina", "provider", { supplierId: id("fornecedor-oficina"), kind: "OFICINA", active: true });
  const agreements: Record<string, string> = {};
  await db.insert(materialCategories).values({ id: id("combustiveis"), code: "AV-COMB", name: "Combustíveis e lubrificantes" }).onConflictDoNothing({ target: materialCategories.id });
  await db.insert(warehouses).values({ id: id("almoxarifado"), name: "Garagem Municipal — Tanques e Peças", costCenterId: id("centro-obras") }).onConflictDoNothing({ target: warehouses.id });
  for (const [index, fuel] of ["GASOLINA", "DIESEL S10"].entries()) {
    const suffix = index === 0 ? "gasolina" : "diesel";
    await db.insert(materials).values({ id: id(suffix), code: `AV-${suffix.toUpperCase()}`, name: fuel === "GASOLINA" ? "Gasolina comum" : "Óleo diesel S10", unitOfMeasure: "L", categoryId: id("combustiveis") }).onConflictDoNothing({ target: materials.id });
    await db.insert(materialStocks).values({ id: id(`estoque-${suffix}`), warehouseId: id("almoxarifado"), materialId: id(suffix), batchNumber: `AV-${anchor.getUTCFullYear()}-10`, quantity: 2000, unitCost: index === 0 ? 6.19 : 5.89 }).onConflictDoNothing({ target: materialStocks.id });
    await db.insert(purchaseProcesses).values({ id: id(`pregao-${suffix}`), number: `AV-PE-${String(18 + index).padStart(3, "0")}/${anchor.getUTCFullYear()}`, object: `${fuel} para abastecimento da frota municipal.`, type: "Registro de Preços", modality: "Pregão", secretariatId: id("secretaria") }).onConflictDoNothing({ target: purchaseProcesses.id });
    await db.insert(purchaseProcessItems).values({ id: id(`item-${suffix}`), purchaseProcessId: id(`pregao-${suffix}`), materialId: id(suffix), quantity: 12000, estimatedUnitValue: index === 0 ? 6.19 : 5.89 }).onConflictDoNothing({ target: purchaseProcessItems.id });
    await db.insert(procurementContracts).values({ id: id(`contrato-${suffix}`), number: `AV-CT-${String(42 + index).padStart(3, "0")}/${anchor.getUTCFullYear()}`, object: `${fuel} — fornecimento por demanda.`, initialValue: index === 0 ? 74280 : 70680, updatedValue: index === 0 ? 74280 : 70680, startDate: dateOnly(day(-120)), endDate: dateOnly(day(365)), processId: id(`pregao-${suffix}`), supplierId: id("fornecedor-posto"), secretariatId: id("secretaria"), status: "Vigente" }).onConflictDoNothing({ target: procurementContracts.id });
    const proof = await evidence(`contrato-${suffix}`, units.hb20s, "CONTRATO", id(`contrato-${suffix}`), `Quantitativo contratado — ${fuel}`, "Fornecimento de 12.000 litros, com saldo operacional reservado e consumido por autorização.");
    agreements[fuel] = (await control(`saldo-${suffix}`, "fuelAgreement", { contractId: id(`contrato-${suffix}`), purchaseItemId: id(`item-${suffix}`), providerId: provider.id, fuelType: fuel, contracted: "12000", unitPrice: index === 0 ? "6.190000" : "5.890000", evidenceVersionId: proof })).id;
  }
  for (const vehicle of fleetPocVehicles.filter(item => item.category === "VEICULO")) {
    const unitId = units[vehicle.key];
    for (const [index, reading] of ["1000", String(1000 + Number(vehicle.movement))].entries()) {
      const auth = await control(`abastecimento-${vehicle.key}-${index}`, "fuelAuthorization", { unitId, origin: "TERCEIRO", providerId: provider.id, agreementId: agreements[vehicle.fuel], quantity: index === 0 ? "30" : "40", description: `${index === 0 ? "Abastecimento inicial" : "Reposição após percurso"} — ${vehicle.name}`, validUntil });
      await control(`confirmar-${vehicle.key}-${index}`, "confirmFuel", { authorizationId: auth.id, quantity: index === 0 ? "30" : "40", reading, unitPrice: "" });
    }
  }
  const own = await control("abastecimento-proprio", "fuelAuthorization", { unitId: units.hilux, origin: "PROPRIO", stockId: id("estoque-diesel"), quantity: "25", description: "Abastecimento no tanque da garagem para conservação das estradas rurais", validUntil });
  await control("confirmar-proprio", "confirmFuel", { authorizationId: own.id, quantity: "25", reading: "1180" });
  const pending = await control("abastecimento-pendente", "fuelAuthorization", { unitId: units.hb20s, driverId: drivers.marcos, origin: "TERCEIRO", providerId: provider.id, agreementId: agreements.GASOLINA, quantity: "35", description: "Viagem administrativa a Serra Clara — autorização para frentista", validUntil });
  external.push({ code: one(await db.select().from(f.fleetAuthorizations).where(eq(f.fleetAuthorizations.id, pending.id)).limit(1)).code, cnpj: syntheticCnpj(8800), token: pending.token, kind: "POSTO" });
  await control("cota-hb20", "quota", { unitId: units.hb20s, period: day().slice(0, 7), limit: "250" });
  for (const [suffix, unitId, driverId, department, reading] of [["administrativa", units.hb20s, drivers.marcos, "administracao", "1350"], ["rural", units.retro, drivers.roberto, "obras", "1002"], ["trator", units.trator, drivers.roberto, "obras", ""]]) {
    const destination = await control(`destino-${suffix}`, "destination", { name: suffix === "administrativa" ? "Centro Administrativo de Serra Clara" : suffix === "trator" ? "Comunidade Riacho Grande — Campo Experimental" : "Comunidade Vale Verde — Estrada da Cachoeira", city: suffix === "administrativa" ? "Serra Clara" : "Aurora das Veredas", address: suffix === "administrativa" ? "Avenida das Nascentes, 420" : "Estrada Municipal AV-012, km 8", distance: "42", departmentId: id(department) });
    const route = await fleet(`rota-${suffix}`, { kind: "route", data: { code: `AV-${suffix.toUpperCase()}`, name: suffix === "administrativa" ? "Aurora das Veredas — Serra Clara" : "Garagem — Comunidade Vale Verde", origin: "Garagem Municipal", destination: "Comunidade / centro administrativo", itinerary: "Garagem Municipal → Avenida do Ipê → Rodovia de acesso → destino → retorno", departmentId: id(department), active: "true" } });
    if (!(await db.select().from(f.fleetControlEvents).where(eq(f.fleetControlEvents.requestId, key(`rota-fixa-${suffix}`))).limit(1)).length) {
      const current = one(await db.select().from(f.fleetUnitControls).where(eq(f.fleetUnitControls.unitId, unitId)).limit(1));
      await control(`rota-fixa-${suffix}`, "unitControl", { unitId, version: current.updatedAt.toISOString(), species: current.species || "", color: current.color || "", fuelType: current.fuelType || "", tankCapacity: current.tankCapacity?.toString() || "", meterType: current.meterType, currentReading: current.currentReading?.toString() || "", expectedConsumption: current.expectedConsumption?.toString() || "", tolerancePercent: current.tolerancePercent.toNumber(), costCenterId: current.costCenterId || "", acquisitionDate: "", fipeModelId: current.fipeModelId || "", machineTypeId: current.machineTypeId || "", machineValues: current.machineValues, fixedRouteId: route.id, allowedLicenseCategories: current.allowedLicenseCategories });
    }
    const agendaDay = suffix === "trator" ? 3 : 2;
    await control(`agenda-${suffix}`, "booking", { unitId, driverId, routeId: route.id, destinationId: destination.id, kind: "VIAGEM", purpose: suffix === "administrativa" ? "Reunião de gestão do consórcio regional" : "Conservação e patrolamento de estrada rural", startsAt: instant(agendaDay), endsAt: instant(agendaDay, 17) });
    const trip = await control(`saida-${suffix}`, "depart", { unitId, driverId, routeId: route.id, destinationId: destination.id, destination: "Destino cadastrado", purpose: "Deslocamento operacional com conferência na guarita", reading: reading ? String(Number(reading) - (suffix === "administrativa" ? 30 : 2)) : "", checklist: { pneus: true, documentos: true, equipamentos: true } });
    await control(`retorno-${suffix}`, "arrive", { tripId: trip.id, reading, reason: "Retorno conferido pelo responsável da garagem" });
  }
  for (const [index, kind] of ["SERVICO", "CONSERTO", "OBRIGACAO"].entries()) await control(`agenda-${kind}`, "booking", { unitId: units.hilux, kind, purpose: kind === "OBRIGACAO" ? "Regularização do licenciamento anual" : kind === "CONSERTO" ? "Reparo da suspensão dianteira" : "Revisão preventiva e troca de óleo", startsAt: instant(5 + index), endsAt: instant(5 + index, 17) });
  for (const [index, vehicle] of fleetPocVehicles.filter(item => item.category === "VEICULO").entries()) {
    const unitId = units[vehicle.key];
    await fleet(`seguro-${vehicle.key}`, { kind: "document", data: { unitId, kind: "SEGURO", type: "FACULTATIVO", title: `Seguro compreensivo — ${vehicle.plate}`, reference: `AV-AP-${90210 + index}`, insurerId: id("fornecedor-seguro"), startsAt: day(-180), dueAt: day(180), value: "2840.90", notes: note } });
    const license = await fleet(`licenciamento-${vehicle.key}`, { kind: "document", data: { unitId, kind: "OBRIGACAO", type: "LICENCIAMENTO", title: `Licenciamento anual — ${vehicle.plate}`, reference: `${anchor.getUTCFullYear()}`, scheduledAt: day(index === 0 ? -15 : index === 3 ? -3 : 3), dueAt: day(index === 0 ? -10 : 30), value: "159.70", notes: note } });
    if (index === 3) await fleet("licenciamento-cumprido", { kind: "fulfillDocument", data: { documentId: license.id, fulfilledAt: day(), fulfillmentNote: "Providência documental concluída na base fictícia; não constitui comprovação bancária." } });
    await evidence(`documento-${vehicle.key}`, unitId, "VEICULO", unitId, `Ficha de identificação — ${vehicle.name}`, `Placa: ${vehicle.plate}. RENAVAM: ${vehicle.renavam}. Ano: ${vehicle.year}.`);
  }
  await fleet("seguro-obrigatorio-historico", { kind: "document", data: { unitId: units.hb20s, kind: "SEGURO", type: "OBRIGATORIO", title: "Seguro obrigatório — referência histórica", reference: "AV-SO-01842", insurerId: id("fornecedor-seguro"), startsAt: day(-180), dueAt: day(-15), value: "68.13", notes: "Referência histórica para consulta; não presume exigência legal vigente." } });
  for (const [kind, brand, specification, cost] of [["PNEU", "Pirelli", "185/60 R15 84H", "459.90"], ["BATERIA", "Moura", "60 Ah — polo positivo direito", "529.90"]]) for (const index of [0, 1]) {
    const component = await control(`componente-${kind}-${index}`, "component", { kind, identifier: `${kind === "PNEU" ? "PN" : "BT"}-AV-2026-${String(1150 + index)}`, brand, specification, expectedLife: "40000" });
    await control(`instalar-${kind}-${index}`, "installComponent", { componentId: component.id, unitId: units.hb20s, position: kind === "PNEU" ? "DIANTEIRO_ESQUERDO" : "SUPORTE_MOTOR", installedAt: instant(-30 + index * 20), reading: index === 0 ? "900" : "980", reason: index === 0 ? "Instalação preventiva registrada" : "Substituição por desgaste após inspeção", cost });
  }
  await db.insert(purchaseProcesses).values({ id: id("dispensa"), number: `AV-DL-011/${anchor.getUTCFullYear()}`, object: "Revisão e manutenção da frota.", type: "Comum", modality: "Dispensa", secretariatId: id("secretaria") }).onConflictDoNothing({ target: purchaseProcesses.id });
  for (const origin of ["PROPRIO", "TERCEIRO"] as const) {
    const auth = await control(`servico-${origin}`, "serviceAuthorization", { unitId: origin === "PROPRIO" ? units.hilux : units.hb20s, origin, providerId: origin === "TERCEIRO" ? workshop.id : "", purchaseProcessId: id("dispensa"), scheduledAt: day(), amountLimit: "1800.00", description: origin === "PROPRIO" ? "Revisão de freios e lubrificação na garagem municipal" : "Alinhamento, balanceamento e revisão da suspensão", validUntil });
    const authorization = one(await db.select().from(f.fleetAuthorizations).where(eq(f.fleetAuthorizations.id, auth.id)).limit(1));
    await fleet(`iniciar-${origin}`, { kind: "startOrder", orderId: authorization.workOrderId });
    if (origin === "TERCEIRO") {
      let [report] = await db.select().from(f.fleetWorkshopReports).where(eq(f.fleetWorkshopReports.authorizationId, auth.id)).limit(1);
      if (!report) { let token = auth.token; if (!token) token = (await control("recuperar-token-oficina", "renewCredential", { authorizationId: auth.id })).token; await submitFleetExternal(connection, { requestId: key("envio-oficina"), kind: "OFICINA", code: authorization.code, cnpj: syntheticCnpj(8801), token, performed: "Alinhamento e balanceamento realizados; suspensão inspecionada", parts: "Buchas e terminais inspecionados", amount: "690.00" }); report = one(await db.select().from(f.fleetWorkshopReports).where(eq(f.fleetWorkshopReports.authorizationId, auth.id)).limit(1)); }
      await control("conferir-oficina", "reviewWorkshop", { reportId: report.id, approved: true, reason: "Serviços e orçamento conferidos pelo setor de transportes" });
    }
    await control(`concluir-${origin}`, "executeService", { authorizationId: auth.id, completedAt: day(), performed: origin === "PROPRIO" ? "Revisão de freios e lubrificação na garagem municipal" : "Alinhamento e balanceamento realizados; suspensão inspecionada", result: "Veículo liberado após inspeção funcional", actualCost: origin === "PROPRIO" ? "280.00" : "690.00" });
  }
  const plan = await fleet("plano-preventivo", { kind: "plan", data: { unitId: units.hb20s, title: "Plano semestral de revisão — HB20S", type: "PREVENTIVA", services: "Troca de óleo 5W30\nFiltro de óleo\nFiltro de ar\nInspeção dos freios\nRodízio de pneus", firstDueAt: day(15), intervalDays: "180", estimatedCost: "890.00" } });
  await fleet("os-prevista", { kind: "generateOrder", planId: plan.id, scheduledAt: day(15) });
  await fleet("lubrificante", { kind: "consumption", data: { unitId: units.hilux, type: "LUBRIFICANTE", origin: "TERCEIRO", occurredAt: day(), material: "Óleo lubrificante Mobil Delvac 15W40", quantity: "7", measurementUnit: "L", cost: "238.00", supplierId: id("fornecedor-oficina"), reference: "NF 68415", stockMode: "LOCAL" } });
  await fleet("gasto-gerador", { kind: "expense", data: { unitId: units.gerador, occurredAt: day(-35), amount: "380.00", description: "Revisão preventiva e substituição do filtro do grupo gerador", reference: "OS 1842" } });
  const entry = one(await db.select().from(f.fleetCatalogEntries).where(and(eq(f.fleetCatalogEntries.versionId, ctb.id), sql`${f.fleetCatalogEntries.details}->'points' = '5'::jsonb`)).orderBy(asc(f.fleetCatalogEntries.code)).limit(1));
  const payable = await control("multa-parcelada", "fine", { unitId: units.hb20s, driverId: drivers.marcos, ctbEntryId: entry.id, aitNumber: `AV${anchor.getUTCFullYear()}003184`, city: "Serra Clara", occurredAt: day(-20), dueAt: day(20), amount: "195.23" });
  const proof = await evidence("pagamento-multa", units.hb20s, "MULTA", payable.id, "Registro de parcela de multa", "Parcela registrada: R$ 95,23. Referência: AV-003184. Registro administrativo de referência, sem comprovação bancária.");
  await control("parcela-multa", "payFine", { fineId: payable.id, paidAt: day(), amount: "95.23", proofVersionId: proof, reason: "Registro da primeira parcela da notificação" });
  for (let index = 0; index < 4; index++) await control(`multa-pontos-${index}`, "fine", { unitId: units.onix, driverId: drivers.pontos, ctbEntryId: entry.id, aitNumber: `AV${anchor.getUTCFullYear()}004${String(210 + index)}`, city: "Aurora das Veredas", occurredAt: day(-10 - index), dueAt: day(15), amount: "195.23" });
  await control("avaria", "occurrence", { unitId: units.hilux, type: "AVARIA", occurredAt: day(-5), description: "Trinca no para-brisa identificada na inspeção de retorno da estrada rural", latitude: -19.924, longitude: -43.937, involvedValue: "780.00" });
  const accident = await control("acidente", "occurrence", { unitId: units.hb20s, type: "ACIDENTE", occurredAt: day(-3), description: "Colisão lateral de baixa velocidade no cruzamento da Avenida do Ipê com a Rua das Palmeiras", latitude: -19.926, longitude: -43.938, involvedValue: "4250.00" });
  const claim = await control("sinistro", "claim", { occurrenceId: accident.id, responsibility: "TERCEIROS", workshopProviderId: workshop.id, parties: [{ plate: "BRA2E19", owner: "Prefeitura Municipal de Aurora das Veredas", driver: "Marcos André Ribeiro" }, { plate: "QWM6F48", owner: "Paulo Henrique Moreira", driver: "Paulo Henrique Moreira" }] });
  await control("encaminhar-sinistro", "claimStatus", { claimId: claim.id, status: "ENCAMINHADO", workshopProviderId: workshop.id, reason: "Veículo encaminhado à Horizonte Auto Center para orçamento" });
  await evidence("sinistro", units.hb20s, "SINISTRO", claim.id, "Registro de ocorrência e sinistro", "Partes identificadas, apólice vinculada automaticamente e oficina de encaminhamento registrada.");
  return { dataset: prefix, note, referenceDate: day(), units, drivers, departments: [id("administracao"), id("obras"), id("saude")], external, ctbEntries: options.ctb.entries.length, fipeLoaded: Boolean(fipe), operators: ["marcos", "roberto", "ana"].map(suffix => `${suffix}.frota@auroradasveredas.example`) };
}
