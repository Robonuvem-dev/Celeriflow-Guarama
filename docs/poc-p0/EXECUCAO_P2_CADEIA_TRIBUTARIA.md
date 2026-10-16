# P2 — cadeia tributária e financeira: primeiro bloco integrado

## Estado

**Em andamento.** Este registro cobre as correções integradas de escopo tributário da P1 e atomicidade/temporalidade da P2. Não certifica a conclusão das fases nem dos checklists.

## Entregue neste bloco

- Motor parametrizado resolve o exercício pela entidade da UG arrecadadora e registra ente/UG/exercício no snapshot, assim como a constituição canônica.
- Actions de constituição, guia, revisão, evento de crédito, guia parcial/agrupada, cobrança, retorno e mapeamento enviam as UGs autorizadas ao serviço. Actions de pagamento/cancelamento de guia preservam seus contratos existentes.
- Leituras de guias e seletores de lançamentos das operações restringem os registros pelo escopo persistido. Registros legados sem origem registrada permanecem disponíveis ao administrador técnico, aguardando conciliação.
- Replay de pagamento, retorno, constituição parametrizada e evento de crédito valida autorização; conteúdo divergente é recusado nos campos cobertos pelo contrato.
- Regras fiscais sobrepostas deixam de ser escolhidas implicitamente pela ordem de data: sem versão explicitamente selecionada, a operação exige conciliação da vigência.
- Recebimento de guia histórica utiliza o exercício aberto da data de arrecadação, preservando o ano e o snapshot do débito. Não reabre o exercício originário.
- Retorno confirmado mantém pagamento, receita, tesouraria, partida, integração, crédito excedente e auditoria na mesma transação. Falha posterior à baixa reverte a cadeia inteira.
- Lock transacional por chave do retorno e lock da guia serializam processamento e cálculo do saldo. Crédito excedente registra ente/UG da origem.
- Guia agrupada exige mesma UG e contribuinte; os locks seguem a ordem estável dos IDs.

## Verificação conjunta

Executada somente depois de concluídas as alterações do bloco:

```powershell
node --conditions=react-server --import tsx --test --test-concurrency=1 --test-reporter=spec tests/tax-financial-chain.test.ts tests/planning-execution.test.ts src/lib/tributacao/__tests__/c8-tax-assessment.test.ts src/lib/tributacao/__tests__/fiscal-engine-s2.test.ts
```

**Resultado: 16 aprovados, zero falhas, três não executados.** Os três não executados exigem conexão externa PostgreSQL de teste. Os cenários aprovados utilizam a fixture PostgreSQL embarcada/PGlite; não constituem prova de concorrência entre sessões PostgreSQL externas.

Os novos cenários comprovam:

1. Motor parametrizado, consulta segregada, rejeição de regra sobreposta, replay divergente e autorização na repetição.
2. Arrecadação corrente de débito histórico com exercício anterior encerrado e preservação do ano de origem.
3. Falha injetada na criação do crédito excedente: zero pagamento/receita/tesouraria/integração novos, partidas preservadas e guia ainda emitida; retry posterior gera uma cadeia e replay não duplica o crédito.

A primeira rodada encontrou incompatibilidade do retorno SQL `void` do advisory lock com o Prisma. O retorno foi convertido para `text`; a reexecução conjunta passou. ESLint direcionado e `git diff --check` passaram.

Build completo único do bloco **aprovado**, com `VERCEL_ENV=development` e saída 0: geração Prisma, tipos de rotas, TypeScript e compilação Next.js concluídos, incluindo a geração das 59 páginas estáticas. Tempos registrados: Prisma 193 s, tipos de rotas 2 s, TypeScript 266 s e Next.js 133 s (aproximadamente 10 minutos no total). Nenhuma alteração de schema/migration foi necessária neste bloco.

## Pendências da P2

**Atualização:** ingresso financeiro do excedente, compensação com partida/extinção e pagamento efetivo de restituição foram implementados e ensaiados na [continuação integrada P1–P4](EXECUCAO_P1_P4_BLOCO_INTEGRADO.md). Os itens históricos abaixo descrevem o estado ao fechar o primeiro bloco; consultar a continuação para as pendências atuais.

- Eventos por estágio de constituição/revisão/dívida/benefício/extinção, matriz contábil vigente e conta/dimensões específicas.
- Reconciliação da entrada financeira do **valor excedente**: este bloco torna seu crédito tributário atômico, mas a receita/tesouraria canônica ainda recebe somente o valor aplicado ao débito. O excedente precisa de obrigação/ingresso próprio aprovado, com estorno e restituição correspondentes.
- Compensação, restituição efetiva de tesouraria, estorno tributário completo e vínculo dívida/guia em todos os produtores.
- Renúncia fiscal, eventos NFS-e/escrita/ITBI e actions/portais restantes.
- Aceite autenticado, concorrência externa e evidências individuais por requisito/ente.

## Ritmo de execução adotado

1. Agrupar mudanças relacionadas de P1/P2 e fases dependentes em blocos integrados, respeitando seus contratos e origens.
2. Agrupar mudanças ainda não aplicadas de schema antes de fechar a migration; preservar migrations já aplicadas.
3. Executar Prisma isoladamente apenas quando necessário para continuar o código/testes; aproveitar a geração já incluída no build.
4. Testes, lint, inventário e build no fechamento do bloco; repetir somente após falha ou mudança relevante posterior.
5. Não promover fase/checklist a concluído a partir de build verde; fechar todos os critérios e identificar dependências concretas.
