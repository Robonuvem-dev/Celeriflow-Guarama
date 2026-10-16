import { PlanningDashboard } from "@/components/app-ui/planejamento/PlanningPages";

export const dynamic = "force-dynamic";

export default async function PlanejamentoDashboardPage() {
  return <PlanningDashboard jurisdiction="EXECUTIVE" />;
}
