import { z } from "zod";
import { Decimal } from "@/db/decimal";
import { recyclingEntrySchema } from "./recycling-catalog";

export class RecyclingStockError extends Error {}
const code = recyclingEntrySchema.shape.code;
const optionalCode = z.union([code, z.literal("")]).default("");
const inputSchema = z.object({
  kind: z.enum(["ENTRY", "EXIT"]),
  materialCode: code,
  depotCode: code,
  typeCode: optionalCode,
  unitCode: optionalCode,
  destinationCode: optionalCode,
  quantity: z.string().trim(),
  amount: z.string().trim().default("0"),
  occurredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Informe uma data válida."),
  origin: z.string().trim().max(200).default(""),
  notes: z.string().trim().max(1000).default(""),
  idempotencyKey: z.string().uuid(),
}).strict();

export function recyclingToday(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const value = (type: string) => parts.find(part => part.type === type)!.value;
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function decimal(value: string, label: string, places: number, positive: boolean) {
  const normalized = value.replace(",", ".");
  if (!new RegExp(`^\\d{1,${18 - places}}(?:\\.\\d{1,${places}})?$`).test(normalized)) {
    throw new RecyclingStockError(`${label}: informe um número sem separador de milhares, com até ${places} casas decimais.`);
  }
  const result = new Decimal(normalized);
  if (result.isNegative() || (positive && result.isZero())) throw new RecyclingStockError(`${label} deve ser ${positive ? "maior que zero" : "maior ou igual a zero"}.`);
  return result;
}

export function normalizeRecyclingMovementInput(raw: unknown, now = new Date()) {
  const input = inputSchema.parse(raw);
  const date = new Date(`${input.occurredOn}T12:00:00.000Z`);
  if (!Number.isFinite(date.valueOf()) || date.toISOString().slice(0, 10) !== input.occurredOn || input.occurredOn > recyclingToday(now)) {
    throw new RecyclingStockError("Informe uma data válida, até hoje.");
  }
  const quantity = decimal(input.quantity, "Quantidade", 3, true);
  const amount = decimal(input.amount, "Valor obtido", 2, false);
  if (input.kind === "ENTRY" && (!input.origin || input.destinationCode || !amount.isZero())) {
    throw new RecyclingStockError("A entrada exige a origem da coleta, sem centro de destino ou receita de saída.");
  }
  if (input.kind === "EXIT" && (!input.destinationCode || input.origin)) {
    throw new RecyclingStockError("A saída exige um centro de reciclagem/destinação, sem origem de coleta.");
  }
  return { ...input, quantity, amount };
}
export type RecyclingMovementInput = ReturnType<typeof normalizeRecyclingMovementInput>;
export type RecyclingMovementResult = { success: true } | { error: string };
type CatalogLabel = { code: string; name: string };
export type RecyclingMovementSnapshot = {
  material: CatalogLabel;
  depot: CatalogLabel;
  materialType: CatalogLabel;
  unit: CatalogLabel;
  destination: (CatalogLabel & { address: string }) | null;
};
export type RecyclingStockPosition = {
  materialCode: string; materialName: string; typeName: string;
  unitCode: string; unitName: string; depotCode: string; depotName: string;
  quantity: string; materialTotal: string; canDispatch: boolean; requestKey: string;
};
export type RecyclingMovementHistoryItem = {
  id: string; kind: "ENTRY" | "EXIT"; quantity: string; amount: string;
  quantityAfter: string; occurredOn: string; origin: string; notes: string;
  snapshot: RecyclingMovementSnapshot;
};
