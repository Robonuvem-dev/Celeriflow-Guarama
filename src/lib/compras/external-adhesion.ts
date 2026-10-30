import { z } from "zod";
export const externalAdhesionSchema = z.object({
  organization: z.string().trim().min(1).max(200),
  processNumber: z.string().trim().min(1).max(100),
  minutesNumber: z.string().trim().min(1).max(100),
});
export type ExternalAdhesion = z.infer<typeof externalAdhesionSchema>;
