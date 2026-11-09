# POC — reavaliação dos módulos afetados pelo merge

**Data:** 09/11/2026. **Merge auditado:** `094782aeab4348a4516b73b8eacb5847f9d21967`.

## Resultado

Reavaliados os **48 requisitos de CF26, CF29, CF31 e CF32** na árvore integrada. **Nenhuma decisão mudou de “não atende” para “atende”, nem no sentido inverso.** As novas interfaces e serviços são aproveitáveis, mas persistem impedimentos funcionais para atendimento integral.

| Módulo afetado | Antes | Após merge | Atende / total | Variação | Pendência principal |
| --- | ---: | ---: | ---: | ---: | --- |
| CF26 — Arrecadação Online Service | 0,00% | **0,00%** | **0/7** | 0,00 p.p. | Contrato FEBRABAN completo, consultas da base tributária e confirmação/cancelamento persistentes. |
| CF29 — Administradoras de Cartões | 22,22% | **22,22%** | **2/9** | 0,00 p.p. | Persistência das operações do credenciado, aceite por usuário, DAM e conta-corrente reais. |
| CF31 — Backup | 0,00% | **0,00%** | **0/11** | 0,00 p.p. | Cópia e restauração reais de banco/arquivos/logs, armazenamento e agendamento efetivos. |
| CF32 — Data Center | 14,29% | **14,29%** | **3/21** | 0,00 p.p. | Comprovação de infraestrutura/contratos e atendimento literal de desktop, wildcard e subdomínios. |

Resultado do recorte: **5/48 atendem**. Nenhum desses quatro módulos atinge os 95% exigidos. O consolidado permanece **1.151/2.661 — 43,25%**, por ausência de mudança nas decisões, sem nova auditoria dos demais módulos.

## Integração realizada

- Origem: `origin/feat/cf26-cf29-cf31-cf32-mateus`, SHA `38f51cf4c542ba1c73fe696b4afeb0b9a1000414`, seis commits exclusivos.
- Destino anterior: `main` em `6a08ccb4b3ad73e3df2e53fa4aa8c5c4df3db00c`.
- Merge sem conflitos: 33 arquivos, incluindo quatro interfaces operacionais, APIs, serviços, navegação, testes e scripts de carga.
- Ajuste complementar em `scripts/seed-cf10-cf30-cf33.ts`: registros tipados conforme `RecyclingEntry`, campos textuais obrigatórios e uso de `Decimal` no valor estimado das compras. Isso corrige compatibilidade do script, sem representar nova funcionalidade pontuada.
- As demais branches da [inspeção anterior](ANALISE_PREVIEWS_FORA_MAIN_2026-11-09.md) tinham entregas já incorporadas, equivalentes na main ou divergências técnicas antigas; o lote funcional exclusivo identificado era o acima.
- **Banco:** nenhum arquivo de schema/migração entrou no merge; scripts de carga não foram aplicados ao banco nesta etapa.
- **Tabelas visuais:** novas telas em `/tributacao/arrecadacao`, `/tributacao/decred`, `/configuracoes/backup` e `/configuracoes/datacenter`; há também o alias `/tributacao/arrecadacao-online`. Reutilizam componentes operacionais e paginação de 20 registros. Inspeção de código, sem validação visual.

## Critério e evidências

Mesma classificação binária do [relatório original](RELATORIO_POC_33_MODULOS_2026-11-09.md): o item só atende quando todas as suas condições são demonstradas. Código de demonstração, constantes, comentários e testes sobre arrays não comprovam o fluxo operacional completo. Os enunciados integrais e as páginas permanecem em `poc-auditoria-2026-11-09/requisitos-fonte.json`.

Referências na árvore do merge, usadas na matriz abaixo:

- **E01 — Persistência de leitura:** `src/lib/platform/tributacao-infra-persistence.ts:26-96`. Carrega JSON de parâmetros e hidrata arrays; não persiste mutações. Em erro, usa estado em memória.
- **E02 — API FEBRABAN:** `src/app/api/tributacao/arrecadacao-online/route.ts:37-149`. SOAP reconhece nomes e passa `{}` às consultas; confirmação/cancelamento estão apenas no switch JSON. Nenhuma gravação da mutação.
- **E03 — Serviço FEBRABAN:** `src/lib/tributacao/febraban-arrecadacao-service.ts:142-305,330-521,526-642,686-706`. Catálogo demonstrativo, consultas locais, mudanças em objetos e WSDL sem tipos/mensagens/binding completos.
- **E04 — DECRED:** `src/lib/tributacao/card-administrators-decred-service.ts:399-418,423-594,600-638,645-754` e `src/app/api/tributacao/decred/route.ts:28-120`. Aceite global, alterações em arrays, declarações e relatórios derivados desse estado; DAM com vencimento fixo `2026-11-20`.
- **E05 — Receptor de cartões:** `src/app/api/tributacao/declaracao-cartoes/webservice/route.ts:25-84`. Lote sem operações recebe uma operação fictícia de R$ 64.000,00/taxa de R$ 1.600,00; recepção não grava declaração tributária real.
- **E06 — Fluxos de cartões preservados:** `src/app/app-domain/tributacao/declaracao-cartoes/DeclaracaoCartoesClient.tsx:40-154,176-184,217-227,325-533`; `src/app/app-domain/tributacao/referencias/TaxReferenceClient.tsx:305-310,401-498`; `src/lib/tributacao/reference-catalog-service.ts:9-42`; `src/db/repositories/taxation-pages/registry.ts:18-41`. Mesmos arquivos da auditoria anterior, conferidos por diff vazio. Fundamentam a manutenção dos itens 29.2 e 29.9 e a reprovação de 29.6.
- **E07 — Backup:** `src/lib/platform/backup-service.ts:20-61,140-264,280-294,340-458,530-658`. AES-GCM efetivo, mas aplicado a manifesto JSON; catálogo/tamanhos sintéticos; restauração cifra e decifra um novo JSON. Cota soma tamanhos declarados, sem storage real.
- **E08 — API/agente de backup:** `src/app/api/sistema/backup/route.ts:13-66` e `scripts/backup-service-windows.ps1:25-43,64-74`. Endpoint chama o protótipo; script Windows chama a API sem token e dorme uma hora entre ciclos. Não extrai banco, arquivos ou WAL.
- **E09 — Data Center:** `src/lib/platform/datacenter-governance.ts:41-153,166-187,206-254`. Matriz declarativa e diagnóstico DNS/TLS pontual; não comprova contratação, instalação, cobertura integral ou continuidade do serviço.
- **E10 — Plataforma publicada preservada:** `src/proxy.ts:8-19,92-134`, `next.config.ts:78-89` e evidências `A16-E6`/`A16-E8` da auditoria original. Aplicação web publicada, DNS e hospedagem em nuvem já eram atendidos. O merge não alterou proxy nem configuração de domínios.
- **E11 — Cargas demonstrativas:** `scripts/seed-cf26-cf29-cf31.ts:491-582`. Inserções explícitas em parâmetros pelo script de carga não são gravações das operações posteriores da UI/API.

## Matriz dos 48 requisitos após merge

As decisões abaixo coincidem com as anteriores; as justificativas refletem a implementação integrada, inclusive métodos e telas que antes estavam ausentes.

### CF26 — 0/7

| Item | Resultado | Justificativa pós-merge | Evidências |
| --- | --- | --- | --- |
| 26.1 | não atende | Tela e endpoint existem; catálogo de bancos/guias demonstrativo não integra os aplicativos das instituições financeiras e a base tributária real. | E01–E03, E11 |
| 26.2 | não atende | `consultarDebitoIPTUOp` existe, mas SOAP ignora parâmetros, resposta XML não entrega os débitos completos e contrato FEBRABAN é incompleto. | E01–E03 |
| 26.3 | não atende | `consultarDebitoISSOp` consulta array; SOAP ignora parâmetros e retorna quantidade, sem contrato integral para a consulta bancária exigida. | E01–E03 |
| 26.4 | não atende | `consultarDebitoDividaAtivaOp` existe sobre catálogo local; faltam consulta real e processamento/retorno completo no layout SOAP exigido. | E01–E03 |
| 26.5 | não atende | `consultarDebitoParcelamentoOp` usa catálogo local; SOAP descarta parâmetros e não implementa o contrato integral dos débitos parcelados. | E01–E03 |
| 26.6 | não atende | `cancelamentoOp` altera objeto local, sem estorno persistente nem recepção XML da operação. | E01–E03 |
| 26.7 | não atende | `confirmacaoOp` altera objeto local, sem baixa transacional do crédito e sem recepção XML da confirmação. | E01–E03 |

### CF29 — 2/9

| Item | Resultado | Justificativa pós-merge | Evidências |
| --- | --- | --- | --- |
| 29.1 | não atende | Novo cadastro mantém equipamentos em memória e não completa inclusão/consulta/edição persistente pelo contribuinte cadastrado. | E01, E04, E11 |
| 29.2 | atende | Visualização de obrigatoriedade e legislação já existente permanece acessível. | E06 |
| 29.3 | não atende | Há botão de aceite, porém o bloqueio testa apenas existência global de termos, inclusive aceites iniciais demonstrativos; não exige aceite do usuário que opera. | E04 |
| 29.4 | não atende | Campos declaratórios existem, mas envio só insere em array e pode construir detalhes sintéticos; não há declaração operacional persistente. | E01, E04 |
| 29.5 | não atende | DAM calculado localmente, com vencimento fixo e sem crédito/guia persistidos para cobrança real. | E04 |
| 29.6 | não atende | Conta-corrente sintética/analítica preservada usa `mockTransactions`; nova tela não a substitui por movimentos persistidos. | E04, E06 |
| 29.7 | não atende | Receptor existe, mas fabrica operações quando ausentes e não persiste o lote; não comprova recepção integral das operações autorizadas reais. | E01, E04, E05 |
| 29.8 | não atende | Agrupamento por natureza é calculado sobre declarações em memória/demonstrativas, sem toda movimentação efetivamente declarada persistida. | E01, E04 |
| 29.9 | atende | Relatório imprimível anterior de equipamentos persistidos continua disponível pelo catálogo compartilhado. O relatório novo em memória não substitui essa evidência. | E06 |

### CF31 — 0/11

| Item | Resultado | Justificativa pós-merge | Evidências |
| --- | --- | --- | --- |
| 31.1 | não atende | Enumerar 33 sistemas no manifesto não realiza cópia dos bancos, documentos e objetos dos sistemas. | E07, E08 |
| 31.2 | não atende | Configuração de bucket e estado “conectado” não executam upload ou armazenamento automatizado de backup. | E07, E08 |
| 31.3 | não atende | Políticas/flags e loop do agente não acionam cópia real dos dados; integração autenticada do agente também está incompleta. | E07, E08 |
| 31.4 | não atende | Console web existe, mas executa manifesto demonstrativo. O requisito foi interpretado como execução do serviço de backup pela web, não simples existência de uma tela com esse nome. | E07, E08 |
| 31.5 | não atende | Retenção de sete registros de catálogo não corresponde a sete backups full diários armazenados. | E07 |
| 31.6 | não atende | Retenção de doze registros mensais não comprova cópias full do primeiro dia de cada mês. | E07 |
| 31.7 | não atende | Camada “diferencial” não lê nem copia logs/WAL; são descritores de snapshots. | E07, E08 |
| 31.8 | não atende | Não há arquivo de backup efetivamente armazenado nem comprovação aplicável do data center certificado. | E07, E09 |
| 31.9 | não atende | AES-256-GCM funciona para o payload, mas não há transferência de backup real ao armazenamento. | E07 |
| 31.10 | não atende | Script PowerShell não comprova serviço Windows funcional instalado no servidor do banco; chama protótipo web sem credencial. | E08 |
| 31.11 | não atende | Limite nominal de 3 TB controla tamanhos fictícios, não espaço efetivamente disponibilizado para arquivos. | E07 |

### CF32 — 3/21

| Item | Resultado | Justificativa pós-merge | Evidências |
| --- | --- | --- | --- |
| 32.1 | não atende | Hospedagem web existe, mas backup de todas as bases no serviço contratado segue sem comprovação integral. | E07, E09, E10 |
| 32.2 | não atende | Matriz informa certificados a comprovar; não fornece certificações vigentes, redundância integral ou recuperação contratada. | E09 |
| 32.3 | não atende | Valor mínimo de 99,6% é declarativo; falta garantia/medição de disponibilidade 24×7×365. | E09 |
| 32.4 | não atende | Serviço CF31 permanece incompleto. | E07–E09 |
| 32.5 | atende | Hospedagem em nuvem e conexão à internet previamente comprovadas permanecem. | E10 |
| 32.6 | não atende | Painel não implementa nem comprova redundância integral de hardware, serviços e instalações. | E09 |
| 32.7 | atende | DNS amigável já atendido; diagnóstico adicionado é evidência complementar da capacidade de consulta. | E09, E10 |
| 32.8 | não atende | Diagnóstico não configura nem comprova elasticidade dinâmica integral sem interrupções. | E09 |
| 32.9 | não atende | Não entrou política/configuração de firewall da infraestrutura contratada. | E09 |
| 32.10 | não atende | Não foram incluídas evidências de controle físico, câmeras e biometria do data center. | E09 |
| 32.11 | não atende | Sem comprovação conjunta de detecção/bloqueio, antivírus e backups em nuvem. | E07, E09 |
| 32.12 | não atende | Não há licenciamento incluso comprovado de Windows Server, SQL Server e antivírus. | E09 |
| 32.13 | não atende | Sondagem pontual DNS/TLS não monitora todos os sistemas/recursos pela entidade e pelo provedor. | E09 |
| 32.14 | não atende | Administração da infraestrutura, sistemas operacionais e bancos continua dependente de serviço não comprovado. | E09 |
| 32.15 | atende | Aplicação web acessível pela internet em nuvem permanece disponível na arquitetura existente. | E10 |
| 32.16 | não atende | Painel não fornece procedimento completo de migração para a nuvem. | E09 |
| 32.17 | não atende | Não há comparativo de custos de infraestrutura que comprove a redução. | E09 |
| 32.18 | não atende | Não foi incluída comprovação de suporte à hospedagem 24×7×365. | E09 |
| 32.19 | não atende | Login web unificado não disponibiliza sistemas desktop existentes no navegador, como exige o texto original. | E09, E10 |
| 32.20 | não atende | Código inspeciona SAN/TLS, mas não fornece nem comprova wildcard cobrindo domínio principal e subdomínios. | E09, E10 |
| 32.21 | não atende | Verificação da URL corrente não associa cada aplicação a subdomínio próprio com certificado. Proxy mantém módulos por caminho. | E09, E10 |

## Verificações técnicas

- **12 testes direcionados: PASS**, abrangendo os serviços adicionados, governança, rotas e tabela operacional. Os testes dos serviços validam o comportamento do protótipo; seus nomes de requisitos não substituem a auditoria funcional.
- **TypeScript dos dois scripts de carga e três arquivos de testes adicionados: PASS**, com `noEmit`, após os ajustes do script CF10/30/33.
- **Build completo: PASS**, código de saída 0; 18 partições TypeScript e build Next.js 16.4.3 concluídos. As novas páginas e APIs aparecem no inventário de rotas produzido.
- **Integridade do complemento: PASS**, 48 IDs únicos, cobertura dos quatro módulos, contagens coerentes com a matriz original e 16 referências de código conferidas.
- **Reconciliação global de tabelas (`--strict`): FAIL.** Os 88 arquivos citados pelos bloqueios foram comparados com `6a08ccb4` e estão integralmente preservados; nenhum pertence ao delta do merge. Os quatro novos componentes não aparecem entre esses bloqueios. A inspeção de código das telas novas não equivale à validação visual nem à aprovação global do padrão.

Comandos principais:

```powershell
npm run build
node --import tsx --test tests/febraban-and-decred.test.ts tests/backup-and-datacenter.test.ts tests/datacenter-governance.test.ts tests/operational-table.test.ts tests/operational-routes.test.ts
node scripts/verify-operational-coverage.mjs --strict
git diff --check
```
