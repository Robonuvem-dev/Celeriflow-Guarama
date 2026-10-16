# RH/Folha — registro de execução

## Revisão e integração entre notebooks — 12/10/2026

Integrados por `git pull --ff-only origin main` os commits `0d8d69f` (Plan 4) e `ef2acec` (plan5), com as entregas de Planejamento/Orçamento e correções RH de Diárias/POC. Alterações locais preservadas no stash `backup RH folha antes pull 20261012` e reaplicadas; conflito único em `/rh/poc` resolvido mantendo a consulta por `regimeId` e a seleção de fontes fechadas do 13º.

O build anterior falhou na consulta `HrPortalRequest.include.employee`, relação inexistente no schema. Correção recebida do outro notebook: consulta dos servidores por `employeeId`, sem relação Prisma inventada. Nenhuma migration RH nova nesta rodada; as migrations de Planejamento chegaram com o pull.

Conferência somente leitura com `npx prisma migrate status`: a migration `20261011220000_planning_publication` ainda está pendente no banco configurado. As duas migrations de Planejamento anteriores recebidas no pull já constam aplicadas. A pendência é do módulo de publicação de Planejamento; não foi aplicada por esta revisão de código.

Pós-integração: nove testes do lote POC/transacional aprovados, incluindo o caso de vínculos inativos no rateio e proteção dos atos funcionais integrados; ESLint dos arquivos RH alterados e `git diff --check HEAD` aprovados. Os outros 31 testes RH/documentais/de direitos/SST passaram antes da integração. Build completo pós-integração em execução. Alterações desta continuação permanecem locais, sem commit/push.

Pendências atuais consolidadas em [RH_FOLHA_PENDENCIAS_20261012.md](RH_FOLHA_PENDENCIAS_20261012.md); a tabela abaixo foi atualizada para não listar como ausentes os modelos entregues nesta continuidade.

## Continuação funcional — rateio, pensões e folhas vinculadas — 11/10/2026

- Rateio mensal civil opcional em `/rh/poc`: salário/jornada/lotação por revisão, admissão/término/retorno parciais, reconciliação de centavos e bases fiscais/previdenciárias consolidadas. Divisor por dias civis e movimentos integrais rateados são políticas estimadas. Mudança de regime e ATS intramês permanecem pendentes.
- `/rh/pensoes`: configuração demonstrativa com beneficiário central, processo, valor fixo/percentual, bases bruto/após previdência/após IRRF, vigência e dedução fiscal explícita. Recibos e relatório PDF/XLSX/CSV; não gera repasse automático.
- 13º ligado à primeira parcela e diferença ligada ao final: valores anteriores por contrato, retenções e patronal acumulados menos anteriores; utilização única da fonte no fechamento. Seleção/escopo/ano/conjunto são conferidos; diferenças negativas e sucessivas exigem fluxos próprios.
- Férias ligadas a reservas: dias obtidos dos aquisitivos/gozos, validação de programação/titular/cancelamentos, conciliação única no fechamento sem segundo débito do ledger; cancelamento posterior requer compensação financeira.
- Rescisão fechada pode gerar desligamento demonstrativo ao fim da competência, ato e revisão de inativação. Reintegração vinculada cria nova vigência ativa e respeita quadro de cargos. Retroativos, TRCT oficial e direitos do intervalo não são apurados automaticamente.
- Resumo contábil e planejamento de despesas conservam centros/lotação dos trechos; descontos automáticos e encargos são rateados por remuneração/dias. A aplicação no Financeiro nativo conserva as regras de acesso/escopo já existentes.
- Corrigida a consulta de regimes na página POC para usar `regimeId`, conforme o schema real sem relação Prisma direta no contrato.

Fontes, fórmulas e estimativas adicionais: seção 14 de [RH_FOLHA_PARAMETROS_ESTIMADOS_POC.md](RH_FOLHA_PARAMETROS_ESTIMADOS_POC.md).

Banco configurado: script `seed-hr-poc-linked-workflows.ts --apply --publish` preparou Mensal 11/2026 (bruto 12.021,00/líquido 9.871,90), 13º 12/2026 vinculado (13.021,00/6.135,98), diferença vinculada (900,00/649,15) e férias com reservas (5.787,11/5.325,71): quatro fechamentos e 12 demonstrativos publicados. Mantido o histórico de outubro. Efeitos de desligamento/reintegração exercitados somente no banco isolado de testes.

Verificação: teste transacional RH ampliado aprovado (pensões, vigências, resumos, vínculos de 13º/férias, repetição, prevenção de duplicidade e ciclo funcional), além de 39 testes RH/documentais/de direitos/SST aprovados; build reiniciado após o anterior ser cancelado pelo reinício do servidor. Resultado final de build/lint a registrar ao concluir.

## Incremento documental e parâmetros estimados para a POC — 11/10/2026

Autorizada a mescla de referências históricas/externas e estimativas para demonstrar funcionalidades com dados fictícios. Registro completo de fórmulas, fontes, decisões estimadas e substituições necessárias em [RH_FOLHA_PARAMETROS_ESTIMADOS_POC.md](RH_FOLHA_PARAMETROS_ESTIMADOS_POC.md).

- `/rh/poc` e `poc-bootstrap.ts`: pacote `RH_POC_DOCUMENTAL_2026_V1`, três identidades fictícias canônicas, contratos/revisões, salários/jornadas de modelo, nove folhas por competência, parâmetros RGPS/IRRF, ATS/licença-prêmio, férias, consignações, extras/banco de horas e provisões. Preparação repetível em etapas transacionais, preservando dados e ajustes existentes; nenhuma migration nova.
- `income-tax.ts` integrado ao motor: tabela com parcela a deduzir, dedução legal/simplificada agregada por PF e redução mensal 2026 calculada pela renda antes das deduções. Snapshot/tela/PDF e relatório `IRRF`. Casos T11–T15 do pacote antigo aproveitados; pensões/exterior, compensação entre pagamentos/folhas e demais exceções seguem pendentes.
- `poc-special-payroll.ts`: oito tipos especiais agora podem ser calculados, conferidos, fechados e publicados em **DEMONSTRACAO**, preservando a simulação isolada anterior. Fórmulas e parâmetros no snapshot; avos civis automáticos quando não informados, médias/adiantamentos explícitos e RRA pela tabela multiplicada por meses. Não consome direitos nem encerra vínculos; rescisão tem tributação agregada estimada. Isso amplia F5 demonstrativa, sem concluir o processamento oficial de produção.
- Mescla de férias: Ibema histórico + Campina do Simão Lei 21/2025 art. 106/109. Faixas 6–14/15–23/24–32; >=33 é decisão estimada expressa. Faltas por datas distintas, perda em dias na memória e bloqueio de reaquisição se frequência/política mudam. Afastamentos/transições continuam pendentes.
- ATS/licença-prêmio suportam anos civis com regra explícita de aniversário 29/02→28/02; políticas por dias preservadas. Suspensão/reinício e bissextos exercitados. Convenções e efeitos escolhidos para POC precisam ser confirmados na implantação.
- `/rh/diarias`: cálculo por tabela da cartilha, solicitação, decisão numerada, prestação e restituição declarada; modelos de solicitação/autorização/prestação em PDF/CSV/XLSX pela rota autenticada. Fronteiras de horas e truncamento são premissas POC documentadas.
- `REMESSA_SALARIAL_POC`: modelo de remessa com banco/agência/conta fictícios, identidade e líquido de snapshots fechados. Não é CNAB homologado.
- `poc-payment.ts`: registro de pagamento demonstrativo por data e informe anual modelo em PDF/XLSX/CSV. Separado de pagamento bancário/nativo; não altera Payroll para Paga. O informe fiscal oficial continua pendente.

Requisitos apoiados por este incremento: FOL-001/009, 021–026, 030/031/049, 050–054, 062/063, 068/069/073/078/079/080/082/085/087/108; ESO-002 recebe um modelo demonstrativo, não a apuração fiscal oficial integral. F0–F9 continuam com pendências específicas; não declarar 134 requisitos homologados.

Verificação deste incremento: 23 testes unitários/documentais/de direitos aprovados; teste transacional RH PostgreSQL/PGlite aprovado incluindo os nove tipos, replay, publicação, remessa, informe anual, diárias e faltas/férias; 14 testes de integração SST aprovados no lote anterior. ESLint dos arquivos alterados aprovado. Build final em andamento.

Pacote preparado no banco configurado com `npx tsx scripts/seed-hr-documentary-poc.ts --apply --calculate --close` e depois `--publish`: competência 10/2026, três titulares/contratos, nove execuções fechadas e **27 demonstrativos publicados**, disponíveis aos respectivos titulares quando vinculados a usuários de teste. Mensal: bruto 11.021,00; descontos 1.040,60; líquido 9.980,40; patronal 2.424,62. A segunda execução reutilizou os mesmos registros/cálculos. A identificação institucional demonstrativa foi criada pelo pacote quando necessária; conferir cadastro institucional final.

## Análise do pacote documental — 11/10/2026

Registrada em [ANALISE_DOCUMENTAL_RH_FOLHA_IBEMA_2026.md](ANALISE_DOCUMENTAL_RH_FOLHA_IBEMA_2026.md): inventário e aproveitamento dos 67 arquivos originais, regras históricas do Estatuto confrontadas com serviços atuais, limitações, roteiro POC e documentos ainda necessários. As 114 linhas de Folha e 20 de eSocial conferem com o checklist; 38 hashes de downloads conferem, ZIPs íntegros e XSDs sintaticamente bem formados; os 11 testes aritméticos Python do pacote passaram, sem representar testes do motor TypeScript.

Achados prioritários: IRRF completo de 2026 ainda pendente no fluxo mensal; direitos por dias não equivalem automaticamente a quinquênios civis; faixas históricas de férias deixam 6/15/24/33 faltas sem enquadramento; licença-prêmio de Paranaguá (60 dias) não é parâmetro de Ibema (90 dias históricos); pacote XSD futuro tem calendário por ambiente. O README inicial foi atualizado quanto aos downloads já presentes. Esta entrega é documental; F0–F9 continuam parciais e a homologação autenticada/oficial segue pendente.

## Integração recebida

### Documentos municipais adicionais — 11/10/2026

Análise e aplicação por módulo em [ANALISE_NOVOS_DOCUMENTOS_IBEMA_2025_2026.md](ANALISE_NOVOS_DOCUMENTOS_IBEMA_2025_2026.md), com [catálogo individual de 141 arquivos](CATALOGO_NOVOS_DOCUMENTOS_IBEMA.md). Acrescentados os relatórios `SERVIDORES_ATIVOS` e `QUANTIDADE_SERVIDORES` em `/rh/operacoes`, nos formatos CSV/XLSX/PDF, por data explícita ou fim da competência, com revisão contratual vigente e contagem separada de pessoas/vínculos. Dois testes específicos aprovados: temporalidade/término/jornada e deduplicação entre regimes. PDF usa o renderizador genérico; diagramação oficial ainda pendente.

As relações não fornecem salários monetários/incidências completas e não autorizam converter jornada semanal em mensal sem regra. O estatuto de nome opaco é de Campina do Simão; a escala tutelar é de julho/2024; o decreto 2912/2026 prevê ponto facultativo em 30/10/2026 com exceções para saúde/coleta de lixo. Não houve carga automática de pessoas ou regras no banco a partir de OCR. Quadro de vagas, estatuto consolidado, ficha financeira/rubricas e conciliação normativa permanecem pendentes.

O RACI 2025, p. 33, contém certidão municipal de 19/02/2026 (imagem conferida) que informa extinção do fundo pela Lei 002/1999 e vinculação ao RGPS. Esta fonte resolve a dúvida documental sobre o regime municipal geral; os anexos RPPS zerados não devem originar configuração RPPS. Alíquotas/incidências, RAT/FAP/patronal e categoria de cada vínculo permanecem parâmetros próprios. Regressão após os novos relatórios: 32 testes RH/SST aprovados.

Em 11/10/2026 foi executado `git pull --ff-only origin main`, de `a9a6b11` para **`7f28090`**. As alterações locais foram preservadas no stash `opencode-rh-before-sst-pull-20261011`, reaplicadas e os conflitos de schema e das duas telas/actions compartilhadas de Folha resolvidos.

Os arquivos do domínio SST recebidos permanecem preservados. O processamento de origens de planos usa `postBenefitPayrollBatch`, mantendo autorização por UG, valores Decimal, histórico funcional e seus bloqueios. Não foram aplicadas migrations de SST por esta frente.

## Entregas locais em andamento

- Migration aditiva de RH: contratos por servidor, revisões, movimentos imutáveis, cálculos e demonstrativos Decimal, saldos de direitos/provisões, solicitações Portal, outbox e origem da projeção dos itens legados.
- Motor de expressões sem `eval`, bases/incidências, contribuição por esquema e teto agregado entre contratos, rateio de centavos e IRRF configurável por tabela.
- Simulação isolada; execução oficial, cancelamento de cálculo aberto, fechamento explícito e proteção contra alteração de dados depois do cálculo.
- Integração das origens SST já lançadas: exige Decimal, rubrica manual canônica e `details.functionalPeriodId`; não infere vínculo a partir de salário/cargo atual. Multivínculo com origens ainda requer alocação explícita, sem duplicar valores.
- Fechamento projeta somente os valores adicionais, com mapeamento explícito `FOLHA_EVENTOS`, preservando itens SST; reconcilia líquido e Decimal com a folha legada.
- `/rh/operacoes`: contratos/revisões, vinculação ao Cadastro Único, movimentos, direitos, cálculos e eventos pendentes. Listagens com 20 registros e referências pesquisáveis/paginadas.
- `/rh/operacoes/calculos/[id]`: conferência, snapshot, fechamento e liberação futura.
- `/portal-servidor/demonstrativos`: totais integrais por contrato e PDF completo; o acesso ao PDF exige titularidade, liberação efetiva e versão oficial fechada.
- Outbox de Financeiro e eSocial criada junto com fechamento, no estado `AGUARDANDO_CONFIGURACAO`. Não representa empenho nem transmissão.
- Bloqueados edição manual de status Fechada/Paga, exclusão de folha com histórico e alteração de competência/tipo após cálculo.
- Cadastro RH e Administração resolvem pessoa física no Cadastro Único; dados pessoais gravados em Employee são projeção de compatibilidade, não editáveis como fonte independente.
- Importações de verbas fixas/variáveis por CSV com prévia, rollback do lote inteiro, hash/arquivo preservados na evidência e replay inclusive entre operadores. O mesmo arquivo com outra chave é rejeitado.
- VT/VA diário por regra JSON e direito existente do servidor; dias da semana, férias/afastamentos e limite percentual explícitos, custo servidor/entidade e geração única do movimento na competência.
- Relatórios integrais de contratos, folha oficial fechada e saldos de direitos: CSV, XLSX real e PDF multipágina.
- `/rh/esocial`: configurações independentes de Produção/Produção Restrita, referências protegidas de credencial e pacote XSD. Continua sem transmissão; origem JSON de conferência não é XML oficial.
- Solicitações autenticadas do Portal e análise pelo RH, com decisão fundamentada, replay e preservação da decisão anterior.
- Revisões contratuais por vigência: histórico paginado, salário/lotação/jornada selecionados pela competência e preservação das folhas fechadas diante de alterações futuras. Mudanças intramês exigem rateio ainda pendente.
- Reajuste coletivo percentual assinado, prévia sem gravação, hash de conferência, detecção de revisão concorrente, aplicação transacional integral e replay entre operadores.
- Conferência da memória por rubrica e das bases em `/rh/operacoes/demonstrativos/[id]`, com consulta a snapshots e PDF integral.
- Cancelamento de reservas futuras de gozo com entrada compensatória e restauração do saldo; histórico e motivos preservados. Folha fechada no período impede a restauração automática.
- Horas extras reconhecidas no ponto geram movimentos Decimal pela regra explícita, salário/jornada temporal e contrato escolhido; replay não duplica e a mesma origem não pode ser alocada a outro vínculo. Ponto integrado fica protegido contra edição/exclusão pela rotina RH.
- Relatórios integrais de resumo por rubrica/regime/centro/local, bases e contribuições previdenciárias e contratos simultâneos. Dados de folhas fechadas usam identidade/lotação do snapshot.
- Memória de médias por janela, rubricas explícitas, percentuais de seleção (incluindo 80%), arredondamento da quantidade, política de meses faltantes e fatores de atualização documentados.
- Campanhas de recadastramento em `/rh/recadastramento` e `/portal-servidor/recadastramento`, com público definido, campos autorizados, vigência, acompanhamento paginado, diff e deferimento transacional no Cadastro Único. Conflito com atualização central posterior bloqueia o deferimento.
- Adaptador interno de solicitações de despesa no Financeiro: classificação explícita por centro/componente, prévia, plano durável, controle de acesso à UG, recuperação de falha parcial e idempotência. Não cria empenho, liquidação nem pagamento.
- Cenários persistidos de simulação dos oito tipos especiais mediante política de rubricas e parâmetros com fonte explícita. Sem fechamento oficial, tributos automáticos, consumo de direitos ou alteração do vínculo.
- Margem consignável por PF, agregada entre vínculos, com base/descontos/rubricas definidos explicitamente e percentual na política de cálculo; excesso bloqueia a execução antes de persistir. Memória imutável por demonstrativo, conferência em tela/PDF e consulta autenticada em `/portal-servidor/margem`.
- `/rh/consignacoes`: contratos imutáveis vinculados ao credor central, cronograma de parcelas iguais, reserva de margem por competência, lançamento único e cancelamento compensatório de parcelas não lançadas. `/portal-servidor/consignacoes`: consulta do próprio titular, a partir de referências liberadas.
- Dependentes vinculados a `Person`, com nome/CPF/nascimento projetados do Cadastro Único, flags de candidatura e proteção contra duplicidade/troca de titular. Elegibilidade de IRRF e salário-família por parentesco/idade/documentos vigentes; quotas e renda agregadas por PF, rateio entre vínculos e memória em tela/PDF. Fechamento rejeita elegibilidade alterada após o cálculo.
- Alteração coletiva de cargo/regime/lotação/centro/nível/salário/jornada/término com prévia, hash, revisão temporal e rollback integral. Matrícula/identidade/admissão não são modificadas por esse lote.
- Banco de horas reconhecido no ponto: créditos/débitos Decimal por origem, limites de saldo e somatórios diários, rejeição de déficit anterior financiado por crédito futuro, política de coexistência com horas extras pagas e preservação da origem integrada. Estorno compensatório único valida saldos posteriores e mantém entrada original. Extrato próprio por escopo em `/portal-servidor/banco-horas`.

Formatos de configuração e limites: `docs/RH_FOLHA_POLITICAS_OPERACIONAIS.md`.

## Configuração do motor

O conjunto deve estar ativo e cobrir toda a competência e escopo escolhido. `HALF_UP`, escala 2. Produção exige aprovação efetiva, referência legal e `isDemo=false`.

Variáveis de expressão: `SALARIO_BASE`, `DIAS`, `JORNADA` e códigos de outras rubricas. `DIAS=30` para mês integral; períodos parciais usam dias civis limitados a 30. A regra de proporcionalidade municipal precisa ser conferida antes do uso oficial. Bases de previdência vêm das incidências RGPS/RPPS/COMPLEMENTAR.

`IRRF_FAIXAS`: regra JSON com lista de `{ lowerLimit: string, upperLimit: string | null, employeeRate: string }`. O cálculo agrega os vínculos da mesma PF e deduz contribuição previdenciária e dependentes marcados para IRRF, usando `IRRF_DEDUCAO_DEPENDENTE`. Quando `DEPENDENTES_IRRF` está configurada, aplica elegibilidade por idade/parentesco/documentos e preserva memória; conjuntos legados sem essa regra continuam com a contagem por flag. Quando `IRRF_DEDUCAO_SIMPLIFICADA` está configurada, escolhe a maior dedução por PF, uma única vez. Seleção incompleta dos vínculos é rejeitada. **Exceções de elegibilidade, pensão, exterior, pagamentos fora da competência e bases de folhas especiais ainda precisam ser completadas.** Esta tabela não equivale à homologação de todas as situações de IRRF.

`FGTS_ALIQUOTA`: percentual configurável, aplicado quando há base FGTS. O valor é informativo e integra encargos da entidade, sem reduzir o líquido do servidor.

`PREVIDENCIA_BASE_PATRONAL_<codigoDoEsquema>`: regra textual obrigatória quando há encargo patronal; valores `SEM_TETO` ou `TETO_SERVIDOR`. O teto do segurado não é aplicado implicitamente ao empregador.

O rateio monetário usa maiores frações com desempate estável por ordem dos contratos, preservando centavos e impedindo parcela residual negativa.

Solicitações do Portal: `/portal-servidor/solicitacoes-rh`, titularidade exclusiva pela sessão, replay e acompanhamento; `/rh/solicitacoes`, análise e decisão fundamentada com outbox transacional. A decisão não cria automaticamente férias, benefício, usuário ou documento: a providência funcional tem registro próprio. Convites de acesso são separados e não podem ser deferidos por esse formulário.

Férias: geração explícita de aquisitivos completos pela política vigente, reserva de gozo/pecúnia, fracionamento, saldo e replay. Aquisitivo com afastamento é bloqueado até haver regra de perda/prorrogação; não se infere seu efeito. Actions legadas de RH verificam conflitos nos dois sentidos e preservam férias com reservas. Essa proteção não modifica as rotinas clínicas de SST.

`FOLHA_EVENTOS`: regra JSON com objeto `códigoDaRubrica → ID do PayrollEvent`. Eventos ativos, tipo compatível e sem fórmula concorrente. Inclui as rubricas calculadas `PREVIDENCIA_<codigoDoEsquema>` e `IRRF` quando presentes. Nenhum evento é escolhido pelo nome.

Movimentos usam chave estável de origem. Correções criam movimentos compensatórios em vez de atualizar/apagar. O saldo de direitos/provisões também usa entradas assinadas; uma baixa não pode exceder o saldo, e replay com outros dados é rejeitado.

## Situação das dez fases do plano

O plano usa **F0–F9**, totalizando dez fases. Esta execução ainda está em andamento: não declarar as dez concluídas nem 134 requisitos homologados.

| Fase | Estado deste incremento | Próximos desenvolvimentos internos |
|---|---|---|
| F0 Fundação | Parcial | Revisões e rateio civil intramês demonstrativo entregues; completar critérios municipais/produção, transições de regime/previdência e consolidação dos demais consumidores temporais. |
| F1 Cadastro | Parcial | Dependentes canônicos, alterações coletivas, campos configuráveis, quadro temporal de cargos/vagas/níveis, ocorrências e pasta funcional agregada disponíveis; completar progressões, multivínculo temporal completo, extensões de funções/designações, cessões/estágio, anexos específicos de contrato e consultas integrais. |
| F2 Motor | Parcial | Redução mensal IRRF 2026, memória por PF, dedução explícita de pensões, rateio civil POC e diferenças vinculadas de 13º entregues. Completar exceções fiscais, compensação entre folhas/pagamentos, transições entre esquemas, bases especiais oficiais e conferência integral. |
| F3 Movimentos/benefícios | Parcial | Importação, VT/VA, salário-família parametrizado, margem agregada, contratos/parcelas/reservas e pensões fixas/percentuais com beneficiário/memória disponíveis. Completar múltiplas linhas/calendários de VT, exceções de benefícios, proporcionalidade especial/repasse de pensões, submargens, renegociação e compensações de consignação. |
| F4 Direitos/frequência | Parcial | Médias, horas extras, banco/FIFO/transferências/conversão/expiração explícita, gozo conjunto, férias com faixas de faltas POC e vínculo à folha, licença-prêmio/ATS por anos civis e averbação para ATS disponíveis. Completar perdas/prorrogações/afastamentos, transições de regime, outros direitos, ATS intramês, médias automáticas nas especiais e agendamento/reconciliação de banco. |
| F5 Folhas especiais | Parcial | Oito especiais calculáveis/fecháveis/publicáveis em DEMONSTRACAO; final/diferença de 13º vinculados e férias conciliadas com reservas. Desligamento ao fim da competência e reintegração demonstrativos com atos/revisões entregues. Completar produção, tributação integral, desligamento intramês, TRCT, diferenças sucessivas/negativas, retroativos e direitos do intervalo de reintegração. |
| F6 Contabilidade | Parcial | Solicitações nativas de despesa, provisões e baixa explícita por empenho, resumo/planejamento por segmentos e diárias com documentos POC disponíveis. Completar razão patrimonial, automatização de vínculos/baixas, retenções/repasses, liquidação/pagamento/retorno bancário, integração financeira de diárias e produtividade. |
| F7 Portal | Parcial | PDF/mensagens históricas, publicação futura (inclusive especiais POC), solicitações, campanhas/deferimento, margem, cronogramas/crédito e consulta própria da licença-prêmio disponíveis. Informe anual modelo POC por pagamentos demonstrativos entregue; faltam renda anual fiscal oficial, carência/liberação de margem por banco e demais jornadas. |
| F8 eSocial/obrigações | Parcial | Origens/outbox, histórico interno integral e renderizador de layouts configuráveis CSV/ASCII com validação/bytes/hash/download autorizado disponíveis; faltam mapeamentos oficiais/populações/classificações, XML/XSD/assinatura/cliente/worker e exportadores específicos de cada obrigação. Configuração externa posterior não substitui esses desenvolvimentos internos. |
| F9 POC | Parcial | Testes iniciais e regressão; ampliar casos ouro, relatórios e evidências item a item, além do percurso autenticado. |

## Comandos de verificação e implantação

### Retomada — executar pendências internas sem aguardar credenciais

### Continuidade F6 — baixa de provisões vinculada ao empenho

- `provision-commitment.ts` liga baixas assinadas no ledger RH a empenho nativo já existente. Exige RH/update e Financeiro/update, acesso à UG, despesa de origem RH/PAYROLL_RUN já empenhada, cálculo oficial fechado de produção e apropriações dos contratos do cálculo. Não cria empenho, liquidação ou pagamento.
- Quantias Decimal são normalizadas em centavos. Impede origens divergentes, apropriações duplicadas/estornadas, consumo acima do saldo individual e baixas acumuladas acima do valor vigente do empenho, considerando reforços/anulações. Locks no empenho e contratos serializam consumo; ledger e auditoria são atômicos. Operações > Direitos permite informar alocações explícitas por apropriação.
- Estorno exige anulação integral do empenho nativo; devolve todos os valores da baixa em novas entradas, com replay e motivo preservados. Estorno de apropriação bloqueia quando há baixa vinculada ainda não devolvida. Anulação parcial, vínculo automático por rubrica e lançamento no razão patrimonial continuam pendentes.
- Relatório de saldos de direitos/provisões passou a separar escopos; registros antigos sem escopo são identificados como LEGADO_SEM_ESCOPO, sem somar demonstração e produção no mesmo saldo.
- **30 testes aprovados novamente**, incluindo native Expense→BudgetReservation→Commitment, autorização conjunta/UG, falha injetada na auditoria com rollback completo, replay, limite acumulado do empenho, bloqueio de estorno de apropriação consumida, devolução somente após anulação integral e separação de escopos no relatório. ESLint e `git diff --check` aprovados. **Build atualizado aprovado com código 0**, incluindo TypeScript (5,6 minutos), geração de páginas e rotas.

### Incremento de direitos, provisões e arquivos configuráveis

- Checkout estava limpo na retomada; os incrementos anteriores já estavam incorporados. Build da continuidade anterior concluiu com código 0, incluindo TypeScript em 14,2 minutos; esse resultado precede as alterações abaixo.
- `service-rights.ts`: licença-prêmio por dias explicitamente definidos. Tipos de afastamento exigem efeito CONTAR/SUSPENDER/REINICIAR; suspensões sobrepostas contam uma vez, reinício descarta o aquisitivo parcial. Aquisições completas, saldo por período/escopo, gozo fracionado, pecúnia reservada e cancelamento futuro são transacionais, idempotentes e auditados. Mudanças de afastamentos que alteram aquisição já registrada bloqueiam nova aquisição. Não converte reserva de pecúnia em dinheiro nem presume quinquênio municipal.
- `/rh/licencas` protege projeções ligadas a entradas de direitos contra edição/exclusão. Cancelamento do serviço compensa o ledger e desativa a projeção de afastamento. Política vigente e produção aprovada são conferidas no servidor; folha oficial fechada no intervalo bloqueia devolução automática.
- `service-time-allowance.ts`: averbação anterior à admissão, com dias reconhecidos limitados ao intervalo e prevenção de sobreposição entre vínculos da mesma identidade; estorno mantém original. ATS seleciona faixa por dias contados no fim da competência, descontando união de afastamentos não computáveis e somando averbações de escopo correspondente. Salário temporal × percentual, Decimal/HALF_UP, gera movimento MANUAL/PROVENTO em mensal aberta, com origem única contrato/competência e estorno compensatório. Cálculo/fechamento revalidam tempo/afastamentos/averbações/salário; alteração posterior exige conciliação do ATS.
- `time-bank-expiration.ts`: reconstituição FIFO por titular/escopo, com créditos por dia, transferências conservando data e ID de aquisição original e pares compensatórios eliminados. Prévia e aplicação explícita baixam saldos vencidos na data da apuração, sem crédito futuro financiar débito anterior. Débitos futuros registrados podem impedir baixa. Política deve abranger regimes atingidos; não reinicia validade na transferência. Agendamento automático, políticas heterogêneas e regularização retroativa continuam pendentes.
- `payroll-provisions.ts`: cálculo de remuneração e patronal por rubricas do snapshot de mensal oficial fechada, taxa explícita, memória de base/itens/centro e ledger anual com origem mensal única por contrato/tipo/escopo. Replay, rejeição de outra versão e estorno compensatório disponíveis. Não é lançamento no razão contábil; baixa associada a empenho, classificação patrimonial, retenções/repasses e conciliação Financeiro ainda requerem implementação.
- `/portal-servidor/licenca-premio`: acesso pela identidade da sessão, saldo integral e 20 entradas por página, filtros de contrato/aquisitivo/escopo. Contrato informado de outro titular não amplia acesso. Valores demonstrativos não são presumidos como produção.
- `obligation-export.ts`: regras `OBRIGACAO_LAYOUT*`, versão e fonte explícitas. CSV UTF-8 ou registros de largura fixa ASCII, fontes permitidas de snapshot/rubrica/literal, obrigatoriedade, tamanho, alinhamento e transformações. Rejeita ausência, rubricas ausentes/duplicadas, overflow e quebra de linha, sem truncar silenciosamente. Proteção contra fórmulas em CSV. Geração preserva bytes em base64, hash, política, versões de origem e ator em evento auditável; repetição retorna a mesma evidência. Download revalida todo o acesso orçamentário e o hash.
- Arquivos configuráveis continuam com `officialLayout=false`: o renderizador interno não comprova layouts DIRF/GFIP/MANAD/SIOPE/TCE/CADPREV homologados nem cobre populações/classificações ainda ausentes. XML/XSD, assinatura, transporte e worker continuam pendências internas, não atribuídas apenas a credenciais.
- **30 testes aprovados** (16 RH e 14 SST→Folha): contagem/suspensão/reinício, gozo/pecúnia/cancelamento, titularidade/escopo, averbações sem duplicidade, ATS integrado de R$ 75,00, revalidação após estorno de averbação, snapshot preservado, provisão com base/patronal/estorno, transferências sem rejuvenescimento, expiração/replay, 501 linhas em arquivo fixo, rejeição de overflow/ausência, bytes preservados e restrição orçamentária. ESLint final de todos os arquivos alterados e `git diff --check` aprovados. **Build completo deste incremento aprovado com código 0**, incluindo TypeScript, geração de páginas e novas rotas de licença-prêmio e arquivos de obrigações; checagem TypeScript levou 6,6 minutos. Nenhuma migration nova.

### Incremento anterior — solicitação de conclusão F4–F8 com parâmetros POC

- Usuário autorizou seguir com parâmetros demonstrativos enquanto as normas municipais e referências oficiais não estão disponíveis. As fases permanecem parciais; autorização para POC não constitui homologação nem substitui desenvolvimento interno pendente.
- F4: `vacation-multiple-periods.ts` reserva 2–10 aquisitivos, até 90 dias no grupo, com parcelas consecutivas e memórias separadas por aquisitivo. Revalida vínculo temporal, fracionamento/saldo de cada período, conflitos do titular, vigência e aprovação em produção. Reserva/projeções/auditoria são atômicas; replay normaliza a ordem dos aquisitivos.
- Cancelamento do grupo devolve todos os saldos com entradas compensatórias e preserva originais. Exige gozos futuros programados e ausência de folha oficial fechada no período do titular. O cancelamento individual rejeita parcelas de grupos. Operações > Direitos tem os dois formulários.
- F7: regra `MENSAGENS_RECIBO` seleciona mensagens gerais ou de contratos/regimes/tipos específicos, por interseção de vigência com a competência. Mensal e simulações especiais preservam mensagens em cada demonstrativo. Conferência RH e PDF próprio do Portal exibem a memória; mudanças futuras da regra não reescrevem recibos. Snapshots antigos retornam lista vazia.
- F8: `/rh/esocial` oferece histórico interno JSON por ano/escopo; `/api/rh/obrigacoes/historico` exige RH/issueReports e aplica acesso orçamentário. Leitura em lotes de 200 sob RepeatableRead exporta todos os demonstrativos oficiais fechados do filtro. Identidade/lotação/rubricas/bases vêm dos snapshots; totais usam Decimal. Hashes determinísticos do snapshot, registro e conteúdo permitem comparar arquivos.
- Histórico é por competência calculada, incluindo versões fechadas; não demonstra pagamento nem classifica renda tributável/isenta. `officialLayout=false`; layouts XML/XSD, assinatura, transmissão, consulta e processamento de retornos continuam pendentes. Nenhuma migration ou credencial nova.
- Evidências automatizadas: saldos/fracionamento, ordem normalizada, parcelas consecutivas, rejeição de cancelamento individual, cancelamento/replay, mensagens por vínculo/vigência e memória preservada após alteração, exportação de 501 demonstrativos em três lotes, totais, identidade histórica, hash estável e separação por ano/escopo/acesso.
- Validação: 12 testes RH aprovados e 14 regressões SST→Folha aprovadas. Teste PostgreSQL repetido após ampliar injeção de falhas e leitura do PDF: passou, incluindo rollback integral de reserva/cancelamento e presença da mensagem de versão no PDF do titular. ESLint dos arquivos alterados e `git diff --check` aprovados. Primeiro build excedeu 120 segundos; segundo compilou com sucesso, mas excedeu 600 segundos durante TypeScript. Processos conferidos, sem build residual; terceira execução com limite de 1.800 segundos iniciada. Aprovação completa ainda pendente neste registro.

### Continuidade — solicitação de crédito pelo titular (F3/F7)

- `/portal-servidor/credito` apresenta as referências mensais oficiais mais recentes do próprio titular que estejam publicadas e tenham política ativa de consignação; vínculos e credores centrais habilitados são selecionáveis. Identidade funcional é obtida da sessão, nunca de um campo do formulário.
- Solicitação `CREDITO_CONSIGNADO` mantém descrição, parcela/quantidade/início, consignatária, política e margem de referência. Solicitar não ocupa margem; replay com mesmos dados retorna a mesma solicitação e origem divergente é rejeitada. Referência não publicada, de outro titular, desatualizada ou fora do prazo da política é bloqueada.
- RH confere o pedido em `/rh/solicitacoes`. A decisão própria exige número e rubrica no deferimento, revalida publicação, vigência, referência, cadastro/cronograma e margem disponível. Reserva completa de todas as parcelas, decisão e evento de auditoria são gravados na mesma transação. Falha de qualquer etapa mantém o pedido em análise e reverte todas as reservas.
- Action aplica escopo orçamentário da referência. Decisão genérica não pode deferir crédito; campos solicitados pelo titular não podem ser alterados pelo deferimento. Repetir decisão não duplica contrato/parcelas; alterar número/rubrica/fundamento após decisão é rejeitado. Indeferimento não cria reserva.
- Teste PostgreSQL real verifica titularidade, replay normalizado, referência antiga, bloqueio de decisão genérica, rollback após falha injetada no evento, reserva e replay da decisão, alteração de decisão e concorrência de margem com reservas existentes. Doze testes RH aprovados; build integrado do incremento de crédito/cron aprovado (notificação de conclusão recebida na continuidade seguinte).
- Crédito bancário/liberação de dinheiro e repasse à consignatária têm procedimentos externos/financeiros próprios. A entrega não homologa FOL-084 (carência e liberação manual por banco) nem conclui F3/F7. Nenhuma migration nova foi necessária.

### Ajuste temporário de deploy — plano Vercel Hobby

- `vercel.json` tinha um cron horário de SST, incluído em `76728e5 — sst5`. Frequência horária é rejeitada pelo plano Hobby.
- Ajustado para um único job diário: `0 9 * * *` (09h UTC, 06h Brasília; janela de uma hora no Hobby). Procedimento de retorno à frequência de produção e impacto em avisos/retries: `src/app/app-domain/sst/restricoes/EMAIL-CRON.md`.
- Configuração JSON e frequência diária conferidas localmente. O status efetivo de deploy na Vercel depende da publicação das alterações e de verificação do projeto remoto.

### Continuidade — banco de horas entre vínculos e conversão mensal (F4)

- Transferências em Operações > Direitos exigem `BANCO_HORAS_TRANSFERENCIA`: hora por hora, pares de regimes autorizados e máximo por operação. Origem/destino têm políticas próprias de banco ativas, no mesmo escopo e vinculadas aos regimes temporais. Produção exige conjuntos oficiais aprovados.
- Dois vínculos distintos da mesma identidade funcional, ativos na data, recebem saída/entrada assinadas na mesma transação. Locks por titular e contratos serializam consumo. Saldo é conferido cronologicamente, incluindo débitos futuros já registrados: crédito futuro não financia transferência anterior. Limite do destino também é conferido. A soma das horas do titular é preservada, sem inferir equivalência salarial.
- Estorno gera duas novas entradas na data original e preserva as duas originais. Consumo posterior no destino pode bloquear estorno por saldo insuficiente; nesse caso nenhuma perna parcial é gravada. Replay retorna os IDs anteriores; mudança de origem/dados/fundamento é rejeitada.
- Conversão em provento exige `BANCO_HORAS_PAGAMENTO`, banco ativo e rubrica MANUAL/PROVENTO do conjunto. Valor = salário temporal / jornada mensal × horas × multiplicador explícito, Decimal com HALF_UP em centavos. Limite de horas é acumulado por contrato/competência/escopo. Baixa do saldo no fim da competência, movimento e memória da origem são atômicos.
- Action de conversão/estorno verifica escopo orçamentário da folha. Folha Mensal deve estar aberta; competência com demonstrativo oficial fechado do titular bloqueia alteração. O motor mensal incorpora o provento e mantém a memória anterior após compensação; recalcular é necessário antes do fechamento se movimentos mudaram.
- O estorno em folha aberta devolve horas e gera movimento financeiro negativo, sem apagar originais. Pagamento bancário não é inferido da geração de provento; segue o fluxo financeiro da folha. Competência com alteração intramês ainda permanece bloqueada pelo guard temporal existente.
- Extrato do Portal identifica transferência, conversão e estornos, com fundamento, escopo, origem e paginação já existentes. Políticas de transferência/pagamento são validadas também no cadastro de parâmetros.
- **26/26 testes aprovados** na continuidade: 12 RH + 14 regressões SST→Folha. PostgreSQL real cobre quatro casas, saldo/limite/temporalidade, política demonstrativa impedida em produção, falha injetada na perna destino, falha da baixa com rollback do provento, replay/estornos, limite acumulado, provento de R$ 3,41 integrado ao motor e compensação em novo cálculo sem reescrever o anterior. ESLint, `git diff --check` e `npm run build` completo (incluindo TypeScript) aprovados.
- Nenhuma migration nova ou cron adicional. Expiração/atribuição de lotes, licença-prêmio/ATS/averbações e os demais direitos seguem pendentes; F4 e FOL-019 não estão integralmente concluídos.

```powershell
node --conditions=react-server --import tsx --test --test-concurrency=1 tests/hr-calculation.test.ts tests/hr-workforce-service.test.ts
npx tsx scripts/deploy-hr-migrations.ts
# Somente após as dependências compartilhadas estarem disponíveis:
npx tsx scripts/deploy-hr-migrations.ts --apply
$env:NODE_OPTIONS='--max-old-space-size=8192'
npm run build
```

O deploy dirigido aplica somente a migration de RH e verifica checksums, dependências de runtime e transação. Não usa `prisma migrate deploy` geral, para preservar a implantação de SST conduzida no outro PC.

O preview encontrou **zero dependências de runtime ausentes** no banco configurado. A migration `20261011030000_hr_workforce_foundation` foi aplicada pelo comando dirigido com resultado `APPLIED`. Nenhuma migration de SST foi executada por esta frente.

A migration `20261011130000_hr_contract_temporal_revisions` foi aplicada por `npx tsx scripts/deploy-hr-migrations.ts --temporal --apply`, com resultado `APPLIED` e zero dependências ausentes. Acrescenta `effectiveFrom`, backfill e índice, restaurando o trigger imutável na mesma transação. Revisões legadas recebem baseline de admissão; a data histórica real de alterações antigas não é reconstruída. As folhas antigas continuam com seus snapshots.

Seed preparado: `npx tsx scripts/seed-hr-engine-demo.ts` / `--apply`. Cria somente parâmetros sintéticos do motor, sem pessoas, servidores, usuários, permissões ou folhas. A tentativa de aplicação encontrou nome/município/UF ausentes em **Administração > Dados da Prefeitura**. A transação foi revertida; o conjunto não foi criado e nenhum dado institucional fictício foi preenchido.

## Verificações desta continuidade

- **18 testes cemiteriais aprovados**, migrations cemiteriais com checksums conferidos.
- **14 testes das integrações SST→Folha aprovados** após o pull.
- **6 testes novos de RH aprovados**, com as verificações integradas descritas abaixo, e ESLint dos arquivos desta frente aprovado.
- Após o reinício do servidor, os seis testes foram repetidos com sucesso, incluindo solicitação/decisão do Portal, rateio de centavos e base patronal explícita. A migration RH retornou `APPLIED_CHECKSUM_VERIFIED`, sem dependências de runtime ausentes; ESLint também passou.
- Testes novos de RH exercitam Decimal/fórmulas, tetos e deduções, simulação/replay/rollback, projeção da folha, titularidade/PDF, direitos/aquisitivos/conflitos, importação, VT/VA e **501 contratos** com exportação integral. A leitura do XLSX confere a última linha e o texto do PDF multipágina confere o último contrato.
- O primeiro build encontrou um bloco FGTS inserido no escopo de fechamento em vez de cálculo; foi corrigido e os testes passaram novamente. Build integrado atualizado em execução; não declarar aprovação antes do resultado final.
- Uma repetição paralela dos testes encontrou falha nativa V8/JIT no processo do PGlite. A execução sequencial (`--test-concurrency=1`) passou, incluindo o teste PostgreSQL integral; não foi necessário alterar código funcional para contornar essa falha de runtime.
- Dois builds foram interrompidos durante a checagem de tipos pelas interrupções/reinícios da sessão. Esses resultados não são aprovação do build. Uma nova execução foi iniciada sobre os arquivos atualizados.
- Nova tentativa do navegador após o reinício manteve `[browser.disconnected]`; não há evidência de homologação visual autenticada.

### Incremento temporal e operacional de 11/10/2026

- Sete testes RH aprovados após inclusão de revisões futuras, reajuste coletivo/rollback, férias compensatórias, horas extras, relatórios agregados, médias, recadastramento e ponte Financeiro. O teste PostgreSQL inclui falha forçada no segundo lançamento financeiro, recuperação e ausência de duplicação.
- Cenário sintético de 13º verifica salário temporal, parâmetros/fonte, persistência/replay, preservação da folha legada e bloqueio de fechamento/publicação oficial.
- ESLint aprovado para os arquivos RH/Portal e scripts alterados. **Build completo atualizado aprovado** (`npm run build`), incluindo TypeScript e geração das rotas de recadastramento, Financeiro e cenários especiais. `git diff --check` aprovado.
- Migration temporal novamente conferida: `APPLIED_CHECKSUM_VERIFIED`, sem dependências de runtime ausentes. Regressão SST→Folha repetida após o incremento: **14 testes aprovados**.
- Todos os estados da tabela acima continuam parciais. As pendências internas não são tratadas como dependências do município ou de acesso externo.

### Continuidade — controle de margem consignável

- Oito testes RH aprovados, incluindo soma Decimal de vínculos, arredondamento único, rejeição de rubricas ausentes/incompatíveis, excesso sem execução parcial, compensação e fechamento/publicação com memória.
- Teste integrado confirma que atualização de movimentos não altera a memória anterior, que o titular não acessa a simulação pelo Portal e que outro titular não acessa o demonstrativo publicado.
- Snapshots legados permanecem sem margem; a consulta explicita sua indisponibilidade, sem aplicar parâmetros atuais ao passado.
- ESLint, `git diff --check` e **build completo atualizado (`npm run build`) aprovados**, incluindo TypeScript e a nova rota do Portal.

### Continuidade — contratos, reservas e parcelas de consignação

- Migration aditiva `20261011160000_hr_consignment_schedule`: contratos, parcelas e entradas de reserva/lançamento/cancelamento imutáveis, integridade referencial, sinais de ledger e unicidades de contrato/origem.
- Cronograma com parcelas iguais (até o limite explícito da política), referência mensal oficial mais recente do titular, consignatárias autorizadas do cadastro central e preservação de política/margem/autorização em snapshot.
- Reserva serializada entre todos os contratos do titular, por competência e escopo; falha em uma competência reverte contrato e cronograma inteiros. Replay não duplica contrato/parcela/movimento; mesmo número/credor/vínculo/escopo não aceita cadastro com outra chave.
- Parcelas gerenciadas já presentes na referência são identificadas pelos movimentos preservados no snapshot para evitar desconto duplicado da margem futura. Descontos não gerenciados da referência permanecem como ocupação conservadora.
- Cálculo e fechamento verificam parcelas reservadas pendentes de lançamento. Parcela lançada não aceita cancelamento automático; exige conciliação/compensação própria, ainda pendente. Cancelar parcela não lançada cria entrada negativa e preserva a reserva original.
- Testes PostgreSQL aprovados para reserva/replay/excesso sem gravação parcial, lançamento/replay, cancelamento, cronograma pendente, recência da referência, margem gerenciada e triggers imutáveis. TypeScript e ESLint aprovados; build atualizado ainda em validação.
- Migration aplicada pelo deploy dirigido e reconferida com `APPLIED_CHECKSUM_VERIFIED`, sem dependências de runtime ausentes. `git diff --check` aprovado. O build foi interrompido e retomado em segundo plano, posteriormente aprovado conforme registro abaixo. A nova tentativa de navegador retornou `[browser.disconnected]`.
- O build retomado concluiu com sucesso, incluindo as rotas RH/Portal de contratos e cronogramas consignados.

### Continuidade — dependentes, alterações coletivas e banco de horas

- Testes RH ampliados para vínculo central/projeções/duplicidade, idade civil/validade documental, quota única entre contratos, cessação futura, histórico preservado e fechamento bloqueado após alteração de elegibilidade.
- Testes de alteração coletiva verificam hash invalidado por revisão concorrente, aplicação/replay e rollback do lote diante de limite de prazo em outro contrato.
- Banco de horas exercita quatro casas decimais, replay entre operadores, alocação única, déficit sem gravação parcial e limites diários agregados. O extrato do Portal não mistura demonstração/homologação/produção, nem presume escopo de entradas legadas.
- Dez testes RH aprovados após os ajustes de somatório diário e estorno compensatório. O teste PostgreSQL verifica bloqueio de estorno de crédito consumido, estorno de débito/crédito, replay sem duplicação, divergência de fundamento e preservação da entrada original.
- ESLint aprovado nos serviços RH, operações, dependentes, ponto alterado, nova rota Portal e testes. `npm run build` completo aprovado, incluindo TypeScript, coleta de dados e geração das rotas. As dez fases permanecem parciais conforme a tabela, com pendências internas explícitas.
- Regressão SST→Folha reexecutada neste incremento: 14 testes aprovados em `sst-functional-payroll-origin`, `sst-functional-leave-posting` e `sst-benefits-posting`. `git diff --check` aprovado após atualização documental.

### Continuidade — campos configuráveis do contrato funcional (F1 / FOL-001 parcial)

- Regra JSON `CAMPOS_CONTRATO` no conjunto do regime, validada em Parametrizações e no serviço contratual. Tipos TEXTO/INTEIRO/DECIMAL/DATA/BOOLEANO/OPCAO, obrigatoriedade, limites e opções explícitos; códigos desconhecidos e datas civis inválidas são rejeitados. Comparação numérica usa inteiros escalados, preservando quatro casas e limites grandes.
- `/rh/operacoes`: formulário gera campos conforme o regime selecionado e confere hash da definição antes de salvar; não aceita ficha aberta com definição alterada. Valores e definição oficial da regra ficam em `details` e no snapshot da revisão, preservando demais informações adicionais.
- Reajustes/alterações coletivas reaproveitam a validação e mantêm os valores configuráveis. Retirada de um campo histórico ou desativação da política bloqueia alterações que descartariam os dados e exige saneamento explícito.
- Consulta por código/valor exato, totais e paginação de 20. Exportação integral de contratos CSV/XLSX/PDF respeita o mesmo filtro e inclui os valores configuráveis. Consulta/exportação de contratos usa a última revisão cadastrada; revisões anteriores continuam na ficha histórica.
- Onze testes RH aprovados, incluindo limites decimais grandes, booleans falsos, tipos/opções/datas, valores inválidos sem criação parcial, parâmetros alterados, revisões preservadas e filtros/exportação. ESLint aprovado. Checagem TypeScript identificou incompatibilidade de literais BigInt com o target do projeto, corrigida para construção via `BigInt()`. `npm run build` completo aprovado após a correção, incluindo TypeScript, coleta de dados e geração das rotas.
- Este incremento usa tabelas e revisões existentes; nenhuma migration nova foi necessária. FOL-001 e F1 continuam parciais pelas demais pendências da matriz.

### Continuidade — quadro de cargos, ocorrências e pasta funcional (F1)

- `QUADRO_CARGOS` reutiliza cargos centrais (`Role`) e conjuntos/regimes RH. Vigências explícitas definem vagas autorizadas, enquadramento, CBO, escolaridade, leis, atribuições, competências, referências GED e escala por níveis/posição vertical-horizontal/salário/jornada. `/rh/quadro-cargos` confere ocupação máxima e disponibilidade mínima por vigência, com filtros, totais e paginação de 20.
- Gravação de contrato/revisão confere enquadramento exato e vagas em todos os trechos temporais alcançados, incluindo contratos futuros e regimes que compartilham o conjunto. Locks por conjunto serializam uso de vagas; lotes validam o estado final após gravar todas as revisões na mesma transação. Falha reverte contrato/revisão/lote. Definição do quadro fica no snapshot contratual; desativação da política não autoriza descartar o histórico.
- Testes verificam excesso de vagas, centavo incompatível na escala, troca de ocupante na fronteira civil sem dupla ocupação, prorrogação inválida com rollback e reajuste de dois contratos para tabela futura, sem rejeitar um estado intermediário do lote. FOL-014/015 seguem parciais: referências e escalas disponíveis, mas progressão automática e a jornada completa de anexos/cadastro ainda precisam de ampliação.
- `/rh/ocorrencias`: advertência/elogio/multa/outra, motivo/data/ato/observação e documentos GED. Registros e cancelamentos compensatórios usam origem única e payload imutável; repetição com dados diferentes é rejeitada. Atos vinculados não podem ser editados/excluídos pelas actions RH. Ocorrência de multa registra valor, sem inferir desconto na folha.
- Documentos de outro titular ou de Saúde/SST clínico são rejeitados na vinculação; anexar exige acesso ao GED na action. Testes cobrem replay entre operadores, data inválida, anexo ausente/protegido, guarda do ato e cancelamento sem alteração da ocorrência original.
- `/rh/pasta-funcional/[employeeId]` agrega contratos/revisões, atos, documentos da pessoa central, ocorrências (inclusive canceladas) e entradas de direitos. Todas as seções têm filtros/totais/paginação de 20. Documentos dependem de acesso ao GED; arquivos clínicos/atestados permanecem em Saúde/SST. A ficha não cria cópias dos registros nem expõe URLs de arquivos de origem.
- Doze testes RH e catorze de regressão SST→Folha aprovados em execução sequencial final (**26/26**). ESLint aprovado e TypeScript aprovado após regenerar o cliente Prisma do schema compartilhado. `npm run build` completo aprovado, incluindo as rotas de quadro de cargos, ocorrências e pasta funcional. Não foram criadas migrations neste incremento.

## Cemitérios

Nesta continuidade, as duas migrations cemiteriais foram novamente conferidas: `APPLIED_CHECKSUM_VERIFIED`. Os **18 testes** passaram. O navegador retornou `[browser.disconnected]`; visual, percurso autenticado e impressão seguem pendentes, assim como parâmetros/fundamento legal municipais. Roteiro: `CEMITERIOS_AMBIENTE_E_HOMOLOGACAO.md`.
