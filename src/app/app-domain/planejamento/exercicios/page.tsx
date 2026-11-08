import { getPlanningContext } from "@/lib/planejamento/access";
import ExerciciosClient from "./ExerciciosClient";

export const dynamic = "force-dynamic";

export default async function PlanejamentoExerciciosPage() {
  await getPlanningContext("EXECUTIVE");
  return <ExerciciosClient />;
}
