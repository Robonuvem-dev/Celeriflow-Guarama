import { z } from "zod";
import { AccessError } from "@/lib/platform/tenant-context";
import { SstValidationError } from "./errors";
export function accidentActionError(error: unknown) {
  if (error instanceof AccessError || error instanceof SstValidationError) return error.message;
  if (error instanceof z.ZodError) return error.issues.map(issue => `${issue.path.join(".") || "Dados"}: ${issue.message}`).join("; ");
  if (error instanceof SyntaxError) return "Não foi possível interpretar os dados informados.";
  return "Não foi possível concluir o registro. Confira os dados e a disponibilidade do serviço.";
}
