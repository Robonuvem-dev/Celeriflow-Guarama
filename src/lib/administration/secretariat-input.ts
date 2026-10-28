import { z } from "zod";

export const secretariatInputSchema = z.object({
  name: z.string().trim().min(1, "Nome é obrigatório.").max(200),
  acronym: z.string().trim().max(30),
  managerId: z.string().trim().nullable(),
});
