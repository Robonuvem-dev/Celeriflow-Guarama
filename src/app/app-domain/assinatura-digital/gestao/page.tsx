import { getGedContext } from "@/lib/documents/ged-access";
import { GedAdministration } from "@/components/signatures/ged/GedAdministration";
export const dynamic = "force-dynamic";
export default async function GedAdministrationPage() { await getGedContext("configure"); return <GedAdministration />; }
