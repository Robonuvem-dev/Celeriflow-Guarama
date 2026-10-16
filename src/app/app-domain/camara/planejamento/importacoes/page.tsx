import { PlanningImportsPage } from "@/components/app-ui/planejamento/PlanningImportsPage";

export default async function Page({ searchParams }: { searchParams: Promise<{ sourceId?: string; page?: string }> }) {
  return <PlanningImportsPage jurisdiction="LEGISLATIVE" filters={await searchParams} />;
}
