import { createHash } from "node:crypto";
import { z } from "zod";

const decimal = z.string().regex(/^-?\d{1,15}(?:\.\d{1,4})?$/);
const common = { code: z.string().regex(/^[A-Z][A-Z0-9_]{0,63}$/), label: z.string().trim().min(1).max(160), required: z.boolean() };
const definition = z.discriminatedUnion("type", [
  z.object({ ...common, type: z.literal("TEXTO"), maxLength: z.number().int().min(1).max(4000) }).strict(),
  z.object({ ...common, type: z.literal("INTEIRO"), minimum: z.string().regex(/^-?\d{1,15}$/).optional(), maximum: z.string().regex(/^-?\d{1,15}$/).optional() }).strict(),
  z.object({ ...common, type: z.literal("DECIMAL"), minimum: decimal.optional(), maximum: decimal.optional() }).strict(),
  z.object({ ...common, type: z.literal("DATA") }).strict(),
  z.object({ ...common, type: z.literal("BOOLEANO") }).strict(),
  z.object({ ...common, type: z.literal("OPCAO"), options: z.array(z.object({ value: z.string().min(1).max(100), label: z.string().min(1).max(160) }).strict()).min(1).max(100) }).strict(),
]);

function units(value: string) {
  const negative = value.startsWith("-");
  const [whole, fraction = ""] = value.replace(/^-/, "").split(".");
  return BigInt(whole + fraction.padEnd(4, "0")) * BigInt(negative ? -1 : 1);
}

export const contractCustomFieldsPolicySchema = z.object({ origin: z.literal("CAMPOS_CONTRATO"), legalReference: z.string().trim().min(3).max(4000), fields: z.array(definition).min(1).max(50) }).strict().superRefine((policy, ctx) => {
  if (new Set(policy.fields.map(field => field.code)).size !== policy.fields.length) ctx.addIssue({ code: "custom", message: "Códigos de campos configuráveis duplicados." });
  for (const field of policy.fields) {
    if ((field.type === "INTEIRO" || field.type === "DECIMAL") && field.minimum !== undefined && field.maximum !== undefined && units(field.minimum) > units(field.maximum)) ctx.addIssue({ code: "custom", message: `Intervalo inválido no campo ${field.code}.` });
    if (field.type === "OPCAO" && new Set(field.options.map(option => option.value)).size !== field.options.length) ctx.addIssue({ code: "custom", message: `Opções duplicadas no campo ${field.code}.` });
  }
});

export type ContractCustomFieldsPolicy = z.infer<typeof contractCustomFieldsPolicySchema>;
export type ContractCustomFieldValues = Record<string, string | boolean>;

export function contractCustomFieldsPolicyHash(raw: unknown) {
  return createHash("sha256").update(JSON.stringify(contractCustomFieldsPolicySchema.parse(raw))).digest("hex");
}

export function validateContractCustomFields(rawPolicy: unknown, rawValues: unknown): ContractCustomFieldValues {
  const policy = contractCustomFieldsPolicySchema.parse(rawPolicy);
  const values = z.record(z.string(), z.unknown()).parse(rawValues);
  const allowed = new Set(policy.fields.map(field => field.code));
  for (const code of Object.keys(values)) if (!allowed.has(code)) throw new Error(`Campo configurável ${code} não pertence à política do regime.`);
  const normalized: ContractCustomFieldValues = {};
  for (const field of policy.fields) {
    const raw = values[field.code];
    if (raw === undefined || raw === null || raw === "") {
      if (field.required) throw new Error(`Campo configurável obrigatório: ${field.label}.`);
      continue;
    }
    if (field.type === "BOOLEANO") {
      if (![true, false, "true", "false"].includes(raw as boolean | string)) throw new Error(`Valor booleano inválido: ${field.label}.`);
      normalized[field.code] = raw === true || raw === "true";
      continue;
    }
    if (typeof raw !== "string") throw new Error(`Informe ${field.label} como texto/decimal explícito.`);
    const value = raw.trim();
    if (!value) {
      if (field.required) throw new Error(`Campo configurável obrigatório: ${field.label}.`);
      continue;
    }
    if (field.type === "TEXTO" && value.length > field.maxLength) throw new Error(`Texto excede o limite do campo ${field.label}.`);
    if (field.type === "INTEIRO" || field.type === "DECIMAL") {
      if (!(field.type === "INTEIRO" ? /^-?\d{1,15}$/ : /^-?\d{1,15}(?:\.\d{1,4})?$/).test(value)) throw new Error(`Número inválido no campo ${field.label}.`);
      if ((field.minimum !== undefined && units(value) < units(field.minimum)) || (field.maximum !== undefined && units(value) > units(field.maximum))) throw new Error(`Número fora do intervalo do campo ${field.label}.`);
    }
    if (field.type === "DATA") {
      const date = new Date(`${value}T00:00:00.000Z`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new Error(`Data civil inválida no campo ${field.label}.`);
    }
    if (field.type === "OPCAO" && !field.options.some(option => option.value === value)) throw new Error(`Opção inválida no campo ${field.label}.`);
    normalized[field.code] = value;
  }
  return normalized;
}
