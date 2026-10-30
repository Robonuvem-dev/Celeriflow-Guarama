import { z } from "zod";
export const regionalActionSchema = z.object({
  id: z.string().min(1).optional(), actionId: z.string().min(1), region: z.string().trim().min(2).max(160).transform(v => v.toLocaleUpperCase("pt-BR")),
  subactionCode: z.string().trim().max(40).regex(/^[\p{L}\p{N}._-]*$/u).transform(v => v.toLocaleUpperCase("pt-BR")), name: z.string().trim().min(2).max(200), active: z.boolean(),
});
