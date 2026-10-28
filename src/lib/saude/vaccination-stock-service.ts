import { z } from "zod";
import { and, eq, sql } from "drizzle-orm";
import { databaseConnection } from "@/db/client";
import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction, type DatabaseTransaction } from "@/db/transaction";
import { materialMovements, warehouses } from "@/db/schema/assets-stock";
import { healthVaccineLotProfiles, healthVaccineManufacturers, healthVaccineOpenedVials } from "@/db/schema/health-vaccination";
import { allocatedVaccinationDoses, readVaccinationStock, readVaccinationStockIdentity, readVaccinationVaccine, vaccinationInventoryOpen, vaccinationRecord } from "@/db/repositories/health-vaccination/records";
import type { HealthVaccinationContext } from "@/lib/contracts/health-vaccination";
import { assertHealthUnitAccess } from "@/lib/platform/tenant-context";
import { postHealthStockReceipt } from "./health-stock-service";
import { applyStockMovement } from "@/lib/patrimonio/stock-service";
import { pharmacyDispensationAccess } from "./pharmacy-dispensation-service";
import { vaccineLotExpiresAt } from "./vaccination-card-policy";

export async function receiveVaccineVials(context: HealthVaccinationContext, raw: unknown, connection: DatabaseConnection = databaseConnection) {
  const input = z.object({ vaccineId: z.string().min(1), warehouseId: z.string().min(1), batchNumber: z.string().trim().min(1).max(80), expirationDate: z.coerce.date(), vials: z.number().int().positive(), dosesPerVial: z.number().int().positive().max(1000), costPerVial: z.number().nonnegative(), manufacturerId: z.string().nullable(), entryType: z.string().trim().min(1), supplierId: z.string().nullable(), donorName: z.string().nullable(), idempotencyKey: z.string().min(8).max(180) }).strict().parse(raw);
  const executor = context.database ?? connection.db;
  const vaccine = await readVaccinationVaccine(executor, input.vaccineId, true);
  if (!vaccine.material || !["UN", "DOSE", "DOSES"].includes(vaccine.material.unitOfMeasure.toUpperCase())) throw new Error("Selecione imunobiológico cujo estoque está em doses.");
  const manufacturer = input.manufacturerId ? vaccinationRecord((await executor.select().from(healthVaccineManufacturers).where(and(eq(healthVaccineManufacturers.id, input.manufacturerId), eq(healthVaccineManufacturers.isActive, true))).limit(1))[0]) : null;
  return postHealthStockReceipt(context, { warehouseId: input.warehouseId, entryType: input.entryType, supplierId: input.supplierId, donorName: input.donorName, idempotencyKey: input.idempotencyKey, items: [{ materialId: vaccine.material.id, batchNumber: input.batchNumber, expirationDate: input.expirationDate, quantity: input.vials * input.dosesPerVial, unitCost: input.costPerVial / input.dosesPerVial, manufacturerName: manufacturer?.name || null, vaccineDosesPerVial: input.dosesPerVial, vaccineManufacturerId: input.manufacturerId }] }, connection);
}

export async function openVaccineVialInTransaction(tx: DatabaseTransaction, context: HealthVaccinationContext, input: { stockId: string; openedAt: Date; diluentStockId: string | null; preparationKey: string; sourceReference: string }) {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`VACCINE_LOT:${input.stockId}`}))`);
  const identity = await readVaccinationStockIdentity(tx, input.stockId);
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`WAREHOUSE_INVENTORY:${identity.warehouseId}`}))`);
  const warehouse = vaccinationRecord((await tx.select().from(warehouses).where(and(eq(warehouses.id, identity.warehouseId), eq(warehouses.isActive, true))).limit(1))[0]);
  if (!warehouse.healthUnitId) throw new Error("Estoque sem unidade de saúde vinculada.");
  assertHealthUnitAccess(context.user, warehouse.healthUnitId);
  const [previous] = await tx.select().from(healthVaccineOpenedVials).where(eq(healthVaccineOpenedVials.preparationKey, input.preparationKey)).limit(1);
  if (previous) { if (previous.stockId !== input.stockId || previous.openedAt.valueOf() !== input.openedAt.valueOf()) throw new Error("Abertura já registrada com outros dados."); return previous; }
  if (await vaccinationInventoryOpen(tx, warehouse.id)) throw new Error("O estoque está em inventário; conclua a contagem antes de preparar novo frasco.");
  const stock = await readVaccinationStock(tx, input.stockId);
  const vaccine = stock.material.vaccine;
  if (!vaccine?.isActive || !stock.vaccineLotProfile || stock.blockedAt || stock.expirationDate && vaccineLotExpiresAt(stock.expirationDate) < input.openedAt) throw new Error("Confira o imunobiológico e os dados/validade do lote para preparar o frasco.");
  const allocated = await allocatedVaccinationDoses(tx, stock.id);
  if (stock.quantity - allocated < stock.vaccineLotProfile.dosesPerVial) throw new Error("Não há frasco fechado completo disponível; registre ou concilie as doses de frasco já aberto.");
  let diluentMovementId: string | null = null, diluentStockId: string | null = null;
  if (vaccine.diluentMaterialId) {
    if (!input.diluentStockId || !vaccine.useAfterOpeningHours) throw new Error("Selecione o diluente e configure a validade após preparo do frasco.");
    const diluent = await readVaccinationStock(tx, input.diluentStockId);
    if (diluent.warehouseId !== warehouse.id || diluent.materialId !== vaccine.diluentMaterialId || !diluent.material.isActive || !diluent.material.healthProfile?.isActive || diluent.blockedAt || diluent.expirationDate && vaccineLotExpiresAt(diluent.expirationDate) < input.openedAt) throw new Error("Diluente incompatível, bloqueado ou vencido.");
    diluentMovementId = (await applyStockMovement(tx, { kind: "EXIT", warehouseId: warehouse.id, materialId: diluent.materialId, batchNumber: diluent.batchNumber, quantity: vaccine.diluentUnitsPerVial, reason: `PREPARO_IMUNOBIOLOGICO:${vaccine.id}`, idempotencyKey: `VACCINE_DILUENT:${input.preparationKey}`, actor: { usuarioId: context.user.id, employeeId: context.user.employeeId } })).movement.id;
    diluentStockId = diluent.id;
  }
  const expiration = [stock.expirationDate ? vaccineLotExpiresAt(stock.expirationDate) : null, vaccine.useAfterOpeningHours ? new Date(input.openedAt.valueOf() + vaccine.useAfterOpeningHours * 3600000) : null].filter((value): value is Date => !!value);
  return vaccinationRecord((await tx.insert(healthVaccineOpenedVials).values({ preparationKey: input.preparationKey, stockId: stock.id, vaccineId: vaccine.id, openedAt: input.openedAt, expiresAt: expiration.length ? new Date(Math.min(...expiration.map(date => date.valueOf()))) : null, totalDoses: stock.vaccineLotProfile.dosesPerVial, remainingDoses: stock.vaccineLotProfile.dosesPerVial, diluentStockId, diluentMovementId, actorUsuarioId: context.user.id, sourceReference: input.sourceReference }).returning())[0]);
}

export async function prepareVaccineVial(context: HealthVaccinationContext, raw: unknown, connection: DatabaseConnection = databaseConnection) {
  const input = z.object({ stockId: z.string().min(1), openedAt: z.coerce.date(), diluentStockId: z.string().nullable(), preparationKey: z.string().min(8).max(100), sourceReference: z.string().trim().min(1).max(2000) }).strict().parse(raw);
  if (input.openedAt > new Date()) throw new Error("A abertura não pode ser registrada como realizada no futuro.");
  return withDatabaseTransaction(connection, async tx => {
    const stock = await readVaccinationStockIdentity(tx, input.stockId);
    await pharmacyDispensationAccess(tx, context, stock.warehouseId);
    return openVaccineVialInTransaction(tx, context, input);
  }, { timeoutMs: 5_000 });
}

export async function configureVaccineLot(context: HealthVaccinationContext, raw: unknown, connection: DatabaseConnection = databaseConnection) {
  const input = z.object({ stockId: z.string().min(1), dosesPerVial: z.number().int().positive().max(1000), manufacturerId: z.string().nullable(), manufacturerName: z.string().trim().max(200).nullable() }).strict().parse(raw);
  return withDatabaseTransaction(connection, async tx => {
    const identity = await readVaccinationStockIdentity(tx, input.stockId);
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`VACCINE_LOT:${input.stockId}`}))`);
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`WAREHOUSE_INVENTORY:${identity.warehouseId}`}))`);
    const stock = await readVaccinationStock(tx, input.stockId);
    if (!stock.material.vaccine || !stock.warehouse.healthUnitId) throw new Error("Selecione lote de imunobiológico de estoque assistencial.");
    assertHealthUnitAccess(context.user, stock.warehouse.healthUnitId);
    if (input.manufacturerId && !(await tx.select({ id: healthVaccineManufacturers.id }).from(healthVaccineManufacturers).where(and(eq(healthVaccineManufacturers.id, input.manufacturerId), eq(healthVaccineManufacturers.isActive, true))).limit(1))[0]) throw new Error("Selecione fabricante ativo.");
    const previous = stock.vaccineLotProfile;
    if (previous && previous.dosesPerVial !== input.dosesPerVial && (await tx.select({ id: healthVaccineOpenedVials.id }).from(healthVaccineOpenedVials).where(eq(healthVaccineOpenedVials.stockId, stock.id)).limit(1))[0]) throw new Error("O lote possui frascos registrados com a quantidade anterior; preserve sua rastreabilidade.");
    const { stockId, ...data } = input;
    return vaccinationRecord((await tx.insert(healthVaccineLotProfiles).values({ stockId, ...data, actorUsuarioId: context.user.id }).onConflictDoUpdate({ target: healthVaccineLotProfiles.stockId, set: { ...data, actorUsuarioId: context.user.id } }).returning())[0]);
  }, { timeoutMs: 5_000 });
}

export async function registerExistingOpenedVaccineVial(context: HealthVaccinationContext, raw: unknown, connection: DatabaseConnection = databaseConnection) {
  const input = z.object({ stockId: z.string().min(1), remainingDoses: z.number().int().positive(), openedAt: z.coerce.date(), expiresAt: z.coerce.date().nullable(), sourceReference: z.string().trim().min(1).max(2000) }).strict().parse(raw);
  if (input.openedAt > new Date() || input.expiresAt && input.expiresAt < input.openedAt) throw new Error("Confira abertura e validade do frasco já aberto.");
  return withDatabaseTransaction(connection, async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`VACCINE_LOT:${input.stockId}`}))`);
    const identity = await readVaccinationStockIdentity(tx, input.stockId);
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`WAREHOUSE_INVENTORY:${identity.warehouseId}`}))`);
    const stock = await readVaccinationStock(tx, input.stockId);
    await pharmacyDispensationAccess(tx, context, stock.warehouseId);
    if (!stock.material.vaccine || !stock.vaccineLotProfile || input.remainingDoses > stock.vaccineLotProfile.dosesPerVial) throw new Error("Confira o imunobiológico e o total de doses do frasco.");
    const allocated = await allocatedVaccinationDoses(tx, stock.id);
    if (allocated + input.remainingDoses > stock.quantity) throw new Error("Doses dos frascos abertos excedem o saldo físico já registrado.");
    const maximum = [stock.expirationDate ? vaccineLotExpiresAt(stock.expirationDate) : null, stock.material.vaccine.useAfterOpeningHours ? new Date(input.openedAt.valueOf() + stock.material.vaccine.useAfterOpeningHours * 3600000) : null].filter((value): value is Date => !!value);
    const latest = maximum.length ? new Date(Math.min(...maximum.map(value => value.valueOf()))) : null;
    if (input.expiresAt && latest && input.expiresAt > latest) throw new Error("A validade do frasco excede a validade do lote ou o período após abertura configurado.");
    return vaccinationRecord((await tx.insert(healthVaccineOpenedVials).values({ ...input, expiresAt: input.expiresAt || latest, vaccineId: stock.material.vaccine.id, totalDoses: stock.vaccineLotProfile.dosesPerVial, actorUsuarioId: context.user.id }).returning())[0]);
  }, { timeoutMs: 5_000 });
}

export async function recordVaccineDoseLoss(context: HealthVaccinationContext, raw: unknown, connection: DatabaseConnection = databaseConnection) {
  const input = z.object({ stockId: z.string().min(1), openedVialId: z.string().nullable().default(null), quantity: z.number().int().positive(), reason: z.string().trim().min(3).max(1000), idempotencyKey: z.string().min(8).max(180) }).strict().parse(raw);
  return withDatabaseTransaction(connection, async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`VACCINE_LOT:${input.stockId}`}))`);
    const identity = await readVaccinationStockIdentity(tx, input.stockId);
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`WAREHOUSE_INVENTORY:${identity.warehouseId}`}))`);
    const stock = await readVaccinationStock(tx, input.stockId);
    if (!stock.material.vaccine) throw new Error("A perda vacinal exige lote de imunobiológico.");
    await pharmacyDispensationAccess(tx, context, stock.warehouseId);
    const reason = `PERDA_IMUNOBIOLOGICO:${input.reason}:FRASCO:${input.openedVialId || "FECHADO"}`;
    const [previous] = await tx.select().from(materialMovements).where(eq(materialMovements.idempotencyKey, `VACCINE_LOSS:${input.idempotencyKey}`)).limit(1);
    if (previous) {
      if (previous.stockId !== stock.id || previous.quantity !== input.quantity || previous.reason !== reason) throw new Error("Perda já registrada com outros dados.");
      return { movementId: previous.id };
    }
    if (input.openedVialId) {
      const vial = vaccinationRecord((await tx.select().from(healthVaccineOpenedVials).where(and(eq(healthVaccineOpenedVials.id, input.openedVialId), eq(healthVaccineOpenedVials.stockId, stock.id))).limit(1))[0]);
      if (vial.remainingDoses < input.quantity) throw new Error("A perda excede as doses remanescentes do frasco.");
      await tx.update(healthVaccineOpenedVials).set({ remainingDoses: sql`${healthVaccineOpenedVials.remainingDoses}-${input.quantity}` }).where(eq(healthVaccineOpenedVials.id, vial.id));
    } else {
      const allocated = await allocatedVaccinationDoses(tx, stock.id);
      if (stock.quantity - allocated < input.quantity) throw new Error("Selecione o frasco aberto ao registrar a perda de suas doses.");
    }
    const { movement } = await applyStockMovement(tx, { kind: "EXIT", warehouseId: stock.warehouseId, materialId: stock.materialId, batchNumber: stock.batchNumber, quantity: input.quantity, reason, idempotencyKey: `VACCINE_LOSS:${input.idempotencyKey}`, actor: { usuarioId: context.user.id, employeeId: context.user.employeeId } });
    return { movementId: movement.id };
  }, { timeoutMs: 5_000 });
}

export async function reconcileOpenedVaccineVial(context: HealthVaccinationContext, raw: unknown, connection: DatabaseConnection = databaseConnection) {
  const input = z.object({ vialId: z.string().min(1), remainingDoses: z.number().int().nonnegative(), reason: z.string().trim().min(1).max(2000) }).strict().parse(raw);
  return withDatabaseTransaction(connection, async tx => {
    const identity = vaccinationRecord((await tx.select().from(healthVaccineOpenedVials).where(eq(healthVaccineOpenedVials.id, input.vialId)).limit(1))[0]);
    const stockIdentity = await readVaccinationStockIdentity(tx, identity.stockId);
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`VACCINE_LOT:${identity.stockId}`}))`);
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`WAREHOUSE_INVENTORY:${stockIdentity.warehouseId}`}))`);
    await pharmacyDispensationAccess(tx, context, stockIdentity.warehouseId);
    if (await vaccinationInventoryOpen(tx, stockIdentity.warehouseId)) throw new Error("Conclua o inventário físico antes de conciliar a distribuição das doses em frascos abertos.");
    const vial = vaccinationRecord((await tx.select().from(healthVaccineOpenedVials).where(eq(healthVaccineOpenedVials.id, identity.id)).limit(1))[0]);
    const stock = await readVaccinationStock(tx, vial.stockId);
    const others = await allocatedVaccinationDoses(tx, vial.stockId, vial.id);
    if (input.remainingDoses > vial.totalDoses || others + input.remainingDoses > stock.quantity) throw new Error("A distribuição em frascos abertos excede o total do frasco ou o estoque físico.");
    const history = Array.isArray(vial.adjustments) ? vial.adjustments : [];
    return vaccinationRecord((await tx.update(healthVaccineOpenedVials).set({ remainingDoses: input.remainingDoses, adjustments: JSON.parse(JSON.stringify([...history, { before: vial.remainingDoses, after: input.remainingDoses, reason: input.reason, actorUsuarioId: context.user.id, at: new Date().toISOString() }])) }).where(eq(healthVaccineOpenedVials.id, vial.id)).returning())[0]);
  }, { timeoutMs: 5_000 });
}
