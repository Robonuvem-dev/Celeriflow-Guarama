import { z } from "zod";
export const nativeSourceCollections = {
  EMPLOYMENT_CONTRACT: ["servidores", "estagiarios", "autonomos", "inativos", "cessoes"],
  PAYROLL_STATEMENT: ["servidores", "estagiarios", "autonomos", "inativos", "cessoes"],
  POSITION_PLAN: ["vagas", "padrao-remuneratorio"],
  TRAVEL_REQUEST: ["diarias"], ADVANCE_REQUEST: ["diarias"],
  PURCHASE_RECEIPT: ["compras"], ASSET: ["patrimonio"], FLEET_UNIT: ["frota"],
  WAREHOUSE: ["estoque","medicamentos"], WORK: ["obras"], COVENANT: ["convenios", "repasses"],
  HEALTH_REGULATION_SECTOR:["fila-saude"],PRE_ENROLLMENT_PROCESS:["fila-creches"],
  TAX_BENEFIT_RULE: ["renuncia"], TAX_BENEFIT_GRANT: ["renuncia"],
  OFFICIAL_DIARY: ["legislacao", "publicacoes"],
} as const;
export type NativeSourceType = keyof typeof nativeSourceCollections;
export const nativeSourceTypes = Object.keys(nativeSourceCollections) as [NativeSourceType, ...NativeSourceType[]];
const decimal = z.string().regex(/^\d{1,15}(\.\d{1,4})?$/);
export const nativePublicDetailsSchema = z.object({
  weeklyHours: z.number().min(0).max(168).nullable().optional(), workSchedule: z.string().max(250).optional(),
  terminationReason: z.string().max(250).optional(), retirementType: z.string().max(150).optional(), cededTo: z.string().max(250).optional(),
  type: z.string().max(200).optional(), legalReference: z.string().max(2000).optional(),
  startDate: z.iso.date().optional(), endDate: z.iso.date().optional(), inspector: z.string().max(250).optional(), progress: z.number().min(0).max(100).optional(),
  internalTransfer: z.boolean().default(false), nominalPublication: z.boolean().default(false),
  attachments: z.array(z.string().min(1).max(100)).max(100).default([]),
  items: z.array(z.object({ description: z.string().min(1).max(1000), quantity: decimal, unitPrice: decimal }).strict()).max(1000).default([]),
  measurements: z.array(z.object({ date: z.iso.date(), percentage: z.number().min(0).max(100), value: decimal }).strict()).max(1000).default([]),
}).strict();
export const nativeBindingSchema = z.object({
  collectionSlug: z.string(), sourceType: z.enum(nativeSourceTypes), sourceId: z.string().min(1).max(150),
  governmentEntityId: z.string().min(1), enabled: z.boolean(), sourceReference: z.string().trim().min(5).max(2000), details: nativePublicDetailsSchema,
}).strict().refine(value => (nativeSourceCollections[value.sourceType] as readonly string[]).includes(value.collectionSlug), "Fonte incompatível com a consulta pública.");
