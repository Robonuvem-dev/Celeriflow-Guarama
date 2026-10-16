# Planejamento — S2: Financeiro, Compras e realizados canônicos

Data: **11/10/2026**. Referência: [plano S1–S9](PLANEJAMENTO_ORCAMENTO_DIAGNOSTICO_ATUAL_E_PLANO_EXECUCAO.md).

**Estado: implementação e validação técnica concluídas nos cenários abaixo.** A próxima etapa é **S3 — classificações, graus, vínculos e códigos**. Ensaio autenticado por ente, configuração normativa, reconciliação de históricos antigos e publicação continuam nas etapas próprias; nenhum aceite EXE-01/LEG-01 foi promovido por este registro.

## 1. Implementação

### Financeiro e Compras

- Ordem de locks alinhada: instrumento → dotação → despesa/empenho → pagamento → conta bancária, conforme o caminho. Estornos e movimentos deixam de bloquear o empenho/pagamento antes do orçamento.
- Cancelamento de reserva relê o registro após adquirir o lock; não utiliza a situação anterior à espera para sobrescrever uma reserva já empenhada.
- Dotação implantada no Planejamento exige execução conectada: não pode contornar cotas pelo CMD legado. Dotações ainda não adotadas preservam seu caminho financeiro existente.
- Reserva em exercício de Preparação exige LOA implantada/conectada, exercício e data corretos, programação completa, despesa aprovada e disponibilidade. Essa preparação não libera empenhamento futuro.
- Reforço verifica disponibilidade de cotas considerando reservas. Contingenciamento considera reservas de compra/crédito e capacidade livre do período; não bloqueia novamente o saldo reservado.
- Reforços/anulações parciais geram partidas a partir das contas da postagem original do empenho. Cancelamento integral estorna o **saldo vigente**, incluindo esses movimentos, em vez de estornar só o valor inicial. Saldo zero não gera nova partida/evento financeiro fictício.
- Escopo de UG é conferido quando o ator fornece a lista autorizada. As autorizações de módulo e a obtenção desse escopo continuam sendo responsabilidade dos consumidores/actions.
- Ativação exige doze meses para receitas e despesas e recusa fatos financeiros anteriores, inclusive registros cujo saldo atual tenha voltado a zero. A rotina não inventa baseline para legado.

### Arrecadação e consultas

- Novo `revenue-execution-bridge.ts`: arrecadação direta, arrecadação de receita lançada, estorno e redistribuição de fonte alimentam eventos/cotas na mesma transação do Financeiro.
- Correspondência única por entidade/exercício/natureza/fonte/UG; ausência/ambiguidade em orçamento conectado é recusada para evitar somar uma arrecadação em várias previsões.
- Realizado de receita pode superar a previsão; não é tratado como teto de empenho. A baixa tributária reutiliza o mesmo `Revenue`, sem somar `TaxPayment` novamente.
- Estorno usa a cota/evento da origem; redistribuição conserva o realizado total e move somente a parcela entre fontes. Consultas por corte e relatório de metas incluem esses eventos.
- Chaves repetidas com valor/origem incompatíveis são recusadas; execução/estorno preservam referência à origem. Valores Decimal não reconciliados deixam de ser tratados como zero nas reservas.
- A UG da conta bancária não pode ser trocada após movimentações, preservando o recorte histórico da arrecadação; a alteração de vínculo e os recebimentos usam locks compatíveis.
- `readPlanningFinancialExecution` resolve a referência PPA/LDO à LOA anual da mesma cadeia e classificação, preferindo código correspondente quando necessário. Falta de vínculo, ambiguidade ou valores não reconciliados são retornados como **não apurados**, não execução zero. Referências duplicadas à mesma dotação não são somadas duas vezes.
- Novo `monthly-execution.ts`: contrato paginado/escopado de realizado por mês, fonte e UG, com estágio EMPENHADA/ARRECADADA, pago **bruto**, corte e IDs dos eventos. Competência é o mês da cota de origem, com estornos vinculados; não substitui a composição normativa dos índices fiscais. Tesouraria líquida continua em coluna separada na avaliação.

## 2. Testes de integração e concorrência

Arquivo: `tests/planning-execution.test.ts`; preparação: `tests/helpers/planning-execution-fixture.ts`.

| Cenário | Resultado comprovado |
|---|---|
| Compras/exercício futuro | Serviço real deriva AE de contrato/processo/itens/alocação; replay mantém a AE; aprovação e reserva 2027 funcionam em Preparação; Financeiro e ponte Compras recusam empenho nesse estado |
| Fluxo financeiro completo | Reserva → empenho → reforço → anulação parcial → liquidação GED → pagamento → estorno → cancelamento de liquidação/empenho; cotas e saldo contábil final conciliam |
| Bruto versus líquido | Retenção da fixture distingue pagamento bruto 2,25 de tesouraria líquida 1,80; avaliação e contrato mensal mantêm as duas métricas separadas |
| Arrecadação/redistribuição | Receita direta e lançada alimentam metas; replay não duplica; estorno devolve à origem; parcela redistribuída sai de uma fonte e entra na outra, conservando o total |
| Rollback | Falha contábil de receita, empenho ou confirmação de pagamento reverte efeitos financeiros, cotas, documentos, estados e auditoria pertencentes à transação |
| Tributação real | `confirmTaxPayment` gera um pagamento, uma receita e uma integração; falta de fonte mapeada no Planejamento desfaz a baixa inteira; estorno financeiro direto de receita tributária permanece recusado |
| Baseline | Orçamento desconectado não usa fallback CMD; fatos anteriores anulados, com saldo vigente zero, ainda exigem reconciliação antes da conexão |
| Disputa de reservas | Outra sessão aguarda o lock do instrumento; duas reservas de 6,00 no mesmo período não consomem juntas a cota disponível |
| Reserva versus crédito | Reserva de compra de 20,00 e reserva de anulação de 35,00 disputam dotação de 50,00: somente uma operação conclui; disponibilidade não fica negativa |
| Cancelamento versus empenho | Somente uma operação conclui; cancelamento não sobrescreve o estado Empenhada após esperar o lock |
| PPA/LOA | Avaliação encontra a execução da LOA anual pelo mapeamento; linha sem dotação anual retorna UNMAPPED/null |

**Concorrência foi executada em PostgreSQL local real, com pool de seis conexões, verificação de `pg_backend_pid()` distintos e espera efetiva por lock.** Não se usa a multiplexação do PGlite como evidência de concorrência entre sessões.

O servidor local é descartável, ligado apenas em `127.0.0.1`, com senha aleatória e schemas próprios por cenário. Os binários opcionais foram instalados no diretório temporário aprovado, fora da aplicação. A preparação aceita somente o banco local `planning_s2`; não reutiliza a conexão operacional nem `.env.local`.

## 3. Verificação

- **9 cenários agregados S2 aprovados em PostgreSQL real, zero falhas e zero skips**.
- **43 testes de regressão aprovados**, zero falhas: domínio/operações/SQL Planejamento, GED, Compras, relatórios financeiros e indicadores.
- A suíte S1 também foi executada com o backend PostgreSQL real nesta continuidade: **5 cenários aprovados**. Os resultados são de rodadas identificadas, não um percentual de aceite do checklist.
- ESLint direcionado e TypeScript aprovados.
- Build completo aprovado, **57 páginas estáticas**, incluindo geração Prisma. Executado com `VERCEL_ENV=development`.
- Nenhuma migration foi aplicada ao banco operacional por esta rodada. S2 usa o schema existente; a migration `200000` pertence à S1.
- O adaptador `pg` emite aviso de depreciação de queries simultâneas; os testes finais concluíram sem falhas.

Comando para PostgreSQL real, após disponibilizar `embedded-postgres` fora da aplicação:

```powershell
$env:CELERIFLOW_EMBEDDED_POSTGRES_MODULE='C:\Users\thiag\AppData\Local\Temp\opencode\node_modules\embedded-postgres\dist\index.js'
$env:CELERIFLOW_POSTGRES_TEST_TEMP='C:\Users\thiag\AppData\Local\Temp\opencode'
node scripts/verify-planning-postgres.mjs tests/planning-execution.test.ts tests/planning-accounting.test.ts
```

Regressões:

```powershell
node --conditions=react-server --import tsx --test --test-concurrency=1 --test-reporter=spec tests/fleet-indicators.test.ts tests/planning-domain.test.ts tests/planning-operations.test.ts tests/planning-postgres.test.ts tests/public-finance.test.ts tests/procurement-finance-bridge.test.ts tests/document-flow.test.ts tests/construction-documents-service.test.ts
```

## 4. Ajustes necessários ao build integrado

Durante a execução chegaram alterações da frente RH. Duas páginas consultavam relações ausentes no schema atual: `rh/diarias/page.tsx` usava `HrPortalRequest.employee`, e `rh/poc/page.tsx` usava `HrEmploymentContract.regime`. Foram ajustadas para consultas pelos IDs existentes e associação dos nomes dos servidores, preservando a intenção das páginas. Schema e migrations de RH não foram alterados por essa correção.

## 5. Limites e continuidade

- S2 valida os consumidores e cenários técnicos acima; ensaio completo em navegador e cenários próprios da Câmara permanecem em S9.
- Importação/reconciliação de histórico anterior, todos os remapeamentos e pesos históricos permanecem em S5. Ausência de histórico não é preenchida automaticamente.
- Memórias/layouts oficiais, RCL executada e tratamento normativo de classificações fiscais permanecem em S7. O contrato mensal é de controle da execução, não um demonstrativo fiscal homologado.
- O estorno tributário deve usar a rotina tributária específica; a confirmação foi comprovada e o estorno financeiro direto continua bloqueado. Esta rodada não criou uma nova rotina de estorno de pagamento tributário.
- Configuração operacional dos perfis, regras, migrations e dados segue em S8/S9. Próxima etapa de desenvolvimento: **S3**.
