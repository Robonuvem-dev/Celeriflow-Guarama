import { PlanningInstrumentsPage } from "@/components/app-ui/planejamento/PlanningPages";

export default async function Page({ params, searchParams }: {
  params: Promise<{ kind: string }>;
  searchParams: Promise<{ q?: string; page?: string; entityId?: string }>;
}) {
  const { kind } = await params;
  return <PlanningInstrumentsPage jurisdiction="LEGISLATIVE" kind={kind} filters={await searchParams} />;
}
