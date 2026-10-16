# IPTU, ISS e ITBI — reconciliação técnica de 15/10/2026

## Situação da revisão

Esta é uma revisão local dos **97 itens**: EXE-12 (30), EXE-13 (41) e EXE-14 (26). Não constitui entrega integral, homologação, aceite operacional ou autorização de commit. Os estados de aceite em `CONTROLE_REQUISITOS.json` permanecem os registrados nos checklists. Os limites históricos descritos em `IMPLEMENTACAO_IPTU_ISS_ITBI_2026_10_14.md` devem ser lidos junto às atualizações deste registro.

As referências abaixo apontam implementações e regressões relacionadas. Um teste relacionado não comprova, por si só, todas as orações do requisito. A conferência autenticada das telas, emissão com modelos oficiais, parâmetros municipais e integrações externas continua pendente. Nenhuma migration deste desenvolvimento foi aplicada ao banco municipal.

Nas tabelas, os nomes de bibliotecas são relativos a `src/lib/tributacao/` e os testes a `tests/`. As bibliotecas devem ser conferidas junto aos consumidores em `src/app/app-domain/tributacao/`, portal e APIs. Não há atribuição automática de ente/UG aos cadastros legados.

## EXE-12 — IPTU / cadastro imobiliário (30 itens)

| ID | Implementação relacionada | Regressão relacionada | Conferência ou lacuna remanescente |
|---|---|---|---|
| EXE-12.1 | `configurable-cadastres.ts`, catálogos territoriais e vínculos tipados | `configurable-fiscal-cadastres.test.ts` | Conferir edifício, condomínio, loteamento e localidade nas fichas reais. |
| EXE-12.2 | `configurable-cadastres.ts`: índices próprios tipados e CNAEs permitidos/permissíveis/proibidos, com referência congelada | `configurable-fiscal-cadastres.test.ts`, `economic-activity-registry.test.ts` | Homologar plano diretor, índices e condições. Tratamento urbanístico cadastrado não é autorização automática de funcionamento. |
| EXE-12.3 | `configurable-cadastres.ts`: versões, desativação e múltiplos vínculos | `configurable-fiscal-cadastres.test.ts` | Conferir apresentação de vínculos antigos após desativação. |
| EXE-12.4 | `configurable-cadastres.ts`, `property-bulk-change.ts`, seleção de situações configuradas | `configurable-fiscal-cadastres.test.ts` | Conferir situações padrão e customizadas em todos os editores. |
| EXE-12.5 | `configurable-cadastres.ts`: tipos, ocorrências, formulários e documentos GED | `configurable-fiscal-cadastres.test.ts` | Executar vistoria completa nas telas autenticadas, incluindo anexação/download. |
| EXE-12.6 | `configurable-cadastres.ts`: bairro, logradouro, valor unitário e valores adicionais da PGV | `configurable-fiscal-cadastres.test.ts`, `property-pgv-integration.test.ts` | Homologar plantas, pavimentação, coleta e parâmetros oficiais. |
| EXE-12.7 | `property-valuation.ts`: múltiplas PGVs, testadas e ponderação por comprimento | `property-pgv-integration.test.ts` | Conferir restrições de aplicação aos terrenos urbanos e legislação de ponderação. |
| EXE-12.8 | `property-profile.ts`, inclusão nativa e perfil na mesma transação | `property-profile.test.ts` | Executar inclusão/manutenção de terreno, unidade e rural pelas telas. |
| EXE-12.9 | `property-profile-schema.ts`, `property-profile.ts`: inscrição, tipo e terreno da unidade | `property-profile.test.ts` | Conciliar legados sem perfil; conferir modalidades autônoma/englobada. |
| EXE-12.10 | `configurable-cadastres.ts`: BCI por tipo e campos adicionais | `configurable-fiscal-cadastres.test.ts` | Conferir preenchimento e manutenção dos três tipos de BCI. |
| EXE-12.11 | `property-profile.ts`, `property-structure.ts`, mapa, titulares e correspondência | `property-profile.test.ts`, `property-structure.test.ts` | Conferir todos os campos na ficha. Total edificado soma áreas próprias das unidades vigentes, sem duplicar a área informada no terreno; área ausente fica pendente. |
| EXE-12.12 | `property-profile-schema.ts`, política de composição da inscrição | `property-profile.test.ts` | Homologar ordem, tamanho, descrição e separadores municipais. |
| EXE-12.13 | `property-history.ts`, posições nativas e perfis na referência | `property-history.test.ts`, `property-profile.test.ts` | Revisar temporalidade dos relacionamentos auxiliares; passado anterior à posição observada permanece desconhecido. |
| EXE-12.14 | `property-history.ts`, ficha/espelho imprimível por referência | `property-history.test.ts` | Conferir impressão integral e relacionamentos na data selecionada. |
| EXE-12.15 | Ficha imobiliária, workspace fiscal, débitos e links de processos | `tax-property-cadastral-completion.test.ts`, `tax-cadastral-migration-chain.test.ts` | Executar navegação de todos os detalhamentos: benefícios, alvarás, vistorias, entregas/devoluções, ITBI, protocolos e extrato. |
| EXE-12.16 | Perfil/workspace fiscal e documentos GED; `itbi-attachments.ts` compartilha anexos | `property-profile.test.ts`, `itbi-online-channel.test.ts` | Conferir upload/download direto da ficha e permissões municipais. |
| EXE-12.17 | `property-history.ts`, linha do tempo e posições observadas | `property-history.test.ts` | Não apresentar data de criação legada como evidência de todo o histórico anterior. Conferir relações auxiliares. |
| EXE-12.18 | Trigger nativo, `property-history.ts` e registros auxiliares manuais | `property-history.test.ts` | Conferir histórico manual e atribuição do ator em todos os produtores; escrita direta sem ator deve continuar identificada como tal. |
| EXE-12.19 | `property-edit-restrictions.ts`, política coletiva APP/risco e liberação consumível | `property-edit-restrictions.test.ts`, `property-profile.test.ts` | Homologar supervisor e regras municipais. Supervisor implementado utiliza administrador do sistema. |
| EXE-12.20 | `property-operations.ts`: cópia por inscrições e links de ajuste | `property-operations.test.ts`, `property-profile.test.ts` | Conferir quantidade, vínculos copiáveis e ajuste de cada destino; dívidas/histórico não são copiados. |
| EXE-12.21 | `property-bulk-change.ts`: prévia, fingerprint, campos nativos/perfil/formulários | `property-profile.test.ts`, `tax-channel-financial-integrity.test.ts` | Conferir abrangência de todos os campos pretendidos pelo município; limite de 1.000 imóveis por operação. |
| EXE-12.22 | `pgv-bulk.ts`: seleção por bairro/logradouro, definição e valores próprios tipados | `property-pgv-integration.test.ts` | Conferir alteração de cada campo na UI; seleção/versões e rollback são reconferidos no servidor. |
| EXE-12.23 | Política de protocolo no perfil e guards PostgreSQL | `property-profile.test.ts` | Conferir associação do protocolo em todos os editores e produtores antigos. |
| EXE-12.24 | `property-operations.ts`: novos cadastros, conservação de áreas, baixa das origens e comprovante | `property-operations.test.ts` | Homologar titularidade, vínculos de unidades e modelo do comprovante nos cenários municipais. |
| EXE-12.25 | `property-group-simulation.ts`, `property-simulation-assessment.ts`, cobertura contra duplicidade | `property-profile.test.ts`, `tax-channel-financial-integrity.test.ts` | Homologar cálculo individual/englobado e campos simuláveis; efetivação preserva cadastro e avaliação nativa. |
| EXE-12.26 | `fiscal-engine.ts`, `conditional-discounts.ts`, `annual-rollover.ts` | `tax-annual-options-rollover.test.ts`, `tax-channel-financial-integrity.test.ts`, `tax-annual-batches.test.ts` | Homologar fórmulas, mínimos, calendários e benefícios; conferir produtores IPTU e ISS e todas as condições de dívida. |
| EXE-12.27 | `debt-notices.ts`, `debt-notice-output.ts`: PDF, lote, TXT/XML e boleto condicionado | `tax-channel-financial-integrity.test.ts` | Boleto depende de registro bancário conciliado. Homologar layout e filtros reais de bairro/logradouro. |
| EXE-12.28 | `debt-notices.ts`: consulta, filtros, reimpressão e cancelamento | `tax-channel-financial-integrity.test.ts` | Conferir pesquisa por data/tipo/contribuinte/imóvel e situação documental na tela. |
| EXE-12.29 | `annual-comparison.ts`: dois exercícios, diferenças, percentuais e valor venal | `tax-property-cadastral-completion.test.ts` | Conferir relatório com bases municipais conciliadas; valores ausentes não são presumidos. |
| EXE-12.30 | `annual-tax-summary.ts`: valores, benefícios, guias, pagamentos e inadimplência | `tax-channel-financial-integrity.test.ts` | Conferir cota única/parcelas e classificação municipal de isenções/imunidades. |

## EXE-13 — ISS / cadastro econômico (41 itens)

| ID | Implementação relacionada | Regressão relacionada | Conferência ou lacuna remanescente |
|---|---|---|---|
| EXE-13.1 | `accountants.ts`, `economic-profile.ts`: contribuinte único e CRC versionado | `economic-profile.test.ts` | Homologar habilitação e tratamento das correções de CRC em perfis já existentes. |
| EXE-13.2 | `economic-activity-registry.ts`: CNAE e serviços ISS da mesma origem | `economic-activity-registry.test.ts` | Homologar tabelas oficiais e vínculos municipais. |
| EXE-13.3 | `economic-activity-registry.ts`: referências CBO ativas | `economic-activity-registry.test.ts` | Conferir ocupações dos autônomos e cadastro oficial. |
| EXE-13.4 | `economic-activity-registry.ts`: baixo/médio/alto/dependente | `economic-activity-registry.test.ts` | Homologar classificação municipal de risco. |
| EXE-13.5 | `economic-activity-registry.ts`: publicação versionada das características da atividade | `economic-activity-registry.test.ts` | Conferir alcance esperado da alteração geral e atualização de perfis existentes. |
| EXE-13.6 | `economic-activity-operations.ts`: perfis e zoneamentos conciliados, aliases e rollback | `economic-activity-registry.test.ts` | Códigos livres de formulários e referências de outros módulos exigem revisão individual. Legados sem origem não são atribuídos implicitamente. |
| EXE-13.7 | `configurable-cadastres.ts`, situações econômicas | `configurable-fiscal-cadastres.test.ts` | Conferir padrão ativo/desativo/baixado/suspenso e todos os editores. |
| EXE-13.8 | Tipos/formulários/ocorrências de vistoria com GED | `configurable-fiscal-cadastres.test.ts` | Executar vistoria econômica completa, arquivos/imagens e download autenticado. |
| EXE-13.9 | `configurable-cadastres.ts`, `economic-profile.ts`: tipos da empresa | `economic-profile.test.ts` | Homologar tipos municipais e seleção na inclusão. |
| EXE-13.10 | Tipos de sócio, percentuais e `certificate-subjects.ts` | `economic-profile.test.ts` | Homologar sujeitos da certidão e modelo oficial da certidão fiscal. |
| EXE-13.11 | `economic-query.ts`: filtros cadastrais e campos adicionais | `economic-profile.test.ts` | Conferir todos os filtros e cadastros PF/PJ em tela; legados sem perfil ficam fora da consulta conciliada. |
| EXE-13.12 | `economic-profile.ts`: inclusão transacional e vínculos completos | `economic-profile.test.ts` | Conferir todos os campos e documentos na inclusão autenticada. |
| EXE-13.13 | Política de prazo por tipo, expiração e cron | `economic-profile.test.ts` | Implantar cron com operador ativo, UG explícita e segredo; homologar prazos. |
| EXE-13.14 | `economic-history.ts`, versão/data do perfil na edição | `economic-profile.test.ts` | Conferir data de última alteração nativa e do perfil na tela. |
| EXE-13.15 | `economic-profile.ts`: endereço da empresa e correspondência | `economic-profile.test.ts` | Conferir persistência na inclusão e manutenção, incluindo REDESIM. |
| EXE-13.16 | `economic-debt-policy.ts`, produtores de inclusão/alteração e REDESIM | `economic-profile.test.ts`, `tax-channel-financial-integrity.test.ts` | Homologar política e revisar todos os produtores; origem desconhecida impede comprovar ausência de dívida. |
| EXE-13.17 | Perfil e GED com documentos econômicos | `economic-profile.test.ts` | Conferir upload/download e autorização da ficha. |
| EXE-13.18 | Perfil e `GeographicPointPicker` | `economic-profile.test.ts` | Executar seleção no mapa e conferir coordenadas persistidas. Tiles dependem do provedor. |
| EXE-13.19 | Consulta econômica com pontos filtrados no mapa | `economic-profile.test.ts` | Conferir visualmente marcadores e filtros com dados municipais. |
| EXE-13.20 | `configurable-cadastres.ts`: formulário econômico tipado | `configurable-fiscal-cadastres.test.ts` | Conferir configuração e preenchimento sem intervenção técnica. |
| EXE-13.21 | `economic-history.ts`, versões de perfil/relações | `economic-profile.test.ts` | Revisar temporalidade de relacionamentos fora do perfil e produtores antigos. |
| EXE-13.22 | Espelho econômico por referência | `economic-profile.test.ts` | Conferir impressão integral; nomes/vínculos anteriores aos snapshots não são reconstruídos. |
| EXE-13.23 | Ficha econômica, workspace fiscal e atalhos de débitos/processos/alvarás | `tax-channel-financial-integrity.test.ts` | Executar todos os detalhamentos, incluindo fiscalização e histórico financeiro. |
| EXE-13.24 | `economic-operations.ts`: filtros, prévia, campos/perfil/formulário e reconferência | `tax-channel-financial-integrity.test.ts` | Conferir abrangência de campos e políticas; limite de 1.000 perfis por operação. |
| EXE-13.25 | `license-policy.ts`: configuração anual, validade, dívida e layout | `configured-licenses.test.ts` | Homologar tipos, modelos, calendário e condições oficiais. |
| EXE-13.26 | Política anual de bloqueio por tipo/CNAE e mensagem | `configured-licenses.test.ts` | Conferir restrições municipais e bloqueio em emissão interna/lote/portal. |
| EXE-13.27 | `portal-licenses.ts`: autorização vigente e tipos explicitamente liberados | `configured-licenses.test.ts` | Executar emissão autenticada com conta municipal autorizada. |
| EXE-13.28 | `license-lifecycle.ts`, `license-signatures.ts`, PDF e consulta | `configured-licenses.test.ts`, `tax-a1-signature.test.ts`, `configured-license-signature.test.ts` | Integração local de emissão/assinatura/consulta/suspensão/cancelamento passou com certificado efêmero e transporte Blob simulado. Credencial municipal e armazenamento implantado ainda precisam de homologação. Assinatura é destacada, não PAdES. |
| EXE-13.29 | Vínculos de processos na ficha econômica | `economic-profile.test.ts` | Conferir trâmite, assunto/subassunto, anexos e pareceres através dos links autenticados. |
| EXE-13.30 | `license-policy.ts`, emissão individual/lote transacional | `configured-licenses.test.ts` | Homologar filtros/quantidade e PDFs resultantes. |
| EXE-13.31 | Autenticidade UUID, situação atual e original assinado separado | `portal-proxy.test.ts`, `configured-licenses.test.ts` | Conferir acesso público real, QR e integridade do original com armazenamento implantado. |
| EXE-13.32 | `economic-events.ts`: tipos e versões | `economic-events-vehicles.test.ts` | Homologar tipos de eventos municipais. |
| EXE-13.33 | `economic-events.ts`: responsável, inscrição opcional, datas, endereço e campos adicionais | `economic-events-vehicles.test.ts` | Conferir edição autenticada e campos municipais. |
| EXE-13.34 | `economic-events.ts`: alvará de evento com tipo/layout congelados | `economic-events-vehicles.test.ts` | Homologar modelo e impressão. Alterar evento licenciado exige cancelar a licença. |
| EXE-13.35 | `economic-events.ts`: veículos, empresa, condutor, marca/modelo/prefixo e placas | `economic-events-vehicles.test.ts` | Conferir placas brasileiras/Mercosul e uso em vistorias municipais. |
| EXE-13.36 | `portal-economic-documents.ts`: comprovante e certidão cadastral de baixa | `tax-channel-financial-integrity.test.ts` | Executar portal autenticado. Baixa exige situação Baixado, não certifica regularidade fiscal nem extingue dívidas. |
| EXE-13.37 | `fiscal-engine.ts`, calendário, mínimos e descontos condicionais | `tax-annual-options-rollover.test.ts`, `tax-channel-financial-integrity.test.ts` | Homologar ISS fixo/anual, taxas, fórmulas e produtores. |
| EXE-13.38 | `debt-notices.ts`, PDF/TXT/XML e boleto conciliado | `tax-channel-financial-integrity.test.ts` | Homologar filtros/endereço e integração bancária; não produzir boleto fictício. |
| EXE-13.39 | `annual-comparison.ts`: comparação por exercício, diferenças e percentuais | `tax-property-cadastral-completion.test.ts` | Conferir relatório econômico e filtros com lançamentos municipais. |
| EXE-13.40 | `simples-option-files.ts`: TXT delimitado/fixo, bytes/hash, saída e downloads | `simples-option-files.test.ts` | Obter e homologar layout oficial e arquivos reais da Receita. |
| EXE-13.41 | `simples-option-files.ts`: empresas, decisões e termos PDF | `simples-option-files.test.ts` | Homologar modelos e fundamentos de deferimento/indeferimento. |

## EXE-14 — ITBI (26 itens)

| ID | Implementação relacionada | Regressão relacionada | Conferência ou lacuna remanescente |
|---|---|---|---|
| EXE-14.1 | `s3-service.ts`, `itbi-online.ts`, inclusão interna/on-line e dados/mapa do imóvel | `itbi-online-channel.test.ts`, `tax-property-cadastral-completion.test.ts` | Conferir diferenciação do canal e mapa para imóveis urbanos/rurais nas telas. |
| EXE-14.2 | `itbi-property-collection.ts`: processo comum e valores por imóvel/unidade | `itbi-process-completion.test.ts` | Conferir seleção completa e documentos agregados. Limite de 100 imóveis. |
| EXE-14.3 | `property-valuation.ts`: regra ITBI independente da avaliação IPTU | `property-pgv-integration.test.ts`, `tax-property-cadastral-completion.test.ts` | Homologar fórmula, fatores e fundamento próprios. |
| EXE-14.4 | `itbi-parameters.ts`, política on-line por modalidade | `itbi-online-channel.test.ts` | Homologar alíquotas e modalidades liberadas ao tabelionato. |
| EXE-14.5 | `s3-engine.ts`, múltiplas partes e transferência fiscal parcial | `tax-property-cadastral-completion.test.ts`, `tax-document-integration.test.ts` | Conferir participações, remanescentes e titularidade municipal. |
| EXE-14.6 | `itbi-correspondence.ts`: opção de correspondência e recomposição no estorno | `tax-cadastral-migration-chain.test.ts` | Conferir comprador selecionado e endereço no fluxo interno/on-line. |
| EXE-14.7 | `itbi-additional-forms.ts`, formulários municipais congelados na inclusão | `itbi-online-channel.test.ts`, `tax-cadastral-migration-chain.test.ts` | Homologar conjunto e versões dos formulários municipais; limite de 50. |
| EXE-14.8 | `itbi-portal-storage.ts`, `itbi-draft-storage.ts`, UI de anexos preparados e GED | `itbi-online-channel.test.ts` | Teste de protocolo usa evidências preparadas na base isolada; conferir upload Blob real, repetição após protocolo, download e revogação de acesso. |
| EXE-14.9 | `itbi-history.ts`, migration `20261015230000_itbi_field_history`, UI de antes/depois | `itbi-field-history.test.ts`, `itbi-online-channel.test.ts`, `tax-cadastral-migration-chain.test.ts` | Aplicar migration e conferir todos os produtores. Legado recebe posição inicial observada sem autor/data anterior presumidos. Escritas sem operador permanecem explícitas. |
| EXE-14.10 | `itbi-online.ts`: tabelionato, usuários autorizados e política versionada | `itbi-online-channel.test.ts` | Homologar habilitações e operadores municipais. |
| EXE-14.11 | `itbi-online.ts`, `itbi-contestation.ts`: liberação automática/análise e impugnação inicial atômica | `itbi-online-channel.test.ts`, `itbi-process-completion.test.ts` | Homologar política e decisão fiscal; revisão abaixo do liquidado continua bloqueada até tratamento formal do excesso. |
| EXE-14.12 | `s3-service.ts`: devedor explícito entre as partes | `tax-property-cadastral-completion.test.ts`, `itbi-online-channel.test.ts` | Conferir seleção e identificação do devedor nas guias/documentos municipais. |
| EXE-14.13 | `itbi-process-channel.ts`, portal autorizado por processo e impressão | `itbi-online-channel.test.ts` | Executar impressão e isolamento entre tabelionatos; acesso requer concessão explícita vigente. |
| EXE-14.14 | Confirmação coordenada de cálculo, lançamento, DAM e documento GED | `tax-property-cadastral-completion.test.ts`, `itbi-online-channel.test.ts` | Conferir comprovantes e guia na inclusão interna e liberação on-line. |
| EXE-14.15 | `itbi-fiscal-treatment.ts`, modalidades e estados de análise | `itbi-online-channel.test.ts` | Homologar isenção/imunidade/não incidência, prévia e integralização de capital e seus modelos; decisão de não tributação é fundamentada antes do crédito. |
| EXE-14.16 | `itbi-process-channel.ts`: mensagens aditivas por processo | `itbi-online-channel.test.ts` | Executar diálogo completo externo/fiscal em contas distintas. |
| EXE-14.17 | Canal de exigências/respostas/aceite e `itbi-data-adjustment.ts` | `itbi-online-channel.test.ts` | Conferir nova matrícula e proposta aceita em tela; aplicação de proposta exige fase anterior ao crédito. |
| EXE-14.18 | `itbi-attachments.ts`: GED compartilhado com processo e imóveis | `itbi-online-channel.test.ts`, `tax-cadastral-migration-chain.test.ts` | Conferir cada produtor de anexo interno/on-line e cada imóvel agregado. |
| EXE-14.19 | `itbi-ownership.ts`: transferência configurada e estorno coordenado | `tax-document-integration.test.ts`, `tax-cadastral-migration-chain.test.ts` | Homologar transferência automática após pagamento integral e preservar registro civil separado. |
| EXE-14.20 | `itbi-ownership.ts`: transferência manual com pagamento conciliado | `tax-property-cadastral-completion.test.ts` | Conferir autorização, fundamento e replay na operação municipal. |
| EXE-14.21 | `itbi-rectification.ts`: novo identificador, origem RETIFICADA, herança de partes/formulários/correspondência | `tax-cadastral-migration-chain.test.ts` | Redução abaixo do pago/compensado continua bloqueada; integração de excesso/restituição específica ao fluxo retificador permanece aberta. |
| EXE-14.22 | `itbi-rectification.ts`: guia complementar somente do saldo devido | `tax-cadastral-migration-chain.test.ts` | Homologar guia retificadora, cadeia sucessiva e tratamento de excesso. |
| EXE-14.23 | `itbi-document-models.ts`: modelos por fase, quitação e acesso explícito no portal | `itbi-online-channel.test.ts` | Homologar textos, modelos, GED e reimpressão; memória e fingerprint são reconferidos. |
| EXE-14.24 | `itbi-expiry.ts`: política de prazo/fundamento e preservação de pagamento/transferência | `itbi-expiry.test.ts` | Regressão específica de expiração aprovada; implantar cron autorizado e homologar prazo/fundamento municipais. Não tributáveis são preservados. |
| EXE-14.25 | Fila interna em `/tributacao/itbi/comunicacao`, ordenação por entrada | `itbi-online-channel.test.ts` | Conferir ordenação e filtros autenticados com vários processos. |
| EXE-14.26 | `itbi-entry-policy.ts`: bloqueios/avisos versionados nas inclusões | `itbi-online-channel.test.ts` | Homologar regras, mensagens e incidência em cada imóvel agregado. |

## Evidências de execução desta rodada

- A regressão ampliada inicial teve 34 cenários, com 28 aprovados e seis falhas. As falhas de exercício fechado/origem ausente foram corrigidas nas fixtures sem relaxar autorização ou atribuir origem a legados.
- A reexecução com ITBI on-line, Simples TXT, reconhecimento contábil, lotes anuais e cadeia financeira terminou com **24/24 cenários aprovados**. Isso não significa 24 cenários adicionais aos executados anteriormente.
- Testes de catálogos/zoneamento, PGV com testadas/alteração geral, total edificado, unificação CNAE/zoneamento e calendário bissexto tiveram execuções dedicadas aprovadas após seus respectivos ajustes.
- `portal-proxy.test.ts`: **9/9 cenários aprovados**.
- Cadeia das **14 migrations** e ITBI on-line aprovados com histórico de campos e atribuição de operador.
- `itbi-field-history.test.ts`: aprovado após ajustar apenas a coluna da fixture ao tipo real `NUMERIC(18,2)`. Verificou precisão no limite, campos anteriores/novos, ator/nome, partes, imutabilidade, posição legada, ausência explícita de atribuição e rollback.
- `configured-license-signature.test.ts`: aprovado com emissão pelos serviços reais, PDF enviado através do SDK Blob com transporte HTTP simulado, assinatura A1/GED e leitura verificável do mesmo arquivo. Confirmou UG, bloqueio de segunda assinatura, limpeza do upload rejeitado, original preservado após suspensão/cancelamento, situação atual separada e rejeição de bytes adulterados. Certificado efêmero/autoconfigurado não é credencial municipal ICP-Brasil; nenhum serviço remoto foi utilizado. `undici` declarado como dependência de desenvolvimento para o transporte isolado.
- `itbi-expiry.test.ts`: aprovado com prazo-limite, origem desconhecida excluída, preservação de transferência/não tributável/pagamento parcial/compensação parcial, cancelamento do crédito não pago e guia, falha injetada com rollback documental, retry e ausência de duplicação. Histórico da mudança final identifica o operador. Primeira execução parou por `fileUrl` obrigatório ausente na fixture; corrigida antes da execução aprovada.
- Lint amplo aprovado; execuções direcionadas posteriores também aprovadas para os ajustes de histórico e PGV. `git diff --check` aprovado.
- O build anterior terminou com erro de tipagem em `PgvBulkClient.tsx`: opções de lista opcionais. Acesso corrigido com `?? []`; lint direcionado aprovado. O **TypeScript dedicado atualizado passou, código 0** (`sh_140620ca8001M0RQ2ZDmxt65Js`). Após adicionar os dois testes de integração de alvará/expiração, a nova conferência dedicada dos tipos também **passou, código 0** (`sh_140729232001ZxQXNe2NfZWDlq`).
- **`npm run build` aprovado, código 0** (`sh_140683e7a001UEXvwydz3WLUEz`): geração Prisma, geração de rotas, quatro partições TypeScript (387 s), compilação otimizada Next.js e geração de 90 páginas estáticas. Inclui as últimas alterações de produção em zoneamentos, PGV, total edificado e histórico ITBI. Os dois testes adicionados durante o build têm regressões aprovadas separadamente; testes não são validação de implantação remota.

## Impedimentos de fechamento

1. Build completo, lint, regressões descritas e TypeScript dedicado incluindo os dois últimos testes estão aprovados. Essa validação local não encerra as lacunas funcionais e de homologação abaixo.
2. Conferir lacunas destacadas individualmente, sobretudo homologação do alvará assinado/armazenado com credencial e Blob implantados, todos os produtores de anexos e temporalidade de relações auxiliares. Integração local do alvará passou com transporte simulado e tipos conferidos.
3. Completar ou delimitar com decisão municipal a revisão ITBI abaixo do liquidado e a destinação do excesso, sem apagar pagamentos, compensações ou histórico.
4. Executar conferência autenticada e homologação com legislação/PGV/alíquotas/calendários/layouts oficiais. Certificado, banco/PIX, NFS-e nacional e demais provedores exigem credenciais e habilitação externas.
5. Aplicação municipal das migrations, implantação dos crons e deploy permanecem pendentes. Commit/push dependem da conclusão e validação integrais combinadas com o usuário.
