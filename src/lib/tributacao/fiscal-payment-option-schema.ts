import { Prisma } from "@prisma/client";
import { z } from "zod";

export const fiscalPaymentOptionSchema = z.object({
  code: z.string().trim().min(1).max(60), name: z.string().trim().min(1).max(160), dueDate: z.iso.date(),
  discountPercent: z.string().regex(/^\d{1,3}(?:\.\d{1,6})?$/).refine(value => new Prisma.Decimal(value).gte(0) && new Prisma.Decimal(value).lt(100), "Desconto deve ser de 0% a menos de 100%."),
  debtCheck: z.enum(["NONE", "CURRENT", "ACTIVE", "INSTALLMENT", "ALL"]),
  debtTaxIds: z.array(z.string().min(1)).max(100).default([]),
  legalBasis: z.string().trim().min(1).max(4000),
}).strict();
export const fiscalPaymentOptionsSchema = z.array(fiscalPaymentOptionSchema).max(20)
  .refine(rows => new Set(rows.map(row => row.code)).size === rows.length, "Códigos das opções de pagamento devem ser distintos.");
export type FiscalPaymentOption = z.infer<typeof fiscalPaymentOptionSchema>;
