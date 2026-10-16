# Execução da sequência final — 13/10/2026

## Estado verificável

Plano registrado em `docs/PLANO_FINAL_IMPLANTACAO_MODULOS_INTEGRADOS.md`, vinculado ao plano consolidado original. Criada fila separada `CONTROLE_IMPLANTACAO_FINAL.json`, com 1.052 IDs distintos nos 15 checklists. A matriz histórica de requisitos permaneceu intacta. A fila não é evidência de atendimento e suas fases iniciais vieram do diagnóstico histórico.

Comando executado: `node scripts/prepare-final-implementation-plan.mjs --write`. Apenas leu a baseline e criou a nova fila; não acessa banco nem verifica código de domínio. Resultado: 1.052 requisitos, distribuídos em EXE-01/LEG-01 (99 cada), EXE-02/LEG-02 (189 cada), EXE-03 (36), EXE-04 (31), EXE-12 (30), EXE-13 (41), EXE-14 (26), EXE-15 (9), EXE-16 (56), EXE-17 (28), EXE-24 (59), EXE-25 (65), EXE-26 (95).

## Implementação local em revisão

### Frente 02 — dimensões e adoção

- Redistribuições agora resolvem a fonte por linha a partir de decisão versionada `redistributionDebitSource` na adoção da conta. Não escolhem fonte pelo prefixo da conta. Exigem as duas fontes distintas e validam o ente/UG da receita; decisão ausente recusa a partida municipal.
- Snapshot captura as naturezas de despesa/receita aplicáveis, programa, ação e função/subfunção quando vinculados explicitamente à linha de Planejamento. Ausência não é preenchida com códigos presumidos; layout MSC continua pendente.
- Consumo patrimonial e retenção consultam a fonte documentada da liquidação/pagamento. Cadeia de devolução/estorno de material é percorrida com recusa de ciclo e validação de ente/UG.
- Arrecadação consulta primeiro `Revenue.id`, que é a origem das partidas financeiras; não confunde esse identificador com o `sourceId` setorial da receita. Escopo informado é reconferido com a UG canônica, inclusive na arrecadação tributária.
- Estornos com `reversalOfId` seguem a fonte congelada da contraparte original de cada conta, preservando também suas memórias anteriores. Fontes distintas na mesma conta sem identificação de linha são recusadas.
- Tela de adoção troca a digitação de JSON por destinos canônicos pesquisáveis e paginados, edição predecessora e fonte do débito nas redistribuições. Grava as entradas selecionadas da página em edição preservada. Consulta de predecessoras limita ente/UG às permissões; servidor reconfere vigência e conflitos.
- UG vazia no formulário de adoção representa edição do ente, como previsto pelo serviço.
- Regression preparada em `tests/municipal-catalog-adoption-postgres.test.ts`: de-para pesquisável, predecessor, snapshot por fonte/linha, recusa de configuração ausente e rollback.

### Frentes 05/07 — consumo e devolução entre exercícios

- Consumo reconhece custo no exercício da data do movimento do mesmo ente; preserva o exercício da aquisição na memória documental.
- Redução e correção identificam exercícios de origem/reconhecimento, exigem exercício e competência correntes abertos e mantêm fonte/valor histórico. Replay conferido não reinsere fato mesmo após encerramento; novo fato exige período aberto.
- Redução serializa a origem e repete a verificação de replay após lock; teto líquido e apropriações continuam impedindo devolução excedente.
- Consulta, página e PDF/CSV mostram correções de origens anteriores no período corrente, mantendo sua identificação. Essas linhas não são somadas aos totais das origens adquiridas no exercício.
- Regression preparada em `tests/material-consumption-costs.test.ts`: origem encerrada, destino temporal ausente, competência fechada, identificação corrente, preservação Decimal e replay após encerramento.
- Incorporação local da correção de tipagem do normalizador de JSON apontada pelo commit remoto `e513831`. Isto não representa merge do commit.

### Frente 03 — redistribuição financeira

- Replay consulta autorização da receita antes de retornar, após serializar a origem. Recusa conteúdo divergente na mesma chave.
- Redistribuição não antecede arrecadação; exercício/escopo usam UG canônica da receita, com conferência da UG bancária quando presente.

## Pendências da retomada

Continuam abertas a revisão individual integral, integração dos demais produtores/leitores, composição MSC completa e as frentes 03–10 do plano. As regressões acima estão preparadas, ainda não executadas. Nenhum Prisma, migration, lint, suíte ou build foi executado nesta retomada, conforme a sequência de verificações agrupadas solicitada. Banco municipal não foi modificado por estes trabalhos.

Integração remota, deploy e commit final continuam pendentes. Nenhum requisito foi promovido a atendimento nem qualquer fase declarada concluída.

### Inspeção adicional de identidades

- A verificação da página de Qualidade passou a examinar PF/PJ, papéis contribuinte/fornecedor/credor, documento normalizado repetido, tipo divergente, documento do credor e identidade do fornecedor vinculado. Achados são individuais, sem documento pessoal no texto e sem alteração dos cadastros.
- Executado `npx tsx scripts/inspect-canonical-identities.ts` em 13/10/2026 às 19:22:11 UTC. A transação usou `SET TRANSACTION READ ONLY` e isolamento `RepeatableRead`; resultado: nenhum achado nessas cadeias presentes. Esta leitura não comprova regressões do comando de reconciliação nem aceite por ente.
- Preparada `tests/identity-integrity-postgres.test.ts` com conflitos concretos, preservação dos registros e ausência de documentos pessoais na saída. Ainda não executada.

## Retomada após solicitação de concluir desenvolvimento

- Introduzido vínculo explícito `AccountingLine.originalEntryId` para estornos em contas com múltiplas fontes. Referência conferida contra transação, conta e natureza oposta; replay compara a referência preservada. Memória sem catálogo conciliado conserva o vínculo sem certificar classificação.
- Integrados individualmente os produtores de estorno: restituição/compensação/excedente tributário, valorização patrimonial, provisões de RH, prestação/concessão/reabertura de adiantamento, restituição de despesa de diária/adiantamento e anulação integral de empenho. Contratos de retorno e erro das funções foram preservados.
- Diagnóstico de fornecedores recusa identidade ausente/dupla e contribuinte duplicado ou incompatível, em vez de escolher o primeiro cadastro encontrado.
- Regressão de de-para ampliada para vínculo explícito, replay e recusa de referência de linha trocada. Ainda não executada.
- Responsável definiu **Emissor Público Nacional** para NFS-e e autorizou perfis bancários exemplificativos enquanto bancos definitivos não forem escolhidos. Fontes oficiais, ambientes e dependências estão em `DECISOES_NFSE_NACIONAL_E_BANCOS.md`.
- Migrations, lint, regressões, build, integração remota e commit final permanecem pendentes; esta retomada não encerra desenvolvimento nem requisitos.

## Correção de build e continuação da fundação contábil

- Correção dos erros informados pela Vercel: ordenação no `groupBy` judicial, payload explícito na cadeia de estoque, eliminação de `undefined` na normalização JSON e guarda do ente antes das consultas de relações de serviços. Sem desligar TypeScript nem mudar contratos exportados.
- Lint dos cinco arquivos corrigidos aprovado; regressão `tests/tax-annual-batches.test.ts` aprovada em PostgreSQL descartável real para Executivo e Legislativo (2 testes). Build completo iniciado; resultado ainda não registrado.
- Correções presentes no remoto em `a4de0df`; status público do GitHub indicou nova implantação Vercel em andamento. Não equivale a deploy aprovado.
- Frente 02, requisitos `EXE-02.106`/`LEG-02.106`: consulta unificada local em `/financeiro/contabilidade/lancamentos`, com filtros, paginação e escopo por ente/exercício/UG, produtor/evento/origem, usuários e dimensões congeladas de cada linha. Datas inclusivas em UTC; valores legados sem Decimal identificados. Alterações locais ainda sem validação técnica e sem evidência de operação por ente.
- A consulta não atribui dimensões usando o cadastro atual. Conta corrente MSC ainda sem composição é explicitamente apresentada como não documentada; referência estadual preservada não substitui conta corrente estadual completa. Estes requisitos seguem abertos até fechar composição e evidências.
- Capturada e reconciliada a referência oficial STN MSC 2026: 6.119 contas analíticas ativas e nove tipos de informação complementar. Original, hash e ferramenta de captura em `fontes/README.md`. Não houve importação municipal nem alteração de saldos/cadastros.

## Continuação: saldos, composição MSC e consulta fiscal

- Implementadas localmente consulta mensal Decimal por conta/fonte, edições MSC por ente/UG/vigência, composição congelada por linha, perímetro publicado pelo Executivo e geração CSV/ZIP agregada com PO preservado. Migration aditiva amplia os tipos do catálogo; referência/edições são publicadas somente após inserir suas linhas.
- Corrigida a classificação de fonte no estorno para copiar a memória original, em vez de consultar a classificação vigente na data do estorno.
- Implementada consulta de partidas tributárias em `/tributacao/movimentacoes-contabeis`, com filtros de data, tributo, evento, conta e valor contábil e impressão da página. Filtro fiscal acompanha IDs canônicos, inclusive recebimento e crédito/compensação/restituição.
- Executadas regressões agrupadas em PostgreSQL descartável real: 7 testes aprovados, 0 falhas. Lint direcionado aprovado. Typecheck completo em execução; nenhum build integral ou aceite autenticado do novo conjunto foi concluído.
- Evidências e lacunas individuais em `EVIDENCIAS_CONSULTAS_MSC_TRIBUTACAO_2026_10_13.md`. Os requisitos permanecem abertos; não há encerramento integral dos checklists.
- O deploy de `a4de0df` apresentou status público de falha. O usuário assumiu a correção do deploy em outro notebook e direcionou esta execução às pendências de Tributação/Financeiro. Alterações deste bloco seguem locais, sem commit/deploy.
- Ampliada a consulta fiscal para referências disponíveis de arrecadação sem partida: valida valor/data contra o retorno original e usa guia/receita/memória fiscal para confirmar ente/UG. Sem fonte/conta/documentação não presume classificação. Dois testes fiscais reexecutados e aprovados. Os três testes MSC também foram reexecutados e aprovados com postagem real, persistência, estorno e replay pelo produtor canônico.
- Publicação MSC concorrente sobreposta admite somente uma edição, e composição de linhas compartilha a chave de lock da publicação para manter a edição de fonte até o commit da partida; três cenários reexecutados e aprovados.
- Reconhecimento tributário serializa a origem, reconcilia a posição/linhas originais em replay e preserva a política explícita de não reconhecer legados retroativamente. Dois cenários completos de accrual aprovados em PostgreSQL real, com concorrência, revisão, benefício/extinção, compensação, recebimento/estorno, reclassificação/retorno e rollback. Nove cenários distintos aprovados nesta continuação; validação integral permanece pendente.

## Resultado da checagem de tipagem local

- `npm run typecheck` terminou com saída 1. Prisma generate e Next typegen passaram; o processo TypeScript atingiu o heap de 6 GB definido em `scripts/build.mjs` e abortou com `FATAL ERROR: ... JavaScript heap out of memory`. Não houve emissão de diagnósticos de tipagem; a execução não certifica o código.
- Regenerados os tipos das rotas após as alterações posteriores. Iniciada checagem direta local com `node --max-old-space-size=8192 node_modules/typescript/bin/tsc --project tsconfig.build.json --noEmit --extendedDiagnostics`, mantendo todos os arquivos do projeto de build. Resultado ainda pendente.
- Logs locais: `ibema-finance-tax-typecheck.log` (OOM confirmado) e `ibema-finance-tax-typecheck-8192.log` (nova execução). Configuração do build/deploy não foi alterada por essa tentativa; o aumento é apenas um parâmetro do processo local.
- A primeira execução com 8 GB concluiu a análise em aproximadamente 628 s e reportou um único diagnóstico: `accounting-movements.ts(44,34)`, TS18047, exercício financeiro nullable da receita. Corrigido o acesso e eliminada a substituição do ente/UG de receita canônica incompleta pela memória do lançamento fiscal.
- Regressão ampliada com receita sem exercício e sua conciliação posterior: 2 testes aprovados em PostgreSQL descartável (Prefeitura/Câmara), lint aprovado. Nova checagem completa com 8 GB iniciada; log `ibema-finance-tax-typecheck-8192-corrected.log`, resultado pendente.
- Checagem corrigida concluída com saída 0, sem diagnósticos: 3.816 arquivos, 176,36 s, memória reportada 5.294.275 K. Esse resultado valida a tipagem do projeto de build após a correção, não a compilação Next nem a operação municipal.
- Iniciado `npm run build` do conjunto atual; log `ibema-tax-finance-build.log`. Resultado ainda pendente. Sem commit/push/deploy.
- `npm run build` concluído com saída 0: Prisma generate em 71 s, Next typegen em 1 s, TypeScript em 26 s e Next build em 178 s. Compiladas as rotas `/api/financeiro/msc`, consultas contábeis de lançamentos/saldos-fontes/MSC e `/tributacao/movimentacoes-contabeis`.
- Estado técnico deste conjunto: lint direcionado, nove cenários distintos em PostgreSQL descartável, typecheck completo e build local aprovados. Não representa deploy aprovado, homologação dos intercâmbios ou encerramento dos checklists; pendências internas e aceite individual permanecem registrados.
