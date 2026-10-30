import {getTenantContextForModuleOperation} from "@/lib/platform/tenant-context";
import {db} from "@/db/client";
import {actionTaxpayerReport} from "@/db/repositories/tax-actions/reports";
import {readAccountantDirectory} from "@/db/repositories/taxation/accountants";
import {listCertificatePageRows,listDebtPageRows} from "@/db/repositories/taxation-pages/overview";
import {taxRegistrySnapshot} from "@/lib/tributacao/registry-data";
import PrintReport from "./PrintReport";
export const dynamic="force-dynamic";
type Query={tipo?:string;q?:string;inicio?:string;fim?:string;inscricao?:string;cadastro?:string};
export default async function CadastralReports({searchParams}:{searchParams:Promise<Query>}){
 const context=await getTenantContextForModuleOperation("TRIBUTACAO","issueReports");const database=context.database??db;
 const query=await searchParams;const kind=["contribuintes","contadores","certidoes","divida-ativa"].includes(query.tipo??"")?query.tipo!:"contribuintes";
 const q=(query.q??"").trim().toLocaleLowerCase("pt-BR");const inscription=(query.inscricao??"").trim();
 const dateFrom=query.inicio&&/^\d{4}-\d{2}-\d{2}$/.test(query.inicio)?query.inicio:"";const dateTo=query.fim&&/^\d{4}-\d{2}-\d{2}$/.test(query.fim)?query.fim:"";
 const inPeriod=(value:Date)=>{const day=value.toISOString().slice(0,10);return (!dateFrom||day>=dateFrom)&&(!dateTo||day<=dateTo);};
 let headers:string[]=[];let rows:string[][]=[];
 if(kind==="contribuintes"){
  headers=["Cadastro","Tipo","Nome","CPF/CNPJ","Inscrição","Situação","Inscrições econômicas","Imóveis"];
  const taxpayers=await actionTaxpayerReport(database,query.q??"");
  rows=taxpayers.filter(row=>(!inscription||(row.municipalInsc??"").includes(inscription))&&(!query.cadastro||row.id===query.cadastro)&&inPeriod(row.createdAt)).map(row=>[row.id,row.taxpayerType,row.company?.corporateName??row.person?.fullName??"",row.company?.cnpj??row.person?.cpf??"",row.municipalInsc??"",row.status,String(row._count.economicRegistrations),String(row._count.realEstates)]);
 }else if(kind==="contadores"){
  headers=["Cadastro","Nome","CRC","Versão","Data"];
  const {taxpayers,entries}=await readAccountantDirectory(database);const latest=new Map<string,typeof entries[number]>();for(const entry of entries)if(!latest.has(entry.entityId)||latest.get(entry.entityId)!.version<entry.version)latest.set(entry.entityId,entry);
  rows=[...latest.values()].filter(entry=>inPeriod(entry.createdAt)).map(entry=>{const taxpayer=taxpayers.find(t=>t.id===entry.entityId);return[entry.entityId,taxpayer?.company?.corporateName??taxpayer?.person?.fullName??"",String(taxRegistrySnapshot(entry.data).crc??""),String(entry.version),entry.createdAt.toLocaleDateString("pt-BR")];});
 }else if(kind==="certidoes"){
  headers=["Cadastro","Contribuinte","Inscrição","Tipo","Emissão","Validade","Situação","Autenticidade"];
  rows=(await listCertificatePageRows(database)).filter(row=>inPeriod(row.createdAt)&&(!inscription||(row.taxpayer.municipalInsc??"").includes(inscription))&&(!query.cadastro||row.taxpayerId===query.cadastro)).map(row=>[row.taxpayerId,row.taxpayer.company?.corporateName??row.taxpayer.person?.fullName??"",row.taxpayer.municipalInsc??"",row.certificateType,row.createdAt.toLocaleDateString("pt-BR"),row.validUntil.toLocaleDateString("pt-BR"),row.status,row.authCode]);
 }else{
  headers=["Cadastro","Contribuinte","Inscrição","Inscrição dívida ativa","Data","Situação"];
  rows=(await listDebtPageRows(database)).filter(row=>inPeriod(row.createdAt)&&(!inscription||(row.taxpayer.municipalInsc??"").includes(inscription))&&(!query.cadastro||row.taxpayerId===query.cadastro)).map(row=>[row.taxpayerId,row.taxpayer.company?.corporateName??row.taxpayer.person?.fullName??"",row.taxpayer.municipalInsc??"",row.id,row.createdAt.toLocaleDateString("pt-BR"),row.status]);
 }
 if(q&&kind!=="contribuintes")rows=rows.filter(row=>row.join(" ").toLocaleLowerCase("pt-BR").includes(q));
 return <main className="space-y-4 overflow-auto p-5"><h1 className="text-xl font-bold">Relatórios cadastrais fiscais</h1><form className="flex flex-wrap gap-3 print:hidden"><label>Relatório<select name="tipo" defaultValue={kind}><option value="contribuintes">Contribuintes / comprovante cadastral</option><option value="contadores">Contadores</option><option value="certidoes">Certidões emitidas</option><option value="divida-ativa">Inscrições em dívida ativa</option></select></label><label>Nome, documento ou código<input name="q" defaultValue={query.q}/></label><label>Inscrição<input name="inscricao" defaultValue={query.inscricao}/></label><label>Código do cadastro<input name="cadastro" defaultValue={query.cadastro}/></label><label>Data inicial<input type="date" name="inicio" defaultValue={dateFrom}/></label><label>Data final<input type="date" name="fim" defaultValue={dateTo}/></label><button>Consultar</button></form><p>Tipo: {kind} · Período: {dateFrom||"início"} a {dateTo||"atual"} · Inscrição: {inscription||"todas"} · Cadastro: {query.cadastro||"todos"} · {rows.length} registros</p><PrintReport/><table className="w-full text-left"><thead><tr>{headers.map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{rows.map((row,index)=><tr key={index}>{row.map((cell,i)=><td key={i} className="border p-1">{cell}</td>)}</tr>)}</tbody></table>{!rows.length&&<p>Nenhum registro encontrado para os filtros informados.</p>}</main>;
}
