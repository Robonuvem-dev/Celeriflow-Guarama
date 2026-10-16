# P0 — rastreabilidade e preparação do banco atual

**Data:** 12/10/2026. **Revisão de partida:** `f94b8be7d99a5f5a4ef0f4e12b104ad755f383cc`.

**Resultado:** controle individual dos 1.052 requisitos criado e dataset de preparação carregado no **banco atual**, autorizado pelo usuário como base de dados fictícios. A preparação técnica está disponível para iniciar P1. Ensaio autenticado e atendimento funcional dos requisitos ainda não foram executados nesta fase.

O desenvolvimento iniciado após o fechamento está registrado em [execução P1 — escopo contábil](EXECUCAO_P1_ESCOPO_CONTABIL.md); esse registro não altera os aceites P0 nem promove requisitos da POC.

## 1. Decisão de ambiente

O usuário esclareceu que os dados do banco atual são fictícios e autorizou interação com eles, preservando tabelas e integrações. Esse passa a ser o ambiente de trabalho do plano. Não é necessário contratar, configurar ou administrar uma infraestrutura adicional para começar as correções.

A base local PGlite preparada anteriormente é uma evidência histórica auxiliar. O arquivo `AMBIENTE_ISOLADO.json` descreve exclusivamente aquela base; suas pendências de transporte local não se aplicam ao banco atual. **O inventário vigente é `AMBIENTE_ATUAL.json`.**

## 2. Entregas da P0

| Obrigação | Resultado / evidência |
|---|---|
| Fixar revisão, fonte e schema | `BASELINE.json`: commit, SHA-256 do PDF, extração, plano e schema, inventário das 68 migrations |
| Desdobrar os 15 blocos | `CONTROLE_REQUISITOS.json` + 15 Markdown individuais; sequência 1–N por checklist, total 1.052, sem IDs ausentes ou duplicados |
| Preservar texto e subcritérios | Texto integral extraído, páginas/linhas de origem e campos para resultado; listas alfabéticas separadas, demais orações mantidas no texto e sujeitas à conferência individual no ensaio |
| Reutilizar controles anteriores | 198 linhas de Planejamento + 31 de Custos + 36 de Controle Interno = 265 referências preservadas |
| Investigar bases antes de abrir desenvolvimento | Busca estática por requisito com candidatos em serviços, actions/UI, schema e testes; índice de produtor/consumidores quando localizado. Candidatos e diagnóstico de faixa não são prova de atendimento individual |
| Identificar gap, fase e responsável | Diagnóstico/gap herdados da faixa do plano, fases e dependências; responsável funcional por área, pessoa ainda a designar |
| Mapear fontes recebidas | `FONTES_DOCUMENTAIS.json`: 141 IDs, 136 fontes distintas, aplicação/campos/limites do catálogo e vínculos aos requisitos; referência legal, catálogo, agregado/evento a reconciliar e modelo/histórico identificados |
| Conferir banco vigente | 68/68 migrations aplicadas; conteúdo conferido inclusive normalização LF/CRLF; não foi necessário executar migrations nesta base |
| Preparar entes, anos, volume e perfis | Dataset `POC_P0_CURRENT_V1`, descrito abaixo; carga aditiva, identificada e repetível |
| Verificar preservação e repetição | Hashes dos registros anteriores conferidos dentro da transação e após a carga; segunda execução sem aumento de contagens nem novo evento de carga |

Os controles começam com **NÃO VERIFICADO / NÃO_EXECUTADO** no aceite individual. Isso não apaga os diagnósticos técnicos já encontrados: eles permanecem em campos próprios e no plano consolidado. Evita-se transformar uma conclusão por faixa em aprovação de cada item.

## 3. Estado concreto do banco

Fonte: [primeira carga e inventário](AMBIENTE_ATUAL.json). Repetição: [verificação de idempotência](AMBIENTE_ATUAL_VERIFICACAO.json).

| Conjunto | Antes | Depois | Acrescentado pela P0 |
|---|---:|---:|---:|
| Entidades | 2 | 4 | 2 entes dedicados a ensaio: Prefeitura/Câmara |
| Escopos de Planejamento | 0 | 2 | Executivo e Legislativo |
| UGs e vínculos de entidade | 0 | 42 | 21 por ente de ensaio |
| Centros | 0 | 42 | 21 por ente de ensaio |
| Exercícios financeiros | 0 | 4 | 2024, 2025, 2026 e 2027, em preparação |
| Fontes | 0 | 21 | Catálogo sintético identificado |
| Naturezas de receita | 0 | 21 | Catálogo sintético identificado |
| Naturezas de despesa | 0 | 21 | Catálogo sintético identificado |
| Contas | 0 | 21 | Catálogo sintético, sem pretensão de PCASP homologado |
| Perfis | 4 | 18 | 14 perfis de ensaio |
| Usuários locais | 2 | 16 | 14 usuários de ensaio, sem alterar os dois anteriores |
| Vínculos usuário/UG | 0 | 14 | UG do respectivo ente |
| Pessoas | 6 | 6 | Preservadas |
| Contribuintes | 3 | 24 | 21 cadastros-base de ensaio |
| Imóveis | 1 | 22 | 21 terrenos de ensaio |
| Inscrições econômicas | 0 | 21 | 21 cadastros-base de ensaio |
| PPA | 0 | 2 | Um por ente de ensaio, 2024–2027 |
| LDO | 0 | 8 | Quatro exercícios por ente de ensaio |
| LOA | 0 | 8 | Quatro exercícios por ente de ensaio |
| Instrumentos canônicos de Planejamento | 0 | 18 | Cadeias PPA → LDO → LOA |
| Evento de preparação | 0 | 1 | Registro `POC_P0_DATASET_PREPARED` |

Todos os registros acrescentados usam identificadores `p0-current-...`, nomes/códigos `POC P0` e relações explícitas. Os entes originais não receberam escopo presumido nem foram substituídos.

As peças estão em **DRAFT**, sem aprovação, implantação ou publicação. Fontes/naturezas/contas sintéticas servem ao volume e à preparação: classificação oficial, fórmulas vigentes, saldos e matriz de eventos serão tratados em P1. Cadastros tributários são bases mínimas; identidade completa, relações, lançamentos e jornadas são completados nas fases pertinentes.

Não houve geração de lançamentos fiscais, receitas, partidas, pagamentos, guias ou remessas externas nesta preparação. A carga não equivale a testar as integrações desses movimentos.

## 4. Preservação comprovada

- A carga inteira foi aplicada em transação, com lock de identificação do dataset.
- Registros existentes recebem `update: {}`; a carga não redefine seus campos, perfis, credenciais ou estados.
- Foram comparados contagem e hash do conteúdo completo dos registros anteriores nas 22 tabelas envolvidas, usando chave determinística; resultado **`existingRowsPreserved: true`**.
- A verificação acontece dentro da transação para reverter a carga se houver divergência, e novamente após o commit.
- A segunda execução manteve as mesmas contagens e um único evento de preparação, comprovando repetição sem duplicação.
- Não houve alteração de schema, exclusão de tabela, reset ou reescrita de migration.
- A aplicação e seus contratos de integração não foram modificados nesta fase. A verificação de dados existentes não substitui a regressão funcional das futuras mudanças de P1–P11.

## 5. Autenticação e ensaio

O banco atual possui **dois usuários ativos já vinculados ao Firebase, em dois perfis**. Seus vínculos e credenciais foram preservados. O transporte Neon já funciona: consultas e carga ocorreram pelo cliente Prisma da própria aplicação.

Os 14 novos usuários locais correspondem a proponente, aprovador, sancionador, consulta, financeiro, controlador e notificado em cada ente de ensaio. São fixtures de escopo/permissão no banco, **não contas Firebase com login validado**. A verificação da política e da segregação desses papéis pertence ao ensaio; os perfis não são declarados homologados pela simples inserção.

Não havia navegador conectado a esta sessão. Portanto não foi realizada navegação autenticada, demonstração visual ou aceite por perfil. Isso fica registrado como condição de execução do ensaio, **não como impedimento para começar as correções do sistema**.

## 6. Comandos e verificações executadas

```powershell
npx prisma migrate status
node --conditions=react-server --import tsx scripts/verify-planning-readiness.ts
node --conditions=react-server --import tsx scripts/prepare-poc-p0-current.ts
node --conditions=react-server --import tsx scripts/prepare-poc-p0-current.ts --apply
node scripts/verify-poc-p0-control.mjs
npx eslint scripts/prepare-poc-p0-current.ts scripts/prepare-poc-p0-control.mjs scripts/prepare-poc-p0-database.mjs scripts/verify-poc-p0-control.mjs
```

Resultados: migrations atualizadas; leitura do cliente da aplicação funcionando; carga/preservação/repetição aprovadas; cobertura dos controles, hashes/referências e lint aprovados. Não houve commit/push nem execução de build nesta entrega de documentos e ferramentas de preparação.

Para reconstruir somente a fotografia inicial dos controles, existe `prepare-poc-p0-control.mjs`, que recebe o texto extraído do PDF com marcadores `### PAGINA N`. **Depois que forem preenchidos resultados de ensaio, preservar a revisão dos controles antes de regenerar**, pois o gerador cria uma fotografia inicial e não faz merge de resultados manuais.

## 7. Entrada de P1

Usar o banco atual e o controle P0 para:

1. Fechar escopo financeiro/contábil por ente/UG e conferir todos os consumidores.
2. Consolidar identidade dos cadastros e relações canônicas.
3. Homologar classificações, fontes, contas analíticas e matriz contábil.
4. Resolver parâmetros municipais e reconciliação dos valores.
5. Preparar os fatos corretos para fechar as integrações tributárias em P2.

**Conclusão:** rastreabilidade e preparação de dados da P0 executadas no ambiente atual. A P0 não declara atendimento dos 1.052 requisitos; ela fornece o controle e a base de trabalho para as correções e os aceites seguintes.
