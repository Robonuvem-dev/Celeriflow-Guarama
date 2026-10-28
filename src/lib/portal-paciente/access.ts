import { getTenantContextForModule, type AppContext } from "@/lib/platform/tenant-context";
import { db } from "@/db/client";
import { findPortalPatient } from "@/db/repositories/health/patient-portal";

export type PatientPortalAccess =
  | { status: "AVAILABLE"; context: AppContext; patient: { id: string; personId: string; fullName: string } }
  | { status: "UNAVAILABLE"; reason: string };

/**
 * Resolve a identidade do paciente exclusivamente a partir da sessão.
 * Caminho primário: Patient.usuarioId. Alternativo: cadeia
 * Usuario -> Employee -> Person -> Patient (servidores que são pacientes).
 * Nenhum identificador de paciente vindo do navegador é aceito aqui.
 */
export async function getPatientPortalAccess(): Promise<PatientPortalAccess> {
  const context = await getTenantContextForModule("PORTAL_PACIENTE");
  const patient = await findPortalPatient(context.database ?? db, context.user.id, context.user.employeeId);
  if (patient) return { status: "AVAILABLE", context, patient };
  return { status: "UNAVAILABLE", reason: "Nenhum cadastro de paciente vinculado a este acesso. Procure a unidade de saúde para vincular." };
}
