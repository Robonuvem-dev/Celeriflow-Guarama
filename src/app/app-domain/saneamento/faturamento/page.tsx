import { redirect } from "next/navigation";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";

export default async function FaturamentoPage() {
  await getTenantContextForModule("SANEAMENTO");
  redirect("/saneamento/faturas");
}
