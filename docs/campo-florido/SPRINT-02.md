# Sprint 02 — relatórios CF10

02/11/2026. Branch exclusiva `feat/cf10-cf30-cf33-mateus`; base `ab5e8641cd845da1a10747610b9d8508432552e5`. Implementação concluída dos cinco requisitos abaixo. Implementado significa código concluído, conforme orientação do usuário; não significa homologado nem apto a merge. Build integral e homologação autenticada continuam pendentes.

| Item | Implementação | Evidência automatizada |
| --- | --- | --- |
| 10.1 | Estoque geral com tipo, intervalo, depósito e ordenação código/descrição. Saldo inicial anterior ao período, entradas/saídas no período e saldo final na data escolhida. | `tests/recycling-reports.test.ts`: reconciliação com ledger, datas inclusivas, filtros e ordenação. |
| 10.2 | Vendas agrupadas por tipo/classe, filtros tipo/material/depósito/datas, tabela e gráfico. Receita das saídas; quantidades de unidades diferentes não são somadas. | Reconciliação exata com receita mensal e valores acima de 2^53; gráfico no navegador. |
| 10.3 | Vendas mensais por depósito/intervalo, meses sem vendas com valor zero, ordem cronológica. | Meses vazios, limites inclusivos e paginação de 27 meses; gráfico sem NaN para total zero. |
| 10.12 | Analítico geral usando a mesma base de estoque; emissão completa em CSV, Excel e HTML para impressão/salvar PDF pelo navegador. | Renderizadores reais, precisão decimal, proteção contra fórmula e escape HTML; exportação além da página visível. |
| 10.13 | Analítico agrupado por depósito, com os mesmos filtros e ordenações, seções identificadas pelo código de depósito na emissão. | Filtros combinados, depósito sem movimentos, agrupamento e isolamento entre instâncias. |

## Reaproveitamento e contratos

- Consultas Drizzle sobre `RecyclingMovement` e `RecyclingMaterialBinding` existentes, usando os cinco catálogos em parâmetros. Não cria schema, migração, estoque paralelo ou lançamentos em `EnvWaste`, patrimônio ou contabilidade.
- Novos repositório/serviço/dataset: `src/db/repositories/environment/recycling-reports.ts`, `src/lib/environment/recycling-report-service.ts`, `recycling-report-delivery.ts` e `recycling-reports.ts`. Duas consultas sequenciais na mesma transação somente leitura/REPEATABLE READ mantêm contagem, totais e página coerentes. Instância resolvida no servidor, sem aceitar override do usuário.
- Página `/meio-ambiente/residuos/relatorios` e endpoint `/api/meio-ambiente/reciclagem/relatorios` exigem `MEIO_AMBIENTE:issueReports` antes de consultar dados. Emissão registra auditoria antes de liberar a resposta; falha de auditoria impede sucesso. Respostas são privadas/no-store, inclusive erros.
- Reusa `OperationalListFrame`, `OperationalTable`, `OperationalLinkPagination`, filtros, diálogos e conteúdo paginado da base. Vinte linhas por página, filtros na URL, código/descrição ordenados no servidor e exportação sem limitar à página visível. Limite explícito de 10.000 registros por arquivo, solicitando restringir filtros quando excedido, sem truncamento silencioso.
- Reusa `tabular-renderers.ts` e `createDefaultReportTemplate`: instituição, operador/data, CSV/Excel/impressão, proteção contra fórmulas/HTML. Não altera os contratos dos renderizadores nem importa serviços financeiros em runtime.
- Componentes BI existentes foram examinados: `DisplayCharts` usa contexto e rótulos de demandas/servidores em layout de TV. As barras ambientais usam os tokens operacionais e diálogos existentes, sem nova biblioteca de gráficos ou CSS global. Gráfico apresenta a página atual com indicação de paginação e escala máxima do filtro completo.
- Valores permanecem strings decimais exatas. Somente a largura percentual do desenho usa cálculo decimal limitado a 0–100. O teste identificou e corrigiu divisão por zero no gráfico: zero em Decimal tem sinal positivo; a condição correta exige valor maior que zero.

## Validação

Resultados deste incremento, sem skipped:

- 8 testes de relatórios com PostgreSQL isolado/PGlite, Drizzle real e movimentos reais da fixture.
- 5 testes HTTP com filtros/dataset/renderizadores reais; identidade e IO substituídos por sentinelas. Não equivale a sessão autenticada real.
- 4 testes browser com componentes e CSS reais: quatro visões, geometria 13px/24px, 20/1 registros, filtros combinados preservados, exportação completa, precisão/zeros nos gráficos e diálogo em 390×844. Fixture fictícia; fonte usa fallback sans-serif do token.
- 23 testes de regressão: estoque, catálogos/persistência e perfis adicionais. Banco produtivo não acessado.
- ESLint dos arquivos alterados e `git diff --check`; tipos das fontes/imports nas partições 2, 11, 13 e 16 do runner existente e tsc específico das fixtures aprovados. São quatro partições de um plano de 16, não novo build integral.

Comandos:

```sh
node --conditions=react-server --import tsx --test tests/recycling-reports.test.ts
node --test tests/recycling-report-route.test.mjs
node --test tests/recycling-report.browser.test.mjs
node --conditions=react-server --import tsx --test --test-concurrency=1 tests/recycling-stock.test.ts tests/recycling-catalog-persistence.test.ts tests/recycling-catalog.test.ts tests/user-additional-profiles.test.ts
node scripts/typecheck-build.mjs --partition 2
node scripts/typecheck-build.mjs --partition 11
node scripts/typecheck-build.mjs --partition 13
node scripts/typecheck-build.mjs --partition 16
```

O build integral permanece pendente pelo acesso negado ao junction Turbopack/Windows registrado no CHECKPOINT. Não repetido integralmente neste incremento; não foi alterado compilador/configuração/permissões para contorná-lo. Publicação apenas de desenvolvimento na branch autorizada, com essa ressalva. Não há PR de conclusão, merge, deploy manual, aceite dos 13 itens ou homologação da main.

Próximo: revisar as evoluções GED já existentes na main antes de integrar as lacunas CF33 (Sprints 03/04). CF30 continua nas Sprints 05/06; dependências externas de origem dos textos, IA autorizada e suporte contratual permanecem sem evidência. Estorno segue melhoria adicional sem implementação e fora dos requisitos expressos CF10 auditados.
