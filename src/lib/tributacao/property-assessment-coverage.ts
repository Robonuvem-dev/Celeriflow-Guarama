import type { Prisma } from "@prisma/client";

export async function assertPropertyOutsideAssessedSimulation(tx:Prisma.TransactionClient,input:{realEstateId:string;taxId:string;year:number}) {
  await tx.$queryRaw`SELECT id FROM "RealEstate" WHERE id=${input.realEstateId} FOR UPDATE`;
  const simulations=await tx.taxRegistryEntry.findMany({where:{entityType:"TAX_ASSESSMENT",category:"PROPERTY_SIMULATION_ASSESSMENT",AND:[{data:{path:["year"],equals:input.year}},{data:{path:["propertyIds"],array_contains:[input.realEstateId]}}]}});
  for(const simulation of simulations) if(await tx.taxAssessment.count({where:{id:simulation.entityId,taxId:input.taxId,status:{not:"Cancelado"}}})) throw new Error("Imóvel já incluído em lançamento de simulação/englobamento do exercício.");
}
