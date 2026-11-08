import { getPlanningContext } from "@/lib/planejamento/access";
import { db } from "@/db/client";
import { planningBudgetUnits } from "@/db/schema/planning-budget";
import { governmentEntities } from "@/db/schema/master-data";
import { asc } from "drizzle-orm";
import UnidadesGestorasClient from "./UnidadesGestorasClient";

export const dynamic = "force-dynamic";

export default async function UnidadesGestorasPage() {
  const context = await getPlanningContext("EXECUTIVE");
  const units = await (context.database ?? db)
    .select({
      id: planningBudgetUnits.id,
      code: planningBudgetUnits.code,
      name: planningBudgetUnits.name,
      secretariatId: planningBudgetUnits.secretariatId,
    })
    .from(planningBudgetUnits)
    .orderBy(asc(planningBudgetUnits.code));

  const entities = await (context.database ?? db)
    .select({
      id: governmentEntities.id,
      code: governmentEntities.code,
      name: governmentEntities.name,
      type: governmentEntities.type,
    })
    .from(governmentEntities)
    .orderBy(asc(governmentEntities.code));

  return (
    <UnidadesGestorasClient
      initialUnits={units}
      entities={entities}
    />
  );
}
