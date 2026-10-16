"use server";

import { revalidatePath } from "next/cache";
import { getEmployeePortalAccess } from "@/lib/portal-servidor/access";
import { bookOwnMedicalAppointment, cancelOwnMedicalAppointment } from "@/lib/portal-servidor/medical-agenda";

export async function bookMyMedicalAppointment(raw: unknown) {
  try {
    const access = await getEmployeePortalAccess();
    if (access.status !== "AVAILABLE") return { error: "Acesso funcional indisponível." };
    const id = await bookOwnMedicalAppointment(access.context, raw);
    revalidatePath("/portal-servidor/sst/agenda"); revalidatePath("/sst/agenda/agendamentos");
    return { id, error: "" };
  } catch (error) { return { error: error instanceof Error ? error.message : "Não foi possível agendar o atendimento." }; }
}

export async function cancelMyMedicalAppointment(raw: unknown) {
  try {
    const access = await getEmployeePortalAccess();
    if (access.status !== "AVAILABLE") return { error: "Acesso funcional indisponível." };
    await cancelOwnMedicalAppointment(access.context, raw);
    revalidatePath("/portal-servidor/sst/agenda"); revalidatePath("/sst/agenda/agendamentos");
    return { error: "" };
  } catch (error) { return { error: error instanceof Error ? error.message : "Não foi possível cancelar o atendimento." }; }
}
