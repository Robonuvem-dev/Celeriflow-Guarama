import Link from "next/link";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
export const dynamic = "force-dynamic";
const downloads = { manual: "Manual do usuário CeleriFlow / DES-IF", "orgao-configuracao": "Parâmetros cadastrados do município", "codigo-tributacao-desif": "Códigos de tributação DES-IF", "codigo-tributacao-municipal": "Códigos de tributação municipal", "evento-contabil": "Eventos contábeis", "produto-servico": "Outros produtos e serviços", "titulo-desif": "Tabela de títulos", "tarifa-bancaria": "Tarifas bancárias", "tipo-dependencia": "Tipos de dependência" };
export default async function DesifDownloadsPage() {
  await getTenantContextForModule("TRIBUTACAO");
  return <main className="space-y-4 p-5"><h1 className="text-xl font-bold">Downloads DES-IF</h1><Link href="/tributacao/iss-bancario/gestao">Voltar à gestão</Link><ul className="space-y-3">{Object.entries(downloads).map(([kind,label]) => <li key={kind}><a className="underline" href={`/tributacao/iss-bancario/gestao/downloads/arquivo?kind=${kind}`}>{label}</a></li>)}</ul><p>As tabelas são exportadas dos cadastros locais autorizados, sem substituir publicações oficiais. O modelo conceitual ABRASF 3.1 e sua relação oficial de mensagens/alertas precisam ser fornecidos pelo município ou pelo publicador oficial; não são simulados por um arquivo local.</p></main>;
}
