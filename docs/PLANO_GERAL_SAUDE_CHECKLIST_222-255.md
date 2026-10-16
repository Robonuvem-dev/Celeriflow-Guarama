# Plano geral da Saúde — cobertura do checklist 222–255

Data da análise: 12/10/2026. Objetivo: concluir os seis blocos de Saúde com fluxos operacionais completos, aproveitando as estruturas existentes.

## Acompanhamento da execução

A execução foi iniciada a partir deste plano e da matriz normativa. Evidências e pendências estão em [EXECUCAO_SAUDE_CHECKLIST_222-255.md](EXECUCAO_SAUDE_CHECKLIST_222-255.md). As entregas registradas são parciais no conjunto do módulo; este documento não declara encerramento das 12 fases nem dos 339 requisitos.

**Orientação confirmada para a execução:** integrações externas ainda não foram configuradas. Manter os pontos de integração previstos, sem executar ou considerar atendidos transmissão/aceite oficiais nesta conferência. Configurar e verificar cada destino posteriormente, um por vez, após os fluxos internos estarem concluídos. Essa orientação não dispensa os dados e fluxos internos dos requisitos associados.

## 1. Fonte, escopo e método

Fonte principal: `docs/Termo de Referencia/Checklist real POC MÓDULOS EXECUTIVO e CAMARA.pdf`. Os números de página abaixo correspondem às páginas do arquivo PDF. A matriz complementar preserva a numeração de cada bloco e descreve a entrega necessária por item.

| Bloco | Prefixo da matriz | Páginas | Itens |
|---|---|---|---:|
| Gestão da Saúde | GS | 222–228 | 42 |
| Gestão do Faturamento | GF | 228–232 | 43 |
| Gestão da Atenção Primária | AP | 232–236 | 41 |
| Assistência à Saúde | AS | 236–244 | 74 |
| Assistência Farmacêutica | AF | 244–248 | 57 |
| Central de Regulação | CR | 248–255; itens a partir de 249 | 82 |
| **Total** | | | **339** |

**Matriz obrigatória de execução:** [MATRIZ_REQUISITOS_SAUDE_222-255.md](MATRIZ_REQUISITOS_SAUDE_222-255.md). Este plano e a matriz formam a entrega de planejamento.

A análise é estática: código, contratos, telas, serviços e schema. Não houve execução da aplicação, consulta ao banco ou comprovação de transmissão aos serviços oficiais. Por isso, não se atribui percentual de conformidade já alcançado. A meta de 100% significa fechar cada um dos 339 itens, incluindo suas condições, documentos e integrações.

O código contém identificadores anteriores como `SAU-AGE`, `SAU-SIS`, `SAU-REG` e `SAU-FAR`. Eles não correspondem automaticamente aos números do checklist real. A rastreabilidade deste plano usa exclusivamente GS/GF/AP/AS/AF/CR, com a numeração original por bloco.

### Regras de escopo

- Implementar somente capacidades exigidas pelos seis blocos e os vínculos internos necessários a elas.
- Preservar capacidades existentes, inclusive as que não aparecem nestes blocos.
- Reaproveitar cadastro único, documentos, estoque, autenticação, agenda, laboratório, Frotas e RH.
- Assistência Social entra pelo cadastro compartilhado, informações familiares, encaminhamento e contrarreferência. Não repetir sua revisão geral.
- Financeiro, tributário e demais áreas entram somente como dependências de ações da Saúde; coordenar os pontos de integração com a revisão realizada no outro ambiente de trabalho.
- Linguagem operacional nas telas e documentos; dados cadastrados alimentam as regras e análises normalmente. Aplicar [DECISOES_SAUDE_INTEGRACOES_BIOMETRIA.md](DECISOES_SAUDE_INTEGRACOES_BIOMETRIA.md).
- Um fluxo deve gravar dados, aplicar regras, produzir os documentos pedidos e refletir seus efeitos nas consultas relacionadas. Um botão, campo JSON, relatório vazio ou contador isolado não fecha um requisito.
- Integrações externas novas ficam nas últimas fases. Seus identificadores e campos internos devem ser definidos antes para evitar remodelagem posterior.

## 2. Inventário técnico e mapa de reaproveitamento

Os códigos E01–E12 são referências de evidência usadas em cada linha da matriz. Todas as tabelas citadas nesta seção existem em `prisma/schema.prisma`; modelos novos sugeridos nas fases são identificados como **a criar**.

As rotas operacionais são `/saude/...`; seus arquivos estão em `src/app/app-domain/saude/`. Confirmar os caminhos efetivos de navegação e revalidação ao implementar, pois o código utiliza tanto `/saude` como `/app-domain/saude`.

| Evidência | Telas e arquivos | Serviços/contratos | Tabelas existentes | Resultado da análise |
|---|---|---|---|---|
| E01 — cidadão | `pacientes/page.tsx`, `PacientesClient.tsx`, `actions.ts`; cadastro único | `contract.ts` (`patientInputSchema`); política de identificadores | `Person`, `Address`, `Patient`, `Family`, `FamilyMember`, `Document` | Cadastro básico e vínculo à pessoa existem. A action de criação exige CPF; a atualização altera apenas o perfil de paciente. Campos modelados em `Person` não estão integralmente expostos pela Saúde. |
| E02 — rede e catálogos | `unidades`, `profissionais`, `equipes`, `administracao`, `administracao/procedimentos`, `administracao/importacoes` | `admin-contract.ts`, `sus-import-contract.ts`, `sus-import-service.ts` | `HealthUnit`, `HealthProfessional`, `HealthTeam`, `HealthProfessionalAssignment`, `HealthUnitShift`, `HealthSpecialty`, `HealthCbo`, `HealthSusProcedure`, `HealthSusReference`, lotes e críticas de importação | Bases de unidades, especialidades, vínculos e importação existem. Importar dados sob o nome CNES/SIGTAP não comprova suporte integral aos arquivos oficiais. |
| E03 — prontuário e origem clínica | `atendimentos`, `atendimentos/[id]/page.tsx`, `ClinicalRecordClient.tsx`, `acolhimento` | `care-service.ts`, `care-contract.ts`, `appointment-service.ts`, `contract.ts` | `MedicalRecord`, `HealthTriage`, `HealthClinicalEvolution`, `HealthDiagnosis`, `HealthPerformedProcedure`, `HealthPrescription`, `HealthPrescriptionItem`, `HealthExamRequest`, `HealthReferral` | Narrativa, evolução, diagnóstico, prescrição, exame, procedimento e encaminhamento estão implementados em código. Não há gestores completos das linhas clínicas especiais nesta base. |
| E04 — agenda e chegada | `agenda`, `acolhimento`, `pronto-atendimento` | `schedule-service.ts`, `appointment-service.ts`, `appointment-policy.ts`, `reception-service.ts` | `HealthCareSchedule`, `HealthAppointment`, `HealthAppointmentEvent`, `HealthWaitlist`, `HealthReception`, `CalendarEvent`, `HealthRoom`, `HealthDestination` | Cronogramas, vagas, bloqueio, chegada, chamada e remanejamento têm bases. Feriados são bloqueados globalmente; falta a exceção configurável por agenda. |
| E05 — estoque e dispensação | `farmacia/page.tsx`, `farmacia/actions.ts` | `health-stock-service.ts`, `src/lib/patrimonio/stock-service.ts` | `Material`, `HealthMaterialProfile`, `Medicine`, `Warehouse`, `MaterialStock`, `MaterialMovement`, `HealthStockReceipt`, itens, transferências, `MedicineDispensation`, `PharmacyRequest`, itens | Há entradas, saídas, transferência com aceite, bloqueio e dispensação vinculada à prescrição. A entrada efetiva o estoque imediatamente; aprovação prévia, kits e judicialização exigem conclusão específica. |
| E06 — vacinação | `vacinacao/page.tsx`, `vacinacao/actions.ts` | `vaccination-service.ts`, estoque E05 | `Vaccine`, `VaccinationRecord`, materiais, lotes e movimentos | Aplicação vinculada ao profissional/unidade e baixa do lote existem. Não foram localizados calendário, incompatibilidades e gestor de ESAVI completos. |
| E07 — território e fichas | `territorio`, `esus`, `sisab` | `territory-service.ts`, `sisab-form-config.ts`, `sisab-service.ts` | `HealthTerritoryArea`, `HealthMicroarea`, `HealthHousehold`, `HealthFamily`, `HealthFamilyMember`, `HealthHomeVisit`, participantes, `HealthEsusForm`, lotes e itens | Território e fichas genéricas existem. Família se liga à base comum. Os formulários são reduzidos; ficha de consumo alimentar atual usa refeição/faixa etária, não o conjunto completo de marcadores exigido. |
| E08 — regulação | `regulacao`, `prestador` | `regulation-service.ts`, `provider-service.ts` | `HealthRegulationQuota`, `HealthRegulationRequest`, `HealthRegulationEvent`, `HealthRegulationAttachment`, `HealthRegulationSector`, `HealthProviderAccess`; `Covenant`, `Supplier` | Solicitações, cotas, transições, anexos e execução por prestador têm bases. Autorizar não cria automaticamente um registro em `HealthWaitlist`; agendar a solicitação não equivale a criar a consulta na agenda. |
| E09 — transporte e TFD | `tfd/page.tsx`, ações correspondentes | `tfd-service.ts` | `HealthTfdRequest`, `HealthTfdTrip`, `HealthTfdPassenger`, `HealthTfdPassengerRemoval`, `FleetUnit`, `Employee` | Pedido, autorização simples, viagem, passageiros e capacidade existem. Laudos, trâmites detalhados, benefícios e organização de rotas precisam ser completados. |
| E10 — produção e intercâmbio | `producao`, `sisab`, `integracoes`, APIs de arquivos/lotes | `production-service.ts`, `sisab-service.ts`, `src/lib/integrations/registry.ts` | `HealthProductionCompetence`, `HealthProductionFact`, `HealthProductionCriticism`, `HealthSusFile`, metas/tetos; conexões e execuções de integração | Captura de fatos, competência e críticas existem. Arquivo atual usa linhas delimitadas por `|`; não separa BPA-C/BPA-I nem inclui APAC na lista de geração. SISAB valida localmente e não transmite nessa implementação. |
| E11 — documentos, histórico e indicadores | `gerencial`, `relatorios`, `administracao/documentos`, `administracao/unificacoes` | `health-report-catalog.ts`, `health-report-service.ts`, `health-report-extra.ts`, `patient-timeline-service.ts`, `health-merge-service.ts`; GED e assinatura da plataforma | `HealthStandardDocument`, `HealthClinicalDocument`, `HealthAdministrativeMerge`, `Document`, `AuditEvent` e origens operacionais | Central de relatórios e documentos tem bases. Carteira vacinal atual reflete aplicações; relação de atrasos retorna vazia por falta de calendário. Histórico transversal e unificação de paciente precisam abranger as novas relações. |
| E12 — família social e sessões | `src/app/app-domain/social/actions.ts`; `saude/centro-especializado` | `src/lib/social/access-policy.ts`, `social-engine.ts`; `specialized-care-service.ts` | `SocialFamily`, `SocialFamilyMember`, `SocialPersonProfile`, `SocialReferral`, `SocialAttendance`, `SocialRecord`; `SpecializedTherapeuticPlan`, `SpecializedPlanEntry` | Família comum e autoria/sigilo social têm bases. Perfil social e perfil de saúde mantêm também composição própria. Plano especializado conta evoluções, mas não fecha sozinho sessões de fisioterapia/psicologia. |

### Localizações relevantes verificadas

- `Person`: linha 446; `Family`: 712; `FamilyMember`: 728.
- Rede e atendimento: `HealthUnit` 9053; `Patient` 9116; `HealthProfessional` 9164; `HealthTeam` 9221; `MedicalRecord` 9344.
- Farmácia/vacinação: `Medicine` 9452; prescrição 9510; dispensação 9555; `Vaccine` 9593; aplicação 9610; estoque assistencial 10130 em diante.
- Regulação/TFD/produção: cotas 10669; solicitação 10699; TFD 10773; viagens 10798; produção 10840.
- Território: domicílio 11137; família 11153; membro 11173; visita 11185; fichas 11225; agenda 11292.
- Social: encaminhamento 11529; perfil individual 11556; família 11641; membro 11670.

As linhas são referências da revisão e podem mudar com a implementação.

## 3. Achados que determinam a ordem do trabalho

1. **Cadastro anterior às linhas clínicas.** `Person.cpf` é obrigatório e único, e `createPatient` exige CPF para nova pessoa. Isso conflita com a obrigatoriedade por idade e com pré-cadastro. Resolver sem usar CPF preenchido artificialmente, sem duplicar a pessoa e verificando os consumidores em outros módulos.
2. **Família única com perfis especializados.** Saúde e Social têm `masterFamilyId`, mas as telas usam também suas próprias listas de integrantes. Atualizar apenas `FamilyMember` não garante igualdade de composição nas consultas de ambos.
3. **Separar registro de condição de indicação pontual.** `citizenCondition=PREGNANT` na vacinação e DUM numa ficha JSON não constituem cadastro de gestação com histórico, trimestres e desfecho.
4. **Procedimentos não podem depender de redigitação.** Há gravação manual no prontuário e captura de produção; definir quais atos geram procedimento por especialidade e guardar o vínculo à origem clínica.
5. **Observação não está automaticamente ligada ao desfecho.** `concludeHealthCare` grava `Observação`, mas não cria `HealthObservation`. Vincular o episódio à evolução e à origem.
6. **Encaminhamento e agenda precisam formar uma cadeia única.** O encaminhamento cria solicitação de regulação; concluir análise deve liberar a espera e a espera deve criar um agendamento vinculado, com cota, presença, execução e retorno.
7. **Rever cotas nas transições existentes.** `transitionRegulationRequest` permite repetir o mesmo estado e pode reservar novamente em `AUTORIZADA`. Cancelamento a partir de `AGENDADA` não libera a reserva nesse serviço. Evitar consumo duplicado, devolver saldo e garantir compatibilidade de paciente/procedimento/especialidade/convênio.
8. **Estoque deve manter o mesmo núcleo.** Entradas, vacinas, administração e dispensações devem usar `applyStockMovement`. Não criar um estoque paralelo para kits ou judicialização.
9. **Entrada farmacêutica tem requisito de aprovação.** `postHealthStockReceipt` efetiva imediatamente; criar separação entre registro, aprovação e efetivação. Validade hoje é opcional no contrato; AF-016 exige validade.
10. **Arquivos oficiais exigem adaptadores próprios.** O gerador atual produz formato próprio e o processamento retorna validação local. Planejar BPA-C/BPA-I/APAC/AIH/RAAS e transmissão externa separadamente, com formatos e receptor identificados.
11. **Históricos exigem completude.** `listPatientTimeline` limita consultas por origem e não consulta diretamente todas as esperas; a unificação atual transfere sete relações de paciente, mas não todas as relações de laboratório, regulação, TFD, território e produção. Completar ao incluir novas tabelas.
12. **Indicadores precisam dos dados estruturados.** O gerencial tem contagens por período/situação; não fecha GS-041/042, que exigem evolução histórica, linhas de cuidado e busca ativa nominal com contato/endereço.

## 4. Integração Saúde ↔ Assistência Social

### Situação encontrada

`territory-service.ts:50–99` cria/reutiliza `Family` pelo código e grava `FamilyMember`; `social/actions.ts:81–187` faz ligação equivalente ao cadastrar/alterar/inativar família social. O código impede reutilização de código familiar por responsáveis diferentes e considera perfil de saúde ativo ao calcular inativação da família comum.

Isso é uma integração de base cadastral, não um fluxo completo de compartilhamento operacional. `SocialFamilyMember` e `HealthFamilyMember` continuam separados; `SocialFamily.addressId` e `HealthHousehold.addressId` são referências distintas. `SocialReferral` registra destino e contrarreferência, mas não tem ligação direta encontrada à solicitação da Saúde.

### Entregas necessárias, incorporadas às fases

| Ponto | Entrega | Fase | Requisitos da Saúde relacionados |
|---|---|---|---|
| Identidade individual | Selecionar a mesma `Person`; atualizar contato/endereço em origem compartilhada; criar `Patient` quando necessário sem duplicar a pessoa | F01 | GS-001–008, 014, 018, 029 |
| Composição familiar | Reutilizar `Family` explicitamente por ID, com código como identificador de busca; alinhar leitura/escrita dos integrantes e preservar entrada/saída e responsável | F02 | AP-001–003; AS-032 |
| Domicílio e mudança | Compartilhar a referência de endereço comum; manter atributos territoriais de Saúde no perfil; registrar mudança sem reescrever histórico | F02 | GS-004/005; AP-005–007 |
| Informações familiares no atendimento | Exibir parentesco, responsável e domicílio a partir da família comum, com acesso autorizado às informações sociais pertinentes | F04 | AS-032 |
| Referência e contrarreferência | Relacionar encaminhamento intersetorial ao paciente/família e ao registro de destino quando a Saúde receber a demanda; devolver data, profissional e descrição do atendimento autorizadas | F03/F04 | AS-018/038/060; CR-015, 039–053 |
| Sigilo e autoria | Preservar as políticas de Saúde e Social ao consultar dados e emitir documentos; compartilhar vínculo e retorno sem abrir automaticamente narrativas restritas | Todas as fases com consulta intersetorial | AS-029/032 e condições dos registros existentes |
| Benefícios de TFD | Reutilizar pessoa/família e catálogo/infraestrutura comum quando adequado; autorização e entrega do benefício TFD permanecem associadas ao processo da Saúde | F08 | CR-082 |

A família de acompanhamento de saúde não precisa ter todos os atributos sociais copiados. Definir fonte de verdade por informação: identidade/contato na base comum; abrangência e equipe no perfil de saúde; atributos socioassistenciais no perfil social. Ao mudar responsável, desfazer a marca de representante anterior de forma consistente em todos os perfis aplicáveis.

## 5. Referências municipais para configurar as entregas

Base: `docs/Novos docs/Novos docs/`. IDs e limites documentais foram conferidos em `docs/CATALOGO_NOVOS_DOCUMENTOS_IBEMA.md` e nos documentos de análise/comparação relacionados.

| ID / documento | Utilização no plano | Fases | Limite de utilização |
|---|---|---|---|
| 012 — `CARTEIRA DE SERVIÇOS.pdf` | Organização da oferta: acolhimento, atendimento programado, enfermagem, vacinação, saúde bucal, visitas e encaminhamento; unidades, horários e equipes | F01–F07 | Oferta descrita não é atendimento realizado. Usar para configurar serviços e fluxos, não para preencher produção histórica. |
| 119 — `RELATORIO FINAL AUDITORIA SAÚDE TERRITORIALIZAÇÃO E VÍNCULOS.pdf` | Território, cobertura e vínculos da ESF; orientar relação unidade/equipe/área/microárea e consultas de inconsistência | F01/F02/F10 | Auditoria de processo não substitui cadastro nominal de cidadãos, famílias ou profissionais. |
| 107 — `PLANO MUNICIPAL DE SAÚDE 2026-2029.pdf` | Vocabulário e organização das linhas de cuidado, metas e indicadores pertinentes a GS-041/042 | F05/F10 | Não acrescentar neste escopo um módulo completo de planejamento de Saúde. Reutilizar apenas o que dá suporte aos requisitos dos seis blocos. |
| 001 — `1_rdaq_-6.pdf` | Referência de apresentação de rede, produção e indicadores do 1º quadrimestre de 2026 | F10 | Agregados não constituem prontuários. Não distribuir totais entre pacientes nem apresentar agregados como produção gravada individualmente. |
| 003 — `2_rdaq_2025.pdf` | Comparativos por período, definição de origem e leitura de indicadores | F10 | Não somar quadrimestre com relatório anual nem misturar períodos/fonte. |
| 120 — `relatorio_estoque CAF 05-10-2026.pdf` | Produtos, apresentações, unidades de fornecimento e posição por local/competência; referência de consulta CAF | F06/F07 | Snapshot sem lote/validade/custo completos. Não inferir movimentos a partir do saldo. |
| 121 — `relatorio_estoque CAF 28-09-2026.pdf` | Comparação de posição por competência e identificação da data impressa | F06 | Nome do arquivo e data de emissão diferem; preservar a data efetiva do documento. Diferença de saldo não identifica a causa da movimentação. |
| 122 — `relatorio_estoque FARMÁCIA 05-10-2026.pdf` | Farmácia e CAF como depósitos distintos mesmo com o mesmo CNES | F06 | Não fundir saldos nem deduzir automaticamente transferências. |

Os documentos municipais apoiam a configuração e apresentação. Nenhum deles substitui a matriz normativa. Referências complementares de Assistência Social: `docs/PLANO_ASSISTENCIA_SOCIAL_CHECKLIST_POC_194-222.md` e `docs/MODELOS_ASSISTENCIA_SOCIAL_POC_REFERENCIAS.md`; usar somente para compatibilizar os pontos intersetoriais.

## 6. Arquitetura funcional de destino

### Telas e navegação

- **Pacientes:** cadastro completo, situação cadastral, contatos, documentos, óbito e histórico transversal.
- **Administração:** rede, vínculos, mantenedoras, convênios assistenciais, catálogos e parametrizações por unidade/especialidade.
- **Território:** domicílios, famílias, áreas/microáreas, visitas, atenção domiciliar, atividades coletivas e consumo alimentar.
- **Agenda e Regulação:** disponibilidade, consultas/procedimentos, análise administrativa/técnica, espera, presença e retorno.
- **Atendimento:** único núcleo de triagem, evolução, problemas, prescrições, exames, administração, encaminhamento e documentos; abas por especialidade/linha de cuidado.
- **Farmácia:** produtos, entradas/aprovação, estoque, transferências/requisições, dispensações, kits, judicialização e chamadas.
- **Vacinação:** catálogos, calendário, carteira, aplicação, indicação, resgate, aprazamento, ESAVI e estoque.
- **TFD e Transporte:** laudos, trâmites, autorizações, benefícios, rotas/viagens, ocupantes e embarque.
- **Faturamento:** convênios/tabelas, prévias/custos, produção, AIH/APAC, BPA/RAAS e intercâmbio.
- **Gerencial:** séries históricas e busca ativa derivadas dos registros das áreas anteriores.

Adicionar abas/gestores nas rotas existentes sempre que possível. Novas rotas podem ser criadas para AIH/APAC e painéis quando a organização exigir, mantendo vínculo ao mesmo paciente, unidade, atendimento e central documental.

### Modelagem proposta — somente quando a estrutura atual não atender

Todos os nomes abaixo são **a criar ou adaptar**, não evidência de implementação existente. Conferir o schema e consumidores imediatamente antes da migração.

| Grupo | Estrutura proposta | Reutilização e vínculo obrigatório |
|---|---|---|
| Cadastro | Perfil cadastral de Saúde, contatos adicionais/parentesco, horários de contato, vínculos socioafetivos, política de validade por unidade, registro de óbito detalhado | `Person`, `Address`, `Patient`; CPF ausente tratado como ausência, sem identificador artificial |
| Família | Eventos de composição/mudança, perfil de abrangência, documentos familiares e atributos domiciliares | `Family`, `FamilyMember`, `HealthFamily`, `HealthHousehold` e perfis sociais |
| Clínica | Condição/problema longitudinal, alergia, medicamento em uso, questionário clínico versionado, avaliação de exame e administração de medicamento/material | `MedicalRecord`, evoluções, prescrição, laboratório e movimentos de estoque |
| Linhas de cuidado | Gestação, consultas gestacionais/puerperais, avaliação de hipertensão/diabetes, rastreamento citopatológico/mamografia, odontograma e marcações por estrutura dental, sessões terapêuticas | Mesmo `Patient`/atendimento; `SpecializedTherapeuticPlan` quando aplicável |
| Chamadas | Painel por unidade/setor, mensagem, notícia e evento de chamada | `HealthAppointmentEvent`, `HealthReception`, fila de farmácia; dados de chamada limitados ao painel |
| Farmácia | DCB com CAS, classificações RENAME/REMUME, equivalência de unidades CATMAT; entrada pendente/aprovada; processo judicial, advogado, kit/itens/entregas/retornos | `Material`, `Medicine`, estoque único, GED, processo e compras quando cabível |
| Vacinação | Calendário/regras de dose/idade/estratégia, fabricante/código, diluente, incompatibilidade/intervalo, indicação, contraindicação, aprazamento, ESAVI e campanha | `Vaccine`, `VaccinationRecord`, `Material`/estoque; separar frasco de dose |
| Regulação | Etapas administrativa/técnica, cotas por unidade solicitante, ligação entre pedido/espera/agendamento, programas de saúde e contatos | Ampliar `HealthRegulationRequest`, `HealthWaitlist`, cotas e eventos existentes |
| TFD | Laudo, eventos/complementos, autorização, benefícios e entrega; rota/local/embarque/ausência | `HealthTfdRequest`, viagem/passageiros, `FleetUnit`, `Employee`; infraestrutura financeira existente para adiantamento |
| Faturamento | Órgão emissor, faixa numérica/consumo, laudo AIH/APAC, decisões/glosas, autorização/renovação/permanência/pagamento; convênio-procedimento-unidade e tabela auxiliar | Produção, `Covenant` ou perfil assistencial vinculado, unidade e paciente; não confundir convênio administrativo com cobertura assistencial |
| Intercâmbio | Contrato/receptor/versionamento, fila de remessa, resultado por registro e protocolo da origem | Conexões e execuções existentes, `HealthSusFile`, lotes e-SUS; não criar nova central genérica |

## 7. Fases de implementação

Cada fase deve concluir telas, serviços, tabelas, regras e documentos dos itens a ela atribuídos na matriz. Nenhuma fase se encerra apenas por disponibilizar sua tela. Os documentos exigidos fazem parte do próprio fluxo; não ficam acumulados numa fase final de impressão.

### F01 — Cadastro do cidadão, rede e parâmetros

**Dependência:** base existente E01/E02/E11. **Escopo:** GS cadastral e preparação de unidades/profissionais/convênios.

1. Completar dados pessoais e endereços, filiação conhecida/desconhecida, socioafetividade, fotos, contatos adicionais e horário de contato.
2. Resolver pré-cadastro, atualização e validade por unidade, incluindo exceções da urgência. Definir obrigatoriedade do CPF por idade antes de qualquer mudança em `Person`.
3. Implementar óbito detalhado e atualização do cadastro comum; impedir que telas posteriores tratem o cidadão falecido como ativo.
4. Integrar ficha cadastral, cartão com modelo configurável, documentos digitalizados e pasta de documentos ao paciente.
5. Completar mantenedoras, expediente, vínculos profissionais, unidade prestadora e unidade responsável farmacêutica; preparar os campos BNAFAR sem comunicação externa nesta fase.
6. Completar auditoria por alteração e unificação com transferência de todas as relações aplicáveis, preservando histórico.
7. Estabelecer convênios assistenciais e cobertura por especialidade/procedimento/unidade para consumo pela agenda em F03. F09 amplia preços, prévias e faturamento sobre essa mesma base, sem exigir reconstrução dos vínculos.

**Condição de conclusão:** cadastrar/atualizar sem duplicar a pessoa; cadastrar menor sem CPF quando permitido; vencer e renovar cadastro conforme a unidade; emitir ficha/cartão; registrar óbito; consultar alterações e unificar sem perder origens.

### F02 — Família, território e atenção primária

**Dependência:** F01. **Bases:** E07/E12.

1. Reutilizar família comum; definir responsável, parentesco, classe/tipo, unidade e equipe de abrangência; registrar movimentação de integrantes.
2. Completar ficha domiciliar, endereço e atributos territoriais; múltiplas famílias no mesmo domicílio, transferência de domicílio e saída do município.
3. Pasta documental familiar ligada ao GED, com consulta pelo perfil autorizado.
4. Visitas com presença/ausência/recusa por integrante, antropometria/sinais vitais e inclusão de integrante no fluxo.
5. Atenção domiciliar com solicitação → avaliação de elegibilidade → atendimento, modalidade, CID e caráter. Evitar que preencher `elegivel` numa ficha substitua a decisão registrada.
6. Atividades coletivas com tipo, temas/práticas e procedimentos; consumo alimentar com marcadores por faixa/condição e histórico individual.

**Condição de conclusão:** localizar a mesma família na Saúde e Social; acompanhar mudança com histórico; gravar visita e seus desfechos; concluir atendimento domiciliar somente após avaliação; consultar histórico alimentar e produção coletiva.

### F03 — Agenda, regulação e chamada

**Dependência:** F01; F02 para programas e composição familiar. **Bases:** E04/E08/E11.

1. Completar agendas de unidade, profissional e especialidade; convênio, prestador, local distinto, vigência, sexo/idade e múltiplos vínculos.
2. Feriados com abertura configurável, bloqueios por período, confirmação de presença, liberação por ausência e comprovante com horário marcado/fixo.
3. Integrar consultas/procedimentos às requisições e cotas, exibindo disponibilidade e impedindo consumo além do saldo.
4. Regulação administrativa/técnica parametrizável, prioridade, parecer/motivo, complementos, anexos e linha do tempo.
5. Aprovação → espera liberada → agendamento → presença → execução → retorno. Cada etapa preserva o vínculo ao pedido original e o saldo da cota.
6. Espera de programas de saúde; registros de contato telefônico; aviso de agendamento por e-mail usando o serviço de comunicação existente.
7. Painéis por unidade/setor, chamada, mensagem configurável e notícias; usar o mesmo núcleo também na Farmácia.

**Condição de conclusão:** agendar pelos dois caminhos e pelas esperas; transferir/cancelar/liberar vaga e cota corretamente; rastrear análise e chamada sem duplicar agendamento ou reserva.

### F04 — Atendimento multiprofissional e documentos

**Dependência:** F01/F02/F03. **Bases:** E03/E04/E05/E11/E12.

1. Centralizar consultas e demanda espontânea, escuta inicial, triagem indicada, atendimento, vacinação vinculada e encaminhamento interno de fila.
2. Campos por especialidade e questionários clínicos com obrigatoriedade por condição; problema longitudinal com início e narrativa de evolução.
3. Prescrição com quantidade/tipo de uso/dias, manipulados, separação automática/manual por tipo e modelos de receituário.
4. Administração de medicamentos e materiais, distinguindo estoque da unidade e propriedade do paciente; atualizar movimento somente quando devido.
5. Requisição/avaliação de exames e visualização de laudos do laboratório; contrarreferência de especialista e retorno intersetorial vinculado.
6. Indicativos de alergia, uso contínuo e condições; consulta de histórico e família autorizados.
7. Conclusão em observação cria/vincula o episódio, com evolução acessível; ausência/não atendimento com justificativa.
8. Documentos do desfecho: atestado, comparecimento, receita, espelho com triagem, encaminhamento, BPA-I/TFD quando aplicável, modelos formatáveis e assinatura digital pelo fluxo da plataforma.
9. Janela parametrizada de alteração de atendimento concluído, com revisão e autoria; atuais travas de somente consulta precisam comportar essa regra.
10. Digitação por voz em todos os campos textuais do atendimento. Habilitação de biometria e troca de profissional/login preservando o método de autenticação e autoria; interface preparada para o equipamento na implantação.

**Condição de conclusão:** concluir o mesmo núcleo pelo agendado e espontâneo; documentos refletem os dados persistidos; observação não perde o episódio; edição respeita a janela; campos textuais aceitam voz; troca de profissional não altera indevidamente a autoria.

### F05 — Linhas de cuidado e odontologia

**Dependência:** F04; F02 para família/consumo alimentar. **Bases:** E03/E07/E12.

1. Gestação aberta a partir do atendimento; DUM/ultrassom/peso/altura/tipo/histórico/último preventivo; cálculo de DPP e idade gestacional com origem do cálculo.
2. Evolução por trimestre, consulta puerperal, parto/condições clínicas, aborto e desfecho administrativo com motivo/justificativa.
3. Gráfico IMC por semana e indicação de gestação no atendimento.
4. Gestor de hipertensão/diabetes com pressão/glicemia, fatores de risco, complicações e indicação no atendimento.
5. Rastreamento citopatológico e acompanhamento de mamografia, com exame/origem, resultado e situação para busca ativa.
6. Atendimento odontológico pelos mesmos caminhos, triagem, odontograma visual adulto/infantil/ambos, situação e procedimento por dente, arcada, quadrante, boca e sextante; evolução e produção vinculadas.
7. Sessões de fisioterapia/psicologia com plano, sessão agendada/realizada, evolução e situação; aproveitar plano especializado sem contar toda evolução como sessão realizada.
8. Estruturar os dados necessários a SISPRENATAL/HIPERDIA. O intercâmbio dos contratos próprios será concluído em F10; a comunicação oficial em F12.

**Condição de conclusão:** acompanhar uma gestação ao desfecho; reabrir o histórico sem recalcular o passado; registrar condições crônicas/rastreamentos; marcar procedimentos dentais com faturamento de origem; controlar sessões pelo plano.

### F06 — Assistência farmacêutica

**Dependência:** F01/F04; painéis F03. **Bases:** E05/E11.

1. Produtos com CATMAT, unidade de fornecimento, princípio ativo, apresentação, RENAME/REMUME e DCB/CAS. Manter a referência à lista DCB de 2007 solicitada no checklist, identificando sua versão.
2. Entradas com nota/data, XML da nota, tipo, doador, itens, fabricante, lote/validade/quantidade/custo; aprovação configurável antes da efetivação.
3. Consultas de entrada, estoque por unidade e lote, baixa, bloqueio, requisição/transferência até recebimento, demanda reprimida e inventário com ajustes rastreáveis.
4. Processos judiciais: advogado/paciente/processo/data, anexos, pedido de compra, fases/cancelamento/renovação, aprovação → dispensação pela própria tela, extrato.
5. Kits com itens/quantidades e geração por validade da receita/endereço/ação programática; entrega, não retirada com justificativa e retorno de estoque sem duplicar movimento.
6. Dispensação por código de barras da receita, seleção pelo paciente, manual por lote/quantidade, receituário especial com prescritor, retirada por terceiro, tipo de receita, declaração de recebimento, filtros e edição/exclusão com recomposição dos saldos.
7. Chamada de farmácia usando o painel compartilhado; preparar códigos/equivalências de unidades e componentes farmacêuticos para BNAFAR.

**Condição de conclusão:** entrada pendente não altera saldo; aprovação altera uma vez; dispensação respeita receita/lote; devolução/alteração recompõe saldos; kit/processo judicial usa o mesmo estoque e histórico do paciente.

### F07 — Vacinação e carteira

**Dependência:** F01/F02/F04/F06. **Bases:** E06/E05/E07/E11.

1. Catálogo de imunobiológico com mapeamento e-SUS/RNDS, fabricante/código e diluente; incompatibilidades e intervalo entre aplicações.
2. Calendário por dose/estratégia/faixa etária e campanhas com início/fim.
3. Carteira individual com aplicação, indicação e profissional indicador, resgate, aprazamento e contraindicação; manter as diferenças entre aplicação histórica e baixa de estoque atual.
4. Aplicação com data selecionável, grupo, local e profissional. Hoje o serviço usa a data padrão de gravação; não fecha a informação de data exigida no fluxo.
5. ESAVI relacionado a imunobiológico/aplicação, tipo de lesão e conduta.
6. Estoque de doses/frasco/diluente, entrada, perdas, bloqueio, requisição/transferência e inventário, reutilizando F06.
7. Carteira impressa, certidão de regularidade e busca ativa calculadas pelo calendário, contraindicações e histórico.

**Condição de conclusão:** saldo por dose coerente; carteira indica pendências/aprazamentos conforme as regras; certidão corresponde à situação calculada; aplicação no atendimento e na carteira converge para o mesmo registro.

### F08 — Transporte, laudos e benefícios TFD

**Dependência:** F01/F03/F04. **Bases:** E09/E11/E12.

1. Reutilizar tipos/marcas/veículos de Frotas; rotas/locais, origem/destino, motivo, veículo, motorista/auxiliar e adiantamento do responsável.
2. Gerenciar viagem, integrantes, confirmação, ordem de tráfego e relação de passageiros.
3. Agendar transporte por destino e rotas disponíveis, paciente/embarque, acompanhantes ocupando vagas e histórico de faltas.
4. Laudo TFD com dados clínicos/tratamento/transporte; impressão após inclusão e reimpressão; complementos com data/hora/usuário.
5. Aprovação/glosa/arquivamento/alteração/negação, autorização com usuário, pedido após autorização/cancelamento e liberação de agendamento do transporte.
6. Trâmites e relatório por unidade/destino/procedimento/profissional; cadastro/autorização/entrega de benefícios ao paciente vinculado ao laudo.

**Condição de conclusão:** pedido clínico percorre autorização e transporte sem redigitação; capacidade conta acompanhantes; falta/embarque e alterações ficam rastreados; benefícios e adiantamento ficam vinculados às suas origens.

### F09 — Gestão interna do faturamento

**Dependência:** F01/F03/F04/F05/F06/F07/F08. **Bases:** E02/E03/E08/E10/E11.

1. Completar o gerenciamento dos convênios assistenciais e procedimentos executáveis por unidade estabelecidos em F01, adicionando tabelas auxiliares e valores com vigência; filtro por grupo/subgrupo. A cobertura necessária ao agendamento já deve estar disponível antes de F03.
2. Procedimentos por ato/especialidade, críticas durante o atendimento e captura automática por origem; produção manual para unidades sem informatização.
3. Prévia por unidade/profissional/geral e custos do paciente do atendimento ao desfecho, distinguindo valor de procedimento e consumo de materiais/medicamentos.
4. Órgãos emissores e faixas AIH/APAC com validade/saldo, consumo exclusivo da numeração e próximo número disponível.
5. Gestor AIH: laudo detalhado, impressão automática, autorização individual/coletiva, duas vias, glosa/arquivo, pagamento manual, cancelamento com autoria/senha parametrizada e saída/óbito refletido no cadastro.
6. Gestor APAC: laudo detalhado, decisões, autorização/duas vias/validade, cancelamento, renovação baseada no laudo anterior e permanência inicial com motivo.
7. RAAS domiciliar/psicossocial com informação de origem estruturada; BPA-C/BPA-I/prévia para impressão, seleção agrupada ou por unidade.

**Condição de conclusão:** atendimento alimenta produção; crítica aponta a origem a corrigir; laudo consome número uma vez; renovação preserva anterior; custo e prévia reconciliam com os registros relacionados.

### F10 — Indicadores e contratos próprios de acompanhamento/regulação

**Dependência:** F02–F09. **Bases:** E07/E08/E10/E11.

1. Séries de anos de dispensação/vacinação/visitas/consultas médicas/odontológicas e painel de linhas da atenção primária.
2. Gestante/puérpera, pessoa idosa, hipertensa, diabética, desenvolvimento infantil, saúde da mulher, e-Multi e odontologia: definir numerador, denominador, população, período, situação e lista nominal com telefone/endereço para busca ativa.
3. Indicadores derivados dos registros estruturados e realizados, com abertura de origem; não estimar atendimentos individuais a partir de totais documentais.
4. Contratos `CELERIFLOW_SISPRENATAL`, `CELERIFLOW_HIPERDIA`, `CELERIFLOW_RIRA`, versão `1.0.0`, JSON UTF-8 e CSV de conferência. Implementar receptores próprios de acompanhamento gestacional, crônicos e regulação, conforme o documento de decisões.
5. Cada contrato tem esquema, obrigatoriedade, unidade/profissional, identificador de origem, versão, operação, remessa, chave contra repetição, resultado por registro, motivo de rejeição e protocolo do receptor.
6. Persistir processamento e retornos; vincular correção à origem e reprocessamento. RIRA contém pedidos e eventos de espera/agendamento; acompanhamento clínico referencia episódio e avaliações.

**Condição de conclusão:** alteração operacional modifica indicador/lista correspondente; séries refletem os períodos cadastrados; remessa e receptor próprio processam registros e produzem retorno rastreável de ponta a ponta.

### F11 — Catálogos e arquivos oficiais

**Dependência:** F01/F05/F07/F09/F10. **Bases:** E02/E10.

1. SIGTAP com relações e competência, atualização de procedimentos e importação automática ao criar competência, preservando referências anteriores.
2. CNES XML com estabelecimento/profissional/vínculo e reconciliação com cadastros internos; não apenas converter XML próprio em linhas internas.
3. Adaptadores oficiais BPA-C/BPA-I, APAC/SIA, AIH/SIH e RAAS por versão, a partir dos fluxos internos. Arquivo agrupado/por unidade respeita configuração.
4. Geração, consulta e download de arquivos com versão, quantidade, unidade/competência e correspondência de campos à origem.
5. Críticas de formato e conteúdo verificadas com os validadores/leiautes do destino; integração de retorno mantém diferença entre geração/validação e transmissão/aceite.

**Condição de conclusão:** catálogos preservam relações e vigência; formatos gerados são reconhecidos pelo destino correspondente e reconciliam com a produção e os laudos.

### F12 — Comunicação externa e configuração dos destinos

**Dependência:** F11 e dados internos completos. **Bases:** conexões/execuções E10 e interfaces dos fluxos anteriores.

1. CADSUS: consulta por CPF e pesquisa por nome+nascimento, seleção/atualização controlada do cidadão.
2. e-SUS: envio da produção e API exigida, preservando o vínculo às fichas/atendimentos; resposta por registro e histórico da remessa.
3. RIRA: adaptador entre contrato próprio e destino oficial; pedidos e lista de espera. SISPRENATAL/HIPERDIA: confirmar padrão vigente e adaptar o contrato próprio quando houver intercâmbio requerido.
4. RNDS: vacinas configuradas/autorizadas, versões, identificadores/fabricantes e retorno do serviço.
5. BNAFAR: unidade responsável, CATMAT/unidade de fornecimento, ambiente/endereço/credenciais, componentes Básico/Especializado/Estratégico, entradas/posição automática e retorno com mensagem/protocolo/quantidades, consulta e situação visual.
6. Laboratório: recepção de resultado do prestador e consulta durante o atendimento, correlacionada ao pedido existente.
7. Configurar equipamento biométrico na implantação utilizando a interface de F04; somente captura/validação do leitor produz autenticação biométrica.

O catálogo atual inclui Hórus/SIGAF/e-SUS Vacinação, mas isso não substitui CADSUS/RIRA/RNDS/BNAFAR. Sua política atual também bloqueia despacho de produção; a configuração da instalação e dos adaptadores deve ser tratada especificamente nesta fase.

**Condição de conclusão:** executar as operações exigidas no destino configurado, consultar o retorno e o protocolo originado por esse destino, corrigir a origem e reenviar sem duplicar registros aceitos.

## 8. Dependências e caminho crítico

```text
F01 Cadastro/rede
 ├─ F02 Família/território
 └─ F03 Agenda/regulação/painéis
      └─ F04 Atendimento/documentos
           ├─ F05 Linhas clínicas/odontologia
           ├─ F06 Farmácia
           │    └─ F07 Vacinação
           └─ F08 TFD/transporte
                └─ F09 Faturamento interno
                     └─ F10 Indicadores/contratos próprios
                          └─ F11 Catálogos/arquivos oficiais
                               └─ F12 Comunicação externa
```

O diagrama é uma ordem de consolidação; F09 depende também de F05/F06/F07, F10 de todas as origens de indicadores e F08 não exige concluir toda a Farmácia. O detalhe de cada fase prevalece sobre o desenho. Convênios e cobertura assistencial são estabelecidos em F01 para que F03 não dependa de F09. Cadastros dos catálogos farmacêuticos/vacinais e numerações podem ser preparados antes, mas suas entregas só se encerram com o fluxo consumidor completo.

### Medidas para evitar retrabalho

- Definir identificadores oficiais, unidades de fornecimento, versões e vínculos de origem em F01/F06/F07/F09, mesmo com comunicação externa em F12.
- Resolver pessoa sem CPF e fonte de verdade familiar antes de desenvolver telas clínicas que dependem desses dados.
- Entregar campos estruturados antes dos indicadores e arquivos; não extrair DUM, dentes ou glicemia de texto livre para preencher campos obrigatórios.
- Centralizar movimentos de estoque e eventos de chamada, evitando implementações separadas para cada tela.
- Mapear todas as relações ao unificar paciente e ao corrigir/remover movimentos; novos módulos devem entrar nesse mapa.
- Normalizar prioridades e estados entre atendimento/regulação: o código usa vocabulários diferentes (`Urgência`, `Urgente`, `Alta`, `Media`, `Normal`). Fazer tradução explícita e consistente, não comparar textos incompatíveis.
- Preservar padrões de Server Actions: `<form action>` retorna `void`/`Promise<void>`; chamada via `await` por client mantém retorno de erro tratável. Antes de mudar assinatura exportada, conferir todos os consumidores.
- Para implementação de Next.js, consultar os guias pertinentes em `node_modules/next/dist/docs/` antes das alterações.

## 9. Critérios de encerramento e acompanhamento

Para cada linha da matriz, registrar na execução: tela/ação, serviço, tabelas, origem, documento/resultado, fase responsável, evidência da operação e pendência remanescente. Não criar novos requisitos para justificar a entrega.

**Condição comum:** ação disponível ao perfil correto → gravação válida → efeitos nas consultas relacionadas → documento/retorno exigido → histórico com origem e autoria. Aplicar verificações aos cenários pedidos pelo checklist, como saldo insuficiente, lote bloqueado, ausência, glosa, expiração e cancelamento.

Documentos devem usar identidade da instituição, unidade, paciente/profissional, data e informações da origem. Indicadores não devem usar valores fixos na interface. A carga de dados deve manter consistência de datas, família/unidade/equipe, estoque, laudos, agenda e produção, passando pelos mesmos fluxos operacionais.

Verificação técnica da futura implementação: aproveitar as verificações de Saúde já existentes em `package.json` quando pertinentes; executar build antes de commit/push conforme as regras do projeto. Este trabalho de planejamento não cria scripts ou verificações adicionais nem executa alterações de aplicação/banco.

### Prioridade inicial

1. Resolver conflitos estruturais GS-009/013–017, AP-001–007 e integração familiar.
2. Fechar agenda → atendimento → regulação e painel, com cotas e histórico corretos.
3. Concluir linhas clínicas, Farmácia e Vacinação com documentos e efeitos de origem.
4. Concluir laudos TFD/AIH/APAC, produção e indicadores.
5. Concluir formatos/catálogos oficiais e comunicação externa nas duas últimas fases.

O inventário não autoriza recriar o módulo inteiro. A matriz define o que reaproveitar, completar ou implementar e o resultado necessário para fechar cada requisito.
