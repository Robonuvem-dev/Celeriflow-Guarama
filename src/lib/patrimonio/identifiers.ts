import type { Prisma, PrismaClient } from "@prisma/client";

type Database = PrismaClient | Prisma.TransactionClient;

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
  const counter = await db.sequenceCounter.upsert({
    where: { key },
    create: { key, value: currentMaximum + 1 },
    update: { value: { increment: 1 } },
    select: { value: true },
  });
  return formatCode(prefix, counter.value);
}

export async function nextMaterialCode(db: Database, type: CatalogMaterialType) {
  if (type === "PATRIMONIO") return nextEquipmentCode(db);
  const prefix = "MAT";
  const materials = await db.material.findMany({ where: { code: { startsWith: prefix } }, select: { code: true } });
  const maximum = maximumCode(materials.map((material) => material.code), prefix);
  const key = `almoxarifado-catalogo-${prefix.toLowerCase()}`;
  await db.sequenceCounter.updateMany({ where: { key, value: { lt: maximum } }, data: { value: maximum } });
  const counter = await db.sequenceCounter.upsert({ where: { key }, create: { key, value: maximum + 1 }, update: { value: { increment: 1 } }, select: { value: true } });
  if (counter.value > 999999) throw new Error("A sequência de códigos do catálogo atingiu o limite de seis dígitos.");
  return `${prefix}${String(counter.value).padStart(6, "0")}`;
}

export async function nextEquipmentCode(db: Database) {
  const [materials, assets, custodies] = await Promise.all([
    db.material.findMany({ where: { code: { startsWith: "EQP" } }, select: { code: true } }),
    db.asset.findMany({ where: { code: { startsWith: "EQP" } }, select: { code: true } }),
    db.equipmentCustody.findMany({ where: { code: { startsWith: "EQP" } }, select: { code: true } }),
  ]);
  const maximum = maximumCode([...materials, ...assets, ...custodies].flatMap(row => row.code ? [row.code] : []), "EQP");
  const key = "almoxarifado-catalogo-eqp";
  await db.sequenceCounter.updateMany({ where: { key, value: { lt: maximum } }, data: { value: maximum } });
  const counter = await db.sequenceCounter.upsert({ where: { key }, create: { key, value: maximum + 1 }, update: { value: { increment: 1 } }, select: { value: true } });
  if (counter.value > 999999) throw new Error("A sequência de equipamentos atingiu o limite de seis dígitos.");
  return `EQP${String(counter.value).padStart(6, "0")}`;
}

export async function nextAssetPatrimonyNumber(db: Database) {
  const assets = await db.asset.findMany({ select: { patrimonyNumber: true } });
  return nextSequentialCode(db, "patrimonio-asset", "PAT", assets.map((asset) => asset.patrimonyNumber));
}

export async function previewNextAssetPatrimonyNumber(db: Database) {
  const assets = await db.asset.findMany({ select: { patrimonyNumber: true } });
  return formatCode("PAT", maximumCode(assets.map((asset) => asset.patrimonyNumber), "PAT") + 1);
}
