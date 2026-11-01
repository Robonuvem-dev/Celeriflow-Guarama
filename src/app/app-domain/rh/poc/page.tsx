import { redirect } from "next/navigation";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
export default async function RhPocPage(){await getTenantContextForModule("RH");redirect("/rh/parametrizacoes");}
