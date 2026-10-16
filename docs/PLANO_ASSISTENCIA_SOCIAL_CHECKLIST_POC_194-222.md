# Plano de adequação — Assistência Social (POC, páginas 194–222)

> Documento de análise e planejamento. Não representa implementação concluída nem certificação de conformidade. A situação foi avaliada por leitura estática do repositório e do checklist; não foram executados fluxos no navegador nem consultados dados reais da base.

## 1. Objetivo e escopo

### Continuidade — vínculos, prontuário, benefícios, rede e modelos (10/10/2026)

- **Vínculos e sigilo:** implementado `/social/profissionais`, com vigência, equipamento, cargo/especialidade, expediente, escopos individual/familiar e marcação para RMA. Administração de vínculos restrita ao master. Leituras de atendimentos e visitas filtradas no servidor; escrita de atendimento exige vínculo com o equipamento. Participantes profissionais já integram a política, mas sua edição na interface permanece pendente.
- **Prontuário individual:** implementados `/social/pessoas` e detalhe, reutilizando `Person`, com perfil social/trabalhista, vulnerabilidades/potencialidades, encerramento com motivo, rendas/despesas por competência, cancelamento histórico e totalização exata em centavos. Tabelas paginadas em 20 registros. Identificação ativa duplicada bloqueada por índice parcial. Tipos autorizados de equipamento configuráveis para vulnerabilidades. Perfil social compartilhado ainda não possui política própria de sigilo por campo.
- **Benefícios:** implementado `/social/requisicoes`, com múltiplos itens, avaliação por autorizador, notificação interna, entrada de estoque com fornecedor/nota informados, cotas sem sobreposição, entrega transacional e cancelamento antes de entrega. Regras de modalidade/aprovação/cota são copiadas para o item, preservando a configuração da requisição. Entrega bloqueia estoque/cota insuficientes e repetição, com rollback integral. A concessão direta antiga orienta usar o novo fluxo. Ainda pendentes documentos obrigatórios/anexos, classificação completa, cadastro central de fornecedor, limites financeiros por benefício, integração da demanda reprimida, BPC e folhas externas.
- **Rede e encaminhamentos:** implementado `/social/encaminhamentos`, com órgãos, CPF/CNPJ opcional validado, ativação/inativação, identificação individual ou familiar, motivo/público prioritário configurados, destino, profissional de referência e retorno com data/descrição. Comprovante protegido e auditado. Tipo de órgão ainda informado como texto; integração ao catálogo de tipos da rede e participação de outros equipamentos permanecem pendentes.
- **Modelos demonstrativos:** nove modelos locais `POC-1.0`, com cabeçalho institucional, preenchimento, prévia e impressão/PDF em `/social/modelos`. Referências públicas conferidas de Campina da Lagoa, Joinville e Manual do Prontuário SUAS. Fontes e limites registrados em `docs/MODELOS_ASSISTENCIA_SOCIAL_POC_REFERENCIAS.md`. Impressos manuais não alteram operações; requisições e encaminhamentos possuem comprovantes gerados dos registros.
- **Migrations aditivas:** `20261010070000_social_professional_access`, `20261010080000_social_person_history`, `20261010090000_social_benefit_workflow` e `20261010100000_social_network_referrals`, além da migration anterior de unidades. Não aplicadas ao banco municipal/de destino.
- **Integração remota:** `git pull --ff-only origin main` atualizado para `0b11f3e` (Planejamento/SST), com proteção e restauração das alterações locais via stash, sem conflitos. Nenhum commit/push das implementações locais realizado.
- **Checks após integração:** build de produção completo aprovado, ESLint aprovado, 17 testes aprovados, incluindo permissões SUAS, constraints/migrations, precisão monetária, rollback/duplicidade de entrega e testes remotos de Planejamento/SST. Validação visual/impressão no navegador ainda pendente: navegador da sessão desconectado.
- **Cobertura remanescente:** domicílios/composição familiar, prontuário agregado, agenda/fila, ofertas/grupos com PAF/PIA persistidos, denúncias, calamidade, BPC, relatórios e integração oficial continuam em andamento. Os modelos impressos de PAF/PIA/agendamento/fila não equivalem à implementação desses fluxos. A cobertura integral dos 271 itens não está concluída.

### Continuidade — identificação de equipamentos

- Cadastro/edição de unidades ampliado com código único de identificação, data de implantação, endereço completo, município/UF e latitude/longitude.
- Tipos de equipamento ampliados na interface: Secretaria, Centro DIA, Saúde, Judiciário e Outros, além dos tipos existentes.
- Validação no servidor de nome/tipo, e-mail, data real e coordenadas em par e dentro dos limites geográficos; campos omitidos pelos consumidores anteriores são preservados.
- Formulário de unidades permanece aberto em erro e bloqueia nova submissão durante a gravação.
- Migration aditiva `20261010060000_social_unit_identification`, com unicidade do código e restrição das coordenadas. Ainda precisa ser aplicada ao ambiente de destino.
- Prisma validate, ESLint, dois testes de validação e build completo de produção aprovados. Não houve validação visual no navegador nesta entrega.
- Itens 1–2 avançaram parcialmente: permanecem pendentes equipamentos de referência e consulta/cartografia em mapa; sigilo, equipe e vínculos profissionais seguem na próxima etapa.

### Registro de execução — primeira entrega técnica

- Implementado `/social/configuracoes` com 15 catálogos: renda, despesa, vulnerabilidade, potencialidade, motivo de atendimento, acesso, desligamento, público prioritário, atividade social, atividade de gestão, medida socioeducativa, ato infracional, motivo de denúncia, motivo de encaminhamento e tipo de órgão da rede.
- Cada catálogo permite criar, editar, buscar e ativar/inativar. A integração das entradas com os registros do domínio, restrições por equipamento/especialidade e exclusão controlada permanece pendente; portanto os respectivos itens do checklist ainda não estão integralmente atendidos.
- Implementado registro de salário mínimo por início de vigência, valor decimal positivo e preservação das vigências anteriores. A tabela será consumida posteriormente pelo cálculo socioeconômico/BPC.
- Implementado painel com contagens reais de famílias ativas, unidades CRAS/CREAS ativas, atendimentos ativos do mês e concessões não canceladas do mês; consulta exige permissão de emissão de relatórios. Filtros, séries, bairros, georreferência e indicadores de acompanhamento ainda estão pendentes.
- Migration aditiva: `20261010050000_social_suas_catalogs`. Deve ser aplicada no ambiente de destino antes de acessar a nova página. Não foi aplicada ao banco municipal por esta entrega.
- Verificação: schema Prisma válido, ESLint dos arquivos implementados aprovado, três testes de política e um teste de migration em PostgreSQL embarcado aprovados. Resultado do build de produção deve ser registrado ao concluir sua execução.
- O restante das fases deste plano continua pendente; esta entrega não certifica conformidade dos 271 itens.

Atender os 271 itens do checklist do módulo **Gestão da Assistência Social**, iniciado na página 194 e encerrado na página 222 do PDF `docs/Termo de Referencia/Checklist real POC MÓDULOS EXECUTIVO e CAMARA.pdf`. O escopo compreende Configurações, Benefícios, Programas e Serviços, Prontuário Social, atendimento/agenda, denúncias, encaminhamentos, calamidade pública e Vigilância Socioassistencial.

Este plano compara os requisitos ao estado atual visível no código e organiza uma entrega incremental para POC. Um recurso existente só deve ser considerado atendido depois de verificar persistência, autorização, validações de domínio, histórico e comportamento de ponta a ponta; mera presença de tela/modelo não basta.

## 2. Diagnóstico executivo

O módulo atual é um **protótipo inicial**, com uma base útil para evoluir, mas distante da cobertura funcional exigida pela POC.

### O que já existe

- Navegação do módulo em `src/app/app-domain/social/layout.tsx`: Painel, Atendimentos, Famílias e Indivíduos, Prontuário, Visitas, Unidades e Programas/Benefícios.
- Modelos Prisma básicos para unidade, família, membros, registros sociais, atendimento, visitas, benefícios/concessões e programas/participações, em `prisma/schema.prisma` (`SocialUnit` a `SocialProgramParticipation`).
- CRUD parcial de unidades e famílias, criação/edição/inativação de atendimentos, criação de benefícios e programas, registro de concessão e visitas.
- Reutilização do cadastro comum `Person` (inclui nome social, CPF, nascimento, sexo, raça/cor, filiação, escolaridade e contatos), endereço e cadastros centrais de pessoas/famílias.
- Consulta local de `CadUnicoRecord` por NIS/CPF e persistência de um registro `SuasProntuarioRma`.
- Verificação de acesso ao módulo e de operação (`getTenantContextForModuleOperation`) nas actions já existentes.

### Lacunas críticas

- A tela inicial do painel contém números estáticos (por exemplo, 42 famílias e 5 unidades); não é painel alimentado por indicadores reais.
- O esquema atual não modela a maioria dos conceitos do checklist: parâmetros do SUAS, perfil profissional/equipamento, renda e despesa com histórico, vulnerabilidades e potencialidades com ciclo de vida, requisições/aprovação/estoque/cotas, serviços/projetos/grupos, inclusão/desligamento e históricos, PAF/PIA, fila de espera, agenda, denúncia, rede intersetorial/contrarreferência, calamidade, importações e relatórios oficiais.
- `SocialFamilyMember` representa vínculos simples, enquanto cadastro familiar também se relaciona à família geral do sistema. Não foi comprovado que todos os fluxos mantêm os dois cadastros consistentes ou cobrem múltiplas famílias por domicílio.
- `SocialAttendance` não possui no modelo participantes múltiplos, duração, atividades, anexos, agendamento, motivo configurável, encaminhamentos estruturados ou autorização sigilosa por profissional envolvido.
- A existência do campo `secrecyLevel` não implementa sigilo: as páginas fazem buscas amplas e não há evidência de filtragem de leitura por vínculo com unidade, equipe, autoria ou participantes.
- O código de consulta CadÚnico pesquisa a tabela local `CadUnicoRecord`; o rótulo de interface sugere sincronização federal, mas não há evidência de integração com serviço/arquivo oficial, importação em lote, prévia, reconciliação ou trilha de importação.
- A action de criação de concessão registra concessão direta; não cobre requisição, análise individual, autorização, estoque, dispensação, comprovantes ou auditoria do ciclo de benefício.
- O RMA atual grava um registro textual de consulta; não calcula itens oficiais, não apresenta memória de cálculo nem exporta leiaute oficial.
- Várias telas e actions oferecem apenas parte do CRUD ou não oferecem retorno/validação de erro adequados. Excluir/inativar e regras temporais precisam de definição por entidade.

## 3. Inventário técnico atual

| Área | Evidência encontrada | Leitura para a POC |
|---|---|---|
| Unidades | `SocialUnit`, `/social/unidades`, `create/update/toggleSocialUnitStatus` | Cadastro simples: nome, tipo, telefone/e-mail, imóvel e responsável. Faltam endereço/município completos, código/data de implantação, geolocalização, sigilo, referência, equipe, expediente e vínculo profissional com escopo. |
| Pessoas e famílias | `Person`, `SocialFamily`, `SocialFamilyMember`, `/social/familias` | Há cadastro social simplificado e integração parcial com `Family`/`FamilyMember`. Faltam domicílio SUAS completo, tipos/classes/povos, composição familiar social gerenciável, condições de saúde/convivência e prontuário agregado. |
| Atendimento | `SocialAttendance`, `/social/atendimentos`, `/social/prontuario` | Registro simples com data, tipo, descrição, família/pessoa, unidade, profissional e nível textual de sigilo. Faltam fluxo SUAS completo, política de leitura, lista de chegada, agenda, coletivo, anexos e derivados. |
| Visitas | `SocialVisit`, `/social/visitas` | Estrutura básica de agendamento/realização e consulta; verificar actions e completar edição, resultado, anexos, vínculos e histórico. |
| Benefícios | `SocialBenefit`, `SocialBenefitConcession`, `/social/beneficios` | Cadastro básico e concessão direta. Faltam classificação e regras, cotas, fornecedor/estoque, requisições, aprovação, entrega, demanda reprimida, BPC e importação de folha. |
| Programas | `SocialProgram`, `SocialProgramParticipation` | Nome/descrição/esfera e participação familiar básica. Faltam serviços/projetos, regras de elegibilidade, unidades/equipes, grupos, histórico de vínculos, avaliações, desligamentos e renda transferida. |
| CadÚnico/RMA | `CadUnicoRecord`, `SuasProntuarioRma`, `social-engine.ts` | Consulta local e gravação simplificada. Não chamar de integração oficial até implementar e comprovar a origem/conformidade dos dados. |
| Demais domínios | Não localizados modelos/telas/actions específicas na inspeção | Denúncia, rede intersetorial, encaminhamentos formais, calamidade, agenda SUAS completa, PAF/PIA, relatórios e vigilância requerem desenvolvimento. |

## 4. Plano de implementação por fases

### Fase 0 — Fundação, segurança e inventário executável

1. Confirmar com a área usuária o roteiro demonstrável da POC, cadastros iniciais, perfis e limites de acesso por unidade/equipe.
2. Desenhar um mapa entidade-relacionamento e decidir o que reutiliza de `Person`, `Family`, `Address`, `Employee`, `Document` e estruturas de agenda, sem duplicar o cadastro mestre.
3. Fazer uma matriz formal de autorização: operação por módulo, unidade de vínculo, autoria, equipe, participantes e registros sigilosos. Toda leitura sensível deve ser filtrada no servidor; esconder botão não é controle de acesso.
4. Definir catálogo parametrizável com status ativo/inativo e proteção contra exclusão física de registros referenciados; registrar usuário/data de criação, alteração e decisão quando necessário.
5. Implementar migrações Prisma aditivas, com índices, restrições e plano de compatibilidade; revisar migrations existentes e gerar/validar Prisma Client.
6. Corrigir painel social para usar consultas reais, com período, unidade e indicação de dados vazios; retirar contagens estáticas.

**Aceite:** usuários de unidades distintas não leem nem alteram dados fora do escopo autorizado; permissões são verificadas em cada action/consulta; migrações aplicam em banco de desenvolvimento sem perda de dados; indicadores não usam valores fixos.

### Fase 1 — Cadastros SUAS e prontuário básico

1. Completar unidade/equipamento: tipos exigidos e extensíveis, endereço/município, responsável, referência, código, implantação, georreferência, sigilo, situação e equipe técnica.
2. Cadastrar profissionais SUAS, cargo conforme NOB-RH/SUAS, vínculo por unidade, especialidade e horários de expediente. Criar regras de acesso ao prontuário individual e familiar (próprio profissional, unidade ou município) sujeitas ao sigilo.
3. Completar pessoa e família reaproveitando cadastros centrais: NIS, CPF, nome social, raça/cor, gênero/orientação conforme política de dados, escolaridade, contatos, endereço, referência social e óbito.
4. Modelar domicílio SUAS separadamente da família e permitir que um domicílio tenha várias famílias; incluir características de habitação previstas no checklist.
5. Modelar vínculo familiar com parentesco, representante, datas e situação, sem impor unicidade global da pessoa se o requisito permitir múltiplos vínculos/famílias.
6. Criar cadastros de tipos de renda/despesa, salário mínimo versionado por vigência e registros socioeconômicos imutáveis/históricos por pessoa; calcular composição familiar a partir dos membros.
7. Criar catálogos de vulnerabilidades e potencialidades, escopo por tipo de equipamento, identificação, observação, superação/remoção e histórico auditável.
8. Criar prontuário único individual e familiar com abas/seções, timeline unificada, filtros de visibilidade e impressão controlada.
9. Adicionar informações de saúde e convivência familiar/comunitária do prontuário SUAS, conforme instrumento funcional a validar com a Secretaria.

**Aceite:** operações de cadastro mantêm histórico; é possível consultar a composição e renda da família com base nos integrantes; vulnerabilidade respeita configuração por equipamento; prontuários imprimíveis respeitam sigilo e autorização.

### Fase 2 — Atendimento, acolhida, agenda, atividades e encaminhamentos

1. Substituir/expandir `SocialAttendance` para representar atendimento individual ou coletivo, unidade, data/hora, duração, participantes pessoa/família, profissionais, motivo, programa/serviço/projeto, atividades, descrição, anexos e classificação de sigilo.
2. Restringir a leitura de atendimentos por vínculo empregatício com o equipamento, participação/autoria em registros sigilosos e configuração individual de abrangência. Não devolver registros não autorizados nem mesmo em payload inicial.
3. Criar catálogo de motivos com restrição por especialidade e pelos programas/serviços/projetos aplicáveis.
4. Implementar listas de chegada configuráveis por unidade/profissionais, presença/ausência, registro de atendimento, atualização automática e política de ordem da fila.
5. Implementar agenda do equipamento: horários, participantes individuais ou múltiplos/coletivos, faltas, transferências, comprovante e criação do atendimento a partir do agendamento.
6. Implementar contatos telefônicos e conversão de contato em atendimento individual, preservando vínculo e histórico.
7. Implementar atividades não continuadas com unidade, data, local, participantes, equipe e relação opcional com ofertas socioassistenciais.
8. Criar cadastro de órgãos/tipos da rede, motivos e públicos prioritários; encaminhamentos para unidade/equipamento ou rede externa, profissional de referência, comprovante, prazo de alteração, contrarreferência e histórico.
9. Implementar regras de expediente, anexos e limites temporais de alteração/exclusão por parâmetro.

**Aceite:** lista/agendamento só é acessível aos profissionais habilitados; grupo de participantes gera atendimento coletivo; encaminhamento registra destino e contrarreferência com impressão; sigilo é validado no servidor.

### Fase 3 — Benefícios eventuais, estoque e BPC

1. Separar tipo/classificação de benefício (funeral, natalidade, calamidade, vulnerabilidade temporária) do cadastro do benefício ofertado; configurar entrega por quantidade ou valor, locais, cota e necessidade de autorização.
2. Criar regras de elegibilidade e limite (quantidade por requisição, janela de recebimento, histórico individual/familiar) com comportamento parametrizado: alertar, bloquear ou solicitar autorização de supervisor.
3. Criar fornecedor e entrada/estoque com nota fiscal, emissão, valores, itens, saldo e trilha de movimentação; controlar cotas gerais e por unidade/período, vigência e não sobreposição do mesmo benefício.
4. Criar requisição com itens individualmente avaliáveis, documentos obrigatórios, profissional, unidade, solicitante pessoa/família e estados explícitos (rascunho/pendente/autorizada/negada/parcial/atendida/cancelada).
5. Garantir que item com autorização pendente não possa ser dispensado; autorização só por responsável configurado para benefício/unidade e visualização limitada à sua fila.
6. Criar notificações internas, decisão/justificativa por item, comprovantes de requisição/avaliação/dispensação e cancelamento permitido apenas antes da entrega.
7. Criar entrega com data, motivo, profissional, baixa de estoque/cota atômica e fila de demanda reprimida FIFO/prioridade para autorizados sem estoque.
8. Parametrizar prazo para alteração/cancelamento/exclusão; manter auditoria, e preferir cancelamento/inativação em vez de exclusão definitiva.
9. Criar cadastro/histórico BPC (representante, número, início, valor e situação), vigências de salário mínimo e importação validada da folha com prévia, relatório de divergências, inclusão/atualização/suspensão/encerramento.

**Aceite:** concorrência não permite saldo negativo/sobre-entrega; item exige autorização quando configurado; só autorizado pode ser entregue; cotas futuras não dispensam antes da vigência; histórico de BPC e benefício é reconstruível.

### Fase 4 — Programas, serviços, projetos e acompanhamento

1. Unificar conceitos comuns de oferta socioassistencial sem perder tipo: programa, serviço tipificado e projeto; catálogos de acesso, desligamento, público prioritário, atividades, vulnerabilidades e potencialidades.
2. Parametrizar elegibilidade: individual/familiar, sexo, faixa etária, vagas, outros vínculos, vulnerabilidades e BPC; vincular equipamentos ofertantes, equipe técnica, complexidade compatível e permissão para profissional externo registrar.
3. Criar grupos exclusivos por equipamento com capacidade, aberto/fechado, período, carga horária, dias/horários e regras que não ampliem elegibilidade da oferta principal.
4. Criar inclusão de pessoa/família e histórico de passagens por oferta e por grupo; registrar data, motivo, equipamento, responsáveis legais para menores, avaliação, ocorrências e desligamento/cancelamento do desligamento.
5. Restringir gestão de integrantes à unidade responsável; unidades ofertantes veem listagem mínima compartilhada quando autorizadas, mas cada unidade só gerencia seu próprio vínculo.
6. Validar elegibilidade na entrada e entrada em grupo; impedir inclusão em grupo fechado já iniciado; permitir participação simultânea em vários grupos quando previsto.
7. Ao desligar da oferta, alertar e encerrar vínculos ativos dos grupos, mantendo histórico e permitindo cancelar o desligamento de forma auditada.
8. Implementar valores de transferência de renda com vigência e histórico por integrante/família e importação de folha federal com simulação de inclusões/atualizações/desligamentos. Permitir bloquear edição manual conforme parâmetro.
9. Implementar PAF familiar e PIA individual com diagnóstico, objetivos, plano, encaminhamentos, compromissos, evoluções, impressão e vínculo com ofertas.
10. Implementar Famílias Acolhedoras: inscrição, capacitação, avaliação/parecer histórico, habilitação, valor vigente, repasses e folha de pagamento.
11. Implementar atendimento a grupos: múltiplos grupos/ofertas, profissionais, participantes/presença, tempo por integrante, duração, atividades, anexos, sigilo e validação do expediente.
12. Criar demanda reprimida para vagas em programas/serviços/projetos, com prioridades, unidade de origem/destino, grupo, data, comprovante, remoção e entrada direta quando abrir vaga.

**Aceite:** regras do grupo nunca contradizem a oferta; históricos de inclusão/saída permanecem; vagas não excedem limite em operações concorrentes; demanda reprimida pode virar participação sem redigitar dados.

### Fase 5 — Denúncias, calamidade e contextos especiais

1. Criar catálogo de motivos de denúncia e registro restrito: recebimento, forma, denunciante (com proteção de identidade quando aplicável), pessoas envolvidas, vítima, relato, anexos, risco, pareceres, atendimentos, encaminhamentos e inclusão em oferta.
2. Criar abrigos e catálogo de tipos de calamidade conforme formulário nacional; registrar evento, vigência/anexos, abrigo, capacidade e ocupação.
3. Relacionar famílias atingidas ao evento e registrar benefícios, restrição alimentar, medicação, cuidado constante, gestação, mobilidade, óbitos/desaparecimentos, prejuízos, dano à moradia, situação de alojamento e necessidades imediatas.
4. Permitir dispensação associada ao evento e impor regra de local: pessoas/famílias em abrigo recebem atendimento e benefício no abrigo, não na unidade socioassistencial.

**Aceite:** denúncias têm acesso estritamente autorizado e trilha de auditoria; ocupação não supera vagas; contexto de abrigo valida local de atendimento/dispensação.

### Fase 6 — CadÚnico, importações e qualidade dos dados

1. Especificar origem e leiaute do arquivo CadÚnico disponível para o município; não assumir acesso a API federal sem credencial/documentação confirmada.
2. Criar fluxo de importação em lote com upload protegido, validação de leiaute, prévia, identificação de pessoa/família, relatório de erros/duplicidades, confirmação transacional e histórico do lote.
3. Permitir importar somente novos ou atualizar existentes; configurar separadamente preservação de composição familiar, endereço, domicílio, documentos, escolaridade e contatos.
4. Fazer correspondência por NIS/CPF e revisar conflitos/duplicidades manualmente quando identidade não for inequívoca; jamais sobrescrever campo preservado pelo parâmetro do lote.
5. Criar parâmetro de atualização cadastral (alertar ou impedir atendimento) com data de validade configurável e exceção auditada por perfil.
6. Importar folha BPC e transferências federais no fluxo definido nas fases 3 e 4, com prévia e reconciliação.

**Aceite:** repetir o mesmo lote não duplica pessoas/famílias; arquivo inválido não altera cadastros; opções de preservação são testadas campo a campo; cada alteração pode ser rastreada à importação que a originou.

### Fase 7 — Vigilância, RMA, relatórios e painel

1. Definir versão/leiaute oficial de RMA CRAS, CREAS e Centro POP a ser aceito na POC; mapear eventos do sistema aos itens e permitir detalhar cada contagem até os registros de origem.
2. Configurar profissionais elegíveis por unidade e critérios de contabilização; evitar contar registros sigilosos fora das permissões do usuário que consulta o detalhe.
3. Gerar/exportar arquivos do leiaute validado e apresentar totais, período, unidade, filtros, inconsistências e memória de cálculo.
4. Criar relatórios por profissional, perfil sociodemográfico, vulnerabilidade por bairro/sexo/faixa etária, benefícios por bairro/tipo, evolução anual, encaminhamentos e participantes/ofertas/grupos/planos.
5. Criar painel gerencial real: intervenções, vulnerabilidades e benefícios por bairro, participantes por oferta e pessoas/famílias em acompanhamento, filtros por período/unidade e georreferenciamento agregado.
6. Aplicar controles de privacidade, supressão/agrupamento de pequenas contagens e permissões nos mapas/exports conforme política municipal.

**Aceite:** RMA exportado passa por validador do leiaute definido; cada número é rastreável a dados de origem; filtros não vazam registro individual sigiloso; indicadores não usam contagens mock.

## 5. Matriz de cobertura do checklist

Legenda: **Base parcial** = existe código/modelo relacionado, mas não atende integralmente; **Desenvolver** = não foi encontrada implementação funcional suficiente; **Validar** = confirmar regra, leiaute ou aceitação com a Secretaria/POC. A classificação é preliminar e deve ser atualizada durante execução.

| Itens do checklist | Tema | Estado observado | Fase |
|---|---|---|---|
| 1–7 | Unidades/equipamentos, georreferência, sigilo, cargos, profissionais, vínculo, expediente e escopo do prontuário | Base parcial: `SocialUnit`, `Employee` e autorização do módulo existem; faltam configuração SUAS e controle fino de acesso | 0–1 |
| 8–9 | Tipos de renda/despesa e salário mínimo vigente | Desenvolver | 1 |
| 10–12 | Cadastro familiar, domicílio SUAS e domicílio compartilhado | Base parcial: `SocialFamily` liga a `Person`, endereço opcional e `Family` comum; composição e domicílio SUAS incompletos | 1 |
| 13 | Cadastro social completo de pessoa | Base parcial: `Person` já tem diversos campos, mas falta validar NIS, campos sociais, referência e ciclo de vida no fluxo SUAS | 1 |
| 14–20 | Vulnerabilidades e potencialidades com identificação, superação/remoção, escopo e histórico | Desenvolver; campo textual agregado não satisfaz histórico estruturado | 1 |
| 21–24 | Nome social, trabalho, renda/despesa e respectivos históricos | Base parcial para nome social/ocupação/contatos; desenvolver situação trabalhista e movimentos socioeconômicos históricos | 1 |
| 25–29 | Óbito, atividade de gestão, vínculo da unidade e cadastro desatualizado | Parcial em campos comuns de pessoa; desenvolver fluxos/catálogos/restrições | 1–2 |
| 30–31 | Importação CadÚnico e parametrização campo a campo | Desenvolver; consulta local não é importação | 6 |
| 32–38 | Tipos e regras de benefício, cotas, período vigente e não sobreposição | Base parcial para benefício nominal/recorrência; desenvolver catálogo, regras e cotas | 3 |
| 39–40 | Fornecedores e entrada de estoque com documento fiscal | Desenvolver | 3 |
| 41–54 | Requisição, documentos, aprovação, notificação, decisão, entrega, cancelamento, comprovantes e prazo | Base parcial: concessão direta existe; ciclo de requisição e controles ainda não | 3 |
| 55–58 | Cadastro/histórico BPC e importação de folha | Desenvolver | 3, 6 |
| 59–60 | Demanda reprimida de benefícios e atendimento da fila | Desenvolver | 3 |
| 61–70 | Catálogos de acesso/desligamento/público/atividades, MSE e atos infracionais | Desenvolver | 4 |
| 71–80 | Programas, elegibilidade, oferta por unidade, equipe, valores, grupos e regras | Base parcial: programa e participação simples; desenvolver domínio e validações | 4 |
| 81–101 | Grupos, inclusão, elegibilidade, histórico, desligamentos, ocorrências e avaliações | Desenvolver; não há grupo nem ciclo completo do participante | 4 |
| 102–123 | Serviços tipificados, complexidade, grupos, regras, participação e Família Acolhedora | Desenvolver | 4 |
| 124–135 | MSE, horas cumpridas, histórico de serviço, desligamento e ocorrências | Desenvolver | 4 |
| 136–163 | Projetos e grupos, elegibilidade, vínculos e históricos | Desenvolver | 4 |
| 164–166 | PAF/PIA, evolução e impressão | Desenvolver | 4 |
| 167 | Agenda para grupos | Base parcial em `SocialVisit`; agenda de grupo requer implementação | 2, 4 |
| 168–170 | Famílias acolhedoras, avaliação e folha de pagamento | Desenvolver | 4 |
| 171–176 | Atendimentos de grupo, participantes, sigilo, expediente e vínculo de unidade | Base parcial em atendimento simples; ampliar modelo e proteger consultas | 2, 4 |
| 177–180 | Demanda reprimida de vagas e comprovante | Desenvolver | 4 |
| 181–182 | Importação de folha de transferência de renda e bloqueio de edição manual | Desenvolver | 4, 6 |
| 183–194 | Pessoa, vulnerabilidades, potencialidades, trabalho, renda e despesa | Base parcial em `Person`; módulos históricos sociais a desenvolver | 1 |
| 195–196 | Prontuário único individual e impressão | Base parcial: `/social/prontuario` lista atendimentos; não é prontuário completo | 1 |
| 197–202 | Catálogos de potencialidade/vulnerabilidade/motivo e salário mínimo | Desenvolver | 1–2 |
| 203–209 | Família, domicílio, saúde/convivência, totais, prontuário familiar e impressão | Base parcial em `SocialFamily`; desenvolver | 1 |
| 210–220 | Lista de chegada, atendimentos, sigilo, atualização, ordem e acesso | Desenvolver | 2 |
| 221–223 | Agenda de unidade, coletivo, faltas/transferências e comprovante | Desenvolver | 2 |
| 224–227 | Contatos telefônicos e atividades não continuadas com escopo de unidade | Desenvolver | 2 |
| 228–231 | Denúncias, risco, vítima, encaminhamentos, pareceres e anexos | Desenvolver | 5 |
| 232–241 | Motivos, órgãos, públicos, encaminhamento, contrarreferência e impressão | Desenvolver | 2 |
| 242–253 | Abrigos, eventos de calamidade, famílias atingidas, necessidades e atendimento no abrigo | Desenvolver | 5 |
| 254–261 | RMA CRAS/CREAS/Centro POP, detalhe, seleção de profissionais e exportação | Base parcial: gravação `SuasProntuarioRma` simples; cálculo/exportação oficial a desenvolver | 7 |
| 262–271 | Relatórios, georreferenciamento e painel gerencial | Desenvolver; painel atual usa valores estáticos | 0, 7 |

## 6. Sequência recomendada para uma POC demonstrável

Se o prazo exigir uma primeira demonstração vertical, priorizar os fluxos que formam um percurso completo sem declarar os demais itens como conformes:

1. **Base segura:** unidades e profissionais com vínculo; pessoas, famílias e domicílio; controle de acesso por unidade e sigilo.
2. **Atendimento:** acolhida individual/coletiva, histórico de prontuário, encaminhamento e agenda/lista de chegada.
3. **Benefício eventual:** cadastro/regra, requisição, aprovação (quando configurada), estoque/cota, entrega e comprovante.
4. **Oferta continuada:** programa/serviço, elegibilidade, grupo, inclusão, presença/evolução e desligamento com histórico.
5. **Visibilidade de gestão:** demanda reprimida, relatórios essenciais e RMA conforme leiaute confirmado.
6. Em paralelo, validar como a POC demonstrará importação CadÚnico/BPC, Família Acolhedora, denúncia e calamidade; esses blocos são amplos e não devem ser simulados por dados fixos.

## 7. Critérios transversais de qualidade e segurança

- Actions validam autorização, tenant, unidade, vínculo e estado do domínio no servidor; leitura e escrita aplicam a mesma matriz de escopo.
- Registros sigilosos exigem política explícita de participantes/equipe, com auditoria de leitura/alteração quando definido pela gestão.
- Movimentações de estoque, cota, vagas, aprovação e desligamento usam transações e controles contra corrida/duplicidade.
- Histórico de fatos socioassistenciais não é apagado por atualização comum: encerramentos, superações e correções preservam autor, data, motivo e valores anteriores.
- Formulários mostram erros da action; ações irreversíveis são evitadas ou exigem fluxo apropriado, e comprovantes/exportações identificam número/data e origem.
- Datas e vigências são tratadas em timezone consistente; importações são idempotentes e apresentam prévia e relatório de erros.
- Acessibilidade, paginação, busca, filtros por período/unidade e estados vazios são validados nas telas novas.
- Dados de produção não devem ser usados em fixture de teste. Cobrir autorização negada, unidade não vinculada, sigilo, duplicidade, limites de vaga/cota e transições inválidas.

## 8. Dependências e decisões a confirmar

1. Leiautes e arquivos oficiais que o município realmente possui para CadÚnico, BPC e transferências de renda, bem como regras de credenciamento/integração.
2. Versão do leiaute RMA exigida e quais tipos de equipamento entram na POC.
3. Definição municipal de acesso ao prontuário (escopo do profissional), sigilo, auditoria e retenção de dados.
4. Catálogos municipais de benefícios, regras, documentos, cotas, fornecedores, níveis de aprovação e prazos.
5. Serviços e complexidades adotados, critérios locais de elegibilidade e ofertas existentes (programa/serviço/projeto/grupo).
6. Política de atendimento a denúncias e calamidade, perfis autorizados e regras de proteção de identidade.
7. Se salário mínimo, renda familiar, vulnerabilidades e dados do prontuário serão compartilhados com os módulos gerais ou terão campos/contextos SUAS especializados.
8. Impressos exigidos pela POC: modelos, brasão, assinaturas, protocolo, formato e identificação de quem emitiu.

## 9. Pronto para considerar um item atendido

Um requisito só passa para **Atendido** quando: (a) o fluxo está implementado em UI e action; (b) dados e histórico persistem corretamente; (c) autorização e validações ocorrem no servidor; (d) critérios de aceite do item passam em teste automatizado ou roteiro reproduzível; (e) efeitos em cadastros relacionados foram conferidos; e (f) a evidência da POC (tela, relatório, comprovante ou arquivo) foi identificada.

**Próximo passo recomendado:** aprovar o recorte vertical da POC e os pontos da seção 8; depois detalhar a Fase 0 em tarefas técnicas/migrations e iniciar a sequência Fases 1–3 para estabelecer cadastro, prontuário, atendimento e benefício demonstráveis.
