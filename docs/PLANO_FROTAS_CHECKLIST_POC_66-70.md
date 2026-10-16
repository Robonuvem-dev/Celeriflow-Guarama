# Frotas — diagnóstico e plano de implementação do checklist da POC

**Fonte:** `docs/Termo de Referencia/Checklist real POC MÓDULOS EXECUTIVO e CAMARA.pdf`, páginas **66–70 do arquivo PDF**, módulo **Gestão de Frota**, requisitos **1–50**. A página 70 passa a tratar de Folha de Pagamento após o item 50; esse trecho está fora deste plano. Diagnóstico estático do repositório no commit `44eee91` (`main`, 10/10/2026); não equivale a homologação funcional em ambiente implantado.

**Legenda:** **C** = cobertura identificada para o enunciado; **P** = parcial (para a POC, tratar como **não atende** até demonstração completa); **N** = não encontrada cobertura específica. Não presumir conformidade de regras legais, disponibilidade de serviços externos ou pagamentos a partir de campos de texto. A classificação conservadora deve ser reavaliada por demonstração, requisito a requisito.

## Base existente: aproveitar, não duplicar

- UI em `src/app/app-domain/frotas/{page.tsx,FrotasClient.tsx,FleetEditor.tsx,navigation.ts}`: cadastro de veículo/máquina/equipamento/agregado, rotas, utilização concluída, planos e OS preventivas, consumos, gastos, documentos/seguros/obrigações, ocorrências e relatórios. Não há áreas dedicadas a agenda, garagem, autorizações, motoristas/CNH, infrações, pneus/baterias ou sinistros.
- `src/lib/frotas/{contract.ts,service.ts,queries.ts,report.ts}`: validação, persistência transacional/idempotente, filtros por setor, referências, relatórios PDF/XLSX/CSV/TXT/impressão. `src/app/app-domain/frotas/actions.ts` retorna `{error,fields}` para chamadas `await` do cliente; preservar esse contrato. Endpoints em `src/app/api/frotas/` oferecem referências, consulta patrimonial e emissões.
- `prisma/schema.prisma`: `FleetUnit`, `FleetRoute`, `FleetUsage`, `FleetPlan`, `FleetWorkOrder`, `FleetConsumption`, `FleetExpense`, `FleetDocument`, `FleetOccurrence`, `FleetMutation`, `FleetAssetEvent`. `FleetWorkOrder` **só nasce de plano periódico**. `FleetUsage` exige entrada e saída juntas e trata leituras como km; motorista é `Employee` opcional, sem dados de CNH. `FleetDocument` guarda seguradora e referência/apólice textual, mas não é repositório de arquivos; `FleetOccurrence` contém tipo, data, descrição, valor e referência, sem multa estruturada ou sinistro. `FleetConsumption` cria `FleetExpense` e pode consumir estoque próprio ou vincular saída existente, mas não guarda autorização, leitura do marcador, preço por litro ou vínculo formal com licitação.
- `prisma/migrations/20260918213000_integrate_fleet_assets_stock/migration.sql` e `20260919231000_keep_inactive_assets_unavailable_in_fleet/migration.sql`: projeção por triggers de setor, responsável e status patrimonial; rastreio de mudanças e apropriação de manutenção patrimonial. A ficha exibe dados de `Asset` inclusive aquisição e recebimento, mas a data de aquisição **só está disponível para unidade vinculada**. Preservar triggers e fonte patrimonial na evolução do esquema.
- `tests/frotas.integration.test.ts`, `tests/frotas-opening.test.ts` e `npm run test:frotas`: ponto de partida para cenários com banco isolado; conferir o teste que reaplica as migrations incrementais quando novos modelos/colunas/triggers forem introduzidos.

## Confronto item a item

| Pág. / nº | Exigência resumida | Estado | Evidência / entrega necessária |
|---|---|---|---|
| 66 / 01 | Cadastro completo de veículos | **P** | `FleetUnit` tem placa, RENAVAM, marca/modelo/ano, setor; `Asset.acquisitionDate` só para bem vinculado. Acrescentar espécie, cor, combustível, tanque, centro de custo quando diferente do setor, dados de seguro e aquisição para não vinculados, com fonte única para bens patrimoniais. |
| 66 / 02 | Ocorrência/avaria | **P** | Ocorrência `ACIDENTE/OUTRO` com descrição; estruturar avaria, estado, evidências e acompanhamento. |
| 66 / 03 | Débitos: licenciamento, seguro obrigatório, multas | **P** | `FleetDocument` cobre obrigações e vencimentos; multa não tem débito, estado nem pagamento próprio. Criar visão consolidada de débitos com origem. |
| 66 / 04 | Identificação, marca e trocas de bateria | **N** | Criar cadastro instalado e histórico de trocas, custos e OS/estoque. |
| 66 / 05 | Lançar e emitir autorização de abastecimento | **N** | Criar autorização numerada, workflow, impressão e consumo associado. |
| 66 / 06 | Autorização de abastecimento e OS | **P** | OS de manutenção existe e pode ser emitida; falta autorização de combustível e OS avulsa/de serviço, se exigida na demonstração. |
| 66 / 07 | Agenda por veículo, departamento e motorista com motivo | **N** | Criar reservas com período, finalidade, setor e condutor, conflito e consulta por dimensões. |
| 66 / 08 | Entrada/saída do pátio, horários, km e posse | **P** | `FleetUsage` registra período concluído, leituras e condutor opcional; falta evento de saída/entrada em tempo real e guarita. |
| 66 / 09 | Gerenciar gastos de veículos/máquinas/equipamentos | **C** | `FleetExpense` e consultas agregam OS, consumos, patrimônio e outros gastos com valor conhecido/desconhecido; demonstrar os três tipos e conferir conciliação. |
| 66 / 10 | Integração bidirecional operacional com Patrimônio, sem duplicação e transferência imediata | **C** | Vínculo único `FleetUnit.assetId`, projeções e triggers de alterações em `Asset`, histórico `FleetAssetEvent`, bloqueios de baixa/manutenção. Verificar em teste com setor/responsável alterados. |
| 67 / 11 | Anexos do veículo em 14 formatos | **N** | Criar upload, metadados e acesso a foto/documento/multa/comprovante; validar `png,bmp,jpg,gif,doc,docx,ppt,pptx,xls,xlsx,pdf,odt,ods,dwg`. |
| 67 / 12 | Imprimir autorização em branco ou pré-cadastrada | **N** | Dois modos de impressão: formulário manual identificado e autorização preenchida, sem lançar consumo na mera impressão. |
| 67 / 13 | Autorizações de serviço ou abastecimento | **N** | Tipos separados com estados e referências verificáveis. |
| 67 / 14 | Despesa a partir da autorização de serviço | **P** | Concluir OS gera despesa, porém OS só existe via plano e não há autorização de serviço; ligar despesa idempotentemente à autorização executada. |
| 67 / 15 | Despesa referenciada em ordem de compra dispensável/licitação | **N** | Vínculo tipado e validado com Compras/Licitações, sem aceitar somente número livre em `reference`; evitar duplicar liquidação/pagamento. |
| 67 / 16 | Troca de pneus com despesa automática | **N** | Cadastro de pneu/posição/trocas, custo único de origem e vínculo com OS/almoxarifado. |
| 67 / 17 | Manutenções, revisões, lubrificações, óleo e pneu, próprias/terceiros | **P** | Planos/OS/execução e lubrificante como consumo; faltam tipificação detalhada, oficina/execução própria, peças/pneus e serviços avulsos. |
| 67 / 18 | Marca/modelo vinculados à FIPE | **N** | Seleção/catálogo FIPE com referência/versionamento de fonte e compatibilidade com patrimônio; não tratar texto livre como vínculo FIPE. |
| 67 / 19 | Obrigações de seguro/licenciamento | **P** | Seguros/obrigações com datas e status; falta distinção seguro obrigatório/facultativo, débito e histórico financeiro verificável. |
| 67 / 20 | Tabela de infrações CTB | **N** | Catálogo consultável com código, descrição, natureza, pontos, vigência/fonte e atualização. |
| 67 / 21 | Gestor de multas com cidade, CTB, motorista e vencimento | **P** | Ocorrência `MULTA` genérica; criar multa estruturada e validações. |
| 68 / 22 | Consulta de multas | **P** | Filtro `MULTA` nas ocorrências; implementar consulta dedicada por placa, infração, condutor, cidade, data, vencimento e situação. |
| 68 / 23 | Dados de pagamento da multa | **N** | Registrar pagamento/comprovante/status sem equiparar registro de gasto a pagamento financeiro. |
| 68 / 24 | Deslocamento e planilha para preenchimento/acompanhamento | **P** | Utilização finalizada calcula km e pode ser emitida; falta planilha **em branco** e acompanhamento da saída até retorno. |
| 68 / 25 | Agendar viagens, serviços e consertos por veículo | **P** | Plano/OS agendam manutenção; uso registra viagem após ocorrer; criar agenda de reservas de todos os tipos. |
| 68 / 26 | Rotas e rotas fixas por veículo/máquina | **P** | `FleetRoute` e vínculo opcional em utilização de veículo; falta atribuição de rota fixa por unidade e uso previsto por máquinas. |
| 68 / 27 | Consultas de manutenção/taxas previstas e realizadas | **P** | Existem listas de planos, OS, gastos, seguros e obrigações; consolidar previstas/realizadas e taxas/seguro obrigatório/facultativo sem equivalências indevidas. |
| 68 / 28 | Guarita: registrar/consultar entrada e saída | **N** | Criar operação de guarita com permissões, eventos independentes, estado em pátio/em uso e histórico. |
| 68 / 29 | Seguro facultativo | **P** | Seguro genérico; tipificar facultativo, apólice, seguradora, cobertura e vigência. |
| 68 / 30 | Bloquear condutor sem CNH/vencida | **N** | Verificação server-side em reserva, autorização quando aplicável e saída/uso; inclusive categoria de habilitação. |
| 68 / 31 | Motoristas RH/terceirizados; nº, categoria e validade da CNH | **N** | Referência a `Employee` existe, sem cadastro de condutor/CNH/terceiro. Criar entidade e vínculo RH, sem duplicar dados do servidor. |
| 68 / 32 | Controlar 20 pontos/suspensão na saída | **N** | Vincular pontuação à multa/condutor e período aplicável; bloquear saída segundo política parametrizada e regra legal vigente. |
| 69 / 33 | Hodômetro, horômetro ou sem marcador | **P** | Leituras opcionais de uso em km; parametrizar marcador por unidade e uniformizar validação em uso, abastecimento e guarita. |
| 69 / 34 | Campos de máquinas configuráveis/obrigatórios | **N** | Categoria `MAQUINA` existe, mas usa formulário único sem configuração de campos por tipo. |
| 69 / 35 | Visualizar/alterar apenas veículos da repartição | **C** | `fleetScope`/`departmentWhere`, checagem de mutação e escopo; admin é exceção intencional. Estender aos novos fluxos/arquivos/relatórios. |
| 69 / 36 | Frentista externo lança abastecimento mediante autorização | **N** | Criar papel/identidade de posto e operação restrita a autorização válida, sem expor demais dados da frota. |
| 69 / 37 | Cadastro de destinos | **P** | Origem/destino são texto em `FleetRoute`; falta catálogo pesquisável independente. |
| 69 / 38 | Períodos de utilização via agenda e obrigações | **N** | Registro posterior de uso e data isolada de obrigação não compõem agenda de períodos/reservas. |
| 69 / 39 | Consultar combustível disponível proveniente de licitação | **N** | Há referência a fornecedores/estoque, sem consulta de saldo contratual/licitação por combustível. |
| 69 / 40 | Estoque próprio de combustível e origem da despesa | **P** | Consumo próprio/terceiro, baixa/vínculo de saída de Almoxarifado; complementar rastreio de combustível e vínculo do terceiro com autorização/fornecedor/compra. |
| 69 / 41 | Consulta de modelos de veículos | **P** | Campo livre `model` pesquisável indiretamente na ficha; criar catálogo/consulta ligada à FIPE. |
| 69 / 42 | Relatórios de despesas agrupados por repartição/período/veículo/fornecedor | **P** | Exportação e filtros por data/unidade, setor implícito; `FleetExpense` não preserva fornecedor para todas as origens nem produz agrupamentos. |
| 69 / 43 | Relatório de processos de um ou vários veículos | **P** | Emissão de listagem com até 50 unidades filtradas; falta dossiê consolidado (cadastro, uso, autorização, manutenção, gastos, documentos e sinistros). |
| 70 / 44 | Média de consumo e status alto/normal/baixo por veículo | **N** | Quantidades/custos totais existem; abastecimento não registra leitura do marcador, capacidade/combustível nem regras de classificação. |
| 70 / 45 | Coordenada geográfica na ocorrência | **N** | Não há latitude/longitude em `FleetOccurrence`. |
| 70 / 46 | Sinistro originado de ocorrência | **N** | `ACIDENTE` é texto livre, sem entidade de sinistro e ligação verificável. |
| 70 / 47 | Responsabilidade próprio/terceiros/outros | **N** | Adicionar classificação ao sinistro e trilha de alterações. |
| 70 / 48 | Seguradora e apólice preenchida automaticamente | **N** | Seguradora/apólice estão em `FleetDocument`, não em sinistro; usar seguro vigente do veículo na data, com opção de seleção se ambíguo. |
| 70 / 49 | Oficina de encaminhamento no sinistro | **N** | Vincular fornecedor/oficina e histórico de encaminhamento. |
| 70 / 50 | Partes: veículo, proprietário e condutor | **N** | Entidades das partes envolvidas e respectivos dados/vínculos; não confundir com condutor da frota. |

## Plano de execução para o Codex

Trabalhar em PRs/etapas pequenas e demonstráveis, mantendo checklist vivo: marcar **C somente quando fluxo ponta a ponta existir** (UI, persistência, autorização, consulta e, onde pedido, emissão). Não implantar migrations automaticamente em produção. Antes de alterar assinaturas exportadas, localizar todos os consumidores; antes de implementar APIs Next, ler o guia aplicável em `node_modules/next/dist/docs/` conforme `AGENTS.md`. Não modificar diretamente migrations antigas; criar migrations incrementais e rever efeitos nos triggers de integração patrimonial.

### Etapa 0 — contratos e escolhas de dados

1. Definir modelos/relacionamentos, estados e responsáveis de dados por domínio; inventariar consumidores de `FleetUnit`, `FleetUsage`, `FleetExpense`, `FleetDocument`, `Employee` e `Asset`, inclusive Educação/TFD, triggers e testes. Decidir quais campos são projeção de Patrimônio e quais são operacionais exclusivos de Frotas. Formalizar diferença entre **autorizado, consumido, gasto, débito e pago**.
2. Definir fonte e atualização dos catálogos **FIPE** e **CTB** (versão, vigência, fallback de consulta e carga auditável); não declarar integração como pronta sem catálogo funcional. Definir política de pontuação da CNH, exceções legais e tipologia de seguros com a área responsável.
3. Definir integração com Compras/Licitações: identificar no schema a origem real para ordem de compra, dispensa, licitação/contrato, saldo de combustível e fornecedor; validar tipo e escopo no servidor, sem referência textual como prova de vínculo. Definir provedor de arquivos já utilizado no projeto, limites por formato e política de acesso do posto externo. Registrar pendências de fonte externa como bloqueadoras dos itens correspondentes.

### Etapa 1 — base de cadastro, patrimônio, anexos e catálogos (01, 04, 10, 11, 18, 33, 34, 37, 41)

- Expandir `FleetUnit` para atributos próprios (espécie, cor, combustível, tanque, tipo de marcador, detalhes de máquina), com configuração de campos obrigatórios por classe de maquinário; exibir aquisição/centro de custo a partir de `Asset` quando vinculado. Evitar cadastro duplicado de marca/modelo patrimonial; permitir modelo FIPE com código e competência, inclusive consulta. Criar destinos independentes, bateria instalada e histórico de troca.
- Anexos por veículo e, onde necessário, multa/pagamento/sinistro: upload e download autenticados, extensão/MIME/tamanho, guarda privada, vínculo ao setor e auditoria; testar todos os 13 formatos exigidos. Fotos e documentos devem ser recuperáveis pela ficha.
- **Aceite:** cadastro e reabertura de veículo/máquina/equipamento; transferência patrimonial atualiza ficha e escopo sem intervenção manual; catálogo FIPE consultável; máquina aplica configuração; troca de bateria mantém histórico; anexos aceitos/recuperados nos 14 formatos exigidos.

### Etapa 2 — condutores, agenda, rotas fixas e guarita (07, 08, 24–26, 28, 30–32, 33, 35, 37–38)

- Cadastro de condutores vinculado a `Employee` ou terceiro identificado, CNH (número, categoria, validade, estado), pontos/suspensão; validação **server-side** da elegibilidade em reservas, saída de pátio e utilização. Registrar decisões e intervalo de apuração de pontos; bloquear sem CNH, vencida, categoria incompatível ou suspenso/limite configurado.
- Criar agenda por veículo, setor e condutor para viagem, serviço, conserto e períodos/obrigações; impedir sobreposição, indisponibilidade por manutenção e colisão de condutor. Vincular rota fixa (veículo ou máquina) e destino cadastrado. Separar reserva planejada de uso real.
- Criar saída/entrada de guarita como eventos auditáveis (hora local inequívoca, motorista, leitura conforme marcador), impedir duas saídas em aberto, impedir entrada sem saída e leituras regressivas. Gerar utilização real a partir dos eventos sem duplicar histórico e planilhas **em branco** e **preenchidas** para acompanhamento.
- **Aceite:** consultas por setor/veículo/motorista; conflitos e CNH vencida/ausente bloqueados mesmo via chamada direta ao servidor; guarita fecha saída e preserva histórico; relatórios/planilhas imprimíveis; não vazar dados de outro setor.

### Etapa 3 — autorizações, abastecimento e oficina (05–06, 12–17, 36, 39–40, 44)

- Criar autorização numerada de abastecimento e de serviço com estados (emitida, usada, cancelada), unidade, fornecedor/posto, volume/valor-limite, validade, solicitante e escopo; emissão em branco e a partir de registro, com reimpressão, cancelamento e trilha de auditoria. Autorizações não criam despesa antes de execução.
- Criar OS avulsa/de serviço além da periódica, sem quebrar `FleetPlan` e OS históricas (rever `planId` obrigatório, unicidade e relatórios). Executar serviço próprio/terceiro, revisões, óleo, lubrificação, pneu e bateria; associar autorização e oficina, apropriar custo **uma vez**. Formalizar origem contratual da despesa (ordem/dispensa/licitação) e origem do estoque/fornecedor.
- Abastecimento externo: usuário do posto com permissão restrita à autorização do próprio posto, consumo confirmado com volume, custo, data, combustível e leitura (se aplicável), travas de limite/reuso e vínculo `FleetConsumption`/`FleetExpense`. Estoque próprio usa `applyStockMovement`/saída já registrada sem segunda baixa; consultar combustível contratado/saldo com origem de Compras.
- Calcular média por veículo (p.ex. km/L **somente** para litros e hodômetro com leituras válidas), janela de abastecimentos consecutivos, regras configuráveis alto/normal/baixo; horímetro com unidade adequada e sem marcador com resultado “não calculável”. Não somar custos de peças/serviços já apropriados.
- **Aceite:** autorização impressa vazia e preenchida, posto registra somente sua autorização, bloqueio de excedente/duplicação, OS planejada e avulsa, despesa rastreável à origem e combustível com relatório e classificação demonstráveis.

### Etapa 4 — obrigações, CTB e multas (03, 19–23, 27, 29, 32)

- Distinguir seguro obrigatório/facultativo, licenciamento e demais taxas; unificar consulta de obrigações por vencimento/veículo, mantendo apólice e vigência separados de débito/pagamento. Importar/manter tabela CTB versionada e pesquisável.
- Criar multa vinculada a veículo, infração CTB, município, condutor, data, vencimento, valor, pontos e status; consulta dedicada e registro de pagamentos e comprovantes, inclusive pagamentos parciais se decisão funcional exigir. Integrar pontos à elegibilidade para saída; registrar correções e estornos com histórico. Não alterar o significado de `FleetOccurrence.involvedValue` nem tratar `FleetExpense` como pagamento.
- **Aceite:** lançamento, consulta por filtros, vencimento, pagamento documentado, soma de pontos demonstrável e bloqueio de condutor atingindo limite/punição definidos.

### Etapa 5 — pneus, ocorrências e sinistros (02, 04, 16–17, 45–50)

- Cadastrar pneus (identificação, posição, instalação, retirada, motivo, marcador, custo, origem), trocas com OS/estoque e despesa automática idempotente. Reaproveitar lógica de bateria. Ocorrência/avaria com latitude/longitude e anexos.
- Sinistro derivado de ocorrência `ACIDENTE`, responsabilidade próprio/terceiro/outros, oficina e partes (veículo, proprietário, condutor), etapas e documentos. Buscar seguros vigentes do veículo **na data do sinistro** e preencher seguradora/apólice a partir da apólice selecionada; preservar snapshot histórico quando seguro mudar.
- **Aceite:** troca de pneu cria um único gasto; localização válida na ocorrência; sinistro exibe origem, apólice, oficina, responsabilidade e todas as partes após reabrir.

### Etapa 6 — relatórios e dossiê para demonstração (09, 22, 24, 27, 39–44)

- Evoluir `fleetQuerySchema`, `queryFleet`, `report.ts`, UI e rota de emissão para agrupamentos de gasto por repartição, período, veículo e fornecedor, totais e custos desconhecidos; preservar escopo por setor, limites de volume e formatos existentes.
- Relatório de processo/dossiê por 1–N veículos com filtros: cadastro, origem patrimonial, agenda/uso/garagem, autorizações, consumo/médias, OS, pneus/bateria, multas, seguros, obrigações, ocorrências/sinistros e despesas, com paginação ou processamento adequado para emissão completa. Acrescentar consultas separadas de manutenção prevista/realizada, combustível licitado e modelos.
- **Aceite:** exportação completa (não apenas 20 itens da tela) nos formatos suportados, filtro multi-veículo, agrupamentos com soma conferível e dados externos restritos ao papel correto.

### Etapa 7 — verificação final e roteiro POC (01–50)

- Ampliar `tests/frotas.integration.test.ts` e testes de UI/API **focados em fluxos**: persistência e reabertura, setor, concorrência/idempotência, download, aquisição patrimonial projetada, CNH, conflito de agenda, guarita, autorização/posto, estoque e despesa sem duplicação, multa/pontos/pagamento, apólice e sinistro, médias e totais dos relatórios. Verificar migrations incrementais em banco isolado e efeitos dos triggers sem rodar migrations no banco do usuário durante o planejamento.
- Roteiro de demonstração por item numerado com dados fictícios persistentes: abrir, executar ação, reabrir, consultar e emitir; registrar evidência e decisão **ATENDE/NÃO ATENDE**. Critério de conclusão: **50/50 cobertos** após validação. Conforme `docs/CHECKLIST_POC_IBEMA_CODEX.md`, a etapa funcional exige pelo menos **90% por módulo**, ou **45/50** em Frotas; parciais não contam e os 5 restantes continuam pendências para cobertura integral.
- Rodar `npm run test:frotas`, lint/checks aplicáveis e `npm run build` antes de qualquer commit/push, conforme `AGENTS.md`. Não usar scripts de replace em massa; revisar cada arquivo/consumidor individualmente.

## Cuidados de implementação transversais

- Aplicar `fleetScope`, `departmentWhere` e `canPerformModuleOperation` a **cada** nova leitura, mutação, relatório, download e identidade externa; o papel de frentista requer fluxo de autorização próprio e mínimo acesso. Respeitar transferência patrimonial que muda o setor da unidade.
- Manter `requestId`/`FleetMutation` (ou equivalente transacional) e auditoria para novas operações: retry não pode gerar segunda baixa, segundo gasto, segundo pagamento ou segundo evento de pátio. Estender `requireReplayScope` para novos tipos; preservar controle de versão nas edições.
- Tratar períodos com fuso explícito e datas legais como datas civis; leituras e quantidades com `Decimal`, não `Float`; diferenciar km, horas e ausência de marcador. Criar índices e unicidades coerentes para transições/consultas.
- Antes de integrar Saúde/TFD e Educação, verificar consumidores do cadastro da frota: cadastro de veículo não garante que a saída foi autorizada nem que o condutor é habilitado. Não introduzir bloqueios cruzados sem testar os fluxos existentes.
