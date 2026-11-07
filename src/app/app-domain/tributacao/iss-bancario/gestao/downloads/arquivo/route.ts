import { db } from "@/db/client";
import { getTenantContextForModule, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { listFiscalEntries } from "@/db/repositories/taxation-pages/registry";
import { latestTaxReferences, taxReferenceSchema } from "@/lib/tributacao/reference-catalog";

const catalogKinds = [
  "orgao-configuracao",
  "codigo-tributacao-desif",
  "codigo-tributacao-municipal",
  "evento-contabil",
  "produto-servico",
  "titulo-desif",
  "tarifa-bancaria",
  "tipo-dependencia",
];

const manual = `# Manual do Usuário — DES-IF CeleriFlow (Requisito 28.18)

1. Acesse /tributacao/iss-bancario com sua conta municipal autorizada.
2. Cadastre a Instituição Financeira, vínculo com contribuinte e dependências/agências (os CNPJs das agências devem corresponder ao CNPJ base).
3. Na recepção da DES-IF, importe os arquivos dos Módulos 1 (Demonstrativo Contábil), 2 (Apuração Mensal do ISSQN), 3 (Informações Comuns) e 4 (Partidas dos Lançamentos Contábeis).
4. Confira instituição, competência, módulo, tipo de declaração (Original ou Retificadora) e eventuais inconsistências antes de concluir o processamento e emitir o protocolo.
5. Consulte a apuração mensal por subtítulo e emita ou reimprima a Guia de Recolhimento (DAM) diretamente na tela da declaração.
6. Em /tributacao/iss-bancario/gestao pesquise declarações e Autos de Infração combinando filtros de instituição, módulo, situação administrativa e intervalo de datas.
7. Na tela de Auto de Infração (/tributacao/iss-bancario/gestao/autos/[id]), selecione as contas e subcontas COSIF indicadas para tributação, revise o motivo da indicação, altere o Código de Tributação DES-IF e confirme o aceite do valor lançado a débito.
8. Emita e imprima os Anexos I a VI do Auto de Infração (/tributacao/iss-bancario/gestao/anexos/[id]) e exporte os relatórios gerenciais em PDF, XLS, XLSX, DOC, DOCX, TXT e CSV.
`;

const modeloConceitualAbrasf = `# Modelo Conceitual ABRASF — DES-IF Versão 3.1 (Requisito 28.19)

## 1. Estrutura dos Módulos da DES-IF
- **Módulo 1 — Demonstrativo Contábil**: Balancete Analítico Mensal (Registro 0410) e Demonstrativo de Rateio de Receitas (Registro 0420).
- **Módulo 2 — Apuração Mensal do ISSQN**: Demonstrativo da Apuração da Receita Tributável e do ISSQN Mensal Devido por Subtítulo (Registro 0430) e Demonstrativo do ISSQN Mensal a Recolher (Registro 0440).
- **Módulo 3 — Informações Comuns aos Municípios**: Plano Geral de Contas Comentado — PGCC (Registro 0100), Tabela de Tarifas de Serviços da Instituição (Registro 0200) e Tabela de Identificação de Outros Produtos e Serviços (Registro 0300).
- **Módulo 4 — Demonstrativo das Partidas dos Lançamentos Contábeis**: Registro 1000 contendo data da partida, número do lançamento, conta COSIF/PGCC, valor a débito/crédito e histórico.

## 2. Identificação do Arquivo (Registro 0000)
- CNPJ Base (8 dígitos), Nome da Instituição Financeira, Código IBGE do Município, Módulo Declarado, Competência Início/Fim, Tipo de Declaração (1 = Original, 2 = Retificadora) e Versão do Leiaute (3.1).
`;

const mensagensErrosAlertas = [
  {
    code: "E001",
    severity: "ERRO",
    module: "GERAL (0000)",
    message: "CNPJ base da instituição financeira não cadastrado ou inativo no município.",
  },
  {
    code: "E002",
    severity: "ERRO",
    module: "MÓDULO 2 (0430)",
    message: "Subtítulo contábil informado na apuração mensal não consta no PGCC vigente da instituição.",
  },
  {
    code: "E003",
    severity: "ERRO",
    module: "MÓDULO 2 (0430/0440)",
    message: "Código de Tributação DES-IF inválido ou incompatível com a Lista de Serviços da LC 116/2003.",
  },
  {
    code: "E004",
    severity: "ERRO",
    module: "MÓDULO 1 (0410)",
    message: "Divergência aritmética no Balancete Mensal: Saldo Inicial + Créditos - Débitos difere do Saldo Final declarado.",
  },
  {
    code: "A001",
    severity: "ALERTA",
    module: "MÓDULO 1 x MÓDULO 2",
    message: "Movimento a crédito no Balancete (grupo 7.1.7 COSIF) superior à Receita Declarada no Módulo de Apuração do ISSQN.",
  },
  {
    code: "A002",
    severity: "ALERTA",
    module: "MÓDULO 3 (0200)",
    message: "Conta vinculada à tarifa bancária sem movimento declarado na competência.",
  },
];

export async function GET(request: Request) {
  const context = await getTenantContextForModule("TRIBUTACAO");
  const kind = new URL(request.url).searchParams.get("kind") ?? "";

  if (kind === "manual") {
    return new Response(manual, {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": 'attachment; filename="manual-desif-celeriflow.md"',
        "Cache-Control": "no-store",
      },
    });
  }

  if (kind === "modelo-conceitual-abrasf") {
    return new Response(modeloConceitualAbrasf, {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": 'attachment; filename="modelo-conceitual-abrasf-desif-3.1.md"',
        "Cache-Control": "no-store",
      },
    });
  }

  if (kind === "mensagens-erros-alertas") {
    return Response.json(mensagensErrosAlertas, {
      headers: {
        "Content-Disposition": 'attachment; filename="mensagens-erros-alertas-desif.json"',
        "Cache-Control": "no-store",
      },
    });
  }

  if (!catalogKinds.includes(kind)) {
    return new Response("Tabela indisponível.", { status: 404 });
  }

  const allowed = isSystemAdministrator(context.user) ? undefined : context.user.allowedBudgetUnitIds;
  const entries = await listFiscalEntries(context.database ?? db, {
    entityType: "TAX_REFERENCE",
    categories: ["TAX_REFERENCE"],
    allowedBudgetUnitIds: allowed,
  });
  const rows = latestTaxReferences(
    entries.map((entry) => ({
      id: entry.entityId,
      version: entry.version,
      deleted: entry.status === "EXCLUIDO",
      data: taxReferenceSchema.parse(entry.data),
    })),
  ).filter((row) => !row.deleted && row.data.kind === kind);

  return Response.json(
    rows.map((row) => ({
      code: row.data.code,
      name: row.data.name,
      details: row.data.details,
      relatedCode: row.data.relatedCode,
      governmentEntityId: row.data.governmentEntityId,
      budgetUnitId: row.data.budgetUnitId,
      version: row.version,
    })),
    {
      headers: {
        "Content-Disposition": `attachment; filename="${kind}.json"`,
        "Cache-Control": "no-store",
      },
    },
  );
}
