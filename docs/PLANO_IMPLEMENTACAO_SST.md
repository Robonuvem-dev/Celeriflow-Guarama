# Plano de implantação — Segurança e Medicina do Trabalho

Data da análise: 10/10/2026. Módulo: `SST`, rota `/sst`, referência EXE-10.

Este documento preserva a análise inicial e o escopo contratual. Para o estado após `sst4` e o hardening local de 11/10/2026, consultar `EXECUCAO_SST.md` e `EVIDENCIAS_SST.md`. As lacunas iniciais abaixo não são a lista atual de funcionalidades ausentes.

## 1. Fonte e conclusão

Fonte conferida: `docs/Termo de Referencia/Checklist real POC MÓDULOS EXECUTIVO e CAMARA.pdf`, páginas **86–96 do arquivo PDF**, requisitos **1 a 74**. A página 96 contém o último requisito SST e inicia Gestão e-Social; os itens seguintes pertencem a outro módulo. Os números abaixo são os do checklist, não números novos de requisitos. Não foi estabelecida equivalência com uma paginação impressa diferente.

O quadro de cobertura em `docs/CHECKLIST_POC_IBEMA_CODEX.md` registra 74 requisitos e mínimo de 67. A meta de implantação deste plano é 74; o mínimo não define quais sete poderiam ser excluídos.

**Conclusão:** já existe a fundação de navegação e autorização de SST e existem dados funcionais e serviços assistenciais reaproveitáveis. Não foi localizado um domínio ocupacional completo com ASO, GHE, LTCAT, PGR, PCMSO, CIPA e CAT nas buscas realizadas no schema e em `src`. Isso representa ausência de evidência de cobertura, e não homologação negativa de todas as funcionalidades do sistema.

Esta matriz é uma síntese rastreável do checklist. O PDF permanece a referência para o texto integral. O cruzamento com `ESPECIFICAÇÕES FUNCIONAIS DOS MÓDULOS EXECUTIVO.pdf` foi conferido em 10/10/2026: páginas PDF 56–62, itens 1.732–1.805, correspondem, na mesma ordem, aos 74 requisitos SST desta matriz (item n → 1.(731+n)). A equivalência textual não comprova implementação ou homologação.

Referências correlatas conferidas: eSocial separado em páginas 62–63, itens 1.806–1.825; serviços SST do portal na página 103, itens 1.1309/1.1310 (CIPA), 1.1312 (PPP), 1.1313 (CAT), 1.1316 (planos) e 1.1318 (agenda). Esses itens correlatos não ampliam a contagem dos 74 requisitos SST.

## 2. Evidências e reaproveitamento

| Código | Evidência no repositório | Reutilização e lacuna |
|---|---|---|
| E1 | `src/app/app-domain/sst/page.tsx`, `layout.tsx`; `docs/MODULOS_PLANEJAMENTO_SST.md` | Card, painel e acesso próprios. Áreas futuras do painel não são rotinas ocupacionais implementadas. Links para servidores/licenças continuam exigindo RH. |
| E2 | `prisma/schema.prisma`: `Employee`, `Person`, `Dependent`, `Leave`, `AttendanceRecord` | Servidor e pessoa canônicos; dependentes e ponto como referências. `Leave` tem servidor, tipo, datas, motivo e situação; faltam emitente, múltiplos CIDs, horas, protocolo, entrega, perícia e vínculo de origem ocupacional. |
| E3 | `src/app/app-domain/rh/licencas/actions.ts` | `saveLicenca` usa autorização RH e retorna sucesso/erro; grava licença e revalida RH/portal. Não há nesse arquivo deferimento pericial nem cálculo automático de reflexos em folha. |
| E4 | `src/app/app-domain/rh/folha/`, `rh/parametrizacoes/`, `rh/ferias/`, `rh/dependentes/` | Pontos de integração para competência, rubricas, férias e dependentes. Existência dessas áreas não comprova cálculo de absenteísmo nem gestão ANS/titular/dependente. |
| E5 | Schema: `HealthProfessional`, `HealthUnit`, `HealthAppointment`, `MedicalRecord`, `HealthDiagnosis`, `HealthClinicalDocument`, `HealthPrescription`, `HealthExamRequest`, `HealthReferral` | Há estrutura clínica e assistencial. Reaproveitar conceitos e componentes após avaliar consumidores; manter os registros SUS separados dos ocupacionais. |
| E6 | Schema: `HealthLabExamModel`, `HealthLabQuestionnaire`, `HealthLabOrder`, `HealthLabResult`; `src/lib/saude/` | Laboratório, resultados e questionários são candidatos a infraestrutura compartilhada, não evidência de exame toxicológico/ASO do servidor. |
| E7 | `src/lib/platform/tenant-context.ts`; `configuracoes/perfis/` | Reutilizar autenticação, ativação, operações e escopo. Permissão SST não concede acesso Saúde/RH nem acesso clínico irrestrito. |
| E8 | `src/components/app-ui/erp/ErpListFrame.tsx`, `ErpPagination.tsx` | Moldura de lista e paginação existente com padrão 20. O corpo de `ErpListFrame` usa `overflow-auto`, exigindo adequação específica para SST. |

Busca por `ASO`, `PCMSO`, `LTCAT`, `CIPA`, `GHE`, `S-2210`, `S-2220`, `S-2240` e `HealthPlan/healthPlan` em fontes TypeScript encontrou apenas a menção futura a ASO no painel SST. Não foram identificadas por esses termos rotinas próprias ou adaptadores desses eventos. Validar eventuais nomes alternativos e o conector eSocial antes de implementar a integração. Não criar cadastro de plano de saúde paralelo a uma estrutura de benefícios que venha a ser identificada na revisão de seus consumidores.

## 3. Etapas de entrega

| Etapa | Entrega | Dependências e aceite |
|---|---|---|
| F0 | Fundação ocupacional e UX | Escopo entidade/UG; permissões por rotina e classe de informação; profissionais por `Person`; motivos/CID; anexos protegidos; listas de 20; migração aditiva. |
| F1 | Atestados, perícias e agenda | F0; cadastro completo, comprovantes, juntas, restrições por motivo, vínculo idempotente com licença e simulação dos reflexos em folha. |
| F2 | Ambientes, GHE e programas | F0; regras por local/cargo/função e vigências; LTCAT/PGR/PCMSO; ordens de serviço e necessidade de equipamentos. |
| F3 | Exames, ASO e atendimento | F1/F2; tipos/resultados, candidato sem contrato, anamnese versionada, prontuários profissionais, solicitações, vacinas e vencimentos. |
| F4 | EPI/EPC e estoque | F2; catálogo complementar ao material canônico, entregas/baixas/revisões, recibos, movimento real de estoque e leitor biométrico homologado. |
| F5 | Acidentes e restrições | F1/F3; CAT, investigação, atendimento, incidentes, pareceres técnico/médico e acompanhamento de restrições. |
| F6 | Prevenção e programas especializados | F2/F3; CIPA/SIPAT/eleições, inspeções, visitas, brigada, extintores, ergonomia e PCA. |
| F7 | Planos e integração com Folha | F0 e revisão de E4; ANS, adesões, titulares/dependentes, despesas/devoluções e demonstrativos por competência. |
| F8 | Integrações, relatórios e POC | Integração eSocial entregue junto aos domínios de origem; fechamento com PPP, prontuário consolidado, indicadores e demonstração dos 74 itens. |

F8 não deve postergar a arquitetura eSocial: definir seus contratos em F0 e validar ASO em F3 e CAT em F5. Benefícios e relatórios financeiros requerem conferência dos serviços de Folha existentes antes da modelagem definitiva.

## 4. Matriz dos 74 requisitos

Status inicial de todas as linhas: **pendente de comprovação ocupacional**. “Base” identifica evidência reutilizável da seção 2, sem classificar o requisito como atendido. A coluna entrega/lacuna estabelece o que deve ser demonstrado para aceite.

| Item | Página PDF | Entrega/lacuna a comprovar | Base | Etapa |
|---|---|---|---|---|
| 1 | 86 | Atestado com emitente, múltiplos CIDs, motivo, datas/horas inicial e final, entrega, protocolo, situação, parentesco e anexos. | E2/E5 | F1 |
| 2 | 86 | Comprovante de entrega e parâmetro para impressão automática após cadastro. | E5 | F1 |
| 3 | 86 | Perícia ligada ao atestado; deferimento configurável gera afastamento com reflexos na folha. | E2/E3/E4 | F1 |
| 4 | 86 | Relatório filtrado por período, servidor, cargo, regime, motivo, profissional, local, centro de custo e CID. | E2/E5 | F1 |
| 5 | 86 | Gestão de atestados por período: dias, frequência CID, idade média e custo para entidade. | E2/E4 | F8 |
| 6 | 86 | Entrega e protocolo com geração automática ou informação manual parametrizadas. | E3 | F1 |
| 7 | 86–87 | Absenteísmo por competência: horas atestadas versus planejadas, com custo estimado opcional. | E2/E4 | F8 |
| 8 | 87 | Cadastro de atestado abre confirmação do afastamento conforme parâmetro, mantendo vínculo entre ambos. | E2/E3 | F1 |
| 9 | 87 | Motivo restringe lançamento por regime e cargo, com bloqueio no servidor. | E2 | F1 |
| 10 | 87 | Motivo controla dependente habilitado/desabilitado e obrigatório/opcional. | E2 | F1 |
| 11 | 87 | Juntas médicas com vigência e profissionais integrantes. | E5 | F1 |
| 12 | 87 | Agenda por profissional/unidade, disponibilidade e bloqueios temporários por férias/compromissos. | E5 | F1 |
| 13 | 87 | Comprovante de agenda com profissional, unidade, servidor, data e hora. | E5 | F1 |
| 14 | 87 | CIPA: vigência, membros, funções e atas vinculadas. | E2 | F6 |
| 15 | 88 | Plano CIPA por atividade: ações, objetivos, local, estratégia, período e responsáveis. | E2 | F6 |
| 16 | 88 | Inspeções com data/hora, responsável e formulário personalizado. | E6 | F6 |
| 17 | 88 | Reuniões ordinárias/extraordinárias, comissão gera participantes; adiamento justificado, nova data, ata e presenças. | E2 | F6 |
| 18 | 88 | Calendário anual das reuniões CIPA. | E1 | F6 |
| 19 | 88 | SIPAT com organizadores, atividades, local, data/hora, custos e programação impressa. | E2 | F6 |
| 20 | 88 | Eleição CIPA com comissão, candidaturas, votos, participação percentual e apuração. | E2 | F6 |
| 21 | 88 | Exame toxicológico do servidor: laboratório, número, data e profissional. | E6 | F3 |
| 22 | 88–89 | GHE por regras de local/cargo/função, dispensando associação manual individual. | E2 | F2 |
| 23 | 89 | Consulta de servidores por GHE, inclusive sem grupo. | E2 | F2 |
| 24 | 89 | Ordem de serviço específica/GHE: riscos, EPI, treinamentos, prevenção, normas e conduta em acidente. | E2 | F2 |
| 25 | 89 | Cadastro EPI/EPC: validade em dias, intervalo de revisão e certificado de aprovação. | E1 | F4 |
| 26 | 89 | Entregas e baixas individuais/coletivas com comprovante EPI/EPC. | E2 | F4 |
| 27 | 89 | Entrega individual com confirmação biométrica em leitor homologado. | E7 | F4 |
| 28 | 89 | Parâmetro de integração de entrega com baixa automática real no Almoxarifado, se contratado. | E7 | F4 |
| 29 | 89 | Revisões de equipamentos em uso: próxima data, responsável e observações. | E2 | F4 |
| 30 | 89–90 | Tempo e média de uso com entrega/baixa/quantidade, servidor e quebras por cargo, centro, local e GHE. | E2 | F4 |
| 31 | 90 | Responsáveis ambientais/biológicos por cadastro único, tipo e vigência. | E2/E5 | F2 |
| 32 | 90 | LTCAT vigente por GHE: condições, riscos, danos, propagação, controle, tempo, fontes e aplicabilidade/quais EPI. | E2 | F2 |
| 33 | 90 | PGR com avaliação detalhada de riscos, perigos e danos por GHE. | E2 | F2 |
| 34 | 90 | Necessidade de EPI pelo PGR por GHE/servidor, incluindo entregas realizadas opcionalmente. | E2 | F4 |
| 35 | 90–91 | PCMSO vigente: objetivos, responsabilidades, procedimentos, arquivo, primeiros socorros, campanhas; exames por GHE para admissão, periódico, mudança de função, retorno, monitoração e demissão. | E5/E6 | F2 |
| 36 | 91 | Questionários personalizados de enfermagem, psicologia e assistência social, impressos em branco e preenchidos no sistema. | E6 | F3 |
| 37 | 91 | ASO e exames/resultados apresentados/realizados, datas e validades; emissão preenchida ou em branco. | E5/E6 | F3 |
| 38 | 91 | Anamnese médica personalizada vinculada ao ASO. | E6 | F3 |
| 39 | 91 | ASO admissional, periódico, retorno, mudança de riscos, demissional, licença sem vencimentos e monitoração pontual. | E2 | F3 |
| 40 | 91 | Resultados apto, inapto, apto com restrições, apto com recomendações e inapto temporário. | E5 | F3 |
| 41 | 91 | Geração de informações ASO para eSocial a partir do documento ocupacional. | E7 | F3/F8 |
| 42 | 91 | Resultado ASO parametriza sugestão de novo horário de agenda. | E5 | F3 |
| 43 | 91–92 | ASO admissional de candidato de concurso/processo seletivo sem contrato de servidor obrigatório. | E2 | F3 |
| 44 | 92 | Retorno apto alerta vencimento iminente do segundo período de férias conforme parâmetro. | E4 | F3 |
| 45 | 92 | Relatório ASO por intervalo de vencimento. | E5 | F3 |
| 46 | 92 | CAT: agente, partes atingidas, situação, depoimento, testemunhas, despesas e reembolsos. | E2 | F5 |
| 47 | 92 | Servidor comunica CAT pelo próprio portal. | E7 | F5 |
| 48 | 92 | Investigação vinculada à CAT e homologação mediante parecer técnico e médico. | E5 | F5 |
| 49 | 92 | Investigação registra idade, escolaridade, IMC, outro emprego, extras, clima, umidade e temperatura. | E2/E5 | F5 |
| 50 | 92 | Relatório conjunto da comunicação e investigação. | E5 | F5 |
| 51 | 93 | CAT impressa conforme layout padronizado INSS. | E5 | F5 |
| 52 | 93 | Informações CAT geradas para eSocial. | E7 | F5/F8 |
| 53 | 93 | Atendimento ligado à CAT/investigação: profissional, lesão, múltiplos CIDs, diagnóstico provável e observações. | E5 | F5 |
| 54 | 93 | Incidentes de trabalho: local, descrição, testemunhas, data/hora e análise de causas. | E2 | F5 |
| 55 | 93 | PPP com história funcional, locais, CAT e riscos LTCAT do servidor. | E2 | F8 |
| 56 | 93 | Restrições: tipo, motivo, período, grau, profissional, múltiplos CIDs e acompanhamentos datados. | E2/E5 | F5 |
| 57 | 93 | Liberação ou impedimento de cada atribuição do cargo na restrição. | E2 | F5 |
| 58 | 93 | E-mail automático ao responsável próximo do término da restrição, parametrizado. | E7 | F5 |
| 59 | 93–94 | Visitas técnicas SST: tipo, responsável e detalhes. | E5 | F6 |
| 60 | 94 | Brigada: pavimentos, treinamentos, exames necessários, plano de ação e reuniões. | E2 | F6 |
| 61 | 94 | Extintores: responsável, fornecedor, localização, instalação e validade. | E2 | F6 |
| 62 | 94 | Recargas/testes hidrostáticos: data, validade, empresa e responsável técnico. | E2 | F6 |
| 63 | 94 | Solicitações médicas ao servidor: encaminhamentos, medicamentos, exames e relatório. | E5 | F3 |
| 64 | 94 | Relatório funcional SST reúne atestados, acidentes, entregas, ASO, laudos, juntas, restrições e solicitações. | E2/E5 | F8 |
| 65 | 94 | Planos ANS e rubricas de desconto de mensalidade/despesa extraordinária em folha. | E4 | F7 |
| 66 | 94–95 | Adesão/carteirinha/mensalidade titular; dependentes com vigência, carteirinha e valor; despesas/devoluções individualizadas. | E2/E4 | F7 |
| 67 | 95 | Geração automática de mensalidades/despesas separadas titular/dependentes na DIRF e comprovante de rendimentos. | E4 | F7 |
| 68 | 95 | Demonstrativo mensal por servidor/período de mensalidades, despesas e devoluções titular/dependentes. | E4 | F7 |
| 69 | 95 | Ergonomia coletiva e individual: máquinas, móveis, EPI/EPC, iluminação/temperatura/ruído, recomendações e anexos. | E2 | F6 |
| 70 | 95 | PCA e resultados audiométricos dos servidores. | E6 | F6 |
| 71 | 95 | Vacinação de servidores com contexto ocupacional. | E5 | F3 |
| 72 | 95 | Prontuário médico ocupacional: atendimento, profissional, parecer, múltiplos CIDs, exames e diagnóstico. | E5 | F3 |
| 73 | 95 | Laudo médico emitido com base no prontuário ocupacional. | E5 | F3 |
| 74 | 96 | Prontuários psicológico e de assistência social ocupacionais com pareceres e encaminhamentos por profissional. | E5 | F3 |

## 5. Arquitetura proposta

Os nomes a seguir são sugestões de domínio, não modelos já criados:

- `SstMedicalCertificate`, diagnósticos associados, `SstMedicalAssessment`, juntas e membros; vínculo opcional/aditivo ao `Leave` legado.
- `SstProfessionalRole` associado a `Person`, responsabilidade técnica/conselho e vigência; não duplicar dados pessoais. Avaliar relação autorizada com `HealthProfessional` quando o mesmo profissional atuar nos dois contextos.
- `SstWorkEnvironment`, `SstExposureGroup`, regras por local/cargo/função e histórico de exposição; reutilizar organograma e preservar a condição funcional na data do evento.
- Programas e versões LTCAT/PGR/PCMSO/PCA com dados estruturados por GHE, riscos, medidas, equipamentos e exames. PDF anexado sozinho não atende às consultas e relatórios exigidos.
- `SstOccupationalExam`, ASO e exames associados; `personId` obrigatório, vínculo funcional/candidato conforme o tipo. ASO admissional deve aceitar candidato sem criar `Employee` artificial.
- Equipamento ocupacional como extensão do material canônico; entregas, itens, baixa de uso, revisão e evidência de recebimento. Distinguir validade do equipamento, do certificado e prazo de revisão.
- CAT, investigação, testemunhas, despesas, pareceres e atendimentos relacionados; incidentes sem CAT; restrições e liberação de atribuições.
- CIPA, mandatos, membros, planos, reuniões, SIPAT, eleições; brigadas e controle técnico de extintores com referência patrimonial quando aplicável.
- Plano de saúde e adesões: primeiro avaliar modelo genérico de benefícios, manter titular/dependente e competência identificáveis, rubricas canônicas e lançamentos auditáveis.
- Prontuários ocupacionais com autoria profissional e separação de medicina, psicologia e assistência social. Formulários e respostas guardam versão do questionário usado.

Consultas devem aplicar entidade/UG e autorização antes de contar/paginar/exportar. Índices sugeridos: entidade + servidor + data; entidade + situação + vencimento; GHE + vigência. Evitar apagar histórico utilizado em ASO, PPP ou eventos transmitidos; correções por versões/retificações.

## 6. Contratos de integração

### RH/Folha

Atestado → análise/perícia → decisão → confirmação quando configurada → licença vinculada → reflexo por competência. Definir estados e transições; indeferimento não gera afastamento. Repetir deferimento não pode duplicar licença nem desconto. Anulação deve registrar o tratamento de reflexos existentes, respeitando competências fechadas.

O serviço de integração deve reutilizar a regra funcional e o servidor canônico com autorização explícita para a operação. Não chamar indiscriminadamente `saveLicenca` com permissão SST: essa action valida RH e possui consumidores próprios. Antes de extrair serviço ou mudar assinatura, localizar todos os imports/chamadas e preservar o retorno `{ success, error }` esperado pelos clientes.

Absenteísmo: calcular minutos atestados efetivamente sobrepostos à jornada planejada por competência, unindo intervalos sobrepostos para evitar contagem dupla. Não usar simplesmente dias × 8. Exibir metodologia do custo e tratamento de ausência de jornada; denominador zero significa índice indisponível, não 0% artificial.

Planos: reconciliar mensalidades, despesas e devoluções por beneficiário/competência com descontos de folha e rendimentos. O item 67 menciona DIRF; preservar a rastreabilidade contratual e validar o leiaute/obrigação aplicável ao ano de referência antes de desenvolver a saída fiscal.

### Saúde e documentos

Separar agenda e prontuário ocupacionais dos assistenciais. Compartilhamento de profissional, unidade, catálogo CID ou componentes exige avaliar serviços e permissões. Importação de resultado externo deve guardar origem e documento apresentado; não consultar todo o prontuário SUS a partir do CPF do servidor. Encaminhamento e vacinação devem ter finalidade e vínculo ocupacional explícitos.

Documentos gerados devem preservar versão, autoria, emissão, conteúdo usado e anexos autorizados. Download, impressão e exportação aplicam a mesma autorização da consulta.

### Almoxarifado e biometria

Entrega integrada deve registrar entrega e saída de estoque de modo atômico ou com fluxo recuperável, identificador idempotente e reconciliação. Validar saldo, depósito, lote, bloqueios e inventário usando o serviço existente. Baixa de uso de EPI não significa entrada automática no estoque; devolução física requer movimento próprio.

Para item 27, identificar equipamento/SDK homologado, ambientes suportados, identificação do recebedor e evidência da confirmação. Botão de aceite ou leitura simulada não comprova biometria. Definir política de guarda e acesso à evidência sem colocar dados biométricos em logs gerais.

### eSocial e portal

Planejar adaptadores ASO → S-2220 e CAT → S-2210 conforme leiaute aplicável; exposição → S-2240 e eventual evento de toxicológico devem ter aplicabilidade validada, sem somá-los como requisitos adicionais deste checklist. Reutilizar infraestrutura de lotes, assinatura, envio/retorno se comprovada no conector existente. Guardar origem, versão, XML, ambiente, protocolo, rejeição, recibo e retificação. Gerar XML não comprova transmissão aceita.

Portal CAT valida o vínculo do usuário autenticado com seu servidor; não confiar no `employeeId` informado pelo cliente. Prever também as dependências de autoatendimento do checklist: inscrições/votos CIPA, PPP, despesas de planos e agenda SST (páginas 157–158), como integrações correlatas sem inflar a contagem de 74.

## 7. Telas e padrão ERP

Navegação proposta: Painel; Atestados e perícias; Agenda; Ambientes e GHE; Programas e laudos; Exames e ASO; EPI/EPC; Acidentes e incidentes; Restrições; CIPA e prevenção; Brigada e extintores; Planos; Prontuários; Relatórios; Configurações.

Usar consistência visual do ERP atual: título/breadcrumb, ação principal, filtros, resumo, lista, ações por linha e paginação. Totvs, Primavera, SAP, IPM e Betha são referências de qualidade solicitadas; esta análise não atribui padrões específicos a esses produtos nem declara pesquisa visual externa realizada.

### Lista de 20 itens sem rolagem da tabela

1. Paginação no servidor com `take: 20`, filtros persistidos na URL, ordenação estável com desempate por ID, total filtrado e página normalizada. Não buscar toda a base para cortar no cliente.
2. Reutilizar `ErpPagination` com `pageSize={20}` e os controles anterior/próxima/ir para página.
3. Para SST, usar corpo de lista com altura natural, sem `overflow-auto`, `overflow-x-auto` ou `overflow-y-auto` na tabela. Revisar os ancestrais de workspace para não introduzir clipping. Não remover o overflow compartilhado globalmente sem conferir consumidores.
4. Tabela `w-full table-fixed`, `colgroup` com orçamento de largura; códigos/datas/ações compactos, nome e descrição flexíveis. Texto completo disponível na ficha; não colocar todos os campos do cadastro na grade.
5. Visualizações de colunas adaptadas à largura, mantendo identificação/situação/ações; em telas estreitas usar apresentação compacta ou cartões com os mesmos 20 registros. Não resolver excesso de colunas reduzindo texto a ponto de prejudicar leitura.
6. Ficha em abas/seções: identificação, detalhes, anexos e histórico. Narrativas médicas longas pertencem à ficha, com acesso profissional apropriado.
7. Estados de vazio, carregamento e erro; foco visível; status com texto além de cor; números alinhados e datas consistentes.

**Limite físico:** 20 linhas legíveis, filtros e cabeçalho não cabem em toda altura de tela. A exigência adotada é ausência de rolagem horizontal e vertical **interna da tabela**; a página pode crescer e ter rolagem natural. Ausência de toda rolagem vertical da página junto de 20 linhas em qualquer viewport precisaria de um requisito de altura mínima. Não ocultar registros para aparentar conformidade.

| Grade | Colunas principais sugeridas |
|---|---|
| Atestados | Protocolo, servidor/matrícula, período, duração, situação, ações |
| ASO | Número, pessoa/matrícula, tipo, realização, validade, aptidão, ações |
| GHE | Código, descrição, local, vigência, situação, ações |
| Entregas | Número, servidor, equipamento, quantidade, entrega, situação, ações |
| CAT | Número, servidor, acidente, situação, envio eSocial, ações |
| Planos | Plano, titular/matrícula, competência, mensalidade, despesas, devoluções, ações |

CIDs, diagnósticos e pareceres não são colunas gerais para perfis administrativos. Testar nomes longos, zoom e larguras 1366/1440/1920 e apresentação estreita, verificando também o rodapé de paginação.

## 8. Permissões e escopo clínico

- Administrativo SST: protocolo, agenda e andamento, sem diagnósticos/pareceres restritos.
- Médico ocupacional: ASO, perícias, prontuário e informações clínicas necessárias ao atendimento autorizado.
- Enfermagem, psicologia e assistência social: registros de sua atuação e compartilhamento explicitamente definido.
- Segurança do trabalho: ambientes, riscos, programas, EPI, prevenção e parecer técnico; acesso apenas ao conteúdo clínico autorizado.
- RH/Folha: duração, decisão e reflexo funcional/financeiro necessários; não recebe prontuário integral.
- Servidor: seus serviços e documentos autorizados no portal.

Modelar essas capacidades na matriz existente de perfis e validar operações no servidor. Prefeitura e Câmara permanecem segregadas por entidade/UG. Auditar leitura/exportação sensível e alterações com autor/data/origem, sem despejar conteúdo clínico em logs técnicos ou painel público. SST é distinto de `SEGURANCA` (Segurança e Mobilidade).

## 9. Roteiro de validação e evidências POC

Cada item da matriz só passa a “atendido” com rota/action, dados persistidos, relatório quando exigido, teste de regra e evidência demonstrável. Registrar versão/commit, perfil, entidade, passos, resultado e arquivo emitido.

1. Atestado com múltiplos CIDs, horas e dependente; bloqueios por motivo; comprovante; perícia deferida/indeferida; reexecução sem duplicar licença e reflexo.
2. Jornada variável e dois atestados sobrepostos atravessando competências: conferir horas e custo do absenteísmo.
3. GHE por local/cargo/função com mudança de lotação: preservar períodos históricos e apontar servidor sem grupo.
4. PGR/LTCAT/PCMSO estruturados; necessidade EPI; ASO com exames e candidato sem contrato; todas as opções de tipos/resultados; alertas de agenda/férias/vencimento.
5. Entrega coletiva, revisão e baixa; saldo insuficiente, inventário e reenvio; recibo e confirmação em leitor real.
6. CAT pelo servidor, pareceres técnico/médico, atendimento, despesas, impressão INSS e evento eSocial com retorno rastreável.
7. Restrição por atribuição e alerta próximo ao fim; reuniões adiadas, presenças, SIPAT, eleição com voto duplicado impedido e cálculo correto de participação.
8. Brigada, recarga/teste de extintor, ergonomia, audiometria/PCA e vacinação.
9. Plano com titular e dois dependentes, vigências diferentes, despesas/devoluções: reconciliar demonstrativo, folha e rendimentos.
10. PPP e prontuário funcional com histórico completo autorizado; negar acesso clínico ao perfil administrativo e cruzamento de entidade; validar downloads/exportações.
11. Base com mais de 40 registros: 20 por página, filtros/ordenação/página persistidos, sem duplicação ou perda e sem scroll interno da tabela.

## 10. Preparação técnica da implantação

- Conferir consumidores de qualquer função exportada antes de alterar assinatura/retorno; preservar padrão de actions de formulário versus chamadas `await` no cliente.
- Ler guias relevantes de `node_modules/next/dist/docs/` antes de escrever as futuras rotas/actions, conforme `AGENTS.md`.
- Migrações por etapa são aditivas; novos vínculos legados opcionais, backfill explícito e relatório de inconsistências. Não resetar banco operacional nem usar bootstrap destrutivo como validação.
- Antes de cada alteração em componente compartilhado, avaliar consumidores individualmente. Integrações financeiras/estoque/folha exigem testes de transação, idempotência e regressão.
- Na entrega de código executar Prisma validate quando houver schema, testes relevantes, lint e build. `npm run build` deve passar antes de commit/push.
- Conferir Git e trabalho dos dois notebooks antes de aplicar migrações ou enviar alterações; manter arquivos e documentos do usuário.

**Primeiro incremento recomendado:** F0 + cadastro completo de atestados e motivos, comprovante de entrega e consulta paginada; depois perícias e vínculo controlado com licenças. Isso produz uma jornada verificável e prepara a integração com Folha sem confundir atestado, licença e ASO.
