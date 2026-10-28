import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { listVafOverview } from "@/lib/tributacao/s10-service";
import VafClient from "./VafClient";
import { db } from "@/db/client";
export const dynamic = "force-dynamic";
export default async function VafPage({
  searchParams,
}: {
  searchParams?: Promise<{ year?: string }>;
}) {
  const context = await getTenantContextForModule("TRIBUTACAO");
  const sp = (await searchParams) ?? {};
  const year = sp.year ? Number(sp.year) : 2026;
  const data = await listVafOverview(
    context.database ?? db,
    Number.isFinite(year) ? year : 2026,
  );
  if (!data.exercise) {
    return (
      <p className="p-4 text-sm text-slate-600">
        Nenhum exercício de VAF foi configurado.
      </p>
    );
  }
  return <VafClient data={JSON.parse(JSON.stringify(data))} />;
}
