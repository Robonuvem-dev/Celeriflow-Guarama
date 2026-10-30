import { z } from "zod";
export const processRegistrationDetailSchema = z.object({
  representativePersonId: z.string().trim().min(1).nullable(),
  declaredValue: z.string().trim().regex(/^\d{1,16}(\.\d{1,2})?$/, "Informe um valor não negativo com até duas casas decimais.").nullable(),
});
