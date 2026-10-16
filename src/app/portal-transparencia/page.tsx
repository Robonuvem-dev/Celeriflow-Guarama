import { redirect } from "next/navigation";
import { publicTransparencyPath } from "@/lib/transparencia/publication-policy";

export default async function LegacyTransparencyPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = await searchParams;
  const params = new URLSearchParams(Object.entries(raw).flatMap(([key, value]) => typeof value === "string" ? [[key, value]] : []));
  redirect(`${publicTransparencyPath}?${params}`);
}
