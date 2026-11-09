import { z } from "zod";

export const DEMO_LABEL = "AMBIENTE DE DEMONSTRAÇÃO — RESPOSTAS SIMULADAS, SEM TRANSMISSÃO AO eSOCIAL";
export const DEMO_LAYOUT = "CELERIFLOW-DEMO-1 / referência S-1.3 NT07-2026";
export const permissions = ["ESOCIAL_VIEW", "ESOCIAL_PREPARE", "ESOCIAL_VALIDATE", "ESOCIAL_SEND", "ESOCIAL_ADMIN", "ESOCIAL_AUDIT"] as const;
export type Permission = typeof permissions[number];
export const totalizerTypes = ["S-5001", "S-5002", "S-5003", "S-5011", "S-5012", "S-5013"] as const;
export type TotalizerType = typeof totalizerTypes[number];
export type Status = "DRAFT" | "VALIDATED" | "RECEIVED" | "PROCESSING" | "ACCEPTED" | "ACCEPTED_WITH_WARNING" | "REJECTED" | "TRANSPORT_ERROR" | "EXCLUDED" | "IMPORTED_EXTERNAL";
export type Occurrence = { tipo: 1 | 2 | 3; codigo: string; descricao: string; localizacao: string; correctionUrl: string };
export type Amounts = { base: number; cp: number; irrf: number; fgts: number; expectedCp: number };
export type Event = {
  id: string; type: string; period: string; reference: string; registration: string | null; name: string; regime: "RGPS" | "RPPS" | null;
  status: Status; amounts: Amounts; rubric: string; warning: boolean; alternative: boolean;
  sourceId: string | null; sourceUrl: string; sourceKind: "FIXTURE" | "RH" | "IMPORTED_EXTERNAL";
  attempts: Attempt[]; revision: number; excludedBy?: string;
};
export type Attempt = { id: string; batchId: string; revision: number; hash: string; sentArtifactId: string; returnArtifactId: string | null; receipt: string | null; status: Status; occurrences: Occurrence[]; duplicated: boolean; archived?: boolean; createdAt: string; processedAt: string | null };
export type Batch = { id: string; category: string; eventIds: string[]; status: Status; protocol: string | null; queries: number; receiptArtifactId: string | null; consultations: string[]; createdAt: string };
export type Totalizer = { id: string; type: TotalizerType; eventId: string; attemptId: string; receipt: string; batchId: string; consultationId: string; registration: string | null; name: string; regime: string | null; period: string; revision: number; value: number; base: number; artifactId: string; receivedAt: string; source: "SIMULATED" };
export type Artifact = { id: string; kind: "SENT" | "RECEPTION" | "CONSULTATION" | "RETURN" | "TOTALIZER" | "IMPORT"; xml: string; hash: string; createdAt: string; objectUrl?: string };
export type Consultation = { id: string; batchId: string; protocol: string; index: number; code: number; artifactId: string; createdAt: string };
export type Timeline = { id: string; action: string; target: string; message: string; at: string; actorId: string };
export type Notification = { id: string; eventId: string; status: string; subject: string; recipientId: string; channel: "IN_APP" | "EMAIL_OUTBOX"; source: "SIMULATED"; createdAt: string };
export type DemoState = {
  version: 1; mode: "DEMO"; source: "SIMULATED"; tenantId: string; employerId: string; period: string; generation: number;
  events: Event[]; batches: Batch[]; totalizers: Totalizer[]; consultations: Consultation[]; artifacts: Artifact[]; timeline: Timeline[];
  rubrics: string[]; notifications: Notification[]; subscribers: string[]; closed: boolean;
  imports: { id: string; eventId: string; hash: string; status: "NEW" | "EXISTING" | "CONFLICT" | "IMPORTED" | "KEPT"; artifactId: string; at: string; filename?: string; registration?: string; receipt?: string }[];
  schedule: { dueAt: string; authorizedBy: string; enabled: boolean; lastRun: string | null; stage?: "VALIDATE" | "COMPLETE" } | null;
};
export const commandSchema = z.object({
  action: z.enum(["PREPARE", "VALIDATE", "SEND", "CONSULT", "COMPLETE", "CORRECT", "DUPLICATE", "EXCLUDE", "REOPEN", "RESET", "ARCHIVE_ERRORS", "SUBSCRIBE", "SCHEDULE", "RUN_SCHEDULE", "IMPORT", "IMPORT_PREVIEW", "IMPORT_CONFIRM"]),
  period: z.enum(["2026-10", "2026"]).default("2026-10"),
  employerId: z.string().min(1).max(150), idempotencyKey: z.uuid(),
  targetId: z.string().max(150).optional(), scenario: z.enum(["NORMAL", "ERRO_RUBRICA", "ADVERTENCIA", "FALHA_CONEXAO", "ERRO_SCHEMA"]).default("NORMAL"),
  dueAt: z.iso.datetime().optional(), xml: z.string().max(500_000).optional(), enabled: z.boolean().optional(),
  stage: z.enum(["VALIDATE", "COMPLETE"]).optional(), rubric: z.string().regex(/^[A-Z0-9_-]{1,60}$/).optional(),
  files: z.array(z.object({ name: z.string().min(1).max(200), xml: z.string().max(500_000) }).strict()).max(20).optional(),
}).strict();
export type Command = z.infer<typeof commandSchema>;
export const accepted = (status: Status) => status === "ACCEPTED" || status === "ACCEPTED_WITH_WARNING";
export function permissionFor(action: Command["action"]): Permission {
  if (["RESET", "SCHEDULE"].includes(action)) return "ESOCIAL_ADMIN";
  if (action === "SUBSCRIBE") return "ESOCIAL_VIEW";
  if (["PREPARE", "IMPORT", "IMPORT_PREVIEW", "IMPORT_CONFIRM", "CORRECT"].includes(action)) return "ESOCIAL_PREPARE";
  if (["VALIDATE", "ARCHIVE_ERRORS"].includes(action)) return "ESOCIAL_VALIDATE";
  return "ESOCIAL_SEND";
}
