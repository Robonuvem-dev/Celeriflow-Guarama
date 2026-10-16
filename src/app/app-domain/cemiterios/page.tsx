import { redirect } from "next/navigation";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";

export default async function CemeteriesEntry({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await getTenantContextForModule("CEMITERIOS");
  const query = await searchParams;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) if (typeof value === "string" && value) params.set(key, value);
  redirect(params.size ? `/cemiterios/consulta?${params}` : "/cemiterios/estrutura");
}
