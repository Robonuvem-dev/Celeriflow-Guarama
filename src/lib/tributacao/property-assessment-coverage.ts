import type { DatabaseTransaction } from "@/db/transaction";
import { lockProperty, listPropertyAssessedSimulations, hasPropertyAssessment } from "@/db/repositories/tax-property/records";

export async function assertPropertyOutsideAssessedSimulation(tx:DatabaseTransaction,input:{realEstateId:string;taxId:string;year:number}): Promise<void> {
  await lockProperty(tx,input.realEstateId);
  const simulations=await listPropertyAssessedSimulations(tx,input.year,input.realEstateId);
  for(const simulation of simulations) if(await hasPropertyAssessment(tx,{assessmentId:simulation.entityId,taxId:input.taxId})) throw new Error("Imóvel já incluído em lançamento de simulação/englobamento do exercício.");
}
