import { PlanningHearingsPage } from "@/components/app-ui/planejamento/PlanningHearingsPage";

export default async function Page({ searchParams }: { searchParams: Promise<{ hearingId?: string; page?: string }> }) {
  return <PlanningHearingsPage jurisdiction="LEGISLATIVE" filters={await searchParams} />;
}
