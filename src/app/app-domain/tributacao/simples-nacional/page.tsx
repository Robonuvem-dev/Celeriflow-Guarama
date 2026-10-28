import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import SimplesNacionalClient from "./SimplesNacionalClient";
import { db } from "@/db/client";
import { listPageTaxpayers } from "@/db/repositories/taxation-pages/registry";
import { readSimplesPage } from "@/db/repositories/taxation-pages/simples";
export const dynamic = "force-dynamic";
export default async function SimplesNacionalPage() {
  const context = await getTenantContextForModule("TRIBUTACAO"); const database = context.database ?? db;
  const [rawTaxpayers, { imports, divergences, exclusions, allocations }] = await Promise.all([
    listPageTaxpayers(database, { active: true, order: "created-asc" }),
    readSimplesPage(database),
  ]);
  const taxpayers=rawTaxpayers.map(row=>({id:row.id,name:row.company?.corporateName??row.person?.fullName??row.id,document:row.company?.cnpj??row.person?.cpf??""})); const names=new Map(taxpayers.map(row=>[row.id,row.name]));
  return <SimplesNacionalClient data={{taxpayers,
    imports:imports.map(row=>({id:row.id,source:row.sourceType,originMode:row.originMode,fileName:row.fileName,competence:row.competence??"—",status:row.status,total:row.totalRows,accepted:row.acceptedRows,rejected:row.rejectedRows,createdAt:row.createdAt.toISOString()})),
    divergences:divergences.map(row=>({id:row.id,taxpayerId:row.taxpayerId,taxpayerName:names.get(row.taxpayerId)??row.taxpayerId,competence:row.competence,type:row.divergenceType,status:row.status,nfse:Number(row.nfseServiceDecimal),declared:Number(row.declaredServiceDecimal),revenueDifference:Number(row.revenueDifferenceDecimal),municipalIss:Number(row.municipalIssDecimal),confirmed:Number(row.confirmedPaymentDecimal),paymentDifference:Number(row.paymentDifferenceDecimal),dteMessageId:row.dteMessageId,events:row.events.map(event=>`${event.eventType}: ${event.description}`)})),
    exclusions:exclusions.map(row=>({id:row.id,taxpayerName:names.get(row.taxpayerId)??row.taxpayerId,competence:row.competence,reason:row.reason,revenue:Number(row.calendarRevenueDecimal),limit:Number(row.legalLimitDecimal),status:row.status,documentId:row.documentId,dteMessageId:row.dteMessageId,externalReceipt:row.externalReceipt})),
    allocations:allocations.map(row=>({id:row.id,taxpayerName:names.get(row.taxpayerId)??row.taxpayerId,competence:row.competence,code:row.revenueCode,regime:row.taxpayerRegime,nationalDas:Number(row.nationalDasDecimal),municipal:Number(row.municipalComponentDecimal),confirmed:Number(row.confirmedDecimal),difference:Number(row.differenceDecimal)}))
  }}/>;
}
