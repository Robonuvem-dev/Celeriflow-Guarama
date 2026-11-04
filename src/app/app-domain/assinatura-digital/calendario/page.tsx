import { getGedContext } from "@/lib/documents/ged-access";
import { GedPersonalPanel } from "@/components/signatures/ged/GedPersonalPanel";
export const dynamic = "force-dynamic";
export default async function GedCalendarPage() { await getGedContext(); return <GedPersonalPanel calendar />; }
