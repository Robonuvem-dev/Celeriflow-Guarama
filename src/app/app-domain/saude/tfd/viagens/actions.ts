"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { confirmTfdTrip, createTfdTripFromBooking, recordTfdPassengerBoarding } from "@/lib/saude/tfd-transport-service";
import { addPassenger } from "@/lib/saude/tfd-service";

const text = (data: FormData, key: string) => String(data.get(key) || "").trim();
export async function createBookedTfdTripAction(data: FormData): Promise<void> {
  const context = await getTenantContextForModuleOperation("SAUDE", "create");
  const trip = await createTfdTripFromBooking(context, { bookingId: text(data, "bookingId"), capacity: Number(data.get("capacity")), assistantEmployeeId: text(data, "assistantEmployeeId") || null, responsibleEmployeeId: text(data, "responsibleEmployeeId"), advanceRequestId: text(data, "advanceRequestId") || null });
  revalidatePath("/saude/tfd"); revalidatePath("/saude/tfd/viagens");
  redirect(`/saude/tfd/viagens/${encodeURIComponent(trip.id)}${text(data, "requestId") ? `?requestId=${encodeURIComponent(text(data, "requestId"))}` : ""}`);
}
export async function confirmTfdTripAction(data: FormData): Promise<void> {
  const context = await getTenantContextForModuleOperation("SAUDE", "update");
  await confirmTfdTrip(context, { tripId: text(data, "tripId"), reason: text(data, "reason") });
  revalidatePath("/saude/tfd/viagens"); revalidatePath(`/saude/tfd/viagens/${encodeURIComponent(text(data, "tripId"))}`);
}
export async function boardTfdPassengerAction(data: FormData): Promise<void> {
  const context = await getTenantContextForModuleOperation("SAUDE", "update");
  const initial = await context.prisma.healthTfdPassenger.findUniqueOrThrow({ where: { id: text(data, "passengerId") }, select: { tripId: true } });
  await recordTfdPassengerBoarding(context, { passengerId: text(data, "passengerId"), boardingLocation: text(data, "boardingLocation"), presenceStatus: text(data, "presenceStatus"), reason: text(data, "reason") });
  revalidatePath(`/saude/tfd/viagens/${encodeURIComponent(initial.tripId)}`); revalidatePath("/saude/tfd");
}

export async function addAuthorizedTfdPassengerAction(data: FormData): Promise<void> {
  const context = await getTenantContextForModuleOperation("SAUDE", "create");
  const request = await context.prisma.healthTfdRequest.findUniqueOrThrow({ where: { id: text(data, "tfdRequestId") }, select: { id: true, patientId: true } });
  const tripId = text(data, "tripId");
  await addPassenger(context, { tripId, patientId: request.patientId, tfdRequestId: request.id, kind: text(data, "kind"), companionName: text(data, "companionName") || null, companionDocument: text(data, "companionDocument") || null });
  revalidatePath(`/saude/tfd/viagens/${encodeURIComponent(tripId)}`); revalidatePath("/saude/tfd");
}
