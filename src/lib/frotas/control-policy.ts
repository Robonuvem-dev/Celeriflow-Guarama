import { z } from "zod";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { dateSchema } from "./contract";

export const fleetMeters = ["HODOMETRO", "HORIMETRO", "SEM_MARCADOR"] as const;
export type FleetMeter = typeof fleetMeters[number];
export const attachmentExtensions = ["png", "bmp", "jpg", "jpeg", "gif", "doc", "docx", "ppt", "pptx", "xls", "xlsx", "pdf", "odt", "ods", "dwg"] as const;
const id = z.string().trim().min(1).max(100);
const optionalId = z.string().trim().max(100).default("");
const text = z.string().trim().min(1).max(1000);
const note = z.string().trim().min(5).max(10000);
export const controlQuantity = z.string().regex(/^\d{1,10}(\.\d{1,3})?$/, "Informe quantidade/medidor com até três casas decimais.");
export const controlMoney = z.string().regex(/^\d{1,12}(\.\d{1,2})?$/, "Informe valor com até duas casas decimais.");
const nullableQuantity = z.union([controlQuantity, z.literal("")]).default("");
const nullableMoney = z.union([controlMoney, z.literal("")]).default("");
const time = z.iso.datetime({ offset: true });
export const machineFieldsSchema = z.array(z.object({ code: z.string().regex(/^[a-z][a-zA-Z0-9_]{0,63}$/), label: text, type: z.enum(["TEXT", "NUMBER", "DATE", "SELECT"]), required: z.boolean(), options: z.array(z.string().max(160)).default([]) }).strict()).max(60).refine((fields) => new Set(fields.map((field) => field.code)).size === fields.length && fields.every((field) => field.type !== "SELECT" || field.options.length > 0), "Campos repetidos ou seleção sem opções.");

export const controlSchemas = {
  unitControl: z.object({ unitId: id, version: z.string(), species: z.string().max(100).default(""), color: z.string().max(80).default(""), fuelType: z.string().max(80).default(""), tankCapacity: nullableQuantity, meterType: z.enum(fleetMeters), currentReading: nullableQuantity, expectedConsumption: nullableQuantity, tolerancePercent: z.coerce.number().finite().min(0).max(100), acquisitionDate: z.union([dateSchema, z.literal("")]).default(""), costCenterId: optionalId, fipeModelId: optionalId, machineTypeId: optionalId, machineValues: z.record(z.string(), z.string().max(4000)).default({}), fixedRouteId: optionalId, allowedLicenseCategories: z.array(z.enum(["A", "B", "C", "D", "E"])).max(5) }).strict(),
  driver: z.object({ id: optionalId, version: z.string().default(""), employeeId: optionalId, personId: optionalId, departmentId: id, outsourced: z.boolean(), cnhNumber: z.string().regex(/^\d{5,20}$/, "Número de CNH inválido."), cnhCategories: z.array(z.enum(["A", "B", "C", "D", "E"])).min(1).max(5), cnhExpiresAt: dateSchema, active: z.boolean(), suspensionUntil: z.union([dateSchema, z.literal("")]).default(""), pointLimit: z.coerce.number().int().min(1).max(100), pointWindowMonths: z.coerce.number().int().min(1).max(120), policyReference: note }).strict().refine((value) => Boolean(value.employeeId) !== Boolean(value.personId), "Selecione servidor RH ou pessoa terceirizada, exclusivamente."),
  destination: z.object({ name: text, city: text, address: z.string().max(500).default(""), distance: nullableQuantity, departmentId: id }).strict(),
  machineType: z.object({ id: optionalId, version: z.string().default(""), code: z.string().regex(/^[A-Z0-9_-]{1,40}$/), name: text, fields: machineFieldsSchema, active: z.boolean() }).strict(),
  catalog: z.object({ kind: z.enum(["FIPE", "CTB"]), reference: text, sourceReference: z.string().trim().min(10).max(1000), complete: z.boolean(), entries: z.array(z.object({ code: id, name: text, details: z.record(z.string(), z.unknown()) }).strict()).min(1).max(20000) }).strict().refine((value) => new Set(value.entries.map((entry) => entry.code)).size === value.entries.length, "Código repetido no catálogo."),
  booking: z.object({ unitId: id, driverId: optionalId, routeId: optionalId, destinationId: optionalId, kind: z.enum(["VIAGEM", "SERVICO", "CONSERTO", "OBRIGACAO"]), purpose: note, startsAt: time, endsAt: time, previousId: optionalId }).strict().refine((value) => new Date(value.endsAt) > new Date(value.startsAt), "Fim deve ser posterior ao início."),
  cancelBooking: z.object({ bookingId: id, reason: note }).strict(),
  depart: z.object({ unitId: id, driverId: id, bookingId: optionalId, routeId: optionalId, destinationId: optionalId, destination: text, purpose: note, reading: nullableQuantity, checklist: z.record(z.string(), z.boolean()).default({}) }).strict(),
  arrive: z.object({ tripId: id, reading: nullableQuantity, reason: note }).strict(),
  provider: z.object({ supplierId: id, kind: z.enum(["POSTO", "OFICINA"]), active: z.boolean() }).strict(),
  fuelAgreement: z.object({ contractId: id, purchaseItemId: id, providerId: id, fuelType: text, contracted: controlQuantity, unitPrice: z.union([z.string().regex(/^\d{1,12}(\.\d{1,6})?$/), z.literal("")]).default(""), evidenceVersionId: id }).strict(),
  quota: z.object({ unitId: id, period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/), limit: controlQuantity }).strict(),
  fuelAuthorization: z.object({ unitId: id, driverId: optionalId, origin: z.enum(["PROPRIO", "TERCEIRO"]), providerId: optionalId, agreementId: optionalId, stockId: optionalId, quantity: controlQuantity, description: note, validUntil: time }).strict(),
  cancelAuthorization: z.object({ authorizationId: id, reason: note }).strict(),
  renewCredential: z.object({ authorizationId: id }).strict(),
  confirmFuel: z.object({ authorizationId: id, quantity: controlQuantity, reading: nullableQuantity, unitPrice: z.union([z.string().regex(/^\d{1,12}(\.\d{1,6})?$/), z.literal("")]).default(""), evidenceVersionId: optionalId }).strict(),
  serviceAuthorization: z.object({ unitId: id, driverId: optionalId, providerId: optionalId, origin: z.enum(["PROPRIO", "TERCEIRO"]), contractId: optionalId, purchaseProcessId: optionalId, scheduledAt: dateSchema, amountLimit: controlMoney, description: note, validUntil: time }).strict(),
  executeService: z.object({ authorizationId: id, completedAt: dateSchema, performed: note, result: note, actualCost: nullableMoney, evidenceVersionId: optionalId }).strict(),
  reviewWorkshop: z.object({ reportId: id, approved: z.boolean(), reason: note }).strict(),
  component: z.object({ kind: z.enum(["PNEU", "BATERIA"]), identifier: text, brand: text, specification: text, expectedLife: nullableQuantity }).strict(),
  installComponent: z.object({ componentId: id, unitId: id, position: text, installedAt: time, reading: nullableQuantity, reason: note, cost: nullableMoney, stockMovementId: optionalId, workOrderId: optionalId }).strict(),
  removeComponent: z.object({ installationId: id, removedAt: time, reading: nullableQuantity, reason: note }).strict(),
  fine: z.object({ unitId: id, driverId: optionalId, ctbEntryId: id, aitNumber: text, city: text, occurredAt: dateSchema, dueAt: dateSchema, amount: controlMoney, evidenceVersionId: optionalId }).strict(),
  debtDocument: z.object({ unitId: id, type: z.enum(["LICENCIAMENTO", "SEGURO_OBRIGATORIO", "IPVA", "TAXA", "OUTRO"]), reference: text, title: text, dueAt: dateSchema, amount: controlMoney, notes: z.string().max(4000).default("") }).strict(),
  payDebt: z.object({ documentId: id, paidAt: dateSchema, amount: controlMoney, proofVersionId: optionalId, financialPaymentId: optionalId, reason: note }).strict(),
  reverseDebtPayment: z.object({ paymentId: id, reason: note }).strict(),
  debtSettings: z.object({ departmentId: id, warningDays: z.coerce.number().int().min(0).max(365), criticalDays: z.coerce.number().int().min(0).max(365), requireEvidence: z.boolean() }).strict().refine((value) => value.criticalDays <= value.warningDays, "O alerta crítico deve ser igual ou menor que o alerta preventivo."),
  fineStatus: z.object({ fineId: id, status: z.enum(["PENDENTE", "RECURSO", "CANCELADA"]), reason: note }).strict(),
  payFine: z.object({ fineId: id, paidAt: dateSchema, amount: controlMoney, proofVersionId: id, financialPaymentId: optionalId, reason: note }).strict(),
  reverseFinePayment: z.object({ paymentId: id, reason: note }).strict(),
  occurrence: z.object({ unitId: id, type: z.enum(["ACIDENTE", "AVARIA", "FURTO", "OUTRO"]), occurredAt: dateSchema, description: note, involvedValue: nullableMoney, latitude: z.coerce.number().finite().min(-90).max(90).nullable(), longitude: z.coerce.number().finite().min(-180).max(180).nullable() }).strict().refine((value) => (value.latitude === null) === (value.longitude === null), "Informe latitude e longitude juntas."),
  claim: z.object({ occurrenceId: id, policyDocumentId: optionalId, responsibility: z.enum(["PROPRIO", "TERCEIROS", "OUTROS"]), workshopProviderId: optionalId, parties: z.array(z.object({ plate: z.string().max(20), owner: text, driver: text }).strict()).min(1).max(50) }).strict(),
  claimStatus: z.object({ claimId: id, status: z.enum(["ABERTO", "ENCAMINHADO", "EM_ANALISE", "CONCLUIDO"]), workshopProviderId: optionalId, reason: note }).strict(),
} as const;
export type FleetControlOperation = keyof typeof controlSchemas;
export const fleetControlRequest = z.object({ requestId: z.uuid(), operation: z.enum(Object.keys(controlSchemas) as [FleetControlOperation, ...FleetControlOperation[]]), data: z.record(z.string(), z.unknown()) }).strict();
export const controlQuerySchema = z.object({ area: z.enum(["cadastro", "debitos", "motoristas", "agenda", "destinos", "guarita", "abastecimento", "saldos", "autorizacoes", "componentes", "multas", "sinistros", "catalogos", "infracoes", "modelos", "tiposMaquina", "anexos", "relatorios"]).default("cadastro"), q: z.string().trim().max(100).default(""), unitId: z.string().max(100).default(""), unitIds: z.string().max(10100).default("").refine(value => !value || value.split(",").length <= 100 && value.split(",").every(entry => /^[a-zA-Z0-9_-]{1,100}$/.test(entry)), "Selecione até 100 unidades válidas."), departmentId: z.string().max(100).default(""), catalogVersionId: z.string().max(100).default(""), nature: z.string().max(40).default(""), driverId: z.string().max(100).default(""), status: z.string().max(50).default(""), from: z.union([dateSchema, z.literal("")]).default(""), to: z.union([dateSchema, z.literal("")]).default(""), page: z.coerce.number().int().min(1).max(100000).default(1) }).refine((value) => !value.from || !value.to || value.from <= value.to, "Período inválido.");

export function readingError(meter: FleetMeter, previous: string | null, next: string | null) {
  if (meter === "SEM_MARCADOR") return next === null ? null : "Esta unidade não utiliza marcador.";
  if (next === null) return "Informe a leitura do marcador.";
  if (!controlQuantity.safeParse(next).success) return "Leitura inválida.";
  return previous !== null && Number(next) < Number(previous) ? "Leitura regressiva; utilize o procedimento formal de correção." : null;
}

export function consumptionAverage(meter: FleetMeter, fills: { reading: number | null; quantity: number; date: Date }[]) {
  if (meter === "SEM_MARCADOR") return null;
  const rows = fills.filter((row) => row.reading !== null && Number.isFinite(row.reading) && row.reading >= 0 && Number.isFinite(row.quantity) && row.quantity > 0).sort((a, b) => a.date.getTime() - b.date.getTime());
  if (rows.length < 2 || rows.some((row, index) => index > 0 && row.reading! < rows[index - 1].reading!)) return null;
  const movement = rows.at(-1)!.reading! - rows[0].reading!, liters = rows.slice(1).reduce((sum, row) => sum + row.quantity, 0);
  return movement > 0 && liters > 0 ? meter === "HORIMETRO" ? liters / movement : movement / liters : null;
}
export function consumptionClassification(meter: FleetMeter, actual: number | null, expected: number | null, tolerance: number) {
  if (meter === "SEM_MARCADOR" || actual === null || !expected || !Number.isFinite(expected)) return null;
  const delta = (actual - expected) / expected * 100 * (meter === "HODOMETRO" ? -1 : 1);
  return delta > tolerance ? "ALTO" : delta < -tolerance ? "BAIXO" : "NORMAL";
}
export function newFleetCapability() { const token = randomBytes(32).toString("base64url"); return { token, hash: fleetCapabilityHash(token) }; }
export function fleetCapabilityHash(token: string) { return createHash("sha256").update(token).digest("hex"); }
export function validFleetCapability(expected: string | null, given: string) { if (!expected || !/^[A-Za-z0-9_-]{43}$/.test(given)) return false; const left = Buffer.from(expected, "hex"), right = Buffer.from(fleetCapabilityHash(given), "hex"); return left.length === right.length && timingSafeEqual(left, right); }
export function stableFleetHash(value: unknown): string {
  const normalize = (entry: unknown): unknown => Array.isArray(entry) ? entry.map(normalize) : entry && typeof entry === "object" ? Object.fromEntries(Object.entries(entry).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, row]) => [key, normalize(row)])) : entry;
  return createHash("sha256").update(JSON.stringify(normalize(value))).digest("hex");
}
export function validateMachineValues(fields: z.infer<typeof machineFieldsSchema>, values: Record<string, string>) {
  if (Object.keys(values).some((key) => !fields.some((field) => field.code === key))) throw new Error("Campo não previsto para este tipo de máquina.");
  for (const field of fields) { const value = values[field.code] || ""; if (field.required && !value.trim()) throw new Error(`Preencha ${field.label}.`); if (value && field.type === "DATE" && !dateSchema.safeParse(value).success) throw new Error(`Data inválida: ${field.label}.`); if (value && field.type === "NUMBER" && !/^-?\d+(\.\d+)?$/.test(value)) throw new Error(`Número inválido: ${field.label}.`); if (value && field.type === "SELECT" && !field.options.includes(value)) throw new Error(`Opção inválida: ${field.label}.`); }
}
