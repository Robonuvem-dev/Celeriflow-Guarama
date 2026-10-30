import { z } from "zod";

export const citizenDeclarationQuery = z.object({
  kind: z.enum(["DMS", "BANCOS", "DIVERSOS", "CARTORIO"]).default("DMS"),
  competence: z.string().regex(/^(0[1-9]|1[0-2])\/\d{4}$/).or(z.literal("")).default(""),
  protocol: z.string().trim().max(120).default(""),
  status: z.string().trim().max(60).default(""),
  direction: z.enum(["", "PRESTADOS", "TOMADOS"]).default(""),
  page: z.coerce.number().int().min(1).max(100000).catch(1),
});
