import { z } from "zod";
import { socialDateSchema } from "./history-input";
export const socialReportKinds = { dashboard: "Painel de produção", periodico: "Profissionais, famílias e benefícios", encaminhamentos: "Encaminhamentos", acompanhadas: "Famílias acompanhadas", matriculados: "Matriculados SCFV", frequencia: "Frequência SCFV", prestacao: "Registro mensal de atendimentos — CRAS/CREAS", faixas: "Beneficiários por faixa etária", prontuario: "Prontuário socioassistencial e acompanhamento" };
export type SocialReportKind = keyof typeof socialReportKinds;
export const socialReportFilter = z.object({ kind: z.enum(Object.keys(socialReportKinds) as [SocialReportKind, ...SocialReportKind[]]).default("dashboard"), from: socialDateSchema, to: socialDateSchema, unitId: z.string().max(100).default(""), professionalId: z.string().max(100).default(""), referralType: z.string().max(160).default(""), groupId: z.string().max(100).default(""), personId: z.string().max(100).default(""), familyId: z.string().max(100).default(""), caseId: z.string().max(100).default(""), statementId: z.string().max(100).default("") }).refine(f => f.from <= f.to, "Período invertido.");
export type SocialReportFilter = z.infer<typeof socialReportFilter>;
export type SocialReportSection = { title: string; headers: string[]; rows: string[][] };
export type SocialReport = { title: string; period: string; sections: SocialReportSection[]; totals: { attendances: number; events: number; referrals: number; deliveries: number }; note: string };
export function ageAt(birth: string, on: string): number { return Number(on.slice(0, 4)) - Number(birth.slice(0, 4)) - (on.slice(5) < birth.slice(5) ? 1 : 0); }
