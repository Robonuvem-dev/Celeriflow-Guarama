import { getPlanningContext } from "@/lib/planejamento/access";
import RolloverClient from "./RolloverClient";

export const dynamic = "force-dynamic";

export default async function RolloverPlanningPage() {
  await getPlanningContext("EXECUTIVE");
  return <RolloverClient />;
}
