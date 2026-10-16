# Execução do plano SST

## Estado atual — 11/10/2026

As frentes de software F0–F8 estão presentes no incremento `7f28090 — sst4`; hardening clínico, navegação e matriz foram publicados em `76728e5 — sst5`. A integração do outro notebook chegou em `f78c851 — rh1`, com checkout sincronizado com `origin/main`. **A homologação dos 74 requisitos não está concluída.** A presença de rotinas e testes não comprova 74/74 nem o mínimo de 67 da POC. Escopo: `PLANO_IMPLEMENTACAO_SST.md`; rastreabilidade atual por item: `EVIDENCIAS_SST.md`. Providências, modelos e desenvolvimento restante: `SST_PENDENCIAS_E_RETOMADA.md`.

### Entregas incorporadas em SST4

| Fase | Entrega disponível | Condição operacional / aceite restante |
|---|---|---|
| F0 | Cadastro Único, escopo UG, permissões clínicas gerais e por atuação, habilitação profissional e GED protegido. | Confirmar segregação Prefeitura/Câmara, perfis e downloads com usuários reais. |
| F1 | Atestados, perícia, juntas, agenda, CID oficial, confirmação imediata, restrições por regime/cargo, retificação/revogação e relatórios históricos. | Reflexos monetários dependem de regra RH aprovada, competência aberta e rubricas canônicas. |
| F2 | Períodos funcionais explícitos, entidade/UG verificada, cargo/função/local/centro de custo, GHE, ordens de serviço e responsabilidades; versões LTCAT/PGR/PCMSO. | Validar dados históricos e conteúdo técnico com responsáveis. |
| F3 | ASO com anamnese pré-emissão, exames/anexos, candidato sem vínculo, impressão em branco/preenchida, GED, retificação/anulação, agenda/férias; prontuários especializados, solicitações e vacinação ocupacional. | Vacinação registra comprovante externo; não realiza aplicação nem baixa SUS. Conferir layouts, autoria e fontes documentais. |
| F4 | EPI/EPC sobre Material, entregas individuais/coletivas, CA/validade/revisão, comprovantes, necessidade PGR e saída real de estoque transacional. | Biometria depende de leitor/SDK e integração física ainda indisponíveis. Baixa de uso não devolve estoque. |
| F5 | CAT/incidentes, investigação revisada, pareceres técnico/médico, homologação, despesas/reembolsos, formulário oficial INSS, restrições por atribuição e fila de avisos. | CAT registrada exige recibo eSocial produção da versão exata. E-mail exige configuração real e recibo do provedor. |
| F6 | CIPA, planos/inspeções/reuniões/atas/presenças/calendário, SIPAT/custos, eleições/voto único, visitas, brigada, extintores, ergonomia e PCA/audiometria. | Demonstrar fluxos com dados e perfis, incluindo sigilo do voto e acesso clínico PCA. |
| F7 | Planos ANS, contratos/carteiras, titular/dependentes, lançamentos por competência, postagem Decimal em Folha e compensações rastreáveis. | Saída fiscal oficial permanece bloqueada; ver distinção DIRF/eSocial abaixo. |
| F8 | Preparação S-2220/S-2210/S-2240 com proveniência, estados/ambientes/rejeições; PPP preparatório, consolidado PDF e serviços próprios do portal. | Transporte eSocial real não está instalado/homologado. Consolidado filtra disciplinas autorizadas; portal não libera prontuário integral. |

### Hardening clínico publicado, implantação pendente

- Escrita exige profissional canônico vinculado ao usuário, atuação/UG e vigência compatíveis, inclusive para administrador. Habilitações e concessões são administradas tecnicamente.
- Consultas e documentos aplicam grants por atuação, histórico funcional e auditoria; laudos usam template institucional canônico.
- Retry idêntico de habilitação preserva ID; conflito é bloqueado. Vacinação distingue pessoa/vacina/dose/data, permitindo reforços anuais com a mesma numeração.
- Migração aditiva `20261011120000_harden_sst_clinical_integrity`: datas finitas, unicidade da vacinação, autoria/atuação/UG/vigência no banco e lock compartilhado da habilitação.
- O checksum da migração clínica original `20261011010000_add_sst_clinical_services` confere. O verificador aceita somente variantes LF/CRLF das mesmas instruções.

### Banco compartilhado — histórico da conferência após rh1

O arquivo `20261011030000_hr_workforce_foundation` foi recebido no commit `rh1`. `npx prisma migrate status` encontrou 58 migrações locais e somente o hardening SST pendente. Entretanto, a conferência completa de checksums identificou **divergência entre o arquivo RH recebido e o registro da sua aplicação no banco**, inclusive após considerar finais de linha LF/CRLF. Portanto, o histórico ainda precisa ser reconciliado; status de Prisma sozinho não detecta essa divergência.

`npx tsx scripts/verify-sst-migration-history.ts` retornou `{"checked":18,"mismatches":[],"missing":[]}`. O novo modo read-only `--all` retornou `{"checked":57,"mismatches":["20261011030000_hr_workforce_foundation"],"missing":[]}`. As outras 56 migrações aplicadas conferem. Esse verificador não certifica ausência de drift de schema. O deploy SST desta continuação não foi executado, nem foram modificados checksums, migrações aplicadas ou dados operacionais. Recuperar os bytes originais da migração RH e reconciliar diferenças por incremento aditivo quando necessário.

**Estado posterior, após pull até `17ff495`:** restaurados os bytes originais mistos da foundation e os bytes LF de revisões temporais/consignações, conforme o diagnóstico RH, sem mudança de SQL ou registros do banco. Os três previews RH verificam o checksum exato e o checker geral retornou `{"checked":59,"mismatches":[],"missing":[]}`. Há três migrations pendentes: hardening SST e duas de Planejamento. A restauração foi exclusivamente de arquivos; nenhum desses incrementos foi implantado nessa correção.

### Validação atual

- Após receber `rh1`, **142 testes passaram, zero falhas**, incluindo SST, novo motor RH, serviços RH, fundação dos módulos, acesso de Perfis e upgrade integral das migrações: `node --conditions=react-server --import tsx --test --test-concurrency=1 --test-reporter=spec tests/sst-*.test.ts tests/hr-calculation.test.ts tests/hr-workforce-service.test.ts tests/planning-sst-modules.test.ts tests/system-administration-page-access.test.ts tests/construction-migration-upgrade.test.ts`.
- Os 18 testes clínicos cobrem acesso/autoria, histórico funcional, concessões/revogação, documentos, idempotência, ciclos de vacinação e integridade PostgreSQL isolada.
- Prisma validate/generate, lint direcionado SST/portal/API/testes/verificador e **`npm run build` completo passaram após `rh1`** (53 páginas estáticas, checagem TypeScript aprovada). A nova opção do verificador apenas lê o banco e arquivos; os consumidores e contratos de aplicação permanecem preservados.
- `git diff --check` passou. Homologação em navegador, storage operacional, PDFs com profissionais e concorrência multi-sessão continuam pendentes.

### Dependências e próximos passos

1. A divergência RH foi reconciliada pela restauração dos bytes originais, conforme `RH_MIGRATION_FOUNDATION_CORRECAO_CHECKSUM.md`. Conferir todos os incrementos pendentes antes de aplicar o hardening SST; agora há também duas migrations locais de Planejamento. Detalhes e comandos em `SST_PENDENCIAS_E_RETOMADA.md`.
2. Preparar dados canônicos autorizados e executar a matriz `EVIDENCIAS_SST.md`, registrando perfil, entidade, versão, passos, resultados e arquivos emitidos.
3. Configurar avisos conforme `src/app/app-domain/sst/restricoes/EMAIL-CRON.md`. `vercel.json` agenda a rota de hora em hora UTC; o ambiente precisa suportar essa frequência. Sem provedor/ator/escopo/segredo, a rota permanece `503 BLOCKED`. `SENT` é aceite do provedor, não confirmação de entrega/leitura.
4. Biometria: obter leitor/SDK, implementar e homologar confirmação real (item 27).
5. eSocial: implementar/instalar adaptador real XSD/XMLDSig/mTLS/SOAP, A1, autorização do empregador/procuração e validação da cadeia/revogação; comprovar recibos oficiais por ambiente. Certificado isolado não resolve a ausência do adaptador.
6. Fiscal (item 67): obter pagamentos datados e conciliação por beneficiário e implementar o layout/obrigação aplicável. DIRF PGD foi substituída desde o ano-calendário 2025; preparação por competência não equivale a declaração ou comprovante oficial. `benefit-fiscal.ts` mantém essa saída bloqueada.

## Histórico de execução até SST3

As seções seguintes preservam o registro dos incrementos anteriores. Pendências e descrições de limitações abaixo correspondem à época de cada entrega; o estado atual é o da seção acima e da matriz de evidências.

### Estado em 10/10/2026

Os incrementos iniciais implementavam atestados/perícias, agenda, jornadas/relatórios, GHE, versões de programas, a primeira jornada de exames/ASO e anamnese médica versionada, com acesso clínico por UG.

### Implementado

- `/sst/atestados`: consulta administrativa paginada no servidor com 20 registros, busca/situação e ordenação estável; não envia CIDs, pareceres ou URLs de anexos ao cliente administrativo.
- `/sst/atestados/novo`: servidor/dependente canônicos de RH, emitente `Person` do Cadastro Único, conselho, datas/horas, múltiplos códigos CID, motivo, protocolo/entrega automáticos ou manuais.
- `/sst/configuracoes`: motivos com política de dependente, restrições por cargo, impressão de comprovante, sugestão de afastamento e geração após deferimento; autorização clínica adicional por usuário/UG administrada pelo perfil técnico.
- `/sst/atestados/[id]`: detalhes clínicos restritos, anexos no GED com versões/hash, parecer e decisão pericial imutável.
- `/sst/atestados/[id]/comprovante`: relatório de recebimento, sem diagnósticos, com permissão de emissão de relatórios e impressão automática parametrizada.
- Deferimento pode criar `Leave` canônico, transacionalmente e com vínculo único; requer RH ativo e permissão de inclusão. Repetição de decisão não duplica afastamento; conflito com licença ativa aborta a transação.
- Protocolo automático estável por submissão: nova tentativa não duplica o atestado com os mesmos dados. Reutilização do protocolo com outros dados é rejeitada.
- Anexos usam `ingestGedDocument`, classe `SST_OCUPACIONAL` e `SstCertificateDocument`. Download valida SST, UG e acesso clínico antes de acessar o arquivo privado, inclusive quando houver cópias genéricas da URL.
- Vínculo opcional a processo digital existente: valida módulo Processos e escopo do setor; não encaminha o arquivo clínico para setores não autorizados.
- RH impede edição/exclusão direta de licença originada da decisão SST, preservando o vínculo e o parecer; contratos de retorno das actions existentes preservados.
- Auditoria de registro, decisão, autorização, leitura clínica, impressão e download, sem diagnóstico ou parecer em logs gerais.
- Cálculo de absenteísmo ligado ao relatório e às jornadas planejadas registradas com autorização RH. Turnos e ausências sobrepostos são unidos antes da apuração.

### Segunda entrega incremental

- `/sst/configuracoes/[id]`: edição e inativação/reativação de motivos; a migração preserva um snapshot das configurações usadas nos atestados existentes. Mudança posterior do motivo não muda a regra de geração de licença da perícia anterior.
- `/sst/juntas`: cadastro por UG, vigência, membros canônicos `Person` e conselhos; perícia permite indicar junta e verifica UG, vigência e participação do perito.
- `/sst/agenda`: disponibilidades por profissional/local, horários por duração e bloqueios temporários. Janelas sobrepostas do mesmo profissional são rejeitadas, inclusive entre UGs.
- `/sst/agenda/agendamentos`: consulta de 20 registros, detalhe, comprovante e cancelamento justificado. Reserva usa locks transacionais por profissional e servidor e recusa conflito/horário passado; bloqueio recusa compromissos existentes.
- `/sst/jornadas`: turnos planejados para absenteísmo, com permissão de inclusão RH, UG/lotação compatíveis e snapshots de cargo/local. Não usa batidas reais como se fossem jornada prevista.
- `/sst/relatorios` e `/api/sst/relatorios`: atestados por período, servidor, cargo/local, motivo, emitente, CID e situação; frequência CID, dias corridos aceitos, idade média, horas planejadas/atestadas, índice e custo estimado opcional com acesso RH. CSV de atestados e absenteísmo com ACL clínica e auditoria. Servidores com jornada e sem atestados integram o denominador.
- `/sst/ghe`: regras por UG, local e cadastro canônico de cargo/função, vigência e consulta de servidores com/sem grupo, sem associação individual obrigatória. O RH atual usa o mesmo `Role` para cargo/função; não foi criado cadastro paralelo. A consulta é da exposição atual, não reconstrói lotações históricas para PPP.
- `SstForm` converte `datetime-local` no navegador para ISO com timezone antes de enviar ao servidor. O relatório apresenta datas explicitamente em `America/Sao_Paulo`.

### Programas e laudos — evolução F2

- `/sst/programas` e `/sst/programas/[id]`: cadastro e consulta paginada de LTCAT, PGR e PCMSO, com responsável canônico, conselho, vigência e detalhamento por GHE.
- LTCAT/PGR registram condições ambientais, risco/perigo, danos, propagação, controle, fontes, exposição e indicação de equipamentos; o PGR exige probabilidade/severidade e registra a matriz qualitativa informada.
- PCMSO registra objetivos, responsabilidades, procedimentos, arquivo, primeiros socorros e campanhas; protocolos de exames por admissão, periódico, mudança de função, retorno, monitoração e demissão.
- Reutilizar o código/tipo/UG cria nova versão com número alocado sob lock transacional. Snapshot preserva nome/conselho do responsável, critérios/vigência do GHE, riscos e exames. Triggers impedem alteração/exclusão das versões e seus detalhes.
- Essa entrega não inclui ASO, realização de exames, transmissão eSocial nem a vinculação das recomendações de equipamentos ao catálogo EPI/estoque. Os nomes de exames e equipamentos dos programas ainda precisam dos adaptadores dessas etapas.

### Banco e sincronização

Sincronizado por fast-forward com `087010c — Social2` e `34bc19a — obras e civil`, preservando alterações locais SST e os relacionamentos de ambas as áreas em `Employee`. A primeira entrega está no commit `9901539 — SST2`. As migrações SST `20261010150000_add_sst_certificates`, `20261010160000_add_sst_agenda_boards`, `20261010170000_add_sst_exposure_groups` e `20261010180000_add_sst_programs` foram aplicadas pelo `prisma migrate deploy`; não houve reset. A fundação de Construção Civil já estava aplicada no último deploy. As migrações aplicadas devem permanecer imutáveis.

Nesta continuação foram incorporados `70085ee — Civil2` e `250a520 — civil 4`, preservando os vínculos de ambas as áreas em `Person` e as novas relações funcionais. A migração aditiva `20261010190000_add_sst_aso` foi aplicada com sucesso; o deploy encontrou 29 migrações locais e aplicou somente essa migração. Na última conferência havia no banco `20261010200000_construction_portal_participation`, ainda não publicada no remoto consultado: integrar o arquivo do outro notebook quando disponível, sem recriar nem editar a migração aplicada.

Ao encerrar o incremento de anamnese foi integrado `d4a29f6 — civil5`, incorporando os arquivos dessas migrações e preservando a relação SST de laboratórios junto ao perfil de construtora em `Company`. A conferência após integração encontrou 43 migrações e banco atualizado. Dependências foram sincronizadas por `npm ci`, conforme o lockfile recebido. O GED mantém os contratos anteriores e downloads continuam validando propriedade/autorização clínica SST antes de liberar arquivos.

O build da integração identificou ajustes locais necessários em Construção Civil: validação de referência ausente retorna HTTP 400 diretamente, páginas de consulta usam `getTenantContextForModule` (operações CRUD não têm `read`/`view`) e viabilidade automática valida a regra com `zoneSchema`, sem buscar signatários quando o processo não possui setor atual. Cada arquivo foi conferido individualmente; contratos de actions e escopos setoriais foram preservados. Na conferência final o commit `d5a492e — SST3` já incluía os incrementos SST, Perfis e esses ajustes; apenas a atualização final deste registro permanecia local.

### Exames e ASO — primeiro incremento F3

- `/sst/aso`: consulta clínica paginada no servidor com 20 registros, busca por pessoa, UG e intervalo de vencimentos, ordenação estável e filtros persistidos na navegação. UGs sem autorização clínica ficam fora da contagem e dos resultados; filtro de UG não autorizada não amplia a consulta.
- Registro com `Person` obrigatório; o vínculo `Employee` é derivado do Cadastro Único, não aceito arbitrariamente do navegador. Candidato sem vínculo pode receber ASO admissional mediante referência do concurso/processo seletivo, sem criar servidor artificial. Não foi identificado cadastro canônico de concursos/candidatos no schema consultado; a referência é textual nesta etapa.
- Sete tipos: admissional, periódico, retorno ao trabalho, mudança de riscos, demissional, licença sem vencimentos e monitoração pontual. Cinco resultados: apto, inapto, apto com restrições, apto com recomendações e inapto temporário; resultados condicionais exigem detalhamento.
- ASO ligado a um GHE da versão PCMSO da mesma UG, vigente na data civil ocupacional. Valida os critérios de local/cargo do snapshot contra o vínculo atual; permite demissional de servidor inativado com lotação compatível. Não reconstrói o histórico funcional de ASOs retroativos.
- Exames previstos são reaproveitados dos protocolos do PCMSO; não foi criado catálogo paralelo de laboratório SUS. Mudança de riscos usa o protocolo de mudança de função e licença sem vencimentos usa monitoração: essa correspondência deve ser confirmada na homologação funcional.
- `SstOccupationalExam`: exames clínicos/complementares/toxicológicos realizados ou apresentados, resultado, realização/validade, profissional `Person` e conselho. Laboratório usa `Company` canônico; toxicológico exige laboratório e número do laudo. O clínico deve corresponder ao médico, conselho e data do ASO; todos os exames devem estar realizados e válidos nessa data e os previstos no PCMSO devem estar presentes.
- Emissão exige SST/create e autorização clínica canAssess por UG. Leitura exige SST/view e autorização clínica; impressão em `/sst/aso/[id]/imprimir` exige adicionalmente SST/issueReports. Consulta, leitura e emissão são auditadas somente com identificadores, sem resultados clínicos nos logs gerais.
- Snapshot preserva identificação, matrícula/cargo/local, UG, médico, laboratório, versão PCMSO e GHE. UUID estável e hash do pedido evitam repetição com exames duplicados; reutilização com dados diferentes é rejeitada.
- ASO e exames são gravados na mesma transação. Triggers impedem UPDATE/DELETE; constraints diferidas exigem o conjunto completo, clínico correspondente e validade dos exames, bloqueando inclusão posterior de novos exames em ASO emitido.
- Datas de realização/vencimento são `DATE`, validadas sem rollover e impressas sem deslocamento de calendário por timezone. Vigências PCMSO/GHE são comparadas pelo dia civil em `America/Sao_Paulo`.
- Impressão preenchida disponível, com identificação, exames/datas/validades, conclusão e campo de assinatura. A anamnese versionada complementar está descrita no incremento seguinte. Permanecem pendentes ASO em branco, conferência do layout integral com os profissionais, riscos vinculados ao documento, GED/assinatura digital e retificação/anulação própria. Não classificar a impressão como documento digital assinado ou evento eSocial aceito.
- Os profissionais são identificados por pessoa e conselho informado; habilitação profissional/vigência em cadastro ocupacional próprio ainda precisa ser implementada. Resultados apresentados são informados manualmente; anexos de laudos e integração autorizada com laboratório de origem permanecem pendentes.

#### Roteiro de demonstração deste incremento

1. Selecionar UG autorizada e PCMSO vigente, com protocolos por tipo e GHE; preparar pessoa candidata sem `Employee` e médico no Cadastro Único.
2. Em `/sst/aso`, carregar até cinco nomes separados por `;` (mínimo três letras, até 20 resultados por nome); selecionar pessoa, médico, versão/GHE e concurso/processo. Para toxicológico, buscar o laboratório por razão social.
3. Registrar clínico com o mesmo médico/conselho/data do ASO e acrescentar os exames previstos; informar os resultados e validades. Conferir bloqueio por exame ausente/expirado, GHE incompatível, PCMSO fora da vigência e conclusão condicional sem detalhes.
4. Salvar, abrir ficha e emitir impressão com perfil autorizado. Conferir ausência de servidor artificial, snapshot dos nomes/dados e datas preservadas; negar operação ao leitor clínico sem canAssess e impressão sem issueReports.
5. Consultar vencimentos e usar base com mais de 40 ASOs para conferir paginação/filtros e responsividade. Essas demonstrações com dados e navegador ainda não foram executadas; os testes automatizados não substituem a evidência POC dos itens 21, 37, 39, 40, 43 e 45.

### Questionários e anamnese médica — segundo incremento F3

- `/sst/questionarios`: cadastro de questionários médicos por UG, código, título, seções e questões. Reutilizar código/UG gera nova versão alocada sob lock transacional; UUID/hash estabilizam a submissão e impedem duplicação em nova tentativa. Consulta e histórico de anamnese usam paginação no servidor de 20 registros.
- Seis tipos: texto, número, sim/não, data, escolha única e múltipla. Limites de 100 questões, 50 opções por questão e 10.000 caracteres por resposta textual; chaves estáveis e opções não podem se repetir. Número zero e resposta negativa são valores válidos, não ausência de resposta.
- Validação no servidor exige respostas obrigatórias, tipo correto, opções da versão selecionada e datas civis válidas; rejeita questões desconhecidas, escolhas duplicadas e valores numéricos não finitos.
- `/sst/questionarios/[id]?print=1`: emissão do questionário médico em branco. A versão permanece identificada no documento. Isso não implementa o ASO em branco nem os questionários especializados do item 36.
- `/sst/aso/[id]/anamnese`: seleção de versão da mesma UG do ASO, preenchimento e histórico. Toda nova revisão após a primeira exige justificativa; cada revisão guarda respostas e snapshot de título, versão, perguntas, pessoa, médico do ASO/conselho e nome do usuário registrador. O usuário registrador é identificado separadamente do médico do ASO.
- `/sst/anamneses/[id]`: ficha da revisão com perguntas e respostas preservadas; `?print=1` emite preenchido. Leitura/histórico/impressão são auditados sem conteúdo clínico nos logs. Templates e respostas só são disponibilizados nas UGs com autorização clínica; criar exige SST/create e canAssess; emissão exige SST/issueReports.
- Anamnese é registro complementar ligado a ASO já emitido. Não altera aptidão, exames ou documento original; uma revisão da anamnese não retifica o ASO. Registro tem timestamp próprio; fluxo de anamnese pré-emissão e rascunho ASO continuam pendentes.
- `SstQuestionnaireVersion` e `SstAnamnesis` são imutáveis no banco. FK preserva o ASO de origem e um trigger impede vincular questionário de outra UG; revisão/submissão têm índices únicos. Locks por ASO serializam o número da revisão.
- O modelo assistencial `HealthLabQuestionnaire` foi conferido: suas perguntas/grupos são mutáveis e ligados às rotinas de laboratório assistencial. O novo versionamento é ocupacional; não importa nem consulta respostas/prontuários SUS, nem replica pessoas.
- Migração aditiva `20261010210000_add_sst_questionnaires` aplicada com sucesso. O deploy encontrou 30 migrações locais e aplicou somente essa migração. O banco compartilhado já contém outras migrações de Construção Civil do notebook paralelo (até `20261010300000_construction_internal_documents` na conferência desta etapa), ainda ausentes do remoto consultado; preservar e integrar seus arquivos quando publicados.
- Item 38 tem esta implementação incremental e permanece pendente de evidência POC. Questionários/prontuários de enfermagem, psicologia e assistência social ainda exigem modelagem de autorização por atuação e habilitação profissional: não considerar item 36 ou 74 atendido por este formulário médico.

#### Roteiro de demonstração da anamnese

1. Com UG e autorização clínica de avaliação, abrir `/sst/questionarios`, selecionar UG e cadastrar código/título/perguntas, incluindo sim/não obrigatório e número obrigatório. Criar nova versão pelo mesmo código e conferir preservação da anterior.
2. Abrir ASO → “Anamnese e histórico de revisões”, selecionar a versão e preencher respostas. Conferir que “Não” e `0` são aceitos; obrigatórias vazias, datas inexistentes e opções não previstas são recusadas.
3. Abrir a revisão salva e emitir preenchido com permissão de relatórios. Emitir o template em branco pela ficha do questionário. Conferir seções, identificação da versão e impressão multipágina em navegador.
4. Registrar nova revisão com justificativa; consultar ambas e confirmar que respostas/enunciados anteriores foram preservados. Negar gravação ao leitor sem canAssess, emissão sem issueReports e cruzamento de UG.
5. Essas demonstrações em navegador/usuários reais ainda não foram executadas. Os testes cobrem políticas, autorização, idempotência, revisão/snapshot e integridade PostgreSQL isolada, não homologação visual nem conteúdo clínico do formulário.

### Cobertura contratual ainda pendente

- Item 3: perícia/afastamento implementados; **reflexos automáticos na folha pendentes**. `processPayroll` é uma simulação e não consome `Leave`; não deduzir salário automaticamente sem regra válida por regime/competência.
- Item 8: sugestão/confirmação disponível na ficha pericial; ainda não abre automaticamente a rotina de afastamentos imediatamente após cadastrar atestado.
- Item 9: restrição por cargo disponível; restrição por regime depende do vínculo funcional/regime canônico do RH ainda não associado ao servidor nesse fluxo.
- Item 1: registro e anexos implementados; códigos CID são validados sintaticamente, não por catálogo oficial nesta etapa.
- Retificação/anulação de decisão com tratamento dos reflexos precisa de fluxo próprio antes de liberar essas operações.
- Relatórios ainda não filtram por regime nem usam fontes distintas para local e centro de custo: dependem da ampliação do vínculo funcional canônico do RH. A estimativa de custo usa salário base atual e horas contratuais, não apuração histórica da folha.
- ASO possui o primeiro incremento descrito acima; sua cobertura integral, equipamentos/estoque, CAT, restrições, prevenção, planos, prontuários especializados, PPP e eSocial permanecem pendentes. GHE e os cadastros LTCAT/PGR/PCMSO não equivalem à implantação/homologação integral de F2.
- A integração com Saúde assistencial/exames/vacinação ainda não foi implementada; os registros ocupacionais não consultam o prontuário SUS.
- Associação servidor/UG usa compatibilidade com a secretaria da lotação e autorização à UG. Se houver múltiplas UGs/entidades com a mesma secretaria, definir o vínculo funcional explícito para essa situação antes de homologar segregação por entidade.
- Leitor biométrico, certificado/ambiente eSocial e rotinas de emissão/transmissão precisam de integração real e evidência em homologação.

### Validação

- Vinte e um testes direcionados de SST, módulos e autorização de Perfis passaram, incluindo programas e versões imutáveis em PGlite. Após os ajustes de snapshots/triggers, os três testes de programas passaram novamente, juntamente com os três testes da fundação Construção Civil incorporada.
- Prisma validate e geração do cliente passaram.
- `npm run build` passou após os ajustes de Perfis e programas e após integrar `34bc19a — obras e civil`. Lint direcionado passou. O último deploy encontrou 25 migrações locais e aplicou somente `20261010180000_add_sst_programs`.
- Lint global apresentou oito erros fora dos arquivos SST: seis `no-explicit-any` em `prisma/seed-patrimonio.ts` e dois `set-state-in-effect` em `src/components/portal-institucional/PortalShell.tsx`.
- Não houve validação visual em navegador nem homologação de upload, impressão e fluxo com usuários reais. Testes de serviço com objetos simulados não equivalem a POC completa.
- Nesta continuação, 33 testes direcionados de SST, Perfis/módulos e Construção Civil passaram. Os seis testes ASO cobrem datas, candidato, PCMSO/GHE/exames, autorização clínica, idempotência/snapshot e integridade transacional/imutabilidade em PGlite.
- Após incorporar `civil 4`, o build passou novamente e os nove testes ASO/Construção Civil passaram após a geração do cliente Prisma. Lint dos novos arquivos ASO, painel e navegação SST passou; Prisma validate/generate passaram. Evitar rodar testes Prisma em paralelo com a geração do cliente, pois podem carregar um cliente anterior aos novos modelos.
- Incremento de questionários/anamnese: 36 testes direcionados passaram, incluindo seis novos testes de políticas, acesso clínico, idempotência, versionamento/revisão e integridade em PGlite. Prisma validate/generate e lint direcionado passaram. O primeiro build excedeu o timeout do comando após compilar e verificar TypeScript; a execução seguinte com timeout ampliado concluiu com sucesso.
- Após integrar `civil5`, passaram 29 testes selecionados de SST/documentos/GED/migrações/ciclo de análise e outros 20 testes de viabilidade automática, pedidos externos e ciclo/listas. O teste de serviço GED exige `node --conditions=react-server --import tsx --test tests/construction-documents-service.test.ts`, conforme as evidências de Construção Civil; com essa condição passou. TypeScript com heap 8192 MB e `tsconfig.build.json`, lint dos arquivos ajustados e o build final completo passaram. Não considerar esses testes como homologação visual/contratual dos módulos.

## Continuação

Concluir lacunas F1: confirmação imediata de afastamento, filtros funcionais completos, vínculos por regime e contratos de reflexo RH/Folha. Conectar programas e riscos ao catálogo de equipamentos e exames. Continuar F3 com habilitação e autorização por atuação, prontuários/questionários especializados, anamnese pré-emissão, exames/documentos de origem, solicitações, vacinas, alertas de agenda/férias e contratos reais eSocial; depois F4–F8. Atualizar evidências por requisito, sem marcar rotinas ainda não implementadas ou não homologadas como atendidas.

## Correção de Configurações/Perfis antes do commit

O acesso com perfil Gestão produz uma recusa esperada: a administração de perfis usa `getTenantContextForSystemAdministration`, exclusiva de `SYSTEM_ADMINISTRATOR`. A consulta e projeção de perfis passaram no banco configurado, sem referências órfãs; a conta indicada pelo usuário e seu perfil estão ativos, mas não possuem acesso de administrador técnico.

A página de Perfis renderiza `AccessError` como aviso de acesso restrito antes da fronteira RSC. Conforme a orientação posterior do usuário, a autorização da página agora usa acesso ao módulo `CONFIGURACOES`, e suas actions usam as operações criar/editar/excluir desse módulo. A matriz pode ser visualizada em modo de leitura; controles de alteração seguem as capacidades do usuário. O perfil protegido `SYSTEM_ADMINISTRATOR` continua excluído da edição manual. A conferência da conta indicada confirmou acesso Configurações e as três operações liberadas. Erros inesperados continuam propagados para diagnóstico. A CSP report-only ganhou `connect-src` explícito para Firebase Auth/renovação de token. A alteração precisa de publicação para surtir efeito no ambiente publicado.
