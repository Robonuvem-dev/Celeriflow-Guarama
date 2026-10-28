# Obras — páginas, layouts e componentes TSX em Drizzle

## Escopo e estado — 28/10/2026

Inventário efetivo: **59 arquivos `.tsx`** em `src/app/app-domain/obras/**`. A baseline visual indicada (`C:/Users/trici/AppData/Local/Temp/opencode/celeriflow-main-sync`, head informado `5cfa75d`) contém **30 arquivos com referências Prisma**; o número 35 da transferência era de outro snapshot. Todo o inventário efetivo foi incluído no grep e na comparação AST.

- **Zero referências Prisma/GetPayload/client em todos os 59 TSX** na árvore atual.
- **59/59 JSX idênticos à baseline**, por AST TypeScript/printer, incluindo expressões, textos, props e classes CSS. Nenhum JSX foi reescrito nesta frente.
- Consultas das páginas restantes migradas para `src/db/repositories/works-pages/**`, com contratos em `src/lib/contracts/works-pages.ts` e mappings faltantes em `src/db/schema/works-pages.ts`.
- As páginas de documentos do caso e o layout correspondente já estavam migrados pela frente anterior. Foram conferidos no inventário, na comparação JSX e nas leituras dos seus consumidores/helpers; seus repositórios continuam com o owner original.
- **Integração local preparada, ainda não executada**. Checagem estrita de tipos, execução Neon/PGlite e build permanecem centralizados pelo parent.

As regras de `AGENTS.md` e a documentação instalada de `page`/Server Components foram lidas. Cada página editada teve sua consulta e o consumidor TSX examinados individualmente. Não foi usado script de substituição em massa; os scripts AST são somente leitura. A assinatura das páginas/default exports foi preservada.

## Matriz por página

| TSX (relativo a `src/app/app-domain/obras`) | Repositório / contrato preservado |
|---|---|
| `page.tsx` | `infrastructure.ts`: três contagens, `active`, status exatos e gate OBRAS. |
| `obras-projetos/page.tsx` | Projeção exata dos nove campos e ordem `numero,id`. Float `valorEstimado` permanece `number|null`. |
| `fiscalizacao-medicoes/page.tsx` | Medição completa + obra selecionada; ordem `data DESC,numero DESC`, opções somente obras ativas; conversão ISO para o client mantida no JSX original. |
| `servicos-urbanos/page.tsx` | Todos os campos de `ObrasServico`, inclusive timestamps/null/Float; `createdAt DESC`. |
| `maquinas-equipes/page.tsx` | Projeção exata de equipes, membros/servidor/cargo, alocações não liberadas; categorias com contains **case-sensitive** Obras/Iluminação e responsáveis/setores opcionais. |
| `documentos/page.tsx` | Restauração da inclusão **completa** de vínculo, serviço, documento e pasta conforme baseline. A migração anterior havia reduzido a campos visíveis; todos os campos e datas voltaram ao DTO. |
| `relatorios/page.tsx` | Mesmos groupBy/count/sum, filtros, ordenações, Float e `null` nas somas; movimentos Saída vinculados a serviços. |
| `construcao-civil/page.tsx` | Setor/papel, categoria e busca por protocolo/PF/PJ; count e página de 20, clamps, `createdAt DESC,id ASC`; `totalArea` Decimal. |
| `construcao-civil/novo/page.tsx` | Gates OBRAS/PROCESSOS create, servidor e ANALYST/MANAGER mantidos; última configuração/FORM, catálogos, subjects habilitados em tipo e assunto + IDs publicados, PF/PJ ativos e imóveis. |
| `construcao-civil/configuracoes/page.tsx` | Catálogo por kind/nome/status, mesma paginação/ordem; configuração mais recente, subjects habilitados nas duas camadas. |
| `construcao-civil/construtoras/page.tsx` | Gate original, status/nome empresarial, perfil completo, todas as opções de empresas, datas de vigência e cálculo do dia mantidos. |
| `construcao-civil/equipe/page.tsx` | Gate SystemAdministration; filtro por nome/status, count, employee.name ASC/startsAt DESC, links completos e opções ativas. |
| `construcao-civil/profissionais/page.tsx` | Tabs distintos, cadastros completos e datas, empresa/profissional/PF, ativos; opções técnicas excluem BROKER. |
| `construcao-civil/participacao/page.tsx` | Gate MANAGER/admin, escopo do caso e protocolo; relações identidade→profissional→PF, termos; dados administrativos somente para admin. |
| `construcao-civil/consultas/page.tsx` | Count/list por escopo/protocolo e presença/ausência real da resposta, resposta completa com Date; opções de casos/setores originais. Form action preservada. |
| `construcao-civil/regras/page.tsx` | Tabs/formulário/zonas/distribuições; escopo de distribuição; última definição, finalidade, imóvel→zona, setores/servidores; Decimal e Date preservados. |
| `construcao-civil/integracoes/page.tsx` | Escopo por departamento + **every** dos casos via `NOT EXISTS (... scope IS NOT TRUE)`; busca, período/tipo/recibo, count/página e recibos completos; distinct scope/period pela versão mais alta mantém a ordenação original. |
| `construcao-civil/[id]/page.tsx` | Caso completo, configuração completa, processo/propriedades com projeção exata; quatro paginações independentes; análise, substituições, staff vigente por dia, documentos finais e mensagens. |
| `construcao-civil/[id]/pranchas/page.tsx` | Autorização antes da consulta de histórico; engine/status/filename/hash/model, count/página/ordem e JSON íntegro. |
| `construcao-civil/[id]/ciclo/page.tsx` | Caso/config/processo completos; plano/início opcionais, projeto aprovado, propriedades completas; filtros/páginas independentes de vistorias/conclusões, conclusão TOTAL sem filtro, update opcional e pending requests exatos START/INSPECTION/COMPLETION. |
| `construcao-civil/vistorias/page.tsx` | Fila por setor/papel, status e requestNotes/protocolo, requestedAt DESC/id ASC; lista cadastral do owner original mantida. |
| `construcao-civil/fiscalizacao/page.tsx` | Escopo exige INSPECTOR/MANAGER, filtros de protocolo/imóvel/status/local/alvará; opções limitadas 100/200 e gate de abertura original. |
| `construcao-civil/fiscalizacao/[id]/page.tsx` | Autorização específica; caso/processo/imóvel completos, GED; quatro counts/páginas/filtros independentes, evidências/ciência/ato relacionado e contagem numérica, opções de fiscais vigentes e nomes preservados. |
| `construcao-civil/fiscalizacao/[id]/atos/[actId]/page.tsx` | Autorização do caso + ato daquele caso, snapshots GED, acknowledgements ASC e dados do fiscal; datas em America/Sao_Paulo e texto demonstrativo intactos. |
| `construcao-civil/taxas/page.tsx` | Escopo e caseId, paginação original sem clamp superior; inclusão completa de configuração/processo/PF/PJ/contribuinte/imóveis/taxas/lançamentos/guias/pagamentos confirmados; regras/tax e requests documentais exatos. |
| `construcao-civil/taxas/guias/[id]/page.tsx` | Autorização via caso da taxa, guia por ID, regra e lançamento completos, contribuinte/PF/PJ/imóvel e pagamentos confirmados; Float e Decimal distintos, Date e JSON completos. |
| `construcao-civil/[id]/documentos/{page,layout}.tsx` | Migração anterior conferida: escopo do caso, projeto aprovado, documentos/versões/assinaturas, exclusões de emitidos/carimbados e pedidos pendentes mantidos. Nenhuma edição nesta frente. |
| `layout.tsx`, redirects e demais componentes client | JSX idêntico à baseline e sem Prisma na árvore atual; contratos existentes de actions foram preservados. |

## Persistência e tipos

- Repositórios recebem **`DatabaseExecutor`**. Páginas usam `context.database ?? db`, inclusive as sete páginas de infraestrutura que antes usavam o singleton diretamente.
- Sem delegates, tradutor where/include, proxy de ORM, cast de retorno Prisma ou mudança em schemas/repositórios de Obras de outros owners.
- `works-pages.ts` declara somente as tabelas físicas faltantes para leitura. Não gera/executa DDL e não altera os SQLs históricos.
- Verificação estática por `getTableConfig` contra o catálogo físico: **94 mappings examinados, zero campos ausentes/extras e zero divergências de tipos/precisão/nulabilidade** nos módulos exclusivos e reutilizados verificados.
- Todos os resultados temporais novos usam seleção tipada Drizzle, que faz a decodificação `Date`. Nenhum JSON SQL contendo datas é marcado como Date por cast. Na página documental preexistente, a execução raw de conclusão só retorna strings/Decimal explícito, sem timestamps.
- `exactNumeric` decodifica a string SQL em `Decimal`; valores financeiros/áreas não passam por `Number`. Os Float históricos e agregados Float continuam `number`, inclusive null e zero.
- `WorksCaseRecord`, `WorksConfigurationRecord`, `WorksCaseListRecord` e `WorksCaseDetail` tornam explícitos os DTOs centrais; as assinaturas dos repositórios de lista/detalhe verificam esses contratos sem casts.
- Relações opcionais continuam `null`, arrays vazios continuam `[]`, e snapshots JSON são transportados integralmente. As listas de IDs vazias usam os predicados tipados Drizzle (falso), sem `IN ()` textual.
- Sem filtro novo de ente/UG, sigilo ou titularidade que alargue/restrinja o legado. Os gates de contexto e as políticas originais de construção/fiscalização permanecem nos chamadores; o predicado SQL reproduz o recorte de departamento/papéis.

## Dependência de assinaturas do outro owner (coordenação necessária)

Os helpers abaixo ainda declaravam Prisma na última leitura desta frente:

1. `src/lib/obras/construction-taxation.ts`: `getConstructionPropertyDebts(tx, caseId)`.
2. `src/lib/obras/construction-lifecycle-deadlines.ts`: `getConstructionInspectionCorrections(tx, caseId)`.

Os chamadores TSX foram preparados para **transação Drizzle de `context.database ?? db`**, mantendo as duas transações independentes do ciclo e a consulta transacional de débitos em taxas. A frente de helpers deve fornecer as assinaturas Drizzle e manter os payloads existentes. Nenhum helper foi modificado por esta frente; não há cast/compatibilidade Prisma para ocultar a pendência. Não se declara typecheck/build aprovado enquanto isso não estiver integrado.

As consultas fora dessas transações continuam fora delas como no original; não foi inventado um snapshot global da página ou modificado o isolamento original das leituras.

## Testes preparados para execução central

### `tests/drizzle-works-pages-visual.test.ts`

- Todos os 59 TSX sem Prisma e com sintaxe válida.
- Comparação AST de todos os JSX com a baseline indicada (override `WORKS_PAGES_VISUAL_BASELINE` para outro host; caso visual é explicitamente skipped se a baseline não existir).
- Catálogo físico versus todos os mappings exclusivos, incluindo tipos, precisão e nulabilidade.

### `tests/drizzle-works-pages.test.ts`

Uma fixture local independente, **Neon/Drizzle real sobre PGlite/socket/WebSocket**, com replay do SQL histórico pelo executor real. Nenhum mock de ORM, conexão remota ou carga operacional. Sete subtestes:

1. Escopo de setor/papel, caso com departamento NULL, paginação/count/ordenação, texto SQL como parâmetro, configuração/JSON/propriedades, precisão limite e datas, avaliações/reviews/mensagens/substituições/documentos/staff vigente.
2. Profissionais/empregadores/empresas/identidades/participações/staff, datas civis, configurações/templates/subjects, zona Decimal, distribuição por setor, consulta pendente e extrações.
3. Ciclo/plano/início, imóvel Float/null, inspeção Date, conclusão Decimal, relação update ausente e pending request público exato.
4. Lotes com every, vazio, caso de outro setor e setor NULL; recibos, versões e opções de retificação.
5. Fiscalização com papel específico, evidências PHOTO/ciência, contagem numérica, vigência e espelho autorizado com JSON/Date.
6. Tributação com inclusão completa, Float versus Decimal, precisão acima do inteiro seguro, pagamento cancelado excluído, guia/Date/PF/PJ e negativa de acesso.
7. Infraestrutura completa, agregados, null, alocações, documentos/pastas com Date e DTO integral; consultas executadas em transação PostgreSQL **READ ONLY**.

Comandos sugeridos para a janela central, sequenciais:

```powershell
node --max-old-space-size=512 --conditions=react-server --import tsx --test --test-concurrency=1 tests/drizzle-works-pages-visual.test.ts
node --max-old-space-size=512 --conditions=react-server --import tsx --test --test-concurrency=1 tests/drizzle-works-pages.test.ts
```

Esses testes não foram executados nesta frente. A criação da fixture não exige nem usa `DATABASE_URL` operacional; `createLocalDrizzleDatabase` controla e restaura o transporte local conforme contrato compartilhado.

## Evidências leves realizadas

- ESLint dos **59 TSX**: **exit 0**, sem warnings.
- ESLint dos nove repositórios exclusivos, mapping, contrato e dois testes: **exit 0**, sem warnings.
- Parsing TypeScript/TSX dos **72 arquivos** do escopo: **zero erros**.
- Comparação JSX por AST, reaplicada após as migrações de infraestrutura: **59 iguais / zero diferenças**.
- Inspeção estática dos 94 mappings: **zero divergências** no catálogo físico.
- Grep `Prisma|prisma|GetPayload|@prisma` restrito a todos os `.tsx` de Obras: **zero ocorrências**.
- Não foram executados tsc, build, PGlite ou scripts operacionais por esta frente; nenhuma operação Git/DDL remoto/publicação foi realizada.

## Handoff

### Primeiro retorno da execução central

O parent informou **P1 9 PASS / 0 FAIL** e **Obras AST 3 PASS**. A suíte SQL de Obras parou no seed, antes dos cenários, com `23505 ConstructionCatalogEntry_kind_name_key`: `PURPOSE/Residencial` já está nos 156 SQLs. A fixture passou a usar `Finalidade residencial da fixture works-pages`, preservando seu ID e vínculo de finalidade da zona. Asserções de ordenação permanecem; o vínculo zona→finalidade e a finalidade retornada também são verificados explicitamente.

Revisados individualmente os inserts históricos dos catálogos/versionamentos usados no seed: somente o catálogo de construção e os três impostos-base têm INSERT nos SQLs históricos; nomes/IDs dos demais dados desta fixture não colidem com essas referências. Nenhum dado histórico foi excluído/modificado e nenhuma constraint foi relaxada. Reteste SQL continua centralizado.

1. Integrar as duas assinaturas dos helpers com a frente responsável.
2. Executar as duas suítes sequencialmente na janela central e encaminhar falhas desta frente.
3. Fazer a checagem estrita de tipos do escopo e a validação integrada/build centralizados.
4. As evidências leves comprovam remoção das referências TSX, equivalência estrutural do JSX e compatibilidade estática do catálogo; **não comprovam homologação de produção nem aprovação do projeto inteiro**.

Ownership dos sete scripts P1 foi mantido: as correções de fixtures solicitadas durante esta missão constam de `docs/drizzle-p1-platform-tools-progress.md` e aguardam o reteste central.
