import { redirect } from "next/navigation";

export default async function AuditoriaRedirect({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    if (Array.isArray(value)) value.forEach(item => params.append(key, item));
    else if (value !== undefined) params.set(key, value);
  }
  redirect(`/administracao/auditoria${params.size ? `?${params}` : ""}`);
}
