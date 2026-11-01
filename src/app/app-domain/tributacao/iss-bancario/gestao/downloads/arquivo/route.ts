import { db } from "@/db/client";
import { getTenantContextForModule, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { listFiscalEntries } from "@/db/repositories/taxation-pages/registry";
import { latestTaxReferences, taxReferenceSchema } from "@/lib/tributacao/reference-catalog";
const kinds = ["orgao-configuracao", "codigo-tributacao-desif", "codigo-tributacao-municipal", "evento-contabil", "produto-servico", "titulo-desif", "tarifa-bancaria", "tipo-dependencia"];
const manual = `# Manual do usuário — DES-IF CeleriFlow

1. Acesse /tributacao/iss-bancario com sua conta municipal autorizada.
2. Cadastre instituição, vínculo com contribuinte e agência; os CNPJs das agências devem corresponder ao CNPJ base.
3. O recebimento atual usa conteúdo JSON interno de apuração, balancete ou pacotes. Informar ABRASF 3.1 não certifica o leiaute oficial.
4. Confira instituição, competência, módulo e inconsistências antes de processar. O protocolo é emitido somente após o processamento.
5. Consulte a apuração por subtítulo e emita a guia; sua reimpressão fica disponível no detalhe da declaração.
6. Em /tributacao/iss-bancario/gestao filtre instituição, módulo e intervalo de importação; imprima os registros reais encontrados.
7. Abra uma fiscalização a partir da apuração para emitir TIAF, mapa e auto. Complete os dados administrativos do auto na gestão.
8. As fases administrativas e percentuais complementares não cancelam nem recalculam automaticamente créditos tributários. Use o procedimento financeiro autorizado.
9. Contas e tarifas exibidas como vigentes correspondem ao cadastro atual, não a uma reprodução histórica de declaração.
10. Não compartilhe senha nem exportações contendo informações fiscais.
`;
export async function GET(request: Request) {
  const context = await getTenantContextForModule("TRIBUTACAO");
  const kind = new URL(request.url).searchParams.get("kind") ?? "";
  if (kind === "manual") return new Response(manual, { headers: { "Content-Type": "text/markdown; charset=utf-8", "Content-Disposition": 'attachment; filename="manual-desif-celeriflow.md"', "Cache-Control": "no-store" } });
  if (!kinds.includes(kind)) return new Response("Tabela indisponível.", { status: 404 });
  const allowed = isSystemAdministrator(context.user) ? undefined : context.user.allowedBudgetUnitIds;
  const entries = await listFiscalEntries(context.database ?? db, { entityType: "TAX_REFERENCE", categories: ["TAX_REFERENCE"], allowedBudgetUnitIds: allowed });
  const rows = latestTaxReferences(entries.map(entry => ({ id: entry.entityId, version: entry.version, deleted: entry.status === "EXCLUIDO", data: taxReferenceSchema.parse(entry.data) }))).filter(row => !row.deleted && row.data.kind === kind);
  return Response.json(rows.map(row => ({ code: row.data.code, name: row.data.name, details: row.data.details, relatedCode: row.data.relatedCode, governmentEntityId: row.data.governmentEntityId, budgetUnitId: row.data.budgetUnitId, version: row.version })), { headers: { "Content-Disposition": `attachment; filename="${kind}.json"`, "Cache-Control": "no-store" } });
}
