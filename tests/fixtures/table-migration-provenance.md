# Proveniência histórica e contratos da UI tabular autorizada

## Motivo da separação

A migração Drizzle original exigia não alterar JSX/CSS. A migração posterior de
tabelas tem autorização para alterar a apresentação. Comparar a UI atual com o
JSX anterior rejeitava uma mudança autorizada, sem testar acesso ou payload.

Os testes agora têm duas responsabilidades executáveis e independentes:

1. **Proveniência:** as evidências originais permanecem imutáveis, com commit,
   versão/algoritmo AST e fingerprints históricos. Não se recalcula um hash de UI
   atual para substituir os antigos.
2. **Código atual:** inventários reconciliados, AST de segurança/integração,
   caminhos de renderização e testes comportamentais de rascunhos/exportações.

## Origem e limites da prova histórica

- `historical-visual-baselines.json` permanece byte-equivalente em LF à evidência
  anterior. O manifest fixa seu SHA-256 LF, `sourceCommit=5cfa75d…` e
  `typescriptVersion=5.9.3`, com os 59/15/24 arquivos de Obras/Planejamento/Cemitérios.
- `health-pages-original-jsx.json` permanece intacto com seus 100 fingerprints e
  a descrição original da normalização AST. Seu SHA-256 LF é fixado separadamente.
- Os 17 hashes JSX e oito hashes de componentes de Farmácia continuam nos mapas
  originais de `drizzle-health-pharmacy-pages-ast.test.ts`. Dois digests selam esses
  **mapas de evidência**, não a nova UI. Suas entradas não foram regeneradas.
- Os hashes agregados antigos de RH/SST foram preservados literalmente em
  `table-migration-provenance.json`. O registro SST original não informava SHA de
  origem: isso continua explícito, sem inventar um commit para essa captura.
- Os inventários históricos de RH/SST/Financeiro foram conferidos por leitura dos
  objetos locais de `b199957ce1712fdf1613b4d6909643c3cca4c2c1`. O manifest guarda
  SHA-256 de `JSON.stringify(caminhos_completos_ordenados)` e contagens 98/86/64.
  As adições autorizadas são listadas separadamente; não alteram esses digests.

As fixtures antigas contêm fingerprints, **não cópias integrais dos fontes**.
A verificação executável prova integridade desses registros e seus metadados;
não afirma reexecutar o compilador sobre fontes históricos ausentes. Os testes
do normalizador comprovam suas regras de preservação de callbacks/atributos.
Não há consulta a `.git`, comando Git, arquivo externo opcional ou fallback de
skip durante a execução em CI, inclusive em clone shallow.

## Asserções obsoletas substituídas

| Suíte | Antes | Contrato atual obrigatório |
|---|---|---|
| Planejamento | 15 TSX e hashes JSX/arquivo integral | 15 históricos + cinco adições; contexto por jurisdição, executor, gates PLANEJAMENTO/TRANSPARENCIA/DOCUMENTOS/CAMARA, actions e tabelas reais |
| Obras | 59 TSX e hash JSX/CSS | 59 históricos + relatório; acesso por setor, leitores com executor/escopo, actions urbanísticas/obras e caminho de renderização |
| Cemitérios | inventário/JSX exato e exceção Decimal | artefato original selado, inventário + menu, contexto, CRUD condicionado, leitores de histórico/sepulturas e action da estrutura |
| Saúde | 100 JSX exatos | artefato original selado + três adições; executor, gates create/update/admin, props de permissões, actions AIH/APAC e seleção integral associada ao formulário |
| Farmácia | hashes JSX/arquivo atual | mapas antigos selados; guardas, unidade autorizada, leitor scoped, 14 actions conectadas e payload integral dos formulários |
| RH | contagem 98 + hash agregado do JSX atual | inventário antigo selado + seis adições; autenticação, leitor, action de status, gate de operação e seleção completa |
| SST | contagem 86 + hash agregado do JSX atual | inventário antigo selado + 13 adições; UG clínica, concessão, canAssess, operações, actions e grupo/seleção integral |
| Financeiro | contagem 64 + comparação visual opcional/skip | inventário antigo selado + sete adições; ente/UG, permissões nas actions, pagamento/estorno/recolhimento e payload N:N completo |

Os testes originais de catálogo físico/mappings continuam ativos. Os testes
separados de RH/SST sobre ausência de ORM/SQL inline também foram mantidos.

## Força e limites dos checks atuais

- Asserções de chamadas usam AST e binding de importação, inclusive aliases.
  Import não usado, comentário com nome da guarda, módulo errado ou leitor sem
  executor/escopo esperado não contam como preservação.
- A cobertura resolve a função/export efetivamente renderizada até o
  `OperationalTable` comum. Importar um arquivo que exporta várias telas não
  atribui tabela ao dashboard que não a renderiza.
- Todo TSX atual dos inventários passa pela sintaxe e fronteira Drizzle. As
  adições também passam; a contagem não impede a execução desses checks.
- Há testes negativos para adulteração de evidências, troca de módulo/executor/
  escopo, imports legados dinâmicos, banco em client e troca de caminho histórico
  mantendo artificialmente o mesmo total.
- `table-migration-offline-domain.test.ts` executa os 34 testes persistidos de
  domínio/payload/colunas. `table-migration-query-export.test.ts` protege filtro e
  sort globais, escopo e exportação de 41 registros com página de 20.
- `table-migration-client-contracts.test.ts` executa handlers reais com hooks e
  actions isolados: nega acesso administrativo sem expor tabela/controles, envia
  todas as 41 unidades e conserva o editor em erro; AIH/APAC mantém seleções de
  páginas distintas, associa os IDs ao formulário e remove seleção inelegível.

AST valida os contratos declarados e conectados; não demonstra todas as regras
de autorização com dados reais nem a geometria do navegador. Estes checks não
conectam a banco, não fazem full build e não homologam deploy. Novas mudanças
legítimas devem revisar os contratos/adições correspondentes, preservando as
evidências históricas e acrescentando cobertura comportamental apropriada.

## Execução offline

```powershell
node --conditions=react-server --import tsx --test --test-concurrency=1 tests/drizzle-planning-pages-visual.test.ts tests/drizzle-works-pages-visual.test.ts tests/cemetery-static-contract.test.ts tests/drizzle-health-pages-ast.test.ts tests/drizzle-health-pharmacy-pages-ast.test.ts tests/drizzle-personnel-pages-ast.test.ts tests/drizzle-sst-pages-ast.test.ts tests/finance-pages-static.test.ts tests/table-migration-contracts.test.ts tests/table-migration-client-contracts.test.ts tests/table-migration-offline-domain.test.ts tests/table-migration-query-export.test.ts tests/tabular-renderers.test.ts tests/procurement-export-contract.test.ts tests/operational-table.test.ts tests/discovery-link-drafts.test.ts tests/especializados-table-widths.test.ts
```

Resultado em 29/10/2026: **47/47 no runner principal**, incluindo o agregador,
e **34/34 no subprocesso**; zero falhas, zero skips. Os 34 filhos não são uma
segunda execução adicional dentro da contagem principal: o principal registra
um teste agregador e sua saída TAP comprova os testes de domínio executados.

ESLint dos 11 arquivos TS desta retomada: aprovado com `--max-warnings 0`.
Checagem TypeScript restrita às mesmas 11 raízes, `noEmit=true` e
`incremental=false`: **zero diagnósticos**, sem gerar arquivos nem full build.

As duas regressões funcionais registradas na revisão anterior não foram
corrigidas por esta alteração de testes. Este resultado encerra as falhas dos
gates históricos adaptados, sem presumir correção de código de domínio.
