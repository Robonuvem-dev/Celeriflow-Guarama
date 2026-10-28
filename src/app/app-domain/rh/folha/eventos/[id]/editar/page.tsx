import { EventForm } from "../../EventForm";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { notFound } from "next/navigation";
import { db } from "@/db/client";
import { readPayrollEvent } from "@/db/repositories/personnel-pages/records";

export default async function EditarEventoPage({ params }: { params: Promise<{ id: string }> }) {
  const context = await getTenantContextForModule("RH");
  const { id } = await params;
  const event = await readPayrollEvent(context.database ?? db, id);

  if (!event) {
    notFound();
  }

  return (
    <EventForm data={event} />
  );
}
