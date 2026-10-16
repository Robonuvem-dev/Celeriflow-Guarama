# RH, Folha de Pagamento e eSocial — diagnóstico e plano de desenvolvimento para a POC

> **Execução iniciada após aprovação deste plano.** Esta matriz preserva o diagnóstico original. Consulte `RH_FOLHA_EXECUCAO.md` para entregas, migrations, integração recebida de SST, testes e pendências. As dez fases ainda não estão concluídas.

> **Incremento POC documental:** referências antigas/novas e estimativas autorizadas alimentam `/rh/poc`, o motor IRRF 2026, folhas especiais fecháveis no escopo demonstrativo, mescla de férias, calendários civis, diárias e modelos de remessa/informe anual. Fórmulas, fontes e limites estão em [RH_FOLHA_PARAMETROS_ESTIMADOS_POC.md](RH_FOLHA_PARAMETROS_ESTIMADOS_POC.md). A classificação histórica abaixo não foi promovida a atendimento integral por existência de modelos ou dados fictícios.

## 1. Fonte, escopo e conclusão

**Data:** 11/10/2026. **Base analisada:** `a9a6b11` (`main`, `cemiterio`), diretório limpo no início da análise.

**Fonte primária:** `docs/Termo de Referencia/Checklist real POC MÓDULOS EXECUTIVO e CAMARA.pdf`, páginas do arquivo PDF:

- **70–85 — Gestão de Folha de Pagamento: 114 requisitos**, numerados 1–114. Começa depois de Frota na página 70; termina antes de SST, iniciado na página 86.
- **96–98 — Gestão e-Social: 20 requisitos**, numerados 1–20. Começa depois do item 74 de SST; termina antes de IPTU na página 98.
- A matriz abaixo corresponde ao **Executivo de Ibema**. As seções posteriores da Câmara não foram somadas nem tratadas como novos requisitos deste diagnóstico.

**Conclusão:** há uma base reutilizável de RH, parametrizações e Portal do Servidor, mas ainda não há motor integral de folha nem ciclo operacional eSocial demonstrável. Não basta acrescentar telas: é necessário completar vínculos funcionais, cálculos rastreáveis, históricos, benefícios e integrações transacionais. A meta do plano é demonstrar **114/114 de Folha e 20/20 de eSocial**, respeitando vigência e aplicabilidade de obrigações históricas.

Este documento é **análise estática e planejamento**. As classificações não equivalem a homologação, teste de transmissão, validação de banco implantado ou aprovação pela comissão. Nesta atividade foi criado somente este plano; não foram alterados RH, Folha, Portal, SST, serviços compartilhados ou migrations.

### Critério de classificação

- **C:** cobertura integral localizada, ainda sujeita à homologação. Nenhum requisito foi classificado C apenas por existência de cadastro, coluna, menu ou infraestrutura genérica.
- **P:** implementação parcial concreta relacionada ao requisito; falta parte do fluxo, dos campos, da integração ou da evidência. **Não contar como atendido na POC.**
- **N:** rotina específica não localizada nas fontes revisadas. Componentes transversais eventualmente reutilizáveis não mudam esse diagnóstico.
- **F0–F9:** fase de execução detalhada na seção 8. Cada linha da matriz define o incremento e seu aceite, a partir da exigência original, resumida sem eliminar subrequisitos.

**Resumo do diagnóstico conservador:** Folha: **26 P e 88 N**; eSocial: **1 P e 19 N**. Nenhum item tem cobertura integral comprovada nesta análise. Isso não significa ausência de base técnica: as partes existentes e sua reutilização estão descritas abaixo. As matrizes foram conferidas quanto à sequência dos **114 + 20 IDs**, sem omissões ou duplicações.

## 2. O que já existe e o que efetivamente faz

### Evidências de código usadas nas matrizes

| Ref. | Fontes conferidas | Capacidade existente e limite |
|---|---|---|
| E1 | `prisma/schema.prisma`: `Employee`, `Person`, `Role`, `Department`, `AdministrativeUnit`; `src/app/app-domain/rh/servidores/actions.ts`, `servidores/page.tsx`; `src/app/app-domain/administracao/servidores/actions.ts` | Servidor compartilhado com Administração, cargo, secretaria, departamento, jornada mensal e salário base. `Employee.personId` é opcional e único, mas o formulário/action de RH grava nome/CPF/contatos diretamente em Employee e não exige o cadastro único. Não há contrato funcional temporal ou multivínculo. Matrícula não possui unicidade declarada no modelo. |
| E2 | `src/lib/rh/payroll-configuration.ts`; `src/app/app-domain/rh/parametrizacoes/{page.tsx,actions.ts,HrPayrollSettingsClient.tsx}`; modelos `HrPayroll*`, `HrEmploymentRegime`, `HrSocialSecurity*`, `HrVacationPolicy`, `HrCalculationPolicy` | CRUD de conjuntos de regras por vigência/escopo, rubricas, natureza eSocial, incidências, regimes/categoria eSocial, faixas previdenciárias, políticas de férias, margem/teto/arredondamento e histórico de alterações. Produção ativa é protegida contra edição nas actions; precisa robustecer garantias concorrentes e de banco. **Essas regras não são consumidas por `processPayroll`.** Fórmula controlada é validada como texto por regex, não executada por motor. Algumas conversões passam por `Number` antes de Decimal. |
| E3 | `src/app/app-domain/rh/folha/{actions.ts,FolhaForm.tsx,PayrollSimulationCard.tsx,page.tsx}`; `folha/[id]/editar/page.tsx`; `folha/eventos/*`; modelos `Payroll`, `PayrollEvent`, `PayrollItem` | Competência, quatro tipos na UI, eventos legados e itens. `processPayroll` seleciona todos os servidores ativos, procura salário/benefício pelo nome do evento, exclui itens antigos e grava novos, usando Float; fecha a folha ao final. Não avalia fórmula, regime, faixas, férias, ponto ou previdência. Não envolve o processamento inteiro em transação, não verifica fechamento no servidor e não preserva versões de cálculo. UI chama isso de simulação, mas **altera a folha real e a fecha**. Status Fechada/Paga pode ser enviado pelo formulário. |
| E4 | `src/app/app-domain/rh/ferias/actions.ts`, `licencas/actions.ts`, `ponto/actions.ts`; modelos `Vacation`, `Leave`, `AttendanceRecord` | CRUD de períodos aquisitivos/gozo simples, afastamento por datas/tipo/motivo/status e registro de ponto/horas. Não há ledger de direitos/baixas, cálculo financeiro, conflito bidirecional férias/afastamentos ou banco de horas conectado à folha. Leave vinculado a perícia SST é protegido contra edição/exclusão por RH. |
| E5 | `src/app/app-domain/rh/dependentes/*`, `beneficios/*`, `atos/*`, `servidores/benefitActions.ts`; modelos `Dependent`, `BenefitConfig`, `PayrollBenefit`, `PersonnelAct` | Dependente com flags IRRF/salário-família, benefício e fornecedor, valor genérico, ato com número/data/URL. Faltam políticas etárias/documentais, vigências completas, cálculo legal de benefícios, pensão alimentícia e vinculação automática de atos às movimentações. |
| E6 | `src/lib/portal-servidor/access.ts`; `src/app/app-domain/portal-servidor/{folha,ficha-funcional,ferias,ponto,beneficios,documentos}/page.tsx`; `arePortalPayrollStatementsEnabled` em E2 | Consulta pessoal resolvida exclusivamente por `context.user.employeeId`, exigindo Employee ativo e módulo PORTAL_SERVIDOR. Folha filtra itens próprios de competências Fechada/Paga, com paginação 20; totais são explicitamente da página, não holerite integral. Habilitação genérica existe, mas não liberação por tipo/regime/data futura. Documentos lista solicitações de assinatura, não uma pasta funcional agregada nem emissão completa de recibos. |
| E7 | `src/lib/integrations/{registry.ts,runtime.ts,contract.ts}` | Catálogo ESOCIAL, DIRF_SEFIP, CNAB e outros; logs/envelopes genéricos. **ESOCIAL aceita somente MOCK**; política bloqueia PRODUCAO e não habilita Produção Restrita. Não há operação específica de envio/consulta eSocial no union, nem gerador XML/lotes/recibos/worker. O catálogo possui TCE-PB/SAGRES: não comprova atendimento ao tribunal do Paraná. |
| E8 | `src/lib/financeiro/index.ts`, `retencoes.ts`, `report-delivery.ts`; modelos financeiros e `CostCenter` | Serviços centrais reais de despesas, reservas, empenhos, liquidações, pagamentos, retenções e contabilidade, com Decimal e gates de exercício/período/saldo. Não foi localizado adaptador da Folha para esses serviços, provisões trabalhistas ou busca de autônomos a partir de empenhos para eSocial. Retenção financeira genérica não é pensão/consignado funcional. |
| E9 | `src/app/app-domain/cadastros/actions.ts`; `src/lib/identifiers/brazilian-identifiers.ts`; GED `src/lib/documents/document-flow-service.ts`; `src/lib/signatures/a1-signature-service.ts`; `src/lib/platform/{tenant-context.ts,audit-evidence.ts}` | Cadastro central já usa validação de CPF; GED, assinaturas e autenticação/auditoria são reutilizáveis. PIS/PASEP e complementos pessoais exigidos pela Folha não foram localizados no perfil central. Assinatura A1 documental existente não comprova XMLDSig/canonicalização e mTLS do eSocial. |

### Problemas estruturais prioritários

1. **Pessoa não é contrato.** `Person` deve continuar único; `Employee` permanece identidade funcional compartilhada. Criar contratos/vínculos temporais filhos, com matrícula e dados previdenciários próprios, em vez de duplicar Employee por cargo. Hoje `Person.employee` é um-para-um e `Employee.personId` é único: duplicar funcionários quebraria essa identidade e a autorização do Portal.
2. **Configuração não é cálculo.** Há rubricas novas `HrPayrollRubric` e eventos antigos `PayrollEvent`; definir migração/mapeamento explícito e consumidores. Não localizar evento por palavras como “salário”.
3. **Simular não pode fechar/processar folha.** Criar cenário isolado; cancelamento/reprocessamento devem preservar cálculo anterior e seus reflexos, não executar `deleteMany` no histórico.
4. **Fechada não significa paga/publicada.** Separar cálculo, conferência, fechamento, empenhamento, pagamento confirmado e disponibilização no Portal. A confirmação de pagamento deve vir do Financeiro; nenhum select manual deve marcar pagamento como efetivado.
5. **Integração catalogada não significa conectada.** O bloqueio atual de eSocial aos MOCKs impede os requisitos 10–12. Implementar cliente nativo de comunicação e política específica, sem liberar outras integrações genericamente.
6. **Histórico precisa de identidade estável e snapshot.** Mudança de CPF/nome/cargo/matrícula/salário/regra não pode alterar demonstrativo antigo, retorno eSocial ou conciliação já emitida.

## 3. Matriz individualizada — Folha de Pagamento (114 itens)

| ID | PDF | Exigência da POC | Hoje | Evidência | Desenvolvimento / critério de aceite | Fase |
|---|---|---|---|---|---|---|
| FOL-001 | 70 | Contratos ilimitados, admissão/nomeação/posse, regime, cargo, nível, término temporário, lotação, horário/local e campos configuráveis. | P | E1 | Multivínculo temporal completo ligado ao mesmo servidor/PF; campos operador-configuráveis; consulta paginada sem limite artificial de contratos. | F1 |
| FOL-002 | 70 | Limite de dias de contrato determinado por regime, alerta ou bloqueio. | N | — | Política versionada; testar limite exato e N+1, criação/alteração/importação. | F1 |
| FOL-003 | 71 | Anexos no funcionário e em contrato específico. | N | E9 base | Upload GED com vínculo distinto pessoa/servidor/contrato; reabrir e baixar com escopo funcional. | F1 |
| FOL-004 | 71 | Pasta funcional virtual agregando anexos de diferentes rotinas. | N | E6/E9 base | Uma ficha reúne pessoa, contrato, atos e movimentações, preservando permissões de origem. | F1/F7 |
| FOL-005 | 71 | Cadastro funcional vinculado ao cadastro único, sem redundância pessoal. | P | E1 | Seleção obrigatória de Person; saneamento dos legados e escrita canônica de documentos/endereço/contatos. | F0/F1 |
| FOL-006 | 71 | Validar CPF e PIS/PASEP da pessoa física. | P | E9 | Reutilizar CPF e acrescentar validação de dígitos PIS/PASEP em todos os caminhos de gravação/importação. | F1 |
| FOL-007 | 71 | Geolocalização do endereço e mapa de funcionários por regime/cargo/centro/local. | N | — | Endereço central georreferenciado; mapa único com mesmos filtros do relatório e escopo RH. | F1/F9 |
| FOL-008 | 71 | Regimes variados, incluindo aposentados/pensionistas, categoria eSocial. | P | E2 | Ampliar naturezas e relacionar regime vigente ao contrato; validar categorias oficiais e suas vigências. | F1/F8 |
| FOL-009 | 71–72 | Consulta com todos os filtros/colunas pessoais e funcionais; PDF, Excel e CSV. | P | E1 | Completar documentos/atributos e todos os filtros do PDF; idade/mês admissão; XLSX real, CSV e PDF integrais. | F1/F9 |
| FOL-010 | 72 | Alteração coletiva de centro/classificação/grupo empenho/local/nível/regime/salário/término. | N | — | Prévia por contrato, aplicação transacional versionada e histórico antes/depois; concorrência detectada. | F1/F5 |
| FOL-011 | 72 | Dependentes para família/IR, idade limite por parentesco. | P | E5 | Vínculo ao cadastro único, política por parentesco/data, elegibilidade no cálculo e documentos. | F1/F3 |
| FOL-012 | 72 | Estágio, datas, supervisor, escola, curso, agente e termo. | N | — | Contrato de estágio, responsáveis/entidades centrais e Termo de Compromisso PDF/GED. | F1 |
| FOL-013 | 72 | Múltiplas previdências por funcionário, matrícula/vigência, descontos/patronal/complementar. | P | E2 | Relacionamentos por contrato/vigência, regras e cálculo individual/patronal, percentuais complementares. | F1/F2/F3 |
| FOL-014 | 72 | Cargo com enquadramento/escolaridade/CBO/vagas/salário/tipo/leis/atribuições/competências/anexos. | P | E1 | Complemento versionado de Role e quadro/vagas com GED; ocupação por vínculo sem cargo duplicado. | F1 |
| FOL-015 | 72 | Níveis salariais, histórico, posições vertical/horizontal e níveis inicial/final. | N | — | Plano/níveis e valores por vigência; progressão e consulta de histórico. | F1/F5 |
| FOL-016 | 73 | Atos manuais e automáticos de afastamento/reajuste. | P | E5 | Referência GED/ato canônico; geração/vínculo atômico por fato, sem repetir ato no replay. | F1/F4/F5 |
| FOL-017 | 73 | Ocorrências: advertência/elogio/multa, motivo/data/ato/observação/anexo. | N | — | Jornada completa na ficha, com anexos e autorização por operação. | F1 |
| FOL-018 | 73 | Suspensão convertida em multa e desconto automático. | N | — | Decisão auditada gera movimento único na competência; cancelamento compensa o desconto. | F3/F4 |
| FOL-019 | 73 | Ficha completa com foto, documentos, família, previdência e todos os históricos/benefícios enumerados. | P | E1/E4/E5/E6 | Relatório consolidado com todas as seções do item 19, foto, pensões, saúde, averbações e banco de horas. | F1–F5/F9 |
| FOL-020 | 73 | Transferência por tipo/destino/motivo, deferimento/indeferimento/análise e reflexo no contrato/histórico. | N | — | Solicitação/decisão de transferência com vigência e snapshot; indeferimento não altera contrato. | F1/F7 |
| FOL-021 | 74 | Férias especiais por meses/cargo/função/regime ou indivíduo, aquisitivos automáticos. | P | E2/E4 | Conectar política ao contrato e motor de aquisição; exceções por cargo/função/servidor. | F4 |
| FOL-022 | 74 | Perdas/prorrogações de férias, licença prêmio e tempo de serviço por afastamento/regime. | N | — | Regras e ledger temporal com justificativa, fonte e recálculo compensatório. | F4 |
| FOL-023 | 74 | Aquisitivos: direitos/perdas/prorrogações/pagos/a pagar/proporcional, fontes e gozos/cálculos. | P | E4 | Saldos reconciliáveis e detalhamento dos eventos que formam cada quantidade. | F4 |
| FOL-024 | 74 | Programação de férias em dobro, janela em dias e filtros. | N | — | Data-base configurável, vencimentos e prévia individual/coletiva. | F4 |
| FOL-025 | 74 | Cálculo férias individual/coletivo/programado; múltiplos aquisitivos/gozos/pecúnias e baixas. | P | `vacation-rights.ts`, `vacation-multiple-periods.ts`, teste PostgreSQL RH | Reserva de gozo/pecúnia e grupo de múltiplos aquisitivos com saldo/fracionamento/replay/cancelamento compensatório integral disponíveis. Faltam cálculo financeiro oficial de férias, fluxos coletivos/programados e vínculo integral entre cálculo e baixas. | F3/F4 |
| FOL-026 | 74 | Relatório aquisitivos vencidos/a vencer/em dobro/próximo mês/proporcionais/baixados. | P | E4 | Todos os filtros e respectivos gozos/pecúnias, relatório integral. | F4/F9 |
| FOL-027 | 74 | Avisos e recibos de férias. | N | — | PDF/GED preenchido com período, verba, valor e versão de cálculo. | F4/F7 |
| FOL-028 | 75 | Conflito férias/afastamento validado nos dois sentidos. | N | E4 | Mesma validação temporal em criação, alteração, importação e origem externa; impedir corrida concorrente. | F4 |
| FOL-029 | 75 | Empregos anteriores e averbações separadas para ATS/licença prêmio. | P | `service-time-allowance.ts`, teste PostgreSQL RH | Averbação anterior para ATS com ato, limite de dias, prevenção de sobreposição entre vínculos e estorno disponível; completar empregos anteriores e finalidade de licença-prêmio com políticas próprias. | F1/F4 |
| FOL-030 | 75 | Consulta aquisitivos de licença prêmio com todos os saldos. | P | `service-rights.ts`, `service-right-query.ts`, Portal licença-prêmio | Ledger por dias contáveis, suspensão/reinício, reservas/fracionamento/pecúnia/cancelamento e consulta própria paginada por aquisitivo/escopo disponíveis; completar averbações, exceções/calendários/transições e relatório integral específico. | F4 |
| FOL-031 | 75 | Múltiplos gozos e gozo/pecúnia no mesmo aquisitivo de licença prêmio. | P | `service-rights.ts`, teste PostgreSQL RH | Reservas de gozo e pecúnia coexistem com limite/fracionamento/saldo/replay e cancelamento compensatório; completar cálculo financeiro da pecúnia e baixas integradas à folha. | F3/F4 |
| FOL-032 | 75 | Certidão de Tempo de Serviço. | N | — | Emissão parametrizada com períodos computáveis e atos de averbação; PDF/GED/assinatura. | F4/F9 |
| FOL-033 | 75 | Média das 80% maiores remunerações. | N | — | Seleção e ordenação rastreáveis do histórico, correção quando aplicável e memória no relatório. | F5/F9 |
| FOL-034 | 75 | Estoque e valor mensal de previdência complementar. | N | — | Histórico temporal de estoque/fluxos e incidência na folha. | F1/F3 |
| FOL-035 | 75 | Reajustes de níveis/salários/verbas fixas/cargos/complementar/comissionado/função. | N | — | Lote com escopo, vigência, lei, prévia, todas as bases e aplicação versionada. | F5 |
| FOL-036 | 76 | Cancelar reajuste e reajuste negativo. | N | — | Reversão vinculada à versão original, concorrência e compensação em folhas já fechadas. | F5 |
| FOL-037 | 76 | Descontos parcelados e consignados. | N | — | Contrato, parcelas, saldo, vigência, limites e baixa por pagamento confirmado. | F3/F5 |
| FOL-038 | 76 | Importação de consignados conforme layout. | N | — | Layout versionado, validação/prévia/erros e idempotência por arquivo/linha/parcela. | F5 |
| FOL-039 | 76 | Web service com gestores de consignados. | N | — | API autenticada/contrato do convênio, margem reservada, descontos e retornos sem arquivos. | F5/F7 |
| FOL-040 | 76 | Empresas/linhas VT e código da verba de desconto. | P | E5 | Fornecedor central, linhas/tarifas vigentes, mapeamento inequívoco de rubrica. | F3 |
| FOL-041 | 76 | Quantidade VT diária/mensal, semana ou horário. | N | — | Relacionamento por linha/contrato, calendário e jornada efetiva. | F3/F4 |
| FOL-042 | 76 | Ajuste VT por competência preservando padrão e histórico. | N | — | Movimento adicional/dedução isolado, referência e autor. | F3 |
| FOL-043 | 76 | Configurar VT como provento. | N | — | Regra por regime/benefício com rubrica e incidências versionadas. | F2/F3 |
| FOL-044 | 76–77 | Calcular VT, teto desconto, excluir férias/afastamentos e custos funcionário/entidade. | N | — | Memória diária por linha e três totais conciliados; parâmetros legais vigentes. | F3/F4 |
| FOL-045 | 77 | Gerar desconto VT para folha. | P | E3/E5 | Substituir desconto genérico por resultado calculado com origem e unicidade. | F3 |
| FOL-046 | 77 | Afastamento com motivo/datas/ato/competência/observação. | P | E4 | Catálogo tipado, contrato e ato; competência de reflexo e histórico, preservando vínculos SST. | F1/F4 |
| FOL-047 | 77 | Restrição por sexo no motivo de afastamento. | N | — | Política configurável com regra aplicável e mensagem; validar sem hardcode geral na UI. | F4 |
| FOL-048 | 77 | Abono de faltas descontadas e ressarcimento automático por competência. | N | — | Vincular desconto original, impedir ressarcimento duplicado e registrar crédito. | F3/F4 |
| FOL-049 | 77 | ATS automático e relatório de mudanças percentuais no mês. | P | `service-time-allowance.ts`, motor mensal, teste PostgreSQL RH | Apuração explícita seleciona automaticamente faixa por dias/averbações/afastamentos, salário temporal e rubrica, com memória/estorno e revalidação ao calcular/fechar; completar agendamento, ajustes intramês/retroativos e relatório de mudanças percentuais. | F3/F4 |
| FOL-050 | 77 | Nove tipos de folha e seleção por matrícula/nome/cargo/regime/local/centro/função/admissão. | P | E3 | Mensal, complementar, rescisão, RRA, férias, 1ª parcela 13º, 13º, diferença 13º e adiantamento salarial com cálculo próprio e todos os filtros. | F2/F3/F5 |
| FOL-051 | 77 | Consulta detalhada de cálculo sem imprimir. | P | E3/E6 | Ficha por contrato/competência/execução com itens, bases, encargos e líquido integral. | F2/F9 |
| FOL-052 | 78 | Histórico cálculo/cancelamento: hora/usuário/verbas/valores/referências. | P | E3 | Execuções imutáveis; datas dos itens atuais não substituem registro do cancelamento e autor. | F2 |
| FOL-053 | 78 | Memória de fórmula e valores por verba. | N | E2 texto | AST seguro, etapas intermediárias, parâmetros/origens e fórmula resolvida no snapshot. | F2 |
| FOL-054 | 78 | Consulta incidências previdência/IR por folha. | P | E2 | Bases efetivamente calculadas por rubrica/regime/previdência, reconciliáveis aos descontos. | F2/F9 |
| FOL-055 | 78 | Pagamento proporcional aos dias em centro de custo/função. | N | — | Fatiar vigências do contrato na competência, alocação e memória dos dias. | F1/F2 |
| FOL-056 | 78 | Rescisão individual/coletiva por término, férias/13º automáticos. | N | E3 rótulo | Jornada de desligamento por vínculo/regime com direitos/saldos e filtros. | F5 |
| FOL-057 | 78 | TRCT. | N | — | Documento preenchido a partir da execução aprovada; versão/hash/GED. | F5 |
| FOL-058 | 78 | Pedido de desligamento/aviso prévio com documento assinado. | N | — | Protocolo, datas, aprovação e solicitações de assinatura legítimas. | F5/F7 |
| FOL-059 | 78 | Simular rescisão em consulta separada, sem desligar/refletir. | N | E3 inadequado | Cenário persistido isoladamente sem alterar servidor, direitos, financeiro, Portal ou eSocial. | F2/F5 |
| FOL-060 | 79 | Reintegração judicial/administrativa na mesma matrícula. | N | — | Novo ciclo do vínculo e ato, restauração temporal e reflexos sem reescrever desligamento antigo. | F5/F8 |
| FOL-061 | 79 | Salário-família automático. | N | E5 flags | Elegibilidade/faixas/documentos e proporcionalidade por dependente, com memória. | F3 |
| FOL-062 | 79 | Fórmula de cada verba por regime e incidência IRRF. | P | E2 | Especialização por regime/vigência, avaliação efetiva e snapshot de bases. | F2 |
| FOL-063 | 79 | Incidências de previdência/FGTS por verba, previdência e regime. | P | E2 | Completar chave de incidência e calcular RGPS/RPPS/complementar/FGTS conforme vínculo. | F2 |
| FOL-064 | 79 | Resumo por tipo/funcionário, regime/grupo empenho/centro/local e encargos. | N | E3 total | Relatório detalhado de cada verba e bruto/descontos/líquido/patronal/FGTS por agrupamento. | F6/F9 |
| FOL-065 | 79 | Verbas variáveis individuais/coletivas com observação. | N | — | Movimentos por competência/contrato/rubrica e referência, validação e prévia coletiva. | F3 |
| FOL-066 | 79 | Verbas fixas com vigência, lançamento individual/coletivo, observação/ato. | N | — | Vincular rubrica/ato/vigência, encerrar automaticamente e respeitar proporcionalidade. | F3 |
| FOL-067 | 79–80 | RRA com processo/períodos/sugestão rateada e edição. | N | — | Meses/valores/deduções e tributação própria de RRA com memória e ato. | F5 |
| FOL-068 | 80 | Líquidos por banco/agência/nome/matrícula/CPF/conta. | N | — | Dados bancários por beneficiário, totais reais e filtros; folha aprovada como fonte. | F6/F9 |
| FOL-069 | 80 | Recibo por tipo/regime/cargo/banco/centro/local. | N | E6 lista | Holerite integral PDF por vínculo/cálculo, com filtros de emissão e escopo Portal. | F7/F9 |
| FOL-070 | 80 | Mensagens nos recibos, gerais ou específicas. | N | — | Mensagem versionada por público/vigência e snapshot da emissão. | F7 |
| FOL-071 | 80 | Empenho automático na Contabilidade sem digitação/arquivo. | N | E8 base | Adaptador idempotente de folha/encargos por grupo, dotação, fonte e credor; respeitar reserva/saldo. | F6 |
| FOL-072 | 80 | Planilha contábil da folha e encargos. | N | — | Mesmos agrupamentos/valores do empenhamento, conciliados ao cálculo e documento financeiro. | F6/F9 |
| FOL-073 | 80 | Retido e patronal RGPS/RPPS. | N | E2 cadastro | Relatórios por contrato/previdência/base/faixa/competência e vínculo aos encargos. | F2/F6/F9 |
| FOL-074 | 80 | Pensão alimentícia com beneficiário/datas/banco/desconto automático. | N | — | Ordem/ato e bases, beneficiário central e cessação por data, pagamento rastreável. | F3/F6 |
| FOL-075 | 80 | Vários dependentes de pensão por funcionário. | N | — | Relações simultâneas e distribuição por beneficiário sem duplicação de desconto. | F3 |
| FOL-076 | 81 | Consultar pensão calculada. | N | — | Base, fórmula e valor por beneficiário na competência. | F3/F9 |
| FOL-077 | 81 | Recibo pensionista com instituidor/beneficiário/responsável/valores. | N | — | Documento próprio; autorização do beneficiário não decorre de ter acesso do instituidor. | F6/F7/F9 |
| FOL-078 | 81 | Cadastro/autorização de diárias de viagem. | N | — | Solicitação, destino/período/ato, cálculo/autorizações e PDF/GED. | F6 |
| FOL-079 | 81 | INSS/IRRF correto para dois cargos. | N | — | Agregar vínculos pela pessoa e regras de competência/pagamento, teto/deduções/rateio rastreáveis. | F2 |
| FOL-080 | 81 | Salários de contribuição INSS por funcionário. | N | — | Histórico de base e contribuição, inclusive teto/múltiplos vínculos. | F2/F9 |
| FOL-081 | 81 | Comissionado e diferença sobre cargo efetivo. | N | — | Relacionamento temporal, regra de opção/diferença e cálculo automático sem somar indevidamente. | F1/F3 |
| FOL-082 | 81 | Médias férias/13º/licença por referência/valor/valor reajustado/tabela. | N | — | Janela e critérios versionados, seleção de verbas e atualização monetária com memória. | F4/F5 |
| FOL-083 | 81 | Margem consignável por líquido/bruto/base, deduções e contratos existentes. | P | E2 percentual | Motor de margem com bases selecionadas, reserva/saldo/concorrência e explicação ao servidor. | F5/F7 |
| FOL-084 | 81–82 | Emissão de margem no Portal por banco, carência ou liberação manual RH. | N | — | Reserva/validade por banco, cronômetro de carência, ato de liberação e controle idempotente. | F5/F7 |
| FOL-085 | 82 | Provisões férias/13º/licença e contabilização automática. | P | `payroll-provisions.ts`, teste PostgreSQL RH | Apropriação explícita mensal por rubricas/taxas, remuneração/patronal separados, memória e estorno no ledger disponíveis; completar automatização e integração contábil patrimonial. | F4/F6 |
| FOL-086 | 82 | Baixa provisões junto com empenhamento. | P | `provision-commitment.ts`, teste PostgreSQL RH | Baixa explícita por apropriação ligada a empenho nativo/despesa RH/cálculo oficial de produção, com saldo/limite/replay/rollback e devolução após anulação integral; completar disparo automático no empenhamento, classificação/rubricas/parcelas e razão patrimonial. | F6 |
| FOL-087 | 82 | Memória por verba do cálculo de provisão. | P | `payroll-provisions.ts`, ledger e teste Decimal | Snapshot de base/itens/percentuais/remuneração/patronal/versão preservado; completar detalhe operacional específico e conciliação ao lançamento patrimonial. | F2/F6 |
| FOL-088 | 82 | Estorno/ajuste provisões ao empenhar rescisão. | N | — | Compensação vinculada a provisões originais, nunca eliminação de saldo histórico. | F5/F6 |
| FOL-089 | 82 | Saldos provisão por funcionário/tipo, verbas/baixas/ajustes/estornos. | N | — | Extrato reconciliável ao ledger e lançamentos contábeis. | F6/F9 |
| FOL-090 | 82 | Importar diárias da Contabilidade diretamente para folha. | N | E8 base | Contrato de integração por origem/revisão, evitar duplicar valores já pagos e definir natureza informativa/tributável. | F6 |
| FOL-091 | 82 | E-mail ao responsável do centro ao calcular férias. | N | — | Outbox pós-commit, responsável vigente e registro de envio/retry sem recalcular férias. | F4/F7 |
| FOL-092 | 82 | Relatório funcionários com dois contratos. | N | E1 identidade | Consulta multivínculo real por PF/servidor com períodos simultâneos e contratos históricos. | F1/F9 |
| FOL-093 | 83 | Importar verbas variáveis por layout. | N | — | Prévia/erros por linha/rubrica/vínculo, autoria/hash e replay; não confundir com importação de ponto. | F3 |
| FOL-094 | 83 | Importar verbas fixas por layout. | N | — | Vigências/atos/rubricas validados e histórico por lote. | F3 |
| FOL-095 | 83 | Produtividade da Fiscalização mensal como verba variável. | N | E8/E9 base | Resultado aprovado do domínio de fiscalização, identidade funcional, regra e origem única por competência. | F3/F6 |
| FOL-096 | 83 | Restringir login por férias/rescisão/afastamento/jornada. | N | E9 autenticação | Política do acesso operacional na sessão e nas actions/APIs; distinguir autoatendimento autorizado do Portal. | F0/F7 |
| FOL-097 | 83 | Relatório cedidos/recebidos: período/local/ato. | N | — | Cessão/disposição temporal e responsabilidades de ônus, com relatório. | F1/F9 |
| FOL-098 | 83 | Função com motivo/datas/ato e campos configuráveis. | N | E1 Role simples | Relacionamento de função por contrato/vigência com extensões operador-configuráveis. | F1 |
| FOL-099 | 83 | Função gratificada por referência/percentual/período e campos configuráveis. | N | — | Designação temporal e regra de rubrica, incremento calculável e anexos/atos. | F1/F3 |
| FOL-100 | 83–84 | Recebidos por disposição sem contrato local, Transparência e eSocial. | N | — | Registro de disposição sem fabricar admissão local, categoria/ônus e adaptadores de publicação/envio. | F1/F8/F9 |
| FOL-101 | 84 | Vale-alimentação por configuração e direito do funcionário. | P | E5/E3 | Regra de concessão, vigência, dias/descontos e cálculo efetivo; valor genérico não atende integralmente. | F3 |
| FOL-102 | 84 | Alterar matrícula para código ainda não usado. | P | E1 editável | Unicidade por entidade/vínculo, histórico e preservação dos identificadores eSocial, Portal e Financeiro. | F1 |
| FOL-103 | 84 | Solicitação automática de acesso ao Portal ao cadastrar funcionário. | N | E6 base | Fluxo de convite/solicitação vinculado à identidade Firebase verificada e PF; sem senha/conta fictícia. | F1/F7 |
| FOL-104 | 84 | Função gratificada automática para determinados cargos na admissão. | N | — | Regra de enquadramento vigente, ato e relacionamento único. | F1/F3 |
| FOL-105 | 84 | Nível salarial inicial automático na admissão. | N | — | Plano/cargo/vigência e escolha rastreável no contrato. | F1 |
| FOL-106 | 84 | Alerta verba variável para funcionário comissionado. | N | — | Aviso calculado no servidor e prévia/importação, conforme política do regime. | F3 |
| FOL-107 | 84 | Alerta verba variável para funcionário com função gratificada. | N | — | Mesma política considerando designação vigente na competência. | F3 |
| FOL-108 | 84 | Publicar recibo por tipo/regime antes de encerrar ou em data futura depois do encerramento. | P | E6/E2 | Gate de publicação por cálculo aprovado/tipo/regime/data; liberar exceção sem expor rascunho ou simulação. | F7 |
| FOL-109 | 85 | Campanha de recadastramento no Portal, público/período/conclusão. | N | — | Campanha, convocação, pendências, formulário e protocolos por servidor. | F7 |
| FOL-110 | 85 | Atualizar campos pessoais/contatos/endereço/empregos após deferimento RH. | N | E9 base | Proposta e diff versionados, revisão humana, atualização canônica transacional e trilha das alterações. | F1/F7 |
| FOL-111 | 85 | Documentos dependente e validade cessando salário-família. | N | E5 flags | GED/validade/elegibilidade efetiva, aviso e cessação automática no cálculo. | F3/F7 |
| FOL-112 | 85 | Residente no exterior, campos fiscais/RFB. | N | — | Residência fiscal/país/datas/documentos e tributação correspondente no cálculo/eventos. | F1/F2/F8 |
| FOL-113 | 85 | Complementos IRRF da folha para pagamentos eSocial: dependentes/pensões/saúde/complementar. | N | E5 base | Snapshot por pagamento efetivo e beneficiário, consulta e mapeamento ao S-1210. | F2/F3/F6/F8 |
| FOL-114 | 85 | CADPREV nacional: ativos, aposentados, pensionistas, exonerados/falecidos e dependentes. | N | — | Modelo populacional completo, exportação versionada dos grupos previstos e validador do layout oficial. | F8/F9 |

**Detalhamento obrigatório de FOL-009:** nome, idade, CPF, RG, PIS/PASEP, título eleitoral, CTPS, CNH, nacionalidade, sangue/fator RH, sexo, estado civil, olhos/cabelo, tipo de aposentadoria, cor da pele, mês da admissão, nascimento, cargo, local, endereço, e-mail e telefone. Esses campos devem ser filtráveis e disponíveis como colunas/exportação, não apenas gravados em JSON invisível.

**Detalhamento obrigatório de FOL-019:** reproduzir a lista integral da fonte: foto, documentação, dependentes, endereço/contatos, previdências/cargos, afastamentos/faltas, licença prêmio/férias, atos, empregos anteriores, locais/centros, comissionados/funções gratificadas, verbas fixas, conselho de classe, VT/VA, ocorrências/transferências, pensões, planos de saúde, alterações salariais/ATS e banco de horas.

## 4. eSocial: exigências e comparação com o existente

### 4.1 Relação direta com Folha

- **FOL-008:** categoria eSocial por regime/vínculo, já há campo de configuração, falta vínculo operacional e validação oficial.
- **FOL-100:** servidores recebidos por disposição, inclusive sem contrato local; deve haver geração eSocial e publicação pertinente na Transparência.
- **FOL-113:** complementos IRRF destinados ao evento de pagamentos. Dependentes, pensões, planos de saúde e previdência complementar precisam estar no cálculo/pagamento, com valores e períodos corretos.
- Admissões, alterações, afastamentos, desligamentos/reintegrações, rubricas e remunerações alimentam o motor eSocial. O termo “eSocial” em marketing, natureza de rubrica ou cadastro de conector não demonstra envio aceito.

### 4.2 Matriz individualizada — Gestão eSocial (20 itens)

| ID | PDF | Exigência da POC | Hoje | Evidência | Desenvolvimento / critério de aceite | Fase |
|---|---|---|---|---|---|---|
| ESO-001 | 96 | Gerar/exportar DIRF. | N | E7 catálogo | Exportador histórico versionado por ano/layout, validação e evidência; separar aplicabilidade atual. | F8 |
| ESO-002 | 96 | Comprovante anual de rendimentos do funcionário. | N | — | Consolidar rendimentos/pagamentos/retenções/deduções por PF e ano; PDF/GED e Portal. | F7/F8 |
| ESO-003 | 96 | Exportar SEFIP/GFIP. | N | E7 catálogo | Layout e competência, validador e reconciliação; histórico quando obrigação não vigente. | F8 |
| ESO-004 | 96 | Exportar para Tribunal de Contas do estado. | N | E7 | Definir TCE-PR e leiaute exigido pelo município; conector SAGRES/PB não substitui esse requisito. | F8 |
| ESO-005 | 96 | Exportar MANAD. | N | — | Dados funcionais, rubricas e contabilidade reconciliados no leiaute da obrigação aplicável. | F8 |
| ESO-006 | 96 | Configurar/exportar SIOPE e relatório de conferência. | N | — | Classificação de vínculos/despesa de educação, exportação e comparação com folha/contabilidade. | F6/F8 |
| ESO-007 | 96 | Exportar/importar qualificação cadastral em lote. | N | — | Arquivos/público/retornos/correções; confirmar disponibilidade oficial do serviço para o período solicitado. | F1/F8 |
| ESO-008 | 96 | Consistências da base e sugestão de correção. | N | — | Validações por evento/campo e links ao dado de origem; bloqueio explicável antes da geração. | F1/F8 |
| ESO-009 | 96 | Consultar regras/origem por evento/campo. | N | — | Catálogo versionado de mapeamento, regra, tabela, fonte e vigência, visível ao operador. | F8 |
| ESO-010 | 96–97 | Gerar/assinar/enviar/receber eventos em Produção conforme obrigatoriedade. | N | E7 bloqueia | Cliente nativo XML/XSD/XMLDSig/mTLS, lotes, recibos, retornos oficiais; produzir evidência legítima do ciclo. | F8 |
| ESO-011 | 97 | Mesmo ciclo em Produção Restrita independente. | N | E7 bloqueia | tpAmb, endpoints, IDs, sequências/lotes/recibos separados; não contaminar Produção. | F8 |
| ESO-012 | 97 | Base e sistema únicos, sem integrador externo para qualquer etapa. | N | E7 base | Gerador, assinatura, cliente e worker próprios do ERP; serviço HTTP externo intermediário não atende. | F8 |
| ESO-013 | 97 | Lotes automáticos conforme regras eSocial. | N | — | Dependências, grupos/limites e tamanho conforme layout, sem agrupar eventos incompatíveis. | F8 |
| ESO-014 | 97 | Preservar XML de eventos/lotes assinados e retornos. | N | E9 GED base | Bytes/hash, versão, download autorizado e relação ao recibo/origem, sem regenerar passado. | F8 |
| ESO-015 | 97 | A1 no repositório, assinatura/envio por computador de usuário autorizado. | P | E9 A1 base | Reutilizar custódia/autorizações de certificado; implementar XMLDSig e mTLS corretos, sem expor chave/senha. | F0/F8 |
| ESO-016 | 97 | Processar retornos automaticamente sem consulta manual. | N | — | Worker persistente de polling com backoff, locks, estados e recuperação após reinício. | F8 |
| ESO-017 | 97 | Agendar tabelas/não periódicos em Produção. | N | — | Outbox e agendador por ambiente/público/evento, alteração detectada e reenvio idempotente. | F8 |
| ESO-018 | 97 | Buscar autônomos por empenhamento contábil para eSocial. | N | E8 base | Identificar PF/remuneração/pagamento/classificação do empenho, cadastro TSVE e eventos adequados. | F6/F8 |
| ESO-019 | 98 | Relatórios de retornos periódicos INSS/FGTS/IRRF. | N | — | Persistir/interpretar totalizadores e conciliar ao cálculo/financeiro com divergências. | F8/F9 |
| ESO-020 | 98 | Processos trabalhistas conforme leiautes e envio Produção. | N | — | Cadastro/processo/decisão/cálculo, eventos aplicáveis e retorno oficial por versão. | F5/F8 |

### 4.3 Catálogo inicial de eventos a projetar

**Incremento interno de preparação F8 (11/10/2026):** `src/lib/rh/obligation-history.ts` e `/api/rh/obrigacoes/historico` oferecem exportação JSON integral por ano/escopo/acesso orçamentário, com identidade histórica, rubricas/bases/totais e hashes determinísticos. Teste PostgreSQL confere 501 demonstrativos em três lotes, totais Decimal, memória de identidade, repetição e isolamento dos filtros. Esse formato é evidência de conferência por competência, não layout específico de ESO-001/003/004/005/006, informe fiscal ESO-002 ou transmissão ESO-010/011; esses requisitos mantêm suas pendências.

**Lista de trabalho, a validar por natureza do vínculo, empregador e leiaute vigente; não implica obrigatoriedade universal nem implementação atual.**

| Origem | Famílias/eventos candidatos | Regra arquitetural |
|---|---|---|
| Ente/estabelecimentos/rubricas/lotações/processos | S-1000, S-1005, S-1010, S-1020, S-1070 quando aplicáveis | Tabelas versionadas, publicação e dependências antes dos eventos consumidores. |
| Contrato/identidade/mudança funcional | S-2190, S-2200, S-2205, S-2206 | Identificador do vínculo eSocial estável; alteração da matrícula local não altera recibos antigos. |
| Sem vínculo/estágio/agentes/autônomos | S-2300, S-2306, S-2399 | Distinguir vínculo empregatício/estatutário de trabalhador sem vínculo e disposição. |
| Afastamento/desligamento/reintegração | S-2230, S-2299, S-2298 | Derivar de fatos RH aprovados, período e regra vigente; não de texto livre ou edição visual. |
| Remuneração por regime | S-1200, S-1202, S-1207 | RGPS/RPPS/benefícios de entes públicos conforme população; snapshot do cálculo efetivo. |
| Pagamentos/IRRF | S-1210 | Fonte de pagamento confirmado e complementos de IRRF; fechamento da folha não é data de pagamento. |
| Fechamento/reabertura/exclusão | S-1299, S-1298, S-3000 | Dependências/recibos, controle de competência, retificação e exclusão sem eliminar trilha. |
| Processos trabalhistas | S-2500, S-2501 e retornos aplicáveis | Dados de processo/tributos e fatos geradores conforme MOS/XSD. |
| SST | S-2210, S-2220, S-2240, conforme aplicável | Somente contrato de consumo de evidências ocupacionais aprovadas. Domínio SST continua responsável por produzir/validar seus fatos. |
| Retornos/totalizadores | S-5001/S-5002/S-5003 e consolidados aplicáveis | Conciliar valores oficiais ao contrato/cálculo/pagamento e detectar divergências. |

**Referência oficial consultada em 11/10/2026:** https://www.gov.br/esocial/pt-br/documentacao-tecnica. A página apresenta S-1.3, NT 06/2026 e NT 07/2026 revisada em 24/09/2026, com pacotes XSD e entradas em produção distintas, incluindo datas futuras de 26/10, 23/11, 14/12/2026 e 18/01/2027. Logo, selecionar versão pelo ambiente/evento/data e conservar hash do pacote; **não ativar automaticamente um XSD futuro porque é o link mais recente**. Usar também MOS, Manual do Desenvolvedor e Pacote de Comunicação publicados nessa fonte.

**Obrigações históricas:** DIRF, SEFIP/GFIP, MANAD e qualificação cadastral em lote constam expressamente do checklist. Manter cada item na matriz, confirmar competências/leiautes e disponibilidade do canal com município/comissão; quando pertinente, demonstrar geração/validação histórica e registrar a substituição normativa. Não prometer transmissão a serviço descontinuado nem excluir requisito silenciosamente. Não assumir que homologação em Produção Restrita atende por si só os itens que pedem Produção.

## 5. Integrações com outros módulos

| Integração | Situação atual localizada | Contrato/incremento necessário | Aceite verificável |
|---|---|---|---|
| Cadastro Único | Person, endereços/documentos e validação CPF; ligação Employee opcional. | Person canônico + perfil funcional; documentos complementares e recadastramento deferido escrevem no cadastro central. | Duas matrículas/contratos usam a mesma PF; dados e históricos não divergem entre RH/Portal/Cadastros. |
| Administração | Employee/Role/Secretariat/Department/AdministrativeUnit compartilhados; validação hierárquica. | Complementos funcionais, plano salarial/cargos, CostCenter/grupo de empenho e vigências; revisar ambos os formulários. | Mudança por Administração não contorna vínculo/regime/histórico do RH; antiga folha conserva lotação original. |
| Financeiro/Contabilidade | Serviços centrais com gates reais; sem origem folha específica localizada. | Adaptadores folha→despesa→reserva→empenho e encargos; liquidação/pagamento/baixa; provisões, diárias e autônomos. | Replay não duplica empenho; falta de dotação/saldo/exercício bloqueia de forma explicável; baixa contábil e folha reconciliadas. |
| Fiscalização | Domínio tributário de fiscais/atividades, sem ponte de produtividade→folha localizada. | Exportação interna do resultado aprovado, por fiscal/competência/revisão; regra de verba variável. | Reimportar não duplica; cancelamento do resultado gera ajuste rastreável, não altera folha antiga. |
| Ponto | AttendanceRecord e importação/UI de ponto; sem fechamento/reflexos. | Frequência aprovada/jornada/banco horas→horas extras/noturno/faltas/abonos e benefícios. | Competência e jornada corretas; dados não aprovados não pagam rubrica automaticamente. |
| SST | Leave possui origem ocupacional; RH protege vínculos de perícia. | Consumir afastamento/decisão vigente e contratos futuros de CAT/ASO/riscos; outbox de efeitos funcionais. | Nenhum CRUD RH altera decisão clínica; um afastamento gera um reflexo; correção/retificação compensam. **Não editar SST nesta frente.** |
| GED/Assinaturas/Protocolos | Documentos/versões/assinaturas/A1 e processos centrais. | Pasta funcional, anexos de contrato/ato, termos/avisos/recibos, requerimentos e XML eSocial por escopo. | Download exige servidor/contrato autorizado; documento emitido preserva bytes/hash/versão; assinatura legítima, sem assinatura fictícia. |
| Portal do Servidor | Autoatendimento de leitura já ligado à sessão/Employee; folha própria Fechada/Paga. | DTOs próprios, publicação por regra/data, holerites/rendimentos, solicitações, recadastramento e margem. | Servidor A não consulta vínculo de B; todos os vínculos próprios permitidos aparecem; simulação/rascunho nunca publicados. |
| Transparência | Infraestrutura pública existente; ponte RH/folha não localizada. | Snapshot publicado com campos/público autorizado e recebidos por disposição; excluir descontos/documentos pessoais não publicáveis. | Publicação reproduz versão aprovada e não abre a ficha privada/Portal. |
| Integrações/Certificados/Agendamento | Catálogo/logs MOCK e A1 documental. | Cliente eSocial nativo + fila/worker persistentes + artefatos/recibos e política específica por ambiente. | Restrita/Produção isoladas; processamento sobrevive a reinício; erro XML não recebe recibo fictício. |
| Notificações/e-mail | Catálogo EMAIL_SMTP e mecanismos transversais. | Outbox de avisos de férias, convites Portal, pendências/documentos, publicação e falhas. | Enviar só após commit; registro de entrega/falha; retry não repete efeito financeiro. |
| Banco/consignações | APIs centrais/banco sandbox e catálogo CNAB; sem remessa salarial específica localizada. | Convênio/layout e contas dos beneficiários, lotes de pagamento, retorno/baixas e integração gestores de consignado. | Arquivo/API gerado não marca Paga; retorno confirmado reconcilia beneficiários e retidos. |

### Regras de integração

- **Chave de origem:** instância/unidade, domínio, ID estável do fato, revisão, competência, tipo de evento e ambiente quando externo. Garantir unicidade no banco, não apenas variável em memória.
- **Outbox transacional:** gravar fato e pedido de integração na mesma transação; worker realiza o despacho após commit e registra tentativas. Integração assíncrona não perde a origem em falha externa.
- **Cancelamentos:** manter fato/cálculo/recibo original e registrar evento compensatório, financeiro e eSocial conforme estado e regras. Não apagar folha que já tenha reflexos.
- **APIs centrais:** revisar todos os consumidores antes de alterar parâmetros/retornos; manter `{ error }` nas actions chamadas via `await`. Reutilizar gates centrais, sem gravação direta improvisada de empenhos/pagamentos.
- `createCommitment` hoje exige dotação, reserva ativa integral, fornecedor e demais regras centrais. Definir credor de folha/encargos e tratamento de pessoal por classificação com Contabilidade; não fabricar fornecedor ou usar processo de compras para contornar gates.
- Margem/consignado/pensão não são equivalentes a retenção de nota fiscal. Cada domínio tem origem, beneficiário, saldo e competência próprios, conciliados ao Financeiro.

## 6. Predisposição e conexão com Portal do Servidor

### 6.1 Reutilização de identidade

Preservar `getEmployeePortalAccess`: identidade extraída da sessão, nunca `employeeId` livre vindo do navegador. Ampliar a projeção para os contratos próprios por Employee/Person e escopo de entidade/unidade. Qualquer ID de contrato/cálculo/documento passado na URL deve ser validado contra esse conjunto **antes** de consulta/download.

Decidir política para ex-servidores com RH: o helper atual exige Employee ativo e bloqueia seus históricos. Projetar concessão de autoatendimento histórico com prazo/escopo quando autorizada, sem reativar vínculo, restaurar acesso operacional ou habilitar terceiros. Bloqueio operacional do item 96 e acesso pessoal a comprovantes devem ser políticas distintas e explícitas.

### 6.2 Contratos internos propostos (não implementados nesta análise)

| Contrato | Entrada/origem | Saída e limites |
|---|---|---|
| `listMyEmploymentContracts` | Contexto autenticado, filtros/página. | Vínculos próprios de leitura, datas e situação, sem acesso global RH. |
| `listMyPayrollStatements` | Contexto, competência/tipo/contrato. | Demonstrativos aprovados e liberados, página 20; total por demonstrativo integral, não soma de página de rubricas. |
| `getMyPayrollStatement` / `downloadMyPayrollStatement` | ID de snapshot validado contra titular. | Bruto/descontos/líquido/bases/encargos pertinentes, mensagem e PDF/GED com versão/hash. |
| `getMyAnnualIncomeStatement` | Ano e titular da sessão. | Consolidação anual por PF, com vínculos, pensões/saúde/complementar e reconciliação IRRF. |
| `getMyFunctionalFolder` | Sessão, filtros/página. | Documentos autorizados por tipo e origem; não expor prontuário médico ou documentos de terceiros. |
| `submitMyRegistrationUpdate` | Campanha vigente, campos permitidos, anexos e revisão. | Proposta com protocolo; não atualiza cadastro central sem deferimento RH. |
| `requestMyConsignmentMargin` | Banco/convênio/política, titular. | Cálculo/reserva/validade e regra de carência, sem reutilização concorrente da mesma margem. |
| `submitMyHrRequest` | Contrato próprio, tipo, justificativa, anexos. | Solicitação de férias/transferência/documento dirigida ao workflow central; decisão fica com RH. |

**Identificadores obrigatórios das projeções:** instância/unidade, personId, employeeId, employmentContractId, payrollId, calculationRunId, statementVersionId, publicação/liberação. Campos pessoais/bancários só aparecem quando necessários ao serviço. As projeções são derivadas dos mesmos dados de RH/Folha; não criar “folha do portal” em banco paralelo.

### 6.3 Publicação (FOL-108)

1. Criar política temporal por tipo de folha/regime/público, com `releaseAt` e possibilidade explícita de publicação antes do encerramento da competência.
2. Essa exceção libera **um cálculo aprovado e congelado**, nunca cálculo em execução, cenário simulado ou salário editável.
3. Modelo de publicação próprio com quem autorizou, versão liberada, data/revogação e motivo. Reimpressão usa a versão registrada.
4. Parâmetros DEMONSTRACAO não podem sobrepor silenciosamente uma política oficial de PRODUCAO. Escolher o conjunto por contexto e vigência; o helper atual considera o conjunto ativo mais recente sem filtrar escopo.
5. Revisar `arePortalPayrollStatementsEnabled` (atualmente habilita quando regra/instância ausente) e todos os consumidores antes da alteração. Migração deve tornar a situação legada explícita, sem liberar novos recibos por ausência de regra.

### 6.4 Solicitação de acesso e recadastramento

- Na admissão, gerar solicitação/convite idempotente com PF/servidor e e-mail confirmado, usando Firebase como provedor vigente; RH aprova o vínculo autorizado. O item 103 exige solicitação automática, não criação de senha operacional fictícia.
- Campanha: período/público/campos obrigatórios e pendências. Preservar formulário e anexos submetidos, diff e protocolo.
- Deferimento: verificar versão-base para não sobrescrever alteração posterior, atualizar Person/Address/perfil funcional/empregos anteriores na mesma transação, registrar autor e gatilhos eSocial pertinentes.
- Indeferimento/exigência: guardar razões, permitir complementação e notificar. Nenhuma mudança canônica ocorre antes do deferimento.

## 7. Arquitetura funcional e dados previstos

**Nomes indicativos, a consolidar após revisar consumidores e migrations.**

| Domínio | Reutilizar | Completar/modelar |
|---|---|---|
| Identidade | Person, Employee, Usuario/Firebase, Address, Document. | Perfil pessoal funcional, documentos PIS/CTPS/CNH/título, dados especiais/fiscais, convites e concessões Portal. |
| Vínculos | Employee/Role/organograma/CostCenter. | `EmploymentContract`, versões/eventos, regime/lotação/local/jornada/plano/nível/datas/matrícula, funções e disposição/cessão. |
| Configuração | HrPayrollRuleSet/Rubric/Incidence/CalculationPolicy/SocialSecurity/Vacation. | Snapshot publicado; validade por contexto, fórmulas AST, faixas IRRF/INSS/RPPS/família, bases por regime/previdência, códigos eSocial versionados. |
| Processamento | Payroll/PayrollEvent/PayrollItem legados. | `PayrollCalculationRun`, seleção de vínculos, item/trace/base Decimal, descontos/patronal, operações/cancelamentos e cenário isolado. |
| Movimentos | Dependent/BenefitConfig/PayrollBenefit/PersonnelAct. | Verbas fixas/variáveis/importações, benefícios por vigência, plano saúde/titulares/dependentes, pensão/beneficiário, consignado/parcelas/margem. |
| Direitos | Vacation/Leave/AttendanceRecord. | Aquisitivos, regras/perdas/averbação, reservas/parcelas/gozo/pecúnia, licença prêmio/ATS/banco horas e conflito temporal. |
| Desligamento | Employee/contrato/atos/Document/Process. | Pedido/aviso, rescisão e demonstrativo/TRCT, reintegração e compensações. |
| Financeiro | Despesa/reserva/empenho/liquidação/pagamento/contabilidade centrais. | Mapping por regime/grupo/centro/fonte/credor, integração por cálculo, provisões/baixas e diárias. |
| Publicação | Document/versions, Portal/Transparência. | Snapshot de demonstrativo, política/liberação/recadastramento e DTOs por titular. |
| eSocial | Certificado A1, IntegrationConnection/Run e GED como infraestrutura. | Evento/revisão/artefato, mapping/XSD, lote/ambiente/protocolo/recibo, worker/outbox, retificação/exclusão/totalizadores/processos. |

### Invariantes obrigatórias

- Cálculos monetários **Decimal**; manter alta precisão em bases/percentuais e arredondar no ponto definido pela regra. Converter Float legado por migração conciliada; não alterar histórico já pago silenciosamente.
- Um vínculo tem suas datas/regime/cargo; uma PF pode acumular vínculos. Agregações previdenciárias/fiscais devem observar CPF, competência de remuneração e data efetiva de pagamento, com memória de rateio.
- Usar identificação estável interna em todas as relações. Matrícula é código de apresentação, histórico e mapping eSocial; alterações não mudam chaves/recibos antigos.
- Estados operacionais sugeridos: RASCUNHO → CALCULANDO → CALCULADA → CONFERIDA → FECHADA. Empenhamento, pagamento, eSocial e publicação possuem estados próprios; pagamento parcial/falha/cancelamento não se tornam Paga por edição de status.
- Simulação usa os mesmos avaliadores puros e snapshots, mas não gera folha oficial, baixa de direito, desligamento, empenho, publicação ou despacho externo.
- Lock por competência/vínculo e idempotency key em mutações; proibir corrida de dois cálculos, baixa dupla de férias/provisões e reserva excessiva de margem.
- Versões publicadas, cálculos aprovados, documentos emitidos e artefatos/recibos eSocial são append-only; correções geram nova revisão e compensação.
- Fórmulas não usam `eval`/JavaScript arbitrário. Parser com operadores/funções permitidos, grafo de dependências, limite de complexidade e erro para ciclos/divisão inválida; memória por verba.
- Datas civis, competência e horário local separados; regras de intervalo inclusivo/exclusivo declaradas, sem depender do fuso do processo Node ou navegador.

## 8. Plano de execução por fases

| Fase | Entrega | Dependências | Critério de saída |
|---|---|---|---|
| **F0 — Fundação e migração** | Revisar todas as escritas de Employee/Person/Payroll e ações do Portal; contratos de integração; mapeamento legado; Decimal e escopos; acesso operacional/autoatendimento; custódia A1. | Dados legados e arquitetura vigente. | Inventário de consumidores, SQL aditivo testado no baseline, conciliação de valores, sem quebrar identidades/consumidores/SST. |
| **F1 — Cadastro funcional completo** | Vínculos, admissão, regimes completos, cargos/vagas/níveis, funções/cessões/estágio, perfil pessoal, dependentes, pasta GED, consulta e alterações coletivas. | F0; organograma/Cadastro Único. | Demonstrar matrizes dos cadastros, dois contratos da mesma PF, todos os campos/filtros e arquivos persistidos. |
| **F2 — Motor e memória de cálculo** | Snapshot, rubricas e bases por regime/previdência, AST, IRRF/RGPS/RPPS/FGTS/patronal/tetos, multivínculo, estados/locks, memória/cancelamento/simulação. | F0/F1; tabelas legais. | Casos ouro conferidos, execução real transacional, replay/rollback/concorrência, zero reescrita de histórico fechado. |
| **F3 — Movimentos e benefícios** | Verbas fixas/variáveis/importações, dependentes/família, VT/VA/saúde, pensões, funções/comissionados e descontos. | F1/F2. | Lançamentos unitários/coletivos geram rubricas por vigência, importações idempotentes, cessação automática e fontes rastreáveis. |
| **F4 — Direitos e frequência** | Férias/especiais/em dobro, aquisitivos/gozo/pecúnia, licença prêmio/averbações/ATS, ponto/afastamentos/conflitos, avisos/certidão. | F1/F2/F3; contrato SST já preservado. | Saldos fecham com todos os movimentos e cálculos; concorrência não duplica baixas; conflitos nos dois sentidos. |
| **F5 — Folhas especiais e lifecycle** | Complementar/13º/RRA/adiantamentos, rescisão/TRCT/reintegração, médias/80%, reajustes/reversões, consignados/margem e processos trabalhistas de origem. | F1–F4. | Todos os nove tipos com cenários próprios; simular não desliga; negativos/cancelamentos mantêm histórico; convênios rastreáveis. |
| **F6 — Contabilidade e pagamentos** | Empenho automático, grupos/fontes/credores, planilha/encargos, provisões/baixas/estornos, diárias, produtividade, banco e pagamentos/pensões. | F2–F5; classificação contábil oficial. | Conciliação até pagamento/estorno; replay sem duplicação; gates financeiros respeitados; bases para S-1210/autônomos. |
| **F7 — Portal e documentos** | Contratos de leitura própria, holerites/rendimentos/pasta, política de publicação, convite/recadastramento, serviços/margem, notificações e acesso operacional. | Contratos definidos em F0; incrementos F1–F6. | Titularidade comprovada em cada endpoint/documento; publicação futura/pré-fechamento testada; deferimento de recadastramento transacional. |
| **F8 — eSocial e obrigações** | Mapping/consistências, XSD/XMLDSig/mTLS, lotes nativos, dois ambientes, worker/retornos, periódicos/não periódicos/processos/totalizadores, DIRF/SEFIP/MANAD/SIOPE/TCE-PR/CADPREV. | Contratos em F0; cadastros F1 e snapshots F2; pagamentos F6; parâmetros/acessos oficiais. | 20 itens com evidência própria; geração/validação local não confundida com envio aceito; Restrita isolada; Produção demonstrada quando exigida e legitimamente disponível. |
| **F9 — ERP, relatórios e POC** | Todos os relatórios/mapa/XLSX/CSV/PDF, regressão entre módulos, seed explicitamente demonstrativo e matriz de evidências por requisito. | Incremental desde F1; conclusão F1–F8. | Demonstrar 114 + 20 itens, guardar roteiro/resultados/exceções; build/testes aprovados e percurso autenticado/impressão realizados. |

### Ordem e paralelização futura

- Caminho crítico: **F0 → F1 → F2 → F3/F4 → F5 → F6 → conclusão F8/F9**.
- Portal e eSocial devem ter contratos definidos **em F0**, não serem desenhados somente ao final. F7 pode evoluir com dados de F1/F2; F8 inicia tabelas/mapping/consistências com F1 e incorpora remunerações/pagamentos conforme F2/F6.
- Arquivos e domínio SST permanecem sob sua frente atual; combinar interfaces de leitura/fatos versionados, sem reimplementar CAT/ASO ou alterar perícias na execução de Folha.
- Primeiro marco útil: cadastro canônico/multivínculo + folha mensal completa e rastreável + demonstrativo próprio no Portal. É um incremento demonstrável, **não substitui a meta de 134 requisitos**.

### Organização das telas

Reutilizar `/rh` e componentes ERP existentes; áreas de servidores/contratos, cargos/níveis/funções, direitos/afastamentos, movimentos/benefícios/consignados, folha/cálculos, rescisões, contabilidade/provisões, eSocial, relatórios e parametrizações. Portal permanece `/portal-servidor` e usa projeções próprias.

Todas as listagens: **20 registros por página**, filtros no banco, `count` do mesmo filtro, ordenação estável, salto de página, tabela sem rolagem vertical interna. Total geral não pode ser soma da página. Lookups pesquisáveis/paginados, ficha com salvar/reabrir, anexos e histórico. Relatórios/exportações usam todo o conjunto filtrado, sem `take: 500`, CSV íntegro, XLSX verdadeiro e PDF multipágina. Preservar autorização de create/update/delete/issueReports conforme operação; ações permitidas na UI não substituem validação server-side.

## 9. Insumos oficiais e decisões necessários

| Insumo | Uso |
|---|---|
| Estatuto/regimes, plano de cargos/níveis, gratificações, atos, férias/licença prêmio/ATS | Regras F1–F5 e casos ouro de cálculo. |
| Tabelas e vigências IRRF/RGPS/RPPS/FGTS/complementar/família e tratamento de multivínculo/exterior | Cálculo legal, patronal, retenções e eventos eSocial. |
| Folhas oficiais anteriores e históricos/bases previdenciárias, aquisitivos/averbações | Migração, médias/RRA/provisões, confronto de valores e aprovação RH/Contabilidade. |
| Dotação/fontes/centros/grupos de empenho/credores e regras de provisões/baixas | Empenhamento e contabilização sem atalhos aos gates. |
| Convênio bancário, contas/layout/remessa/retorno; gestores de consignado e margem | Conectores reais, saldos e pagamento confirmado. |
| CNPJ/estabelecimentos/lotações/classificações/categorias, certificado A1/procuração/permissões eSocial | Ambientes oficiais, assinatura/autenticação e transmissão legítima. |
| Leiautes oficiais TCE-PR, SIOPE, CADPREV e arquivos históricos DIRF/SEFIP/MANAD solicitados | Exportações, validadores e evidência de aplicabilidade por competência. |
| Política de publicação/recadastramento/acesso pós-desligamento e perfis Firebase habilitados | Homologação Portal, titularidade e serviços pessoais. |

Enquanto faltarem insumos, usar exemplos sintéticos identificados como **DEMONSTRAÇÃO**, versões com escopo explícito e casos de teste. Não atribuir valores oficiais, assinatura real, protocolo aceito ou transmissão federal a saídas demonstrativas. Dependência externa deve aparecer como pendência na evidência do item, não como funcionalidade já homologada.

## 10. Testes e homologação previstos

1. **Cadastro/migração:** duas matrículas/vínculos da mesma PF; unicidade e mudança de matrícula; cadastro pelos caminhos RH/Admin; documentos centrais; vigências e campo adicional; baseline municipal incluindo SST sem alteração.
2. **Valores:** casos ouro por regime/previdência, cada faixa e limite, bases/IRRF/teto/família, múltiplos cargos, pagamentos em períodos distintos, exterior, pensões/complementar/saúde. Comparar todas as rubricas e intermediários, não só líquido.
3. **Estados/concorrência:** cálculo simultâneo, replay, falha a meio lote, cancelamento e reprocessamento de fechada; nunca perder execução antiga nem deixar itens parciais; status Paga só de pagamento real.
4. **Direitos:** um cálculo consumindo dois aquisitivos, vários gozos/pecúnias, em dobro, perdas/prorrogações e cancelamento; conflito de férias/afastamento nos dois sentidos; ATS/averbação e benefícios proporcionais.
5. **Lifecycle:** simulação de rescisão isolada, rescisão coletiva, RRA/13º/diferenças/adiantamentos, reajuste negativo/reversão e reintegração mesma matrícula.
6. **Integrações internas:** rollback/replay de empenho/provisões, falta de dotação/exercício/credor, retorno/estorno financeiro, produtividade/diária sem duplicação e notificações pós-commit.
7. **Portal:** A não vê B por alteração de URL/filtro/ID; múltiplos vínculos próprios, bloqueio de rascunho/simulação, liberação futura e antecipada por política, revogação, histórico pós-desligamento autorizado e recadastramento concorrente.
8. **eSocial local:** fixtures oficiais/XML e XSD corretos por versão, canonicalização/assinatura verificada, layout incompatível rejeitado, dependências/lotes/recibos, retificação/exclusão, ambiente separado e worker após reinício.
9. **eSocial real:** evidências próprias de envio/consulta/retorno e totalizadores em Produção Restrita; Produção conforme requisito/acesso legítimo. Teste local/MOCK não é protocolo federal aceito.
10. **POC:** um roteiro/evidência para **cada FOL-001–114 e ESO-001–020**, com ator/dados/pré-condição/passos/resultado/referência ao código/documento/recibo e limites. Filtros/exports com mais de 500 registros e PDF último registro; conferir impressão e autenticação real.

Na implementação executar testes significativos de política e serviços com Prisma/PostgreSQL/PGlite, ESLint dos arquivos, checks de migrations e **`npm run build` antes de commit/push**. Na presente análise documental não foram executados testes/build nem declarados resultados técnicos novos de RH/Folha.

## 11. Próximo passo recomendado

Executar **F0 e F1**, começando pela revisão conjunta das escritas de Employee em RH/Admin e pela definição de contrato/multivínculo/identidade Portal. Em seguida ligar as parametrizações existentes ao motor F2. Elaborar a matriz de casos ouro com RH/Contabilidade e abrir o levantamento de acessos/leiautes oficiais eSocial desde o início. O plano está completo quanto ao mapeamento dos 134 itens; a cobertura funcional e homologação deverão ser atualizadas após cada entrega.
