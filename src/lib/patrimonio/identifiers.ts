import { sql } from "drizzle-orm";
import type { DatabaseExecutor } from "@/db/transaction";
import { createId } from "@/db/ids";

type Database = DatabaseExecutor;

export type CatalogMaterialType = "MATERIAL" | "PATRIMONIO";

export function isCatalogMaterialType(value: string): value is CatalogMaterialType {
  return value === "MATERIAL" || value === "PATRIMONIO";
}

export function materialTypeLabel(type: CatalogMaterialType | string) {
  return type === "PATRIMONIO" ? "Patrimônio" : "Material";
}

function formatCode(prefix: string, value: number) {
  return `${prefix}${String(value).padStart(5, "0")}`;
}

function maximumCode(codes: string[], prefix: string) {
  const expression = new RegExp(`^${prefix}(\\d+)$`);
  return codes.reduce((maximum, code) => Math.max(maximum, Number(expression.exec(code)?.[1]) || 0), 0);
}

async function nextSequentialCode(db: Database, key: string, prefix: string, existingCodes: string[]) {
  const currentMaximum = maximumCode(existingCodes, prefix);
  const result = await db.execute<{ value: number }>(sql`INSERT INTO "SequenceCounter" (id, key, value, "createdAt", "updatedAt") VALUES (${createId()}, ${key}, ${currentMaximum + 1}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT (key) DO UPDATE SET value="SequenceCounter".value+1, "updatedAt"=clock_timestamp() RETURNING value`);
  return formatCode(prefix, result.rows[0].value);
}

export async function nextMaterialCode(db: Database, type: CatalogMaterialType) {
  if (type === "PATRIMONIO") return nextEquipmentCode(db);
  const prefix = "MAT";
  const materials = (await db.execute<{ code: string }>(sql`SELECT code FROM "Material" WHERE starts_with(code, ${prefix})`)).rows;
  const maximum = maximumCode(materials.map((material) => material.code), prefix);
  const key = `almoxarifado-catalogo-${prefix.toLowerCase()}`;
  await db.execute(sql`UPDATE "SequenceCounter" SET value=${maximum}, "updatedAt"=clock_timestamp() WHERE key=${key} AND value<${maximum}`);
  const counter = (await db.execute<{ value: number }>(sql`INSERT INTO "SequenceCounter" (id, key, value, "createdAt", "updatedAt") VALUES (${createId()}, ${key}, ${maximum + 1}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT (key) DO UPDATE SET value="SequenceCounter".value+1, "updatedAt"=clock_timestamp() RETURNING value`)).rows[0];
  if (counter.value > 999999) throw new Error("A sequência de códigos do catálogo atingiu o limite de seis dígitos.");
  return `${prefix}${String(counter.value).padStart(6, "0")}`;
}

export async function nextEquipmentCode(db: Database) {
  const [materials, assets, custodies] = await Promise.all([
    db.execute<{ code: string }>(sql`SELECT code FROM "Material" WHERE starts_with(code, 'EQP')`).then(result => result.rows),
    db.execute<{ code: string | null }>(sql`SELECT code FROM "Asset" WHERE starts_with(code, 'EQP')`).then(result => result.rows),
    db.execute<{ code: string }>(sql`SELECT code FROM "EquipmentCustody" WHERE starts_with(code, 'EQP')`).then(result => result.rows),
  ]);
  const maximum = maximumCode([...materials, ...assets, ...custodies].flatMap(row => row.code ? [row.code] : []), "EQP");
  const key = "almoxarifado-catalogo-eqp";
  await db.execute(sql`UPDATE "SequenceCounter" SET value=${maximum}, "updatedAt"=clock_timestamp() WHERE key=${key} AND value<${maximum}`);
  const counter = (await db.execute<{ value: number }>(sql`INSERT INTO "SequenceCounter" (id, key, value, "createdAt", "updatedAt") VALUES (${createId()}, ${key}, ${maximum + 1}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT (key) DO UPDATE SET value="SequenceCounter".value+1, "updatedAt"=clock_timestamp() RETURNING value`)).rows[0];
  if (counter.value > 999999) throw new Error("A sequência de equipamentos atingiu o limite de seis dígitos.");
  return `EQP${String(counter.value).padStart(6, "0")}`;
}

export async function nextAssetPatrimonyNumber(db: Database) {
  const assets = (await db.execute<{ patrimonyNumber: string }>(sql`SELECT "patrimonyNumber" FROM "Asset"`)).rows;
  return nextSequentialCode(db, "patrimonio-asset", "PAT", assets.map((asset) => asset.patrimonyNumber));
}

export async function previewNextAssetPatrimonyNumber(db: Database) {
  const assets = (await db.execute<{ patrimonyNumber: string }>(sql`SELECT "patrimonyNumber" FROM "Asset"`)).rows;
  return formatCode("PAT", maximumCode(assets.map((asset) => asset.patrimonyNumber), "PAT") + 1);
}
