import { z } from "zod";
export const demoCommandSchema = z.object({
  action: z.enum(["PREPARE", "VALIDATE", "SEND", "COMPLETE", "CONSULT", "RESET", "CORRECT", "DUPLICATE", "EXCLUDE", "REOPEN", "ARCHIVE", "SUBSCRIBE", "AUTOMATION", "RUN_AUTOMATION", "IMPORT_PREVIEW", "IMPORT_CONFIRM"]),
  idempotencyKey: z.string().uuid(), period: z.enum(["2026-10", "2026"]),
  employerId: z.string().min(1).max(150),
  scenario: z.enum(["NORMAL", "ERRO_RUBRICA", "ADVERTENCIA", "FALHA_CONEXAO", "SCHEMA_INVALIDO"]).optional(),
  batchId: z.string().max(250).optional(), eventId: z.string().max(500).optional(), rubric: z.string().regex(/^[A-Z0-9_-]{1,60}$/).optional(),
  enabled: z.boolean().optional(), stage: z.enum(["VALIDATE", "COMPLETE"]).optional(), dueAt: z.string().datetime().optional(),
   files: z.array(z.object({ name: z.string().min(1).max(200), xml: z.string().max(500_000) }).strict()).max(20).optional(),
}).strict();
