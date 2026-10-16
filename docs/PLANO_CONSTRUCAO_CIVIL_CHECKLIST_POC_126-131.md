# Plano de adequação — Gestão da Construção Civil

**Fonte:** `docs/Termo de Referencia/Checklist real POC MÓDULOS EXECUTIVO e CAMARA.pdf`, páginas PDF 126–131, itens 1–52 do módulo Gestão da Construção Civil. O item 19 começa na página 127 e termina na 128; a página 131 encerra o módulo no item 52 e inicia Protocolo e Processo Digital, que não integra esta matriz.

**Data da análise e atualização:** 10/10/2026. **Escopo:** plano dos 52 requisitos, diagnóstico inicial e registro das implementações internas. O planejamento está consolidado; a execução integral e a homologação da POC permanecem pendentes.

> A matriz da seção 3 preserva o diagnóstico inicial por leitura estática. O registro abaixo diferencia implementações de propostas futuras. Recursos genéricos existentes não comprovam atendimento do requisito específico. Não foram homologadas configurações municipais ou integrações externas nem executados fluxos civis no navegador. Os modelos futuros na arquitetura são propostas, salvo quando identificados no registro de execução.

## 1. Diagnóstico executivo

### Registro de execução — fundação interna F0/F1 (10/10/2026)

- Antes da implementação, `main` atualizada por `git pull --ff-only origin main` até `9901539`, com alterações de SST integradas. Arquivos locais protegidos por stash; conflito de relação no schema resolvido preservando SST. Nenhum commit/push realizado.
- Criada área `/obras/construcao-civil` dentro de Obras e Serviços Públicos, com solicitações, abertura interna, detalhe, configurações e equipe. Listas de solicitações, catálogos e vínculos têm filtros e paginação de 20 itens no servidor, sem rolagem interna de tabelas.
- Implementados cinco catálogos editáveis/ativáveis: tipos de alvará, finalidades, tipos construtivos, categorias de parcelamento e tipos de vistoria. Migration inclui os 14 tipos construtivos mínimos, quatro modalidades de alvará, seis finalidades e loteamento/desmembramento. Tipos de vistoria devem ser definidos pela prefeitura.
- Parâmetros publicados em versões: franquia de readequações, prazo de exigência, opção de verificação de débitos, orientações, assuntos de protocolo habilitados e coeficientes de cálculo de área existente/ampliada/irregular/reforma/demolição. Versões publicadas são imutáveis também no banco. Publicação exige gestor urbanístico ou master; a regra municipal não foi presumida nem publicada automaticamente.
- Papéis analista/fiscal/gestor por servidor/setor com vigência e situação. Gestão de vínculos restrita ao master, com servidor ativo/lotação válida para ativação. Identidade do vínculo preservada nas edições; fim/inativação não apaga histórico. Leitura de solicitações exige papel vigente e setor atual responsável, ou master.
- Abertura interna exige permissões de criação em Obras e Processos, vínculo operacional e papel analista/gestor. Reutiliza `createValidatedProcess` sem mudar seu contrato. Processo central e solicitação especializada são criados na mesma transação; chave única e lock evitam duplicação no reenvio. Assunto deve constar na versão urbanística publicada. Distribuição inicial segue o setor configurado em Protocolos; estratégias por menor demanda/gestor/usuário ainda pendentes.
- Solicitação admite obra/parcelamento, urbano/rural, normal/regularização, requerente central PF/PJ e múltiplos imóveis. Preserva versão de parâmetros, classificações e snapshots cadastrais, além de áreas em `Decimal(14,4)` e memória. Formulário com versão desatualizada é rejeitado para evitar cálculo diferente da prévia apresentada.
- Persistir franquia/prazo/opção de débito não implementa por si só cobrança de reanálise, exigências ou consulta tributária de conclusão. Esses consumidores pertencem às próximas fases. A abertura interna também não equivale ao autoatendimento externo.
- Migration aditiva: `prisma/migrations-ibema/20261010160000_construction_foundation/migration.sql`. Validada em PostgreSQL embarcado; não aplicada ao banco municipal/de destino nesta execução.
- Checks: Prisma Client gerado, ESLint aprovado, build completo aprovado e nove testes aprovados (três de Construção Civil e seis de SST). Testes civis verificam precisão/regras de áreas, vigência, seed mínimo, unicidade, imutabilidade, referências cadastrais e isolamento SQL real por setor. Fluxo de abertura completo e comportamento visual ainda precisam de validação integrada; navegador da sessão desconectado.
- Próximas entregas: perfis externos/construtoras/corretores, formulários/checklists configuráveis, zoneamento/plano diretor, distribuição avançada e portal, antes de análise/assinatura/vistoria/conclusão. A matriz abaixo permanece como diagnóstico inicial; nenhum item foi promovido a integralmente atendido sem sua demonstração completa.

### Registro de execução — cadastros, regras e análise interna (10/10/2026)

- Após o commit da fundação pelo usuário, repositório limpo e `git pull --ff-only origin main` executado: remoto já atualizado. As novas implementações permanecem locais, sem commit/push pelo agente.
- `/obras/construcao-civil/profissionais`: engenheiros, arquitetos e corretores vinculados a `Person`, conselho compatível e registro único, vigência/inativação; vínculos de engenheiros/arquitetos com construtoras em `Company`. Identificação e início dos vínculos são imutáveis na edição. O cadastro de perfil não concede identidade ou representação externa.
- `/obras/construcao-civil/regras`: publicação imutável de formulários/checklists por etapa, campos de texto/número/data/seleção, opções e obrigatoriedade. Abertura interna e parecer de projeto validam campos no servidor; a abertura preserva definição/valores e rejeita versão desatualizada. Critérios/documentos do formulário de abertura ainda não validam upload; critérios das etapas de vistoria/conclusão aguardam seus consumidores.
- Distribuição publicada por setor: ao setor, usuário específico, gestor vigente ou analista com menor demanda. A abertura aplica a estratégia na mesma transação, valida elegibilidade por papel/lotação/vigência, sincroniza responsável em Protocolos e registra evento. Lock setorial serializa a distribuição; desempate determinístico por identificador. Se uma estratégia exige profissional e nenhum é elegível, a transação de abertura é revertida. Carga considera processos ativos do setor, sem contabilizar encerrados.
- Zoneamento versionado com base legal declarada, vigência, finalidades/categorias permitidas, área mínima, coeficiente máximo e opção de avaliação automática. Vínculo explícito do imóvel à versão urbanística, separado da zona fiscal. Publicação de nova versão não migra imóveis automaticamente.
- Detalhe da solicitação: avaliação interna idempotente de parâmetros urbanísticos, com regra, área territorial consultada, área proposta e motivos preservados. Usa cálculo decimal e compara com o limite exato antes da apresentação arredondada. Sem zona, fora de vigência, área territorial zero, automação desabilitada ou múltiplos imóveis seguem para análise manual. O resultado não é documento de viabilidade, não emite licença e não cobre todos os índices legais.
- Análise interna: pró-análise e parecer do projeto, decisões motivadas, critérios obrigatórios e vínculo de documentos do protocolo com versão GED atual válida. Snapshot preserva checklist, campos, documentos/versões/hashes e decisão; pareceres são imutáveis. Pró-análise favorável mantém o projeto disponível para análise definitiva.
- Exigência calcula prazo com os dias corridos da configuração preservada. Readequação incrementa a revisão e retorna ao analista inicial, exigindo vínculo vigente no setor atual; indisponibilidade bloqueia o retorno até regularização. Fluxo exige processo recebido/ativo; analistas atuam no caso atribuído, gestores podem atuar no setor. Substituição formal do analista, notificações de vencimento, resposta externa e anotação PDF ainda pendentes.
- Franquia é consultada no deferimento: revisão acima da quantidade gratuita bloqueia parecer favorável até concluir a integração tributária. Não há cobrança automática nem vínculo de pagamento civil nesta etapa; esse bloqueio não comprova o item 4 integralmente.
- Migrations aditivas `20261010170000_construction_rules_profiles` e `20261010180000_construction_project_reviews`, aplicadas em PostgreSQL embarcado de teste. Não aplicadas ao banco municipal/de destino.
- Testes adicionados em `tests/construction-rules-reviews.test.ts`: validações de campos/perfis, precisão/limites da avaliação e fluxo real Prisma/PostgreSQL de distribuição, negativa setorial, checklist obrigatório, parecer idempotente, imutabilidade, exigência, reenvio único e retorno ao analista inicial. Não executam autenticação/actions completas, portal, assinatura ou homologação legal.
- Verificação desta etapa: Prisma Client gerado, ESLint aprovado, 12 testes aprovados (seis civis e seis SST), `git diff --check` aprovado; matriz conferida com 52 itens únicos, sem ausências. Primeira tentativa de build compilou, mas excedeu dez minutos durante TypeScript; segunda tentativa com limite ampliado concluiu `npm run build` com código 0, incluindo TypeScript, geração das páginas e otimização. Verificação visual pendente (`browser.disconnected`).

### Cobertura de execução por fase

| Fase | Situação atual | Próximo critério verificável |
|---|---|---|
| F0 | Preparação técnica parcial | Aprovar regras e competências municipais e dataset de demonstração |
| F1 | Implementada parcialmente | Termos versionados, vigência da construtora como entidade, integração dos demais índices e validação visual |
| F2 | Abertura/distribuição internas implementadas parcialmente | Identidade e representação externas, participantes, aceite, upload e comunicação persistida |
| F3 | Avaliação interna parcial de parâmetros | Viabilidade online com documento e motor de taxas, sem duplicação |
| F4 | Pareceres/exigências/readequações e substituição formal interna implementados parcialmente | PDF anotado, resposta externa e taxa após franquia |
| F5 | Infraestrutura central disponível; integração civil pendente | Template, numeração, emissão, carimbo, assinatura PDF e gate de publicação |
| F6 | Pendente | Início, vistorias, conclusão parcial/total, habite-se e atualização cadastral |
| F7 | Pendente | Processo fiscal edilício, diligências, autos e embargo |
| F8 | Aguardando definição do destino/leiaute | Exportação validada com evidência de aceitação |
| F9 | Pendente | Extrator real PDF/OCR/IA com evidência e comparação |
| F10 | Validação técnica parcial | Fluxos completos, banco de destino, navegador e 52 evidências de aceite |

**Itens com avanço nesta etapa:** 4, 6, 8–9, 12, 18, 22–23, 26–27, 29 e 41. Isso indica implementação parcial e não atendimento integral. Os itens 3, 10–11, 15 e 17 possuem fundação anterior; a homologação continua necessária.

### Registro de execução — banco de destino e substituição formal (10/10/2026)

- Repositório limpo após commit pelo usuário e `git pull --ff-only origin main` executado; base remota já atualizada. Nenhum commit/push pelo agente nesta etapa.
- Executados `prisma migrate status` e `prisma migrate deploy` com a conexão definida em `prisma.config.ts` (`DATABASE_URL_UNPOOLED`, com fallback para `DATABASE_URL`). As migrations civis `20261010160000`, `20261010170000` e `20261010180000` já estavam aplicadas. Consulta direta de `_prisma_migrations` confirmou conclusão sem rollback, tabelas e gatilhos de imutabilidade presentes. As notas anteriores de ausência de aplicação descrevem as etapas históricas, não o estado atual do destino configurado.
- Implementada substituição formal no detalhe da solicitação: gestor do setor/master seleciona analista ou gestor vigente no setor atual e informa motivo. A operação bloqueia responsável desatualizado, protocolo não recebido/encerrado e solicitação deferida/indeferida; atualiza a atribuição civil, o destino de retorno de readequações e o responsável central de Protocolos na mesma transação.
- Histórico em `ConstructionAnalystReplacement` preserva analista de retorno anterior, atribuição anterior, substituto, setor, motivo, autor e data; chave idempotente e lock evitam repetição/conflitos. Relações no banco impedem referência a servidor/setor inexistente; trigger proíbe alteração/exclusão do histórico. Histórico no detalhe com total e paginação de 20 itens.
- Migration aditiva `20261010190000_construction_analyst_replacement` testada em PostgreSQL embarcado e aplicada com sucesso ao banco de destino por `prisma migrate deploy`. Confirmados registro de conclusão sem rollback e gatilho de imutabilidade no destino. Total atual: 25 migrations no diretório configurado; quatro civis aplicadas.
- Testes de integração ampliados: analista não pode substituir; gestor de outro setor não acessa; substituto sem vínculo é rejeitado; repetição mantém um único histórico; atualização stale é rejeitada; responsável anterior não reenvia; readequação retorna ao substituto. Imutabilidade verificada em SQL real. Os 12 testes civis/SST e ESLint passaram. `npm run build` concluído com código 0, incluindo TypeScript, geração das páginas e otimização; `git diff --check` aprovado.
- Consulta de prontidão no destino: zero configurações civis publicadas, vínculos urbanísticos vigentes, perfis profissionais, checklists, versões de zona, imóveis zoneados e solicitações civis. As migrations preparam estrutura/catálogos; a operação depende da configuração municipal inicial abaixo. Não foi publicada regra legal ou concedido papel automaticamente.
- Navegador continua desconectado; validação visual/fluxo autenticado permanece pendente. Aplicação de migrations não equivale a homologação dos 52 requisitos.

### Configuração operacional inicial no destino

1. **Master:** vincular usuários a servidores/lotação ativa e cadastrar vínculos analista/fiscal/gestor na equipe civil. Conceder as permissões correspondentes em Obras e Processos.
2. **Protocolos e gestor:** definir tipo/assunto urbanístico com abertura interna e setor inicial compatível. Publicar configuração civil com assunto habilitado, regra de áreas, prazo, franquia e orientações aprovadas.
3. **Gestor:** publicar campos do formulário de abertura e checklist de análise com critérios/documentos; escolher distribuição e profissional elegível quando exigido pela estratégia.
4. **Urbanismo e Cadastro Imobiliário:** validar plano diretor/base legal, publicar zoneamento/índices e vincular imóveis à versão correta. Os dados demonstrativos devem ser identificados e usados em ambiente de homologação.
5. **Analista:** executar solicitação de teste, receber protocolo, avaliar parâmetros, emitir exigência, complementar documentação no protocolo e registrar readequação/parecer. Validar também substituição motivada e negativas de acesso.
6. **Homologação:** registrar processo, versões e evidências nos cenários A–J. Portal/licenciamento completo, taxas, PDFs e integrações das fases restantes ainda precisam de implementação e validação; a inicialização acima libera somente os fluxos internos já disponíveis.

O sistema possui uma base operacional de **Obras e Serviços Públicos**, com cadastro de obras, medições, serviços urbanos, iluminação, equipes, equipamentos, materiais, documentos e vínculos financeiros/de compras. O checklist exige também a **gestão municipal do licenciamento e da fiscalização da construção civil**, incluindo empreendimentos particulares urbanos/rurais e parcelamentos do solo.

A principal lacuna é o processo urbanístico completo: imóvel → requerente/profissionais → viabilidade → projeto e revisões → análise → taxas → alvará assinado → início de obra → vistorias → conclusão parcial/total → habite-se assinado → atualização imobiliária e informação federal.

### Conclusões

1. Manter Construção Civil como área própria **dentro de Obras e Serviços Públicos**, conforme `docs/CHECKLIST_POC_IBEMA_CODEX.md` e `docs/DECISOES_ARQUITETURAIS_IBEMA.md`. Reutilizar o código modular `OBRAS`; não criar outro módulo com cadastros concorrentes.
2. Preservar os fluxos atuais de execução de obras públicas e OS. `ObrasObra`/`ObrasMedicao` não representam alvará, vistoria urbanística ou habite-se; criar entidades especializadas vinculáveis à obra pública quando necessário.
3. Reutilizar `RealEstate`, `Person`, `Company`, `Taxpayer`, `Employee`, `Usuario`, `Department`, `Process`, `Document` e os serviços existentes. A especialização urbanística precisa de dados e regras próprios, sem duplicar identidade, protocolo, arrecadação e GED.
4. O portal externo é uma dependência central: `/portal-protocolos` oferece consulta de avisos e informa que a abertura externa está em preparação. Não há evidência de autoatendimento urbanístico completo.
5. Há versionamento documental, assinatura interna e serviço A1 sobre hash com evidência criptográfica. Ainda é necessário integrar a publicação urbanística, carimbos e assinatura das pranchas/PDF; não assumir suporte PAdES a partir da assinatura de hash.
6. Há lançamento/guia/pagamento e fiscalização fazendária. Não há evidência suficiente de guia urbanística FEBRABAN homologada, motor do plano diretor, fiscalização edilícia/embargo ou arquivo federal de alvarás.

**Resultado:** nenhum dos 52 itens pode ser declarado integralmente atendido nesta auditoria. Existe infraestrutura reaproveitável, mas a cobertura funcional de ponta a ponta precisa ser desenvolvida e demonstrada. Isso não representa ausência de recursos nos outros módulos, nem um percentual de conclusão do produto.

## 2. Inventário do que existe

| Área / evidência | Recursos encontrados | Limite em relação à Construção Civil |
|---|---|---|
| `src/app/app-domain/obras/layout.tsx` | Navegação: Painel, Obras e Projetos, Fiscalização e Medições, Serviços Urbanos, Iluminação e Energia, Ordens de Serviço, Máquinas e Equipes, Documentos e Relatórios | Não há área de licenciamento, parcelamento, viabilidade ou portal profissional |
| `prisma/schema.prisma`: `ObrasObra` | Número único, nome, descrição/local textuais, tipo, valor estimado, situação, ativação, medições | Sem imóvel/processo/requerente, áreas urbanísticas, alvarás ou profissionais externos |
| `ObrasMedicao` e `/obras/fiscalizacao-medicoes` | Medição numerada por obra, data, valor e aprovação/rejeição | Medição financeira/operacional não equivale a vistoria para licenciamento ou auto de infração |
| `src/app/app-domain/obras/actions.ts` | Criar/editar/inativar obras, medições e serviços; configurar integrações; atribuir servidores/equipes/equipamentos; baixar materiais; vincular compras/GED | Não implementa o ciclo urbanístico nem regras de distribuição e leitura por setor do checklist |
| `ObrasServico` e `/obras/ordens-servico` | Departamento, bem alvo, dotação, empenho, equipes/servidores, materiais, compras e documentos; acesso ao imóvel por `targetAsset.realEstate` | Vínculo indireto de bem patrimonial não substitui relacionamento direto do licenciamento com imóvel particular/rural |
| `/obras/documentos` e `ObrasServicoDocumento` | Consulta/vínculo de documentos GED às OS | Sem classificação de pranchas, revisão, marcações, pareceres e documentos urbanísticos emitidos |
| `/obras/relatorios` | Agregações reais de obras, medições, serviços e materiais | Sem indicadores de licenciamento, prazos, readequações, alvarás, habite-se e fiscalização edilícia |
| `RealEstate` | Inscrição municipal, matrícula, endereço/lote/quadra, áreas do terreno/construída, uso, zona fiscal, contribuinte e avaliações | `fiscalZone` não deve ser tratado automaticamente como zoneamento do plano diretor; faltam índices urbanísticos/versionamento e vínculo ao processo civil |
| `src/lib/tributacao/property-cadastral-engine.ts` | Cálculo decimal de fração territorial e prévia de valor venal com memória | Não calcula a área de alvará nem a viabilidade urbanística |
| `Process`, tipos/assuntos/etapas, `src/lib/protocols/` | Numeração anual, abertura interna validada, setores, trâmites, prazos, notificações, fluxo genérico publicado/versionado | Abertura atual exige servidor operacional e valida abertura interna; precisa de fluxo externo próprio e eventos urbanísticos |
| `src/lib/protocols/access.ts` | Escopo por setor atual ou histórico de envio/recebimento | Definir se essa leitura histórica atende à restrição urbanística; adaptar política específica sem ampliar acesso automaticamente |
| `Document`, `DocumentVersion`, `DocumentSignature`, `DocumentIcpEvidence` | Versões finais com hash, assinaturas pendentes/concluídas, evidência A1 e validação pública | Falta integrar artefato urbanístico, liberação somente após assinatura, carimbo e preservação física do original antes de transformação |
| `src/lib/signatures/a1-signature-service.ts` | Cadastro/referência de certificado A1, validação de vigência/finalidade, assinatura de versão por hash | Depende de certificado/configuração; não comprova assinatura PDF embarcada nem anotação gráfica |
| `src/lib/tributacao/index.ts`, `s2-service.ts` | Lançamento decimal, parâmetros, guia, pagamento, cobrança/reconciliação e referência contábil | Integrar taxas urbanísticas, gratuidade de reanálises e impressão bancária homologada |
| `License` | Licença genérica tributária ligada ao contribuinte/cadastro econômico | Não modela o alvará de construção com imóvel, áreas, revisões, conclusão ou parcelamento |
| `FiscalServiceOrder`, `FiscalInspectionDocument`, `src/lib/tributacao/s7-service.ts` | OS fiscal com imóvel/contribuinte/processo, fiscal, eventos, documentos, mapa/autuação e comunicação | Fluxo fazendário precisa de especialização para infração edilícia, notificação preliminar, embargo e fotos |
| `src/app/portal-protocolos/page.tsx` | Avisos públicos autorizados, busca/paginação e validação | Não permite protocolar planta, corrigir projeto, mensagens, renovar alvará ou requerer habite-se |

### Ajustes transversais identificados

- Páginas de Obras consultam listas amplas com `getTenantContextForModule`; a restrição por departamento/analista exigida no item 47 deve chegar a consultas, ações, anexos, downloads e relatórios.
- As principais listas de obras, serviços e medições têm paginação visual de 20 registros no cliente, mas recebem conjuntos completos. Implementar paginação/filtros no servidor para o novo domínio; avaliar migração individual das telas existentes.
- Há contêineres `overflow-y-auto` nas listas de medições e serviços urbanos. Adotar tabelas ERP sem rolagem interna horizontal/vertical, com busca, filtros, totais e `ErpPagination` de 20 itens; a página pode rolar normalmente.
- As relações de departamento/dotação/empenho e materiais estão principalmente nas OS, não no licenciamento. Receita de taxa urbanística deve seguir Arrecadação; despesa de obra pública segue o vínculo operacional existente.

## 3. Matriz dos 52 requisitos

**Situações:** **B** = base genérica/operacional reaproveitável, sem atendimento urbanístico comprovado; **N** = recurso específico não localizado. Nenhuma linha foi classificada como atendida. A descrição resume o PDF e preserva seus pontos de aceite.

| Item | Página | Requisito do checklist | Situação / evidência atual | Desenvolvimento e integração necessários | Fase |
|---|---|---|---|---|---|
| 1 | 126 | Gerenciar/fiscalizar obras urbanas e rurais; emitir alvará de demolição, ampliação/reforma, licença de construção e habite-se | B — obras/medições operacionais e GED | Processo urbanístico, localização urbana/rural, licenças, fiscalização e documentos por modalidade | F1–F6 |
| 2 | 126 | Parcelamento do solo: viabilidade, alvará, vistoria, conclusão e categorias como loteamento/desmembramento | N | Empreendimento de parcelamento, categorias, áreas/lotes e etapas integradas | F1–F6 |
| 3 | 126 | Regra de área total com áreas existente, ampliada, irregular, reforma e a demolir | N | Motor de área configurável/versionado, sem dupla contagem, memória e validações | F1/F3 |
| 4 | 126 | Quantidade de readequações de projetos/pranchas sem nova taxa de análise | N | Contador de revisões por processo/ciclo, franquia parametrizada e taxa idempotente | F1/F4 |
| 5 | 126 | Configurar verificação de débitos imobiliários na conclusão de obras/parcelamentos | B — imóvel e lançamentos tributários | Política por modalidade; consultar débitos do imóvel e registrar resultado no processo | F1/F6 |
| 6 | 126 | Distribuir viabilidade/alvará a usuário, gestor, setor ou analista com menor demanda | B — distribuição inicial por setor em Protocolos | Estratégias configuráveis, elegibilidade, desempate, concorrência, redistribuição e trilha | F1/F2 |
| 7 | 126 | Integrar cadastro imobiliário; processo de fiscalização de obras/posturas e fiscais | B — `RealEstate` e OS fiscal tributária | Vínculo direto urbanístico; processo/fiscalização edilícia e cadastro de fiscais | F1/F7 |
| 8 | 126 | Construtoras com validade e engenheiros/arquitetos vinculados | B — `Company`/`Person` | Perfis especializados, registros profissionais, vigência e vínculos históricos | F1/F2 |
| 9 | 126 | Corretores imobiliários habilitados a usar viabilidade | B — identidade central | Perfil de corretor, registro/vigência e acesso ao serviço adequado | F1/F2 |
| 10 | 126 | Usuários classificados como analistas, fiscais e gestores | B — usuários, servidores e permissões | Papéis urbanísticos por setor, vigência e autorização por operação | F1 |
| 11 | 127 | Tipos de alvará e finalidades residencial, comercial, industrial, serviços, templo e mista | N | Catálogos editáveis/versionados; associar modalidade/finalidade às regras e documentos | F1 |
| 12 | 127 | Checklists configuráveis de viabilidade, alvará, vistoria e conclusão | B — tipos/etapas de processos | Checklist urbanístico versionado com evidências, obrigatoriedade e bloqueio de deferimento | F1/F4/F6 |
| 13 | 127 | Profissional informar início da obra via portal e envio à Receita Federal | N | Evento de início com data/responsável, portal e vínculo ao lote de informação federal | F2/F6/F8 |
| 14 | 127 | Marcar PDFs com textos, notas, setas, formas e cores para devolução ao profissional | N | Editor/viewer de anotações por página/coordenada, versão derivada e visualização externa | F4 |
| 15 | 127 | Tipos construtivos mínimos previstos no checklist | N | Catálogo com os 14 tipos mínimos e manutenção sem alterar classificações históricas | F1 |
| 16 | 127 | Orientação personalizada para abertura de viabilidade/alvará | B — assuntos têm descrição | Instruções municipais editáveis/versionadas por serviço e exibidas no portal | F1/F2 |
| 17 | 127 | Alvarás/obras normais e de regularização | N | Classificação do processo, requisitos, taxas e documentos conforme modalidade | F1/F4 |
| 18 | 127 | Novas informações de controle sem customização contratada | N | Editor administrativo de campos tipados, validações, visibilidade e versão de formulário | F1/F2 |
| 19 | 127–128 | Conclusão parcial/total com data, área parcial e numeração própria por conclusão | B — status de obra concluída | Entidade de conclusão, saldo de área, sequência própria e vínculo a vistoria/alvará | F6 |
| 20 | 128 | Habite-se com layout totalmente configurável e dados do processo | B — GED genérico | Editor de template, campos/blocos, prévia, versão, emissão e assinatura | F5/F6 |
| 21 | 128 | Viabilidade online automática sem intervenção humana | N | Serviço externo com decisão determinística por regras publicadas e emissão automática | F3/F5 |
| 22 | 128 | Buscar imóvel, zoneamento, índices urbanísticos e dados territoriais para viabilidade | B — cadastro imobiliário básico | Dados urbanísticos, consulta por inscrição/localização e snapshot do imóvel | F1/F3 |
| 23 | 128 | Parâmetros do plano diretor para viabilidade automática ou não | N | Zoneamento e índices por vigência/território; elegibilidade de automação e memória | F1/F3 |
| 24 | 128 | Comparar zoneamento imobiliário com dados extraídos por IA de PDFs | N | Extração OCR/IA rastreável, unidades/evidência/confiança e comparação com regras | F9 |
| 25 | 128 | Solicitação online de análise com documentos obrigatórios/opcionais configuráveis | B — GED e processo interno | Portal autenticado, formulário/checklist publicado e upload validado/versionado | F1/F2/F4 |
| 26 | 128 | Pareceres, devolução ao requerente e reanálise | B — eventos/retorno genérico em Protocolos | Parecer técnico urbanístico, exigências por prancha, resposta e ciclo de reanálise | F4 |
| 27 | 128 | Pró-análise com visualização e parecer unificado para readequação | B — documentos/fluxo genérico | Etapa própria de pró-análise; consolidar pareceres e apresentar anexos ao profissional | F4 |
| 28 | 129 | Alvará no mesmo processo após deferimento, assinatura e disponibilização no portal | B — processos, GED e assinatura | Emissão idempotente, vínculo à decisão e portal restrito ao artefato assinado | F4/F5 |
| 29 | 129 | Retornar automaticamente ao analista inicial após readequação | N | Manter analista de origem e regras de retorno com exceção justificada para indisponibilidade | F4 |
| 30 | 129 | Assinar digitalmente projetos aprovados e inserir carimbos digitais | B — serviço A1 sobre hash | Carimbo institucional versionado em **cópia derivada demonstrativa** do PDF vinculado ao deferimento PROJECT vigente; original e backup preservados. A cópia recebe assinatura interna GED própria antes da publicação/download. Sem homologação oficial ou PAdES; detalhes em `CONSTRUCAO_CIVIL_DOCUMENTOS_EVIDENCIAS.md` | F5 |
| 31 | 129 | Disponibilizar viabilidade/alvará/habite-se somente assinados | B — versões/assinaturas GED | Gate no servidor para portal/download/API, incluindo emissão automática | F5 |
| 32 | 129 | Solicitação automática de assinatura após emissão do habite-se | B — pedidos de assinatura GED | Evento/outbox e pedido aos signatários configurados, sem duplicação | F5/F6 |
| 33 | 129 | Backup automático de originais antes da assinatura | B — snapshots/versionamento documental | Cópia física imutável, hash e política configurável de armazenamento/restauração | F5 |
| 34 | 129 | Notificar setores consultados para pareceres (procuradoria, meio ambiente, turismo etc.) | B — notificações por setor em Protocolos | Tramitação/consulta urbanística, responsabilidade, prazo, parecer e retorno | F2/F4 |
| 35 | 129 | Termos de aceite/responsabilidade dos documentos enviados pelo profissional | N | Termo versionado, aceite vinculado ao usuário/processo e hashes das versões enviadas | F1/F2 |
| 36 | 129 | Profissional solicitar correção de alvará emitido | N | Pedido específico, comparação, decisão e versão substitutiva mantendo original | F2/F5 |
| 37 | 129 | Profissional solicitar renovação de alvará | B — validade de licença genérica | Renovação vinculada ao alvará, vigência/taxas e análise, preservando emissões anteriores | F2/F5 |
| 38 | 130 | Adicionar profissionais à solicitação já protocolada | N | Participação por papel, delegação/aceite, inclusão/substituição e histórico | F2/F4 |
| 39 | 130 | Documentos complementares após protocolo | B — documentos de processo | Upload externo autorizado por estado/papel, versionamento e evento | F2/F4 |
| 40 | 130 | Solicitar vistoria e conclusão/habite-se online no mesmo processo com documentos configuráveis | N | Pedido vinculado ao alvará, checklist próprio, vistoria e conclusão integrada | F2/F6 |
| 41 | 130 | Prazo para ajustar exigências de viabilidade, alvará e vistoria de obras/parcelamentos | B — SLA de etapas | Prazo de exigência externa, calendário/regra, notificações e tratamento de vencimento | F1/F4/F6 |
| 42 | 130 | Selecionar vistorias obrigatórias no deferimento do alvará | N | Plano de vistorias por processo, selecionado na decisão e verificável na conclusão | F4/F6 |
| 43 | 130 | Tipos específicos de vistoria para obra e parcelamento | N | Catálogo, checklist e resultado de vistoria por categoria/modalidade | F1/F6 |
| 44 | 130 | Guias com layout personalizado, barras FEBRABAN e acréscimos automáticos por atraso | B — lançamento/guia/pagamento tributários | Taxas do serviço, cálculo vigente, layout, código/DVs e homologação do convênio | F3/F5 |
| 45 | 130 | Arquivos de informações de alvarás para INSS | N | Exportador federal versionado, validação, lote, retificação e recibo/evidência | F8 |
| 46 | 130 | Mensagens profissional–servidor vinculadas à viabilidade/alvará/parcelamento | B — eventos internos de processo | Conversa externa persistida com participantes autorizados, anexos e notificações | F2/F4 |
| 47 | 130 | Limitar visualização das solicitações aos usuários dos setores responsáveis | B — política setorial de Protocolos | Política urbanística única aplicada a todas as superfícies e participantes externos | F1/F2 |
| 48 | 130 | Trâmites automáticos de alvarás de obras/parcelamento | B — workflow genérico versionado | Gatilhos/regras urbanísticos, jobs idempotentes e bloqueios de documentos/taxas/assinaturas | F4/F5/F6 |
| 49 | 131 | Atualizar cadastro imobiliário ao concluir obra por processo vinculado | B — imóvel/processo e precedente de atualização vinculada em ITBI | Processo de alteração cadastral com antes/depois, decisão, versão e idempotência | F6 |
| 50 | 131 | Processo fiscal, notificação fiscal e auto de infração de obra sem alvará | B — OS/autuação fazendária | Especializar infrações edilícias, fundamento, vínculo imóvel/obra e documentos fiscais | F7 |
| 51 | 131 | Embargo ou notificação preliminar de obra | N | Ato fiscal específico com motivo, autoridade, ciência, vigência e levantamento | F7 |
| 52 | 131 | Fotos/anexos no processo de fiscalização | B — GED/documentos de processo/OS fiscal | Upload no processo edilício, identificação da vistoria/fiscal e acesso protegido | F7 |

## 4. Integrações e responsabilidades

| Módulo/base | Responsabilidade de origem | Integração a desenvolver | Regra de implementação |
|---|---|---|---|
| Cadastros centrais | Pessoa, empresa, endereço, servidores/setores | Requerente, proprietário, construtora, corretor e responsáveis técnicos | Vincular IDs existentes; perfis profissionais especializados com registro/conselho/vigência |
| Cadastro Imobiliário / Tributação | Imóvel, inscrição, áreas, uso, contribuinte e débitos | Consulta na abertura/viabilidade/conclusão; proposta de atualização após habite-se | Snapshot dos dados usados; separar zona fiscal de zoneamento urbanístico; alterações somente por processo vinculado |
| Protocolos e Processos | Numeração, tramitação, setores, eventos, prazos | Processo matriz urbanístico; análises/consultas/correções/renovações vinculadas | Usar serviços centrais; estender abertura para ator externo sem fingir vínculo de servidor |
| GED / Documentos | Arquivo, classe, versão, hash e assinatura | Pranchas, documentos complementares, pareceres e artefatos emitidos | Evitar URL pública de anexos privados; original imutável e cópias derivadas rastreáveis |
| Assinaturas / Certificados | Manifestação interna, A1, validação e trilha | Signatários por documento, carimbo, pedido automático e publicação assinada | Escolher formato exigido e demonstrar a assinatura no artefato; carimbar antes de assinar |
| Tributação / Arrecadação | Parâmetros, lançamento, guia, baixa, acréscimos, conciliação | Taxas de análise/emissão/renovação e cobrança após franquia de readequação | Um fato gerador por chave idempotente; Obras não confirma pagamento por botão de status |
| Financeiro / Contabilidade | Receita arrecadada e classificação | Efeitos financeiros das taxas via integração tributária existente | Não confundir empenho de OS com receita de licença; preservar separação receita/despesa |
| Fiscalização Fazendária | OS fiscal, eventos, documentos e autuação | Fiscalização de obras/posturas, embargo e notificações | Compartilhar infraestrutura quando o domínio permitir; não aplicar automaticamente regras de infração tributária à edilícia |
| Meio Ambiente e demais setores | Parecer/licença de sua competência | Consulta formal com prazos e devolução ao processo urbanístico | Tramitar por `Process` e guardar referência à decisão; não presumir deferimento ambiental pelo deferimento civil |
| Portal de Autoatendimento | Identidade externa e serviços autenticados | Área do profissional/cidadão, abertura, correções, mensagens e documentos | Reusar identidade existente quando aplicável; escopo por requerente/representação vigente/processo |
| Administração / RH | Usuário, servidor, setor e permissão | Papéis analista/fiscal/gestor, carga de trabalho e substituição | Permissão de Obras não concede edição irrestrita em Tributação, GED ou Protocolos |
| Compras / Patrimônio / Frotas | Contratos, bens, equipes, máquinas e insumos | Vínculo opcional com execução pública, OS de apoio e vistoria | Reusar integrações atuais; não tornar compras/estoque requisito de licenciamento de obra privada |
| Integrações federais | Destino/leiaute das informações de início/alvará/conclusão | Exportação/transmissão exigida pelos itens 13 e 45 | Confirmar sistema de destino e versão do leiaute; retenção INSS de despesa não atende ao arquivo de alvarás |
| Auditoria / Notificações | Evidências e comunicação interna | Registro dos atos, distribuição, exigências, consultas e assinatura | Eventos com ator, estado anterior/novo, versão e correlação; entrega de mensagem rastreável |

### Contratos essenciais entre módulos

- Abertura urbanística gera **um processo matriz** e a entidade especializada na mesma unidade transacional, ou por mecanismo de compensação explicitamente definido. Pedidos de vistoria/conclusão pertencem ao mesmo histórico; procedimentos auxiliares podem ter processos vinculados.
- Cálculo tributário recebe modalidade, área/base, regra e versão; devolve lançamento/guia e memória. Repetir solicitação não cria nova cobrança.
- Conclusão cria proposta de alteração do imóvel: áreas/uso/tipo construtivo antes e depois, documento de suporte e processo. Aplicação valida versão do cadastro para evitar sobrescrever atualização concorrente.
- Emissão recebe snapshot do processo, template e signatários; devolve versão GED. Publicação depende da assinatura obrigatória concluída sobre a versão correta.
- Consulta intersetorial mantém motivo/prazo, setor destinatário, parecer e evento de retorno. Acesso de um setor consultado deve refletir a participação formal.

## 5. Arquitetura proposta

### 5.1 Navegação em Obras e Serviços Públicos

Acrescentar grupo **Construção Civil** ao `ModuleShell`, mantendo as telas operacionais existentes:

- Painel de licenciamento e distribuição.
- Solicitações e processos urbanísticos.
- Viabilidade e plano diretor.
- Análise de projetos/pranchas.
- Alvarás e renovações/correções.
- Parcelamento do solo.
- Vistorias e conclusões / habite-se.
- Fiscalização de obras e posturas.
- Profissionais e construtoras.
- Configurações urbanísticas.
- Relatórios e exportações federais.

Rotas sugeridas sob `/obras/construcao-civil/...`; portal autenticado em área de serviços externa compatível com a arquitetura atual, sem misturar painel ERP com acesso público.

### 5.2 Modelo de domínio a detalhar antes das migrations

| Entidade proposta | Conteúdo principal / vínculos |
|---|---|
| Processo urbanístico (`ConstructionCase`) | Processo matriz, modalidade obra/parcelamento, imóvel(s), urbano/rural, categoria, finalidade, normal/regularização, requerente, setor/analista e snapshots de regras |
| Perfil profissional / construtora | `Person`/`Company`, conselho/registro, corretor ou engenheiro/arquiteto, vigência e vínculo à empresa |
| Participação no processo | Profissional/empresa/representante, papel, início/fim, permissões, evidência e histórico de substituição |
| Configuração urbanística versionada | Modalidades/finalidades/tipos construtivos, instruções, prazos, franquias, estratégia de distribuição e verificação de débitos |
| Zoneamento / regra urbanística | Identificação territorial, vigência, uso permitido, índices/recuos/áreas, critérios e referência ao plano diretor |
| Definição de formulário/checklist | Campos tipados, documentos obrigatórios/opcionais, critérios de deferimento, público/etapa e versão publicada |
| Projeto/revisão/prancha | Versão de envio, documentos GED, tipo, áreas declaradas, anotações, pareceres e contador de readequação |
| Análise/exigência | Resultado por item, parecer consolidado, responsável, prazo, retorno ao analista e resposta do profissional |
| Alvará / documento de viabilidade | Numeração por espécie/exercício, vigência, template, versão GED, assinatura, substituição/correção/renovação e publicação |
| Vistoria / conclusão | Tipo/checklist, fiscal, agendamento, fotos, resultado, data e área concluída parcial/total, número próprio e habite-se |
| Fiscalização edilícia / ato fiscal | Processo/OS compartilhado ou especializado, imóvel, fato, irregularidade, notificações, auto, embargo e levantamento |
| Conversa / aceite | Participantes do processo, mensagens/anexos, termos versionados e evidências de aceitação |
| Lote de integração / extração IA | Destino, versão, arquivo/hash, validações/retificações/recibo; extração por documento com evidência, confiança e comparação |

**Decisões de modelagem:**

- Criar migrations aditivas; manter dados legados de obras/medições. Não transformar toda obra pública existente em alvará automaticamente.
- Usar relações reais e restrições para imóvel/processo/profissionais/documentos quando compatíveis com os modelos existentes. Identificadores escalares isolados não devem substituir integridade referencial sem justificativa.
- Usar `Decimal` para valores e áreas com precisão definida; registrar unidade e arredondamento. Não estender o uso legado de `Float` para o novo motor.
- Tratar parcelamento como empreendimento que pode afetar vários imóveis/lotes, mantendo origem/destino e fases; não impor cardinalidade de um único imóvel a todo o domínio.
- Preservar revisões de regra/checklist/template e documentos utilizados no ato. Campo configurável requer tipo, validação e versão; texto/JSON livre não resolve sozinho o item 18.
- Sequências atômicas e independentes por espécie/exercício para alvarás/conclusões/atos; não reutilizar o campo manual `ObrasObra.numero` como numeração legal.

### 5.3 Estados e automações

Fluxo-base proposto:

`Rascunho → Protocolado → Distribuído → Em análise → Em exigência → Reenviado → Deferido/Indeferido → Aguardando taxa, quando aplicável → Emissão → Aguardando assinatura → Disponível → Obra iniciada → Vistorias → Conclusão parcial/total → Habite-se assinado → Atualização cadastral / informação federal`.

Viabilidade automática deve executar regras publicadas e, quando elegível, emitir e assinar/disponibilizar o resultado sem decisão humana. Caso sem regra suficiente vai à análise técnica, com motivo explícito. Não apresentar o fluxo manual como demonstração do item 21.

Configurar a ordem e os bloqueios de taxas, análise e documentos conforme norma municipal. Automações precisam de chave idempotente, fila/outbox, tentativas e trilha. Retorno de correção preserva o analista inicial; indisponibilidade permite substituição formal registrada.

## 6. Fases de implementação e critérios de aceite

### F0 — Preparação e validação do domínio

- Confirmar requisitos com Urbanismo/Engenharia, Tributação, Protocolos e fiscais; preparar exemplos municipais.
- Revisar consumidores de serviços centrais, permissões, portal, storage, assinatura, motor tributário e exportações antes de decidir contratos.
- Definir modelo relacional, processo matriz, estados e tipos de integração; preparar migrations aditivas e dados demonstrativos isolados.
- **Aceite:** desenho aprovado, responsável por cada dado, mapa dos 52 itens e fixtures reproduzíveis; nenhum checklist marcado atendido só por criação de tabela.

### F1 — Cadastros, parâmetros, plano diretor e acesso

**Itens:** 3–12, 15–18, 22–23, 35, 41, 43, 47 (fundação).

- Catálogos completos; papéis por setor; profissionais/construtoras/corretores com vigência; vinculação central.
- Formulários/checklists/instruções/termos versionados; campos adicionais configuráveis sem código.
- Regras de área, zoneamento/índices por vigência, prazos, franquias de revisão e política de débitos.
- Cadastrar os 14 tipos mínimos: concreto superior, concreto médio, alvenaria superior, alvenaria média, alvenaria simples, madeira dupla, madeira simples, madeira bruta, mista simples, mista média, precária, área aberta, Box e garagem.
- **Aceite:** administrador altera configuração na UI; nova solicitação usa versão publicada; processo anterior preserva sua versão; setor sem competência não lê/altera nem baixa anexos.

### F2 — Portal profissional, abertura e comunicação

**Itens:** 6, 8–9, 13, 16, 25, 34–40, 46–47 (interfaces e participação).

- Identidade/representação externa; abertura de obra e parcelamento com imóvel, profissionais, aceite, orientações e documentos obrigatórios.
- Complementação documental/profissional, mensagens persistidas, notificações e acompanhamento restrito.
- Distribuição por usuário/gestor/setor/menor demanda; consultas aos demais setores.
- Solicitações específicas de início, correção, renovação, vistoria e conclusão; o processamento final depende das fases seguintes.
- **Aceite:** dois profissionais acessam apenas seus processos; documentos faltantes impedem protocolo; envio repetido não duplica; distribuição simultânea respeita carga e elegibilidade.

### F3 — Viabilidade e taxas

**Itens:** 3–5, 21–23, 44 (cálculo).

- Consulta do imóvel, snapshot territorial, regras de viabilidade e área; memória com parâmetros/versões.
- Viabilidade automática para casos elegíveis e encaminhamento fundamentado dos demais.
- Taxas integradas ao motor tributário, gratuidade/franquia, acréscimos e eventos de pagamento; emissão assinada conectada à F5.
- **Aceite:** caso elegível produz resultado sem analista; caso não elegível é encaminhado; dados iguais com mesma regra têm resultado reproduzível; não há dupla cobrança nem soma duplicada de áreas.

### F4 — Análise, revisões e marcação PDF

**Itens:** 4, 12, 14, 17, 25–29, 34, 38–39, 41–42, 46, 48.

- Pró-análise, checklist com evidências, parecer por documento e parecer unificado.
- Anotação de PDFs com texto/nota/seta/formas/cores, mantendo originais e ligando cada marcação à revisão.
- Exigências e prazo; resposta/reen envio; retorno automático ao analista de origem; controle de readequações e taxa.
- Seleção das vistorias obrigatórias e deferimento/indeferimento motivado; fluxos equivalentes para parcelamentos.
- **Aceite:** profissional visualiza marcações corretas na página correspondente e reenvia; parecer e revisão antiga permanecem acessíveis a autorizados; cobrança somente após exceder a franquia configurada.

### F5 — Documentos, assinatura, cobrança e publicação

**Itens:** 1, 20–21, 28, 30–33, 36–37, 44, 48.

- Templates editáveis com layout, campos/blocos, cabeçalho, numeração, assinatura e validação.
- Emissão de viabilidade/alvará e integração futura do habite-se; correção/renovação com relação entre versões.
- Carimbo em projeto aprovado, backup físico pré-assinatura, solicitação automática e gate de publicação.
- Assinatura no formato exigido, com certificado/provedor configurado e validação do arquivo final; finalizar guia FEBRABAN conforme convênio.
- **Aceite:** alvará nasce no mesmo processo deferido; arquivo não assinado não aparece no portal nem em URL direta; backup é recuperável; documento assinado verifica sem alterar seus bytes; guia confere valor e DVs.

### F6 — Início, vistorias, conclusões e cadastro imobiliário

**Itens:** 1–2, 5, 13, 19–20, 32, 40–43, 48–49.

- Início informado pelo profissional; pedido online de vistoria/conclusão; plano obrigatório de inspeções e registros de campo.
- Conclusões parciais/totais numeradas, área e saldo; habite-se configurável, assinatura solicitada automaticamente.
- Verificação de débito do imóvel conforme parâmetro; processo vinculado de atualização imobiliária.
- **Aceite:** conclusão parcial não encerra toda a área; soma não excede área autorizada; conclusão total exige vistorias; aplicação cadastral registra antes/depois e não duplica em retry.

### F7 — Fiscalização edilícia e posturas

**Itens:** 1, 7, 50–52.

- Criar processo fiscal de obra sem licença, designar fiscal e registrar diligências/fotos.
- Notificação preliminar/fiscal, auto de infração e embargo; ciência, prazos e levantamento documentado.
- Reusar infraestrutura fiscal/GED/processo sem criar falsa equivalência com medição operacional ou autuação de ISS.
- **Aceite:** fiscalização pode começar sem alvará existente; foto fica vinculada à diligência; ato possui fundamento, numeração, responsável e trilha; embargo e levantamento preservados.

### F8 — Informação federal de início e alvarás

**Itens:** 13 e 45.

- Confirmar com o município destino, obrigatoriedade, campos, versão, leiaute e operação de envio aceitos na POC.
- Implementar lote/exportação, validação, prévia de inconsistências, correção/retificação, hash e recibo quando houver transmissão.
- **Aceite:** arquivo aceito por validador/destino correspondente e rastreável até alvará/evento de início. CSV demonstrativo não comprova compatibilidade oficial.

### F9 — Extração de pranchas por IA e comparação

**Item:** 24.

- Pipeline PDF/OCR/IA para áreas/uso/recuos/índices relevantes; registrar arquivo/versão, página, unidade, evidência, confiança e versão do extrator.
- Comparar o resultado extraído com o zoneamento do imóvel e parâmetros municipais; apresentar divergências e origem dos dados.
- **Aceite:** demonstrar extração real de prancha e comparação, incluindo planta digital, escaneada e dado não identificável; não substituir a extração por preenchimento manual e chamá-la de IA.

### F10 — Homologação integrada dos 52 itens

- Cenários completos, permissões, concorrência, automações, relatórios, recuperação de arquivo e falhas de integrações.
- Validar migrations em banco de teste e upgrade de dados existentes; ESLint, TypeScript/build e testes significativos.
- Validar visualmente tabelas, portal, PDFs, marcações/carimbos e impressão; montar evidência por item com dados/processo/versão utilizados.
- **Aceite:** matriz com 52 evidências verificadas, pendências explícitas e nenhuma simulação apresentada como integração homologada.

**Sequência:** F0 → F1 → F2/F3 → F4 → F5 → F6/F7 → F10. Preparação de F8 e prova técnica de F9 devem começar em F0/F1 para antecipar dependências de terceiros; entrega integrada depende das bases documentais e urbanísticas. A ordem não retira nenhum item do escopo.

## 7. Dependências municipais e técnicas

| Insumo/decisão | Por que é necessário | Trabalho possível enquanto aguarda |
|---|---|---|
| Plano diretor, zoneamento, índices, regras de áreas e vigências | Viabilidade e comparação reproduzíveis; regra de área do alvará | Motor parametrizável e dataset demonstrativo identificado, sem inventar regra legal municipal |
| Código de obras/posturas, competências fiscais e modelos de atos | Tipos de licença/vistoria, embargo, infrações e conclusão | Cadastros/workflow/geração de documentos demonstrativos versionados |
| Tabela de taxas, franquia de reanálise, renovação e política de débitos | Fatos geradores, cálculo e bloqueios corretos | Integração tributária com parâmetros de teste |
| Convênio bancário e amostras de guias/retornos | FEBRABAN, DVs e conciliação | Renderizador e validação matemática; homologação permanece específica do convênio |
| Templates, campos adicionais, termos e signatários | Layout configurável, aceite e publicação assinada | Editor/templates demonstrativos, classes/documentos e pipeline de assinatura |
| Certificado/provedor e formato de assinatura exigido | Assinatura demonstrável do documento/prancha | Testar com cadeia/certificados de teste identificados; não declarar prova de produção |
| Identidade/representação do portal | Permissões de cidadão, proprietário, construtora e profissional | Contratos de ator externo, escopos e portal em ambiente de teste |
| Leiaute e exemplo federal para alvarás/início | Itens 13/45 e validação do arquivo | Lote/memória/mapeamento interno; exportação oficial após conhecer contrato |
| Pranchas e parâmetros correspondentes | Medir extração por IA e comparação | Prova técnica com amostras autorizadas e rastreáveis |

## 8. Cenários de demonstração da POC

| Cenário | Demonstração mínima | Itens principais |
|---|---|---|
| A — Configuração sem customização | Criar finalidade, tipo de vistoria, campo adicional, checklist e template pela UI; publicar versão | 10–12, 15–18, 20, 23, 43 |
| B — Viabilidade automática | Corretor consulta imóvel, recebe dados urbanísticos, aceita termo e obtém documento automaticamente assinado | 9, 16, 21–23, 31, 35 |
| C — Projeto, exigência e reanálise | Profissional protocola, analista marca PDF, consolida parecer, devolve; profissional complementa e retorna ao analista inicial | 4, 6, 8, 14, 25–27, 29, 38–39, 41, 46 |
| D — Alvará e atos posteriores | Deferir no mesmo processo, escolher vistorias, cobrar taxa, carimbar/assinar, liberar portal, corrigir e renovar | 1, 11, 17, 28, 30–33, 36–37, 42, 44, 48 |
| E — Parcelamento do solo | Loteamento/desmembramento percorre viabilidade, alvará, vistoria e conclusão com categoria e imóveis afetados | 2, 12, 21–23, 40–43, 48 |
| F — Conclusão e atualização | Início via portal; vistoria; conclusão parcial numerada e total; débito parametrizado; habite-se; atualização imobiliária vinculada | 3, 5, 13, 19–20, 32, 40, 49 |
| G — Fiscalização sem alvará | Abrir ocorrência com imóvel, fiscal, foto, notificação, auto e embargo; registrar levantamento | 7, 50–52 |
| H — Setores e isolamento | Consulta ao Meio Ambiente/Procuradoria notifica setor correto; usuário externo/setor não autorizado não acessa outro processo | 10, 34, 47 |
| I — Arquivo federal | Gerar lote com alvará/início, corrigir inconsistência, validar e mostrar rastreabilidade/recibo conforme contrato | 13, 45 |
| J — IA | Extrair dados de prancha e mostrar comparativo com zoneamento, evidência e resultado não identificável | 24 |

## 9. Verificação e critério final de conclusão

- **Motor:** áreas não negativas, componentes sem sobreposição indevida, arredondamento, regra por vigência, área parcial acumulada, taxas/franquias e débitos corretamente associados ao imóvel.
- **Concorrência:** numeração, distribuição por menor demanda, emissão de taxa/documento, conclusão e atualização cadastral não duplicam; transações mantêm integridade em falha.
- **Acesso:** analista/fiscal/gestor/setor consultado/externo; negativa em UI, ação, API, arquivo e relatório. Todo acesso usa tenant correto.
- **Documentos:** anotação em coordenadas corretas, original recuperável, assinatura verifica sobre versão final, correção não sobrescreve documento assinado e publicação obedece gate.
- **Portal:** upload obrigatório/opcional, mensagens, exigências, participantes e protocolos reais; a consulta de avisos não serve de evidência do autoatendimento.
- **Integrações:** guia e baixa tributária, efeitos contábeis, atualização imobiliária e exportação federal com memória/contrato e evidência correspondente.
- **UI:** tabelas ERP de 20 itens, filtros/totais, sem rolagem interna de tabelas, operação responsiva e erros mantendo formulário preenchido.
- **Repositório:** analisar consumidores antes de mudar assinaturas; preservar retorno de erro das actions chamadas no cliente; migrations aditivas; `npm run build` aprovado antes de commit. Não executar replace em massa.
- Marcar item **atendido** somente quando todos os seus pontos tiverem persistência, autorização, comportamento e evidência de ponta a ponta. Estados intermediários: não iniciado, implementado parcial, aguardando integração/insumo, em validação e atendido.

## 10. Sequência final de execução e conclusão do planejamento

1. **Completar F1/F2:** validar a base no banco de homologação; criar identidade/representação externas e participação profissional; termos com aceite, documentos obrigatórios na abertura e mensagens. Provar isolamento entre dois profissionais e negativa de acesso a arquivos.
2. **Completar F3/F4:** configurar fatos geradores/taxas no motor existente, cobrança idempotente após franquia, integração de pagamento e editor de anotação PDF. Testar revisão com reenvio, retorno/substituição e documentação preservada.
3. **Executar F5:** definir formato de assinatura e signatários, templates municipais demonstrativos/versionados e numeração; emitir alvará no mesmo processo, com backup/carimbo e liberação condicionada à assinatura verificável.
4. **Executar F6/F7:** início, vistorias, conclusões com saldo de área, verificação imobiliária de débitos, habite-se e processo vinculado de atualização; fiscalização de obra sem alvará com notificações, autos e embargo.
5. **Executar F8/F9:** obter destino/leiaute federal e amostras de prancha; desenvolver exportação validável e extração real com evidências. As dependências constam na seção 7 e não são substituídas por CSV ou preenchimento manual.
6. **Concluir F10:** as quatro migrations civis atuais estão aplicadas no destino configurado; validar o percurso completo no navegador e na impressão, executar cenários A–J e anexar evidências individualizadas aos 52 itens. Aplicar as futuras migrations das demais fases após validação. Só então promover itens a atendidos.

O planejamento dos 52 itens está consolidado em arquitetura, fases, integrações, dependências, cenários e critérios de aceite. A implementação integral do módulo não está concluída; as pendências acima fazem parte do escopo de execução.

Este documento é o plano de execução para o EXE-18. A situação do módulo no checklist geral deve permanecer pendente até a homologação dos 52 requisitos.

## 10. Execução integrada em ambiente demonstrativo — 10/10/2026

Esta seção sucede o registro de planejamento da seção 9. O usuário autorizou parâmetros demonstrativos identificados e agentes em paralelo. As frentes foram implementadas e estão sendo integradas; não representam homologação legal nem comprovação visual dos 52 itens.

| Frente | Entrega persistida | Evidência técnica / limite de aceite |
|---|---|---|
| F1 — profissionais/construtoras | Habilitação da construtora com início/validade, histórico antes/depois imutável e vínculos profissionais limitados à vigência | Teste PostgreSQL de referências, vigência, unicidade e ledger; identificação Firebase habilitada pelo master |
| F2 — acesso/abertura externa | Autenticação própria, autorização explícita de requerente/imóveis/assuntos, documentos GED antes do protocolo, aceite versionado e abertura central sem funcionário fictício | Testes com Prisma/PostgreSQL de protocolo/etapas/sequência/escopo; motor de workflow genérico externo bloqueado por exigir ator interno |
| F2 — pedidos/comunicação | Mensagens imutáveis, complementos GED, readequação idempotente, participação e pedidos de início/vistoria/conclusão/correção/renovação | Reenvio retorna ao analista e atos atendidos exigem registro municipal real; download mantém escopo |
| F3 — taxas | Regras versionadas integradas à Tributação, contribuinte/imóvel/processo reais, franquia, guias, pagamento/isenção e ciclos próprios de correção/renovação | Não libera alteração com taxa inicial; FEBRABAN demonstrativo identificado, convênio bancário não homologado |
| F4 — parecer/deferimento | Parecer e seleção de vistorias obrigatórias criados na mesma transação, retry sem duplicação e rollback conjunto | Testes PostgreSQL de falha do plano revertendo deferimento; análise/pró-análise e readequações preservadas |
| F4/F5 — PDF/documentos | Anotações por página/coordenadas em cópia derivada, templates publicados, numeração, emissão GED, backup e gate de assinatura/publicação | PDF real testado; assinatura interna demonstrativa não comprova PAdES/assinatura oficial exigida |
| F6 — ciclo/cadastro | Início, plano e resultados de vistorias, conclusões parciais/totais com saldo Decimal, débitos e processo cadastral com antes/depois | Nova vistoria pendente/reprovada bloqueia conclusão; campo legado `RealEstate.builtArea` permanece Float |
| F7 — fiscalização | Processo próprio urbano/rural, inclusive sem alvará, fiscal designado, diligências/fotos, notificações, auto, embargo, ciência e levantamento | Testes Prisma/PostgreSQL de autorização, replay, vínculos GED e atos imutáveis; espelhos demonstrativos |
| F8 — informação federal | Lotes versionados, validação, hash/download dos bytes exatos, retificação e recibo com evidência privada | Leiaute `MUNICIPAL_DEMO_JSON_V1`; transmissão/aceite federal oficial pendentes |
| F9 — pranchas | Extração real da camada textual PDF, evidência por página/unidade, origem privada/hash e comparação com snapshot de zoneamento | `DEMO_RULES` é parser determinístico, não IA; adaptadores IA/OCR dependem de configuração e bloqueiam execução sem serviço |
| Consultas setoriais | Questão/prazo/setor dirigido, notificação, resposta única imutável e retorno notificado | Setor consultado acessa a consulta dirigida, sem concessão de leitura geral dos processos civis |

Roteiro reproduzível, preparação e natureza dos dados: `docs/CONSTRUCAO_CIVIL_AMBIENTE_DEMONSTRATIVO.md`. Configuração de IA/OCR e leiaute demonstrativo: `docs/construction-integrations.md`.

**F10 em integração:** a bateria inicial executou 50 testes civis, com 49 aprovados e uma falha causada pelo client Prisma anterior ao campo de ciclo documental; após regeneração, os três testes de regras/revisões passaram. O upgrade completo do baseline municipal em PostgreSQL embarcado passou, incluindo as migrations presentes naquele momento. A última geração/lint/compilação definitiva e deploy das migrations posteriores à participação ainda devem ser registrados abaixo após estabilização das frentes.

**Pendências de homologação:** navegador permanece desconectado; faltam percursos autenticados com contas operacionais/externas, impressão e evidências por requisito. IA externa/OCR e integrações federal/bancária/oficial não foram executadas. A matriz-base da seção 3 documenta o inventário original e não deve ser lida como homologação posterior.

### Validação conjunta e fechamento técnico das frentes

- **67 testes civis aprovados** na execução conjunta `node --conditions=react-server --import tsx --test tests/construction*.test.ts`, incluindo abertura interna/externa completa, documentos/assinatura/publicação/correção/renovação/habite-se/carimbo, viabilidade automática, fiscalização, revisão, prazos e upgrade municipal.
- ESLint de todos os arquivos civis alterados, integrações centrais GED/download, portal, APIs, scripts e testes: **aprovado**.
- **17 migrations civis aplicadas**, até `20261010340000_construction_project_stamp`, com todos os checksums conferidos e iguais aos arquivos locais. O upgrade PostgreSQL compara as tabelas e colunas civis com o client gerado.
- O seed demonstrativo foi aplicado e repetido sem duplicação. Cinco definições, sete regras tributárias e três templates foram provisionados; nenhuma permissão de usuário real ou identidade Firebase foi fabricada.
- Viabilidade demonstrativa gera decisão/PDF/GED automaticamente e solicita assinatura aos gestores verdadeiros. Sem assinatura institucional automática configurada, o download aguarda assinatura humana válida; **o item 21 não está integralmente homologado**.
- Prazos de reinspeção usam dias corridos e fim do dia UTC, com memória da configuração. Vencimento bloqueia servidor e portal; gestor regulariza com motivo e histórico imutável. Carimbo do projeto exige versão aprovada e publicação/assinatura próprias.
- Matriz de evidências individualizadas e limites dos 52 itens: `docs/CONSTRUCAO_CIVIL_EVIDENCIAS_POC.md`. Evidências documentais: `docs/CONSTRUCAO_CIVIL_DOCUMENTOS_EVIDENCIAS.md`.
- O usuário confirmou trabalho SST em outro computador e restringiu esta execução a Civil/Obras. Quatro migrations SST aplicadas, ausentes neste checkout, permanecem preservadas; a divergência global de histórico não foi reconciliada pela frente civil.
- Uma execução avulsa de TypeScript excedeu 20 minutos sem diagnósticos. O build de produção final está sendo executado e seu resultado será registrado antes do fechamento.
- Checagem HTTP local sem autenticação: entrada profissional retornou `200`, download de complementos `401` e pré-upload interno `403`. Não substitui a validação visual nem o fluxo autenticado.
- O primeiro build integrado compilou, mas encontrou um status `400` passado a `AccessError` (que aceita apenas estados de acesso). A rota de abertura externa passou a retornar a resposta HTTP `400` diretamente. A verificação avulsa global foi interrompida para priorizar o build com o `tsconfig.build.json` já utilizado pelo projeto, que verifica as fontes da aplicação; a repetição do build está em execução.
- O download GED genérico também passou a exigir habilitação urbanística no setor responsável quando o arquivo estiver vinculado a uma solicitação civil, além dos gates de assinatura/publicação. As regras existentes dos demais módulos foram preservadas.
- A repetição do build compilou e identificou a operação inexistente `"read"` em páginas do ciclo civil, vistorias e fila cadastral. As três passaram a usar `getTenantContextForModule`, apropriado para consulta, preservando os filtros e escopos de domínio. ESLint dessas correções aprovado. A checagem conjunta das fontes de produção (`tsc --project tsconfig.build.json`) está em andamento antes da nova repetição do build.
- A checagem conjunta apontou três diagnósticos adicionais: operação `"view"` na fila de pedidos, categorias territoriais sem estreitamento pelo schema e setor nulo no roteamento dos signatários. Corrigidos usando consulta de módulo, validação `zoneSchema` preservando a memória da versão e estado explícito de configuração de signatários pendente para processo sem setor. Os seis testes de viabilidade passaram; um cenário PostgreSQL adicional confirma processo sem setor sem assinatura fictícia. ESLint aprovado; checagem de produção reiniciada.
- **TypeScript de produção aprovado**, código 0: `npx tsc --project tsconfig.build.json --noEmit --pretty false`. ESLint das correções finais também aprovado. Build completo reiniciado após aprovação da checagem conjunta.
- **Build final aprovado**, código 0: `npm run build`, com Prisma Client gerado, compilação, TypeScript, coleta de páginas e geração estática concluídos. As rotas de abertura, documentos/carimbo, ciclo/vistorias, fiscalização, integrações, fila cadastral e portal/viabilidade automática constam no resultado. Este resultado encerra a validação técnica de compilação; F10 permanece dependente de execução visual/autenticada e homologação específica dos requisitos oficiais apontados na matriz.
