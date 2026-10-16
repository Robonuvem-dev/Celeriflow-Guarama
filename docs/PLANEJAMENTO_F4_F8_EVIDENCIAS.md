# Planejamento e Orçamento — implementação interna F4–F8

Data: 11/10/2026. Escopo: jornadas Prefeitura e Câmara, com domínio compartilhado e autorização explícita por jurisdição/entidade/UG.

Este registro descreve **código interno implementado e verificações técnicas**. Não substitui implantação, ensaio em navegador, validação oficial dos leiautes ou aceite individual dos 99 requisitos por ente. As conexões e comprovações externas seguem em F9; a homologação integral segue em F10.

## Navegação

Os detalhes de cada PPA/LDO/LOA possuem acesso a **Versões, Consistências, Compatibilização, Emendas, Programação, Créditos, Tramitação e Relatórios**.

- Prefeitura: `/planejamento/[kind]/[id]/gestao/[section]`.
- Câmara: `/camara/planejamento/[kind]/[id]/gestao/[section]`.
- Emissão: `/planejamento/relatorios/emitir` e `/camara/planejamento/relatorios/emitir`.
- Consulta histórica: detalhe da peça com `version` e `asOf`.
- Listas de previsões, versões, emendas, créditos, cotas e opções de reconciliação legada possuem paginação no servidor. O escopo é aplicado antes de contagens e consultas.

## F4 — histórico, versões e compatibilização

Implementados em `revisions.ts`, `operations-core.ts` e `versions.ts`:

- Movimentos financeiros assinados, ato, motivo, texto jurídico, responsável, vigência e registro; conservação do valor original e recusa de saldo negativo em qualquer corte histórico.
- Versões imutáveis com hash canônico, dados da peça, classificações, programas/objetivos/indicadores/ações, previsões, movimentos, metas, programação, memórias, renúncias e parâmetros fiscais.
- Consulta da classificação e valores de uma versão preservada, sem recorrer aos cadastros atuais para reconstruir nomes e classificações antigas.
- Críticas por peça: equilíbrio anual, vigência, classificação funcional, programa/ação/produto, grau, percentuais, cadeia e espelhos canônicos da LOA. Erros bloqueiam aprovação/sanção/implantação.
- Comparação da parcela anual por unidade/fonte/natureza/programa/ação/função/subfunção/produto. O total quadrienal não é igualado ao orçamento anual.
- Prévia com revisões esperadas; mapeamento explícito de classificações ambíguas; inclusão formal das classificações ausentes; propagação para destinos selecionados em uma única transação; replay auditado e rollback integral.
- Meta/realizado físico com eventos por data e reflexão LDO→PPA exatamente uma vez. A propagação de metas não inventa realizado no destino.
- Transferências com direção e contraparte, apresentação bruta/líquida e memória das eliminações de pares internos correspondentes por exercício/fonte.
- Inclusão formal de natureza de receita não prevista; nova despesa preparada sem saldo para posterior crédito especial.

Data do ato e exercício orçamentário são eixos distintos: um orçamento do ano seguinte pode ser sancionado/implantado no ano atual. Alterações exigem ato vigente posterior ou igual à sanção, sem efeito futuro ainda não vigente. Execução física e eventos de realizado permanecem vinculados ao exercício da meta/programação.

## F5 — emendas

Implementado em `amendments.ts`:

- Cabeçalho com número, data, objetivo, justificativa, vereador canônico, texto jurídico e revisão da peça.
- Itens de acréscimo/redução; editor de dotações/valores; elegibilidade e escopo validados no servidor.
- Bloqueio/desbloqueio com motivo, autor e data. Bloqueio de emenda não impede automaticamente outras alterações legais legítimas.
- Aprovação integral, reprovação integral e sanção parcial com seleção explícita das dotações.
- Decisão por responsável distinto do proponente, com autorização legal específica.
- Somente itens sancionados geram efeito. Proposta, itens rejeitados e decisão permanecem preservados; decisões encerradas são imutáveis no banco.

Os testes demonstram bloqueio, reprovação, aprovação e decisão parcial em PPA/LDO/LOA, além de operação legislativa própria e recusa de acesso cruzado. A conexão de tramitação, anexos/assinaturas GED e atos externos pertence a F9.

## F6 — programação e cotas

Implementado em `scheduling.ts`:

- Doze meses por previsão/UG/fonte; receita conserva natureza/modalidade e despesa conserva a dotação de origem.
- Métodos: divisão por doze, percentuais totalizando 100%, realizado anterior e realizado dos últimos três anos. Histórico incompleto é recusado, sem substituição silenciosa por distribuição uniforme.
- Períodos bimestral, trimestral e semestral; transferências internas entre meses abertos do mesmo período permitem consumo dentro do limite do período sem perder rastreabilidade.
- Valores previstos, consumo, bloqueios e fechamento, com eventos imutáveis e idempotência.
- Cronograma de desembolso e desembolso pago separados de cota/empenhamento; liberação/estorno vinculado ao evento original.
- Contingenciamento por percentual, global ou por dotação; liberação parcial/total sem exceder o evento de origem.
- Redistribuição somente do saldo não utilizado de meses fechados para meses abertos; consumo, bloqueios e trilha do mês fechado são preservados.
- Alterações legais atualizam cotas abertas transacionalmente; insuficiência de disponibilidade reverte a alteração.

O consumo registrado neste domínio ainda não é alimentado automaticamente pelo Financeiro. A ligação aos estágios reais, estornos e recibos ocorre em F9. Não se equipara empenho a pagamento.

## F7 — créditos, implantação e contratos de consumo

Implementado em `credits.ts`, `reduced-codes.ts`, `legacy-reconciliation.ts`, `year-rollover.ts` e `budget-availability.ts`:

- Lote associado ao `CreditRequest` canônico, com modalidade, origem documentada, limite da origem, itens e reserva específica de anulação desde a prévia.
- Diversas dotações/fontes no mesmo lote. Anulação conserva o saldo por fonte; outras origens exigem evidência/limite e controle do montante já alocado.
- Aprovação, sanção, registro de publicação, efetivação e cancelamento; segregação e autorização legal; preservação do ato sancionado na publicação/efetivação.
- Efetivação reutiliza os itens aprovados; movimentos, espelhos, saldos, cotas e liberação de reserva pertencem à mesma transação. Remanejamento usa efeito líquido, sem inflar o orçamento.
- Implantação de LOA publicada, consistida e em exercício disponível. Lock por entidade/exercício e índice parcial impedem duas implantações concorrentes na mesma entidade/ano.
- Dotações `BudgetAppropriation` canônicas com identificadores municipais legíveis. Implantação repetida não recria dotações.
- Código reduzido separado da classificação original; reordenação antes da execução, com lista completa e auditoria.
- Reconciliação de dotação legada sem recriar saldos: classificação, exercício, valores e vínculos devem corresponder. Divergência demanda migração explícita; o sistema não infere movimentos anteriores nem sobrescreve valores consumidos.
- A implantação recusa legado não reconciliado. O contrato de abertura distingue dotações novas de dotações já associadas, evitando pressupor uma segunda abertura contábil.
- Cópia de configurações do exercício anterior, com origem explícita se houver alternativas, referências compartilhadas, regras fiscais e distribuição mensal. Realizados, bloqueios e fechamentos não são copiados.
- Contrato de disponibilidade desconta empenhado, reservas de compra, reservas de crédito e contingenciamento; distingue preparação/reserva futura de empenho em exercício aberto com confirmação contábil.
- Financeiro recusa alteração orçamentária/tramitação dos registros já pertencentes ao Planejamento. Fluxos ainda não adotados permanecem legados; não houve retirada dos menus antes da conexão final.

`PlanningIntegrationCommand` prepara abertura e alterações para F9. **Não representa partidas contábeis lançadas, integração de Compras conectada ou confirmação do provedor.** No fluxo conectado, a contabilização deverá participar da transação de efetivação e sua falha deverá reverter os efeitos orçamentários.

## F8 — catálogo e emissão

- Catálogo com **37 entradas**, mapeadas individualmente aos itens: receitas/despesas/transferências; metas financeiras/físicas; programas e detalhamento; PPA analítico/sintético; receitas anuais/globais; confrontos; compatibilidade de valores/metas; avaliação; obras/conservação; memórias; CMD/metas/cotas; alterações; renúncias; minutas; demonstrativos fiscais e variantes dos anexos 1, 2, 6, 7, 8 e 9/alínea 1 da Lei 4.320.
- Filtros de peças/entidades, ano, versão, corte e início, UG, fonte, programa, ação, função, subfunção, prefixo da natureza, produto, grau, crédito/origem e agrupamento; consolidação autorizada.
- PDF/CSV com motor canônico. Tabelas largas são divididas em partes e textos jurídicos extensos em continuações, preservando conteúdo.
- Permissão `issueReports`; snapshots de emissão imutáveis, identidade e emissor preservados, hash de **dataset** canônico e autorização de download por todas as entidades/unidades do documento.
- Composição fiscal configurada com referência normativa, receitas/despesas incluídas/excluídas, parâmetro e memória. Não há percentuais legais inventados ou classificação baseada em nome do programa.

**Dependências registradas para F9/F10:** execução financeira real da avaliação; composição/período da RCL executada; particularidades legislativas; leiautes oficiais STN/TCE/MCASP e anexos aplicáveis; documentos/assinaturas; storage/publicação e hash do arquivo final arquivado. A RCL disponível neste bloco é **projeção orçamentária**. Os datasets mantêm `NOT_STATUTORY` e não anunciam publicação pública. Existência de entrada no catálogo não constitui homologação oficial da saída.

## Autorizações e implantação

- Rotas legislativas exigem CAMARA e PLANEJAMENTO; operações são autorizadas em PLANEJAMENTO.
- Decisões legais exigem administração técnica ou `permissions.modules.PLANEJAMENTO.legalApproval=true`, além de permissão de atualização e escopo adequado. A configuração completa dos perfis continua no controle transversal F0/F1.
- Consulta atual: **64 migrations locais; apenas duas pendentes**:
  1. `20261011170000_planning_immutable_movements`.
  2. `20261011180000_planning_legal_operations`.
- As anteriores `20261011120000`, `20261011150000` e `20261011160000` aparecem aplicadas na consulta atual. Esta execução não realizou deploy das duas novas.
- Constraint de contraparte de transferência é `NOT VALID` para preservar legado existente; novas escritas são verificadas. Transferências antigas sem contraparte precisam reconciliação antes de apresentação líquida e validação final da constraint.
- Base fictícia e script continuam exclusivos de conexão isolada; carga não executada. Espelhos da LOA do script foram corrigidos para usar os mesmos códigos das previsões.

## Verificações

- **47 testes, zero falhas**, com PostgreSQL isolado por PGlite/PrismaPg, incluindo regressões RH/Financeiro/permissões e bytes de migrations.
- Cenários: snapshots/cortes, replay concorrente, mapeamento/propagação, realizado LDO→PPA, decisões por peça, consumo concorrente, todos os métodos de distribuição, estornos/liberação, conservação de cotas, crédito líquido, reserva/rollback, implantação única, cópia entre anos sem execução, reconciliação legada, escopo legislativo, todas as famílias do catálogo e PDF sem truncamento.
- Lint direcionado, Prisma validate/generate e TypeScript aprovados.
- **Build completo aprovado**, Next 16.2.12/Prisma 7.9.1, 55 páginas estáticas. Executado com `VERCEL_ENV=development`; não fez deploy automático das novas migrations.
- Não houve ensaio autenticado em navegador nem promoção de aceites integrais EXE/LEG. F0–F3 mantêm pendências próprias; F9/F10 permanecem necessários para entrega 99/99 em cada ente.

```powershell
node --conditions=react-server --import tsx --test --test-concurrency=1 --test-reporter=spec tests/hr-foundation-bytes.test.mjs tests/planning-domain.test.ts tests/planning-operations.test.ts tests/planning-postgres.test.ts tests/hr-calculation.test.ts tests/hr-workforce-service.test.ts tests/planning-sst-modules.test.ts tests/public-finance.test.ts
```
