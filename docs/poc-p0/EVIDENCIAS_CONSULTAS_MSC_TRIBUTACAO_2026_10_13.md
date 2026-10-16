# Consultas contábeis, MSC e Tributação — evidências locais

## Escopo e resultados

Desenvolvimento local vinculado às frentes 02/03/08/10 do plano final. Nenhum requisito é encerrado por este registro. No bloco inicial o banco municipal não foi alterado: migrations e comandos de domínio foram exercitados em PostgreSQL descartável real, com isolamento entre fixtures e múltiplas conexões. A preparação operacional posterior, descrita ao final e em `PREPARACAO_JORNADAS_GLOBAIS_2026_10_14.md`, aplicou configurações aditivas autorizadas ao banco configurado.

Regressão agrupada executada:

```text
node scripts/verify-planning-postgres.mjs tests/tax-accounting-movements.test.ts tests/accounting-monthly-sources.test.ts tests/msc-accounting.test.ts
7 testes; 7 aprovados; 0 falhas.
```

Log local: `C:\Users\trici\AppData\Local\Temp\opencode\ibema-tax-finance-regression.log`. Lint direcionado dos novos serviços, páginas, actions, testes e consumidores alterados aprovado. Typecheck completo e `npm run build` do conjunto atual também aprovados, após resolver o OOM inicial e a guarda do exercício nullable. Build verificou Prisma generate, tipos das rotas, TypeScript e compilação Next; log `ibema-tax-finance-build.log`. Deploy e validação autenticada do conjunto continuam pendentes.

Após a ampliação dos cenários, os três testes MSC foram novamente aprovados, agora passando pelo produtor real `postAccountingTransaction`, sua persistência, estorno e replay (`ibema-msc-producer-regression.log`). Os dois testes fiscais foram novamente aprovados com referências disponíveis sem partida, conferência do valor/data do retorno original, recusa de referência divergente, ausência de conta presumida e segregação das UGs (`ibema-tax-reference-regression.log`). São sete cenários distintos, com reexecuções motivadas pelas alterações correspondentes.

A checagem com 8 GB terminou a análise e identificou um único erro de tipagem no exercício nullable da receita da consulta fiscal. Correção aplicada: receita canônica sem exercício/ente/UG conciliados não usa o cadastro/memória fiscal como substituto. Os dois cenários fiscais foram reexecutados e aprovados com esse caso e com a conciliação posterior do exercício. Lint aprovado; nova checagem completa iniciada em `ibema-finance-tax-typecheck-8192-corrected.log`, sem resultado confirmado neste registro.

Atualização: a nova checagem completa passou com saída 0, sem diagnósticos (3.816 arquivos; 176,36 s; memória reportada 5.294.275 K). Foi iniciado `npm run build` para verificar a compilação Next do conjunto atual (`ibema-tax-finance-build.log`), ainda sem resultado confirmado. A tipagem aprovada não encerra os requisitos nem substitui a compilação/aceite.

Resultado final do build local: saída 0, com Prisma generate (71 s), Next typegen (1 s), TypeScript (26 s) e Next build (178 s) aprovados. A listagem de rotas contém o endpoint MSC e as quatro consultas/configurações novas. Os requisitos continuam abertos pelas lacunas individuais descritas abaixo, independentemente desse sucesso técnico.

## Evidências individuais e lacunas

| Requisito | Implementação e evidência técnica | Lacuna que mantém o requisito aberto |
| --- | --- | --- |
| EXE-02.106 | Consulta unificada em `/financeiro/contabilidade/lancamentos`; MSC congelada por linha é exibida com conta e IC. `msc-accounting.test.ts`, cenário EXECUTIVE, verifica sucessão, vigência e cópia da memória original no estorno. | Jornada autenticada e conta corrente estadual completa quando aplicável; reconhecimento/classificação documental dos produtores ainda não conciliados. |
| LEG-02.106 | A mesma consulta mantém exercício/UG da Câmara. Cenário LEGISLATIVE verifica PO 20231, rejeição de PO do Executivo e estorno sem usar o de-para posterior. | Mesmas verificações da jornada/conta corrente estadual; fechamento contábil individual da Câmara. |
| EXE-02.107 | `/financeiro/contabilidade/saldos-fontes` usa ledger Decimal, fonte congelada e saldo devedor menos credor acumulado mês a mês. Teste EXECUTIVE verifica limites UTC, precisão 0,10 + 0,20, estorno, fontes distintas, alteração do cadastro atual, ACL e linhas legadas sem memória. | Conciliação dos saldos históricos e comprovação de operação autenticada municipal. Saldo de abertura depende de partidas de abertura documentadas. |
| LEG-02.107 | Mesma verificação independente no cenário LEGISLATIVE; UG restrita não integra o saldo consultado. | Conciliação documental dos saldos da Câmara e operação autenticada. |
| EXE-02.108 / LEG-02.108 | Consulta unificada permite selecionar linhas contábeis, selecionar as linhas da página e limpar a seleção; mostra quantidade, débitos, créditos e diferença. Soma em centavos inteiros (BigInt), sem conversão financeira para Float. Linhas sem Decimal/tipo conciliado são indisponíveis para soma. | Conferência autenticada nos dois entes; seleção limitada à página consultada, reiniciada ao mudar filtros/página. Lint aprovado; o build anterior deste documento antecede essa interação. |
| EXE-02.159 / LEG-02.159 | Upload CSV/OFX/OFC pela conciliação. OFC 1.0.6 lê ACCTSTMT/ACCTFROM, tipos numéricos, CPAGE 1252/65001, valores com ponto/vírgula e CHKNUM; conserva bytes/hash e usa a mesma persistência/ACL/locks de OFX. Impressão relê o original, incluindo transações repetidas. | Conferência autenticada com arquivos do banco escolhido; OFC sem FITID é recusado para impedir deduplicação por identidade fabricada. OFC sem CURDEF registra explicitamente a política da conta municipal BRL, sem alegar declaração de moeda no arquivo. |
| EXE-02.2 | Configuração e exportação MSC 2026 em `/financeiro/contabilidade/msc`; teste agrega Prefeitura/Câmara com PO distintos, abertura/movimento/saldo Decimal, competência fechada, ZIP/CSV, hash e auditoria. | SIM-AM/SIOPE/SIOPS/REINF e outros intercâmbios continuam próprios; MSC ainda requer configurações municipais, produtores completos, homologação/transmissão oficial e validação de encerramento/abertura integral. |
| LEG-02.2 | Ledger da Câmara entra no perímetro publicado pelo Executivo, com exercício e competência próprios; restrição de acesso a uma UG impede gerar arquivo agregado incompleto. | Intercâmbios próprios da Câmara, configurações/homologação e demais cenários oficiais. |
| EXE-16.45 | `/tributacao/movimentacoes-contabeis` consulta os módulos TRIBUTACAO e TRIBUTARIO com filtros de data, tributo, evento, conta/código congelado e valor Decimal por linha; permite imprimir a página consultada. Mostra referências de arrecadação disponíveis sem partida quando vinculadas ao retorno/guia e escopo fiscal conciliado. Teste EXECUTIVE verifica guia → pagamento → receita canônica, excedente/restituição/estorno, compensação no tributo de destino, recorte de linhas e referências pendentes/documentação divergente. | Ainda é necessário reunir os demais tipos de fatos disponíveis sem partida e verificar todas as variantes fiscais, impressão integral e jornada autenticada. Referências sem cadeia de origem/escopo conciliados não são atribuídas silenciosamente a um ente. |
| EXE-17.25 | Consulta inclui origens explícitas ACTIVE_DEBT_RECLASSIFICATION/RETURN/RESTORATION, ajustes e estornos; mantém valor e conta por linha. | Testes de todas as variantes de dívida ativa e sua integração diária, cobertura dos fatos ainda não contabilizados e jornada autenticada. |

Os cenários tributários também foram exercitados na fixture LEGISLATIVE para verificar isolamento do mecanismo compartilhado; isso não cria requisito tributário adicional para a Câmara.

## Referência e edições MSC

- Captura derivada de `MSC_STN_2026_20260708.xlsx`: 6.119 contas analíticas reconciliadas com o leiaute; dicionários PO/FP/DC/FR/CO/NR/ND/função/subfunção. SHA-256 do original: `a260f4fafb40d8d19c91113237c8249a619eed815d5fcc0fb6bd2c6cf0482c37`.
- SHA-256 da derivação JSON normalizada LF: `8919bc6ffe4448aa0775da66f0e3af98c965f5d9792a9b47e4a77dfa467286cd`. Upload divergente é recusado.
- `PlanningCatalogVersion/Entry` registram referência preservada e edições municipais distintas. A referência é publicada como catálogo imutável com `operational: false`; não constitui adoção municipal.
- Migration `20261014220000_msc_versioned_references` amplia os tipos do registro classificatório sem reescrever edições anteriores. As linhas são inseridas em DRAFT e publicadas na mesma transação, respeitando os triggers de imutabilidade.
- De-para é aditivo por ente/UG/vigência, com decisões, predecessora e lock de concorrência. Cadastro canônico, referência, PO e FP são conferidos antes da publicação.
- Catálogos MSC não são oferecidos como classificação orçamentária nas peças PPA/LDO/LOA nem pela adoção genérica de Planejamento.
- As novas partidas congelam IC por linha. FS só é composto com função/subfunção documental reconhecida; AI exige ano documental da inscrição em restos a pagar. Esses campos não são inferidos pela data da transação.
- Estornos copiam a composição MSC e a classificação de fonte da contraparte original; versões posteriores não reclassificam a memória histórica. Memórias divergentes na mesma conta exigem identificação individual da linha original.
- Exportação exige perímetro explícito publicado pelo Executivo, órgãos/poderes cadastrados e vinculados, todas as UGs autorizadas, exercícios próprios e competências fechadas. Preserva os saldos recíprocos e PO de cada poder.
- CSV contém seis pares IC/TIPO e os quatro tipos de saldos/movimentos. Linhas sem memória/documentação, códigos fora da referência, valores sem Decimal, competência aberta, arquivo vazio ou desequilíbrio por natureza são recusados.
- Auditoria registra hashes do CSV, evidência e referências. Download não transmite o arquivo ao Siconfi.

## Próximas verificações internas

### Continuação da cadeia patrimonial tributária

Reconhecimento de lançamento agora serializa a própria origem e, em reexecução, reconcilia a posição e as duas linhas originais antes de retornar. Não insere uma segunda `ACCOUNTING_POSITION`, não escolhe o perfil vigente para substituir o congelado e não recria VPA após revisão/reclassificação em dívida ativa. Política explícita `PRESERVE_LEGACY_NO_RETROACTIVE_RECOGNITION` é respeitada também pelo produtor interno. Contratos dos três consumidores de criação do lançamento foram conferidos e preservados.

`tests/tax-accrual-accounting.test.ts` foi ampliado para reexecuções concorrentes, revisão de valor, ACL, proteção do legado e replay após reclassificação. Os dois cenários completos foram aprovados em PostgreSQL descartável real após essas alterações (`ibema-tax-accrual-regression.log`): constituição do direito/VPA, revisão, benefício, extinção, arrecadação, compensação e seus estornos, reclassificação/retorno da dívida ativa e rollback. Esta validação não conclui o conjunto de EXE-16.44/EXE-17.25: produtores/classificações e demais variantes ainda exigem revisão individual.

Composição MSC usa lock compartilhado na chave de publicação do de-para, impedindo troca de edição da mesma fonte entre linhas de uma partida em execução. Teste com duas publicações concorrentes aprovou somente uma edição sobreposta; os três cenários MSC passaram novamente em PostgreSQL real (`ibema-msc-concurrency-regression.log`).

Concluir os produtores sem dimensões suficientes, a conta corrente estadual documentada e os movimentos tributários disponíveis sem partida; integrar inscrição/liquidação/pagamento/reinscrição/cancelamento de RP à memória contábil com AI documental; concluir os demais intercâmbios/relatórios e a revisão individual dos checklists. Os nove cenários distintos deste bloco não substituem a suíte integral de migrações, TypeScript, build nem o aceite municipal.

## Repriorização para a apresentação em 12 horas

O usuário definiu prazo máximo de 12 horas e apresentação do Celeriflow inteiro. A continuação prioriza lacunas diretamente exigidas nos checklists e preparação das jornadas existentes. O prazo não constitui aprovação nem garantia técnica de cobertura integral.

- Nova leitura municipal em 13/10/2026, 22:55 UTC: zero contas bancárias, zero mapeamentos financeiros tributários, zero perfis ACCOUNTING_PROFILE ativos e zero planos de Controle Interno. Catálogos TCE/CNAE/CBO consultados permanecem DRAFT. Leitura não alterou o banco.
- Inventário complementar somente de leitura: os 30 registros de módulos consultados estão ativos; existem Prefeitura/Câmara de Ibema e Prefeitura/Câmara de Aurora das Veredas com IDs preservados. As 42 UGs conciliadas consultadas pertencem aos dois entes de Aurora. Os exercícios por ente de 2024–2027 estão em Preparação; os quatro exercícios antigos sem ente não foram reatribuídos. Custos possui zero políticas, zero objetos e zero origens. Banco do Brasil e Caixa já existem no cadastro único, mas não há contas vinculadas. Esses números apontam preparação operacional pendente, não comprovam atendimento dos módulos ativos.
- Ferramenta de soma: `lancamentos/EntrySelection.tsx`, integrada à página de consulta; lint aprovado.
- Importação OFC: `ofc-parser.ts`, `ofx-import.ts`, actions/tela de conciliação e `statement-print.ts`. Contratos e consumidores de OFX e impressão conferidos; retornos das actions preservados.
- Seis cenários OFC/OFX/CSV aprovados em PostgreSQL descartável real: parsing/centavos/encoding/datas, bytes/hash, replay concorrente, sobreposição OFC–OFX, ACL/conta divergente, conflito e rollback; regressões OFX e CSV preservadas. Log `ibema-poc-ofc-regression.log`.
- A primeira tentativa dos testes parou na preparação da fixture porque suas regras de referência exigem `CELERIFLOW_ACCOUNTING_MODE=POC`. Reexecução configurou esse modo apenas no processo de testes isolados e passou; nenhuma guarda de produção foi alterada.
- Lint dos oito arquivos afetados aprovado. Build final do conjunto com soma e OFC aprovado, saída 0: `npm run build`, log `ibema-poc-12h-final-build.log`. A primeira execução final foi interrompida pelo timeout de 120 segundos do comando; reexecução com limite de 900 segundos terminou normalmente, incluindo geração Prisma, checagem TypeScript e compilação Next (etapa Next: 328 segundos). Não houve commit/push nem aceite autenticado por esse resultado.

## Preparação operacional posterior — 13/14 de outubro

- `prepare-aurora-finance-control.ts --apply`: dois exercícios 2026 abertos, duas contas Banco do Brasil segregadas por ente/UG com saldo zero, três naturezas de principal adotadas da referência TCE-PR, fonte livre inicial, três mapeamentos fiscais, duas políticas/objetos de Custos, 14 itens e dois planos de Controle com checklist. Hash `5f09af7d66079f95bd7a71dd8e2b8bdde6892dec86cf5df1c064d9076ec8c440`; replay aprovado. Fingerprints dos fatos contábeis/tributários/financeiros preservados pela transação.
- `adopt-aurora-tax-accrual-profiles.ts --apply`: três perfis ativos, com replay aprovado. Corrigido código ITBI com segmento adicional incompatível com a edição já publicada; a tentativa anterior foi revertida integralmente.
- Login escolhido expressamente pelo responsável: `admin@email.com`. `prepare-aurora-accounting-actor.ts --apply` vinculou o servidor exemplificativo `aurora-accounting-responsible-admin`, sem alterar autenticação/perfil. Replay aprovado.
- Recebimento de direito tributário reconhecido usa conta bancária e direito original do perfil congelado em `recordConfirmedRevenue`; não depende de regra genérica de receita/VPA. Receita sem reconhecimento continua exigindo regra ativa. Mesma assinatura pública e demais origens preservadas.
- Quatro testes aprovados em PostgreSQL descartável: `tax-accrual-accounting.test.ts` e `tax-accounting-movements.test.ts`; log `ibema-collection-profile-regression.log`. Incluem os dois entes, pagamento sem regra genérica quando reconhecido e rollback do legado sem regra. Conferência nativa no banco configurado passou para IPTU, ITBI e ISS, com constituição/guia/arrecadação e uma única baixa no direito; rollback deliberado preservou os movimentos municipais.
- Custos passa a selecionar inicialmente o exercício corrente aberto; parâmetro explícito inacessível é recusado, sem fallback silencioso.
- `npm run build` final aprovado com saída 0, Prisma generate, Next typegen, TypeScript e compilação/geração Next. Uma execução anterior teve timeout do harness embora o log terminasse em `[build] Finished next in 289s`; a repetição sem redirecionamento confirmou o término do comando. Scripts operacionais são excluídos de `tsconfig.build.json`: foram conferidos por lint e execução própria, não pela tipagem do build.
- Migration aditiva `20261014220000_msc_versioned_references` aplicada com `npx prisma migrate deploy`. `npx prisma migrate status` confirmou os 105 diretórios de migrations e schema atualizado. A alteração amplia os tipos classificatórios permitidos, sem reescrever edições/saldos.
- Catálogos compartilhados, serviços públicos e estrutura socioassistencial posteriores estão em `PREPARACAO_JORNADAS_GLOBAIS_2026_10_14.md`. Commit/push, deploy remoto e aceite autenticado continuam pendentes.
