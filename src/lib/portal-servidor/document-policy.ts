import { z } from "zod";

export const generatedDocumentKinds = ["IRRF_ANUAL", "RECIBO_FERIAS", "DECLARACAO_VINCULO", "TEMPO_SERVICO", "MAGISTERIO", "TERMO_RESCISAO", "MARGEM", "PPP"] as const;
export const functionalDocumentInputSchema = z.object({ kind: z.enum(generatedDocumentKinds), policyId: z.string().min(1), requestKey: z.uuid().optional(), contractId: z.string().optional(), statementId: z.string().optional(), supplierId: z.string().optional(), year: z.number().int().min(1900).max(2200).optional(), from: z.iso.date(), until: z.iso.date() }).strict().refine(value => value.until >= value.from, "Período fora de ordem.");
export const documentLayoutPolicySchema = z.object({
  origin: z.literal("MODELO_DOCUMENTO_FUNCIONAL"), budgetUnitId: z.string().min(1), kinds: z.array(z.enum(generatedDocumentKinds)).min(1),
  issuerName: z.string().trim().min(3).max(250), issuerCnpj: z.string().regex(/^\d{14}$/), title: z.string().trim().min(3).max(200),
  text: z.string().trim().min(10).max(20000), footer: z.string().max(4000), legalReference: z.string().trim().min(3).max(4000),
  documentClassCode: z.string().min(1), signerUserIds: z.array(z.string().min(1)).max(20), requireSignature: z.boolean(),
  teachingRoleIds: z.array(z.string()).default([]), leaveCounting: z.array(z.object({ type: z.string().min(1), counts: z.boolean() }).strict()).default([]), creditScopes: z.array(z.enum(["PRODUCAO", "HOMOLOGACAO", "DEMONSTRACAO"])).default([]),
  annualGroups: z.array(z.object({ code: z.string().regex(/^[A-Z0-9_]{1,50}$/), label: z.string().min(1).max(200), rubricCodes: z.array(z.string()).min(1), payrollTypes: z.array(z.string()).min(1) }).strict()).default([]),
  supplierIds: z.array(z.string()).default([]), validityDays: z.number().int().min(1).max(366).optional(), blockMarginUntilRelease: z.boolean().default(false),
}).strict().superRefine((value, context) => {
  if ((value.requireSignature || value.kinds.includes("PPP")) && !value.signerUserIds.length) context.addIssue({ code: "custom", message: "Configure os signatários obrigatórios." });
  if (value.kinds.includes("PPP") && !value.requireSignature) context.addIssue({ code: "custom", message: "PPP exige assinatura de origem." });
  if (value.kinds.includes("IRRF_ANUAL") && !value.annualGroups.length) context.addIssue({ code: "custom", message: "Configure os grupos de rendimentos/deduções anuais." });
  if (value.kinds.includes("MAGISTERIO") && !value.teachingRoleIds.length) context.addIssue({ code: "custom", message: "Classifique os cargos de efetivo exercício do magistério." });
  if (value.kinds.includes("MARGEM") && (!value.supplierIds.length || !value.validityDays)) context.addIssue({ code: "custom", message: "Margem exige bancos/convenentes e validade configurados." });
  const tokens = [...value.text.matchAll(/\{\{([^}]+)\}\}/g)].map(match => match[1]);
  const allowed = ["nome", "cpf", "matricula", "inicio", "fim", "dias", "ano", "emitente", "cnpj", "cargo", "lotacao", "situacao", "banco", "margem", "validade"];
  if (tokens.some(token => !allowed.includes(token))) context.addIssue({ code: "custom", message: "Modelo contém marcador não reconhecido." });
  if (new Set(value.annualGroups.map(group => group.code)).size !== value.annualGroups.length) context.addIssue({ code: "custom", message: "Grupos anuais duplicados." });
});
export type DocumentLayoutPolicy = z.infer<typeof documentLayoutPolicySchema>;
export type FunctionalDocumentInput = z.infer<typeof functionalDocumentInputSchema>;

export function renderFunctionalTemplate(template: string, fields: Record<string, string>) {
  return template.replace(/\{\{([^}]+)\}\}/g, (_token, name: string) => { if (!(name in fields) || !fields[name].trim()) throw new Error(`Fonte ausente para ${name}.`); return fields[name]; });
}
