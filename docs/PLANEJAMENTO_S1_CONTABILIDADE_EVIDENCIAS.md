# Planejamento — S1: contabilização transacional

Data: **11/10/2026**. Escopo: etapa S1 do [plano de retomada](PLANEJAMENTO_ORCAMENTO_DIAGNOSTICO_ATUAL_E_PLANO_EXECUCAO.md), com cenário de abertura/alterações nas jornadas EXECUTIVE e LEGISLATIVE.

**Estado: implementação e validação técnica concluídas nos cenários descritos abaixo.** A configuração contábil oficial, implantação operacional e ensaio autenticado permanecem nas etapas de integração/homologação. Não promove automaticamente os aceites EXE-01/LEG-01, especialmente itens 64, 73, 77, 83 e 88, que têm outros subcritérios.

## 1. Implementação e correções

- `versions.ts` preserva no comando de implantação as linhas originais de abertura: ID, tipo, ano, UG, dotação e valor original. A entrega posterior não consulta o conjunto corrente de linhas para determinar a base de abertura.
- `accounting-bridge.ts` recupera comandos antigos sem esse campo pela **versão da implantação identificada no payload**, conferindo o hash do snapshot. Ausência/inconsistência exige reconciliação; não se usa o orçamento atual como substituto silencioso.
- Abertura lança somente linhas novas e verifica dotações reconciliadas sem criar segunda abertura. A verificação exige uma única origem postada, débito/crédito iguais ao original, valores Decimal válidos, data inicial do exercício e ausência de reversão da origem.
- Corrigida a sincronização de `LEGACY_BUDGET_BINDING_VERIFICATION`: o formato histórico não possui `governmentEntityId`; a entidade é resolvida pela peça autorizada, exclusivamente para esse tipo. A verificação exige correspondência de linha/dotação/original e abertura da LOA entregue; conclui o comando sem nova partida.
- Configuração valida os seis eventos, regra única ativa por evento, política de regras referenciais, contas existentes/distintas e servidor responsável. Desativação é recusada após histórico entregue, além da proteção já existente para execução conectada.
- Uma chave contábil já ocupada não pode confirmar origem/valor diferentes. A entrega confere exercício, data, evento, origem, valor de ambas as partidas, estado e reversão antes de aceitar postagem existente.
- Nova migration aditiva `20261011200000_planning_accounting_command_integrity`: impede alterar/remover origem, payload, chave ou data dos comandos; permite mudança de estado somente PENDING→DELIVERED. Foi executada **somente nas bases isoladas dos testes**.
- Assinaturas e retornos públicos das actions cliente foram preservados. O motor contábil financeiro foi reutilizado sem substituir por mock e sem criar tabela contábil paralela.

## 2. Cenários comprovados

Arquivo: `tests/planning-accounting.test.ts`; preparação: `tests/helpers/planning-accounting-fixture.ts`.

| Cenário | Verificação |
|---|---|
| Abertura nas duas jornadas | Uma partida balanceada por linha original; implantação repetida não duplica dotações/partidas |
| Seis eventos | Abertura receita/despesa e acréscimo/redução receita/despesa com motor real, autor servidor e comando entregue |
| Replay/conflito | Repetição retorna o fato original; valor divergente e chave contábil ocupada por outra origem são recusados sem efeito adicional |
| Autorização | Falta de permissão de postagem/servidor, jurisdição incompatível e configuração por escopo parcial são recusadas |
| Falha na implantação | Receita com regra inativa falha após tentativas de partidas de despesa; transação desfaz dotações, implantação, comandos, lançamentos, versões e auditoria |
| Sincronização tardia | Abertura original não inclui natureza criada posteriormente; alteração de previsão entra como evento próprio; repetir sincronização não duplica |
| Falha na sincronização | Falha em comando posterior desfaz também partidas de abertura e estados DELIVERED anteriores dentro da mesma sincronização |
| Crédito multifonte | Anulações/acréscimos em duas fontes; falha posterior reverte movimentos, cotas, saldos, versões e reservas; sucesso libera reservas e conserva o efeito líquido |
| Competência fechada | Alteração recusada pelo motor financeiro; estado orçamentário permanece igual |
| Regra ambígua/conta ausente | Duas regras ativas ou referência de conta ausente recusam postagem e revertem efeitos; fixture de conta ausente simula configuração legada inconsistente |
| Comando antigo | Formato sem base de linhas é recuperado da versão preservada; payload permanece protegido pela nova migration |
| Abertura legada | Débito/crédito divergentes bloqueiam entrega; abertura compatível é aproveitada uma única vez e o comando de verificação deixa de ficar pendente |
| Matriz referencial | Regras referenciais são recusadas fora do modo POC; contas de fixture são exclusivas da base isolada e não constituem PCASP oficial |
| Exercício futuro | LOA 2027 sancionada/implantada em 2026 contabiliza no exercício 2027, com data contábil ajustada ao início do exercício; status continua Preparação |
| Integridade SQL | Recusa alteração do payload e retorno DELIVERED→PENDING |

As fixtures usam PGlite/PrismaPg, índices de unicidade contábil, FKs de partidas/autores/contas e migrations reais de Planejamento. Não reproduzem todo o schema operacional. Os replays aprovados são sequenciais; concorrência entre sessões e consumidores permanece no ensaio de S2/S9, sem certificação por esse resultado.

## 3. Verificação concluída

- **48 testes aprovados, zero falhas** na suíte abaixo, incluindo cinco cenários agregados específicos S1 e regressões de Planejamento, GED, Compras e Financeiro.
- ESLint direcionado, TypeScript (`tsconfig.build.json`) e Prisma validate aprovados.
- Build completo aprovado, **57 páginas estáticas**, com geração Prisma e TypeScript. Executado com `VERCEL_ENV=development`, sem deploy automático de migrations.
- `git diff --check` e conferência de whitespace dos arquivos novos aprovados; somente avisos de conversão LF→CRLF.
- Adaptador `pg` emitiu aviso de depreciação de consultas simultâneas; não houve falha na suíte final.

```powershell
node --conditions=react-server --import tsx --test --test-concurrency=1 --test-reporter=spec tests/planning-accounting.test.ts tests/fleet-indicators.test.ts tests/planning-domain.test.ts tests/planning-operations.test.ts tests/planning-postgres.test.ts tests/public-finance.test.ts tests/procurement-finance-bridge.test.ts tests/document-flow.test.ts tests/construction-documents-service.test.ts
```

## 4. Retomada

Próxima etapa: **S2 — consumidores reais Financeiro/Compras, reserva futura, realizado de arrecadação, estornos e concorrência**. Conferir configuração oficial dos seis eventos e banco de destino antes do uso operacional. O status de migrations no banco configurado não foi consultado/aplicado nesta execução; a nova `200000` soma-se às migrations a conferir na implantação.
