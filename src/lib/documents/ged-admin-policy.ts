import { z } from "zod";

export const objectOperations = ["read", "import", "edit", "review", "delete", "share"] as const;
export type ObjectOperation = typeof objectOperations[number];
export const indexFieldSchema = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_]{0,49}$/), label: z.string().trim().min(1).max(100),
  type: z.enum(["text", "number", "date", "select", "boolean"]), required: z.boolean().default(false),
  options: z.array(z.string().max(150)).max(100).default([]), min: z.number().optional(), max: z.number().optional(),
}).superRefine((field, ctx) => {
  if (field.min !== undefined && field.max !== undefined && field.min > field.max) ctx.addIssue({ code: "custom", message: "O mínimo não pode superar o máximo." });
  if (field.type === "text" && [field.min, field.max].some(value => value !== undefined && (!Number.isInteger(value) || value < 0 || value > 5000))) ctx.addIssue({ code: "custom", message: "Limites textuais devem ser inteiros de 0 a 5000." });
  if (field.type === "select" && (!field.options.length || field.options.some(value => !value.trim()) || new Set(field.options).size !== field.options.length)) ctx.addIssue({ code: "custom", message: "Informe opções não vazias e sem repetição." });
});
export type IndexField = z.infer<typeof indexFieldSchema>;
export const typeDefinitionSchema = z.object({
  code: z.string().regex(/^[A-Z][A-Z0-9_]{1,79}$/), label: z.string().trim().min(1).max(150), active: z.boolean().default(true),
  signaturePolicy: z.enum(["INTERNAL_ALLOWED", "EXTERNAL_PROVIDER_REQUIRED", "ICP_REQUIRED"]).default("INTERNAL_ALLOWED"),
  fields: z.array(indexFieldSchema).max(60).refine(fields => new Set(fields.map(f => f.key)).size === fields.length, "Campos repetidos."),
  policy: z.object({ retentionMonths: z.number().int().min(0).max(12000).nullable().default(null), validityDays: z.number().int().min(1).max(36500).nullable().default(null), alertDays: z.number().int().min(0).max(3650).default(30), rankWeight: z.number().min(0.1).max(10).default(1), preserveVersions: z.literal(true).default(true) }),
});
export function validateIndexValues(fields: IndexField[], raw: unknown) {
  const input = z.record(z.string(), z.unknown()).parse(raw);
  const result: Record<string, string | number | boolean> = {};
  for (const field of fields) {
    const value = input[field.key];
    if (value === undefined || value === null || value === "") { if (field.required) throw new Error(`Preencha ${field.label}.`); continue; }
    if (field.type === "boolean") result[field.key] = z.boolean().parse(value);
    else if (field.type === "number") {
      const number = z.coerce.number().finite().parse(value);
      if ((field.min !== undefined && number < field.min) || (field.max !== undefined && number > field.max)) throw new Error(`Valor inválido em ${field.label}.`);
      result[field.key] = number;
    } else {
      const text = z.string().max(field.max ?? 5000).parse(value);
      if (field.type === "text" && field.min !== undefined && text.length < field.min) throw new Error(`Valor muito curto em ${field.label}.`);
      if (field.type === "date" && (!/^\d{4}-\d{2}-\d{2}$/.test(text) || !Number.isFinite(Date.parse(text)) || new Date(text).toISOString().slice(0, 10) !== text)) throw new Error(`Data inválida em ${field.label}.`);
      if (field.type === "select" && !field.options.includes(text)) throw new Error(`Selecione uma opção de ${field.label}.`);
      result[field.key] = text;
    }
  }
  return result;
}

export const flowNodeSchema = z.object({ id: z.string().regex(/^[a-zA-Z0-9_-]{1,60}$/), label: z.string().min(1).max(120), x: z.number().min(0).max(2000), y: z.number().min(0).max(2000), users: z.array(z.string().min(1)).min(1).max(30), days: z.number().int().min(1).max(3650), phase: z.enum(["ELABORACAO", "CONSENSO", "APROVACAO", "HOMOLOGACAO"]), next: z.string().max(60).nullable(), condition: z.object({ field: z.string().max(50), equals: z.string().max(200), otherwise: z.string().max(60) }).nullable().default(null) });
export const flowGraphSchema = z.object({ start: z.string(), nodes: z.array(flowNodeSchema).min(1).max(40) }).superRefine((graph, ctx) => {
  const ids = new Set(graph.nodes.map(n => n.id));
  if (ids.size !== graph.nodes.length || !ids.has(graph.start) || graph.nodes.some(n => (n.next && !ids.has(n.next)) || (n.condition && !ids.has(n.condition.otherwise)))) ctx.addIssue({ code: "custom", message: "Conexões ou identificadores inválidos." });
  const reachable = new Set<string>();
  const walk = (id: string, path: Set<string>) => {
    if (path.has(id)) { ctx.addIssue({ code: "custom", message: "O fluxo não pode conter ciclos." }); return; }
    if (reachable.has(id)) return;
    reachable.add(id); const node = graph.nodes.find(n => n.id === id); if (!node) return;
    const nextPath = new Set([...path, id]); if (node.next) walk(node.next, nextPath); if (node.condition) walk(node.condition.otherwise, nextPath);
  };
  walk(graph.start, new Set());
  if (reachable.size !== ids.size) ctx.addIssue({ code: "custom", message: "Existem etapas sem conexão com o início." });
});
export type FlowGraph = z.infer<typeof flowGraphSchema>;
export const ruleSchema = z.object({ name: z.string().min(1).max(150), event: z.enum(["IMPORT", "CHECKIN", "METADATA", "VALIDITY", "HOMOLOGATED"]), active: z.boolean().default(true), conditions: z.object({ classCode: z.string().max(100).default(""), folderId: z.string().max(100).default(""), tag: z.string().max(100).default("") }), actions: z.array(z.object({ type: z.enum(["tag", "move", "task", "notify", "flow", "classify", "revalidate", "publication"]), value: z.string().min(1).max(500), userId: z.string().max(100).default("") })).min(1).max(10) });
