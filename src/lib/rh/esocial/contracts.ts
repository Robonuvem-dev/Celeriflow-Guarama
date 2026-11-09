// Serializable console view model. Persisted domain types live in contract.ts.
export { DEMO_LABEL } from "./contract";
import { permissions as ESOCIAL_PERMISSIONS } from "./contract";
export { ESOCIAL_PERMISSIONS };
export type EsocialPermission = typeof ESOCIAL_PERMISSIONS[number];
export type DemoScenario = "NORMAL" | "ERRO_RUBRICA" | "ADVERTENCIA" | "FALHA_CONEXAO" | "SCHEMA_INVALIDO";
export type EventStatus = import("./contract").Status;
export type Occurrence = { tipo: 1 | 2 | 3; codigo: string; descricao: string; localizacao: string; correctionUrl: string };
export type DemoEvent = {
  id: string; logicalId: string; type: string; period: string; reference: string; registration: string | null;
  name: string; regime: string; status: EventStatus; batchId: string | null; receipt: string | null;
  attempt: number; previousId?: string; exclusionOf?: string; warning?: boolean; rubric?: string;
  sourceUrl: string; sourceKind: "FIXTURE" | "RH_LINK" | "IMPORT"; employeeId?: string;
  expected: { cp: number; irrf: number; fgts: number }; returned: { cp: number; irrf: number; fgts: number };
  occurrences: Occurrence[]; sentXml?: string; returnXml?: string; hash?: string; duplicated?: boolean; archived?: boolean;
  sentArtifactId?: string; returnArtifactId?: string; historical?: boolean;
};
export type DemoBatch = { id: string; category: string; eventIds: string[]; status: "PREPARED" | "RECEIVED" | "PROCESSING" | "PROCESSED" | "TRANSPORT_ERROR" | "SCHEMA_ERROR"; protocol: string | null; receivedAt: string | null; queryIndex: number; statusCode: number | null; receptionXml?: string; scenario: DemoScenario };
export type DemoConsultation = { id: string; batchId: string; protocol: string; queryIndex: number; statusCode: number; at: string; xml: string; source: "SIMULATED" };
export type DemoTotalizer = { id: string; type: string; period: string; originEventId: string; originReceipt: string; originAttempt: number; batchId: string; consultationId: string; registration: string | null; name: string; regime: string; valueCents: number; expectedCents: number; metric: string; receivedAt: string; xml: string; hash: string; source: "SIMULATED"; revision: number };
export type DemoArtifact = { id: string; kind: string; xml: string; hash: string };
export type DemoTimeline = { id: string; at: string; action: string; reference: string; actor: string };
export type DemoImport = { id: string; filename: string; hash: string; eventId: string; registration: string; receipt: string; status: "NEW" | "EXISTING" | "CONFLICT" | "IMPORTED" | "KEPT"; xml: string };
export type DemoState = {
  runId: string | null; employerId: string; reconciliation: { metric: string; label: string; expected: number; received: number; difference: number; consolidatedValue: number | null; status: string }[];
  version: 1; revision: number; period: string; mode: "DEMO"; source: "SIMULATED"; layout: "S-1.3";
  events: DemoEvent[]; batches: DemoBatch[]; consultations: DemoConsultation[]; totalizers: DemoTotalizer[];
  artifacts: DemoArtifact[]; timeline: DemoTimeline[]; imports: DemoImport[]; rubrics: string[];
  subscriptions: string[]; notifications: { id: string; userId: string; state: string; eventId: string; at: string; status: "DEMO_OUTBOX"; subject: string }[];
  automation: { authorized: boolean; stage: "VALIDATE" | "COMPLETE"; dueAt: string | null; lastRun: string | null };
};
export type DemoCommand = { action: "PREPARE" | "VALIDATE" | "SEND" | "COMPLETE" | "CONSULT" | "RESET" | "CORRECT" | "DUPLICATE" | "EXCLUDE" | "REOPEN" | "ARCHIVE" | "SUBSCRIBE" | "AUTOMATION" | "RUN_AUTOMATION" | "IMPORT_PREVIEW" | "IMPORT_CONFIRM"; idempotencyKey: string; period: string; scenario?: DemoScenario; batchId?: string; eventId?: string; rubric?: string; enabled?: boolean; stage?: "VALIDATE" | "COMPLETE"; dueAt?: string; files?: { name: string; xml: string }[] };
export const commandPermission: Record<DemoCommand["action"], EsocialPermission> = {
  PREPARE: "ESOCIAL_PREPARE", VALIDATE: "ESOCIAL_VALIDATE", SEND: "ESOCIAL_SEND", COMPLETE: "ESOCIAL_SEND", CONSULT: "ESOCIAL_SEND", RESET: "ESOCIAL_ADMIN", CORRECT: "ESOCIAL_PREPARE", DUPLICATE: "ESOCIAL_SEND", EXCLUDE: "ESOCIAL_SEND", REOPEN: "ESOCIAL_SEND", ARCHIVE: "ESOCIAL_VALIDATE", SUBSCRIBE: "ESOCIAL_VIEW", AUTOMATION: "ESOCIAL_ADMIN", RUN_AUTOMATION: "ESOCIAL_SEND", IMPORT_PREVIEW: "ESOCIAL_PREPARE", IMPORT_CONFIRM: "ESOCIAL_PREPARE",
};
