import { z } from "zod";

export const socialCatalogKinds = {
  INCOME: "Tipos de renda",
  EXPENSE: "Tipos de despesa",
  VULNERABILITY: "Vulnerabilidades",
  POTENTIALITY: "Potencialidades",
  ATTENDANCE_REASON: "Motivos de atendimento",
  ACCESS: "Formas de acesso",
  EXIT: "Formas de desligamento",
  PRIORITY: "Públicos prioritários",
  ACTIVITY: "Atividades sociais",
  MANAGEMENT_ACTIVITY: "Atividades de gestão",
  SOCIOEDUCATIONAL_MEASURE: "Medidas socioeducativas",
  INFRACTION: "Atos infracionais",
  COMPLAINT_REASON: "Motivos de denúncia",
  REFERRAL_REASON: "Motivos de encaminhamento",
  NETWORK_TYPE: "Tipos de órgão da rede",
} as const;

export const catalogEntrySchema = z.object({
  id: z.string().min(1).optional(),
  kind: z.enum(Object.keys(socialCatalogKinds) as [keyof typeof socialCatalogKinds, ...(keyof typeof socialCatalogKinds)[]]),
  name: z.string().trim().min(2, "Informe um nome com pelo menos dois caracteres.").max(160),
  description: z.string().trim().max(2000).default(""),
  isActive: z.boolean(),
  allowedUnitTypes: z.array(z.string().trim().min(1).max(80)).optional(),
});

export const minimumWageSchema = z.object({
  validFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, "Data de vigência inválida."),
  value: z.string().regex(/^\d{1,12}(\.\d{1,2})?$/, "Informe um valor monetário positivo com até duas casas decimais.").refine((value) => Number(value) > 0),
});
