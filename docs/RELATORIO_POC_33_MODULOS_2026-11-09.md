# Relatório de aderência — POC Campo Florido, 33 módulos

**Data:** 09/11/2026. **Base de código:** `aeaf772b646b31ee0f1644b68d8ce9eac1eb47a4`.

**Resultado interno:** 1151 de 2661 requisitos atendidos (43,25%); **3 de 33 módulos** alcançam pelo menos 95% na inspeção de código.

**Atualização pós-merge:** a [reavaliação de CF26, CF29, CF31 e CF32](RELATORIO_POC_POS_MERGE_2026-11-09.md), no merge `094782ae`, manteve os percentuais. As justificativas atualizadas para os 48 itens estão nesse complemento; as evidências abaixo registram o corte original.

## Critério e alcance

- Fonte exclusiva dos denominadores: `Campo Florido POC (1).pdf`, 113 páginas, seção 11; 2.661 itens numerados em 33 módulos. Requisitos gerais anteriores à seção 11 não foram acrescentados aos denominadores.
- **Atende:** implementação funcional demonstrável no código para todas as condições obrigatórias do item. **Não atende:** ausência, cobertura incompleta, simulação/placeholder ou evidência insuficiente. Não há pontuação parcial.
- Percentual = itens atendidos ÷ itens do módulo × 100, com duas casas decimais. Itens compostos valem uma unidade; subcondições não foram pontuadas separadamente.
- Duplicações, títulos e continuações que receberam número próprio no PDF foram preservados no denominador. Interpretações de enunciados ambíguos estão nas ressalvas de cada módulo.
- Revisão de páginas/componentes, actions/APIs, regras/serviços e persistência conforme o fluxo exigido; quinze revisões paralelas e revisão/consolidação central. Referências antigas foram usadas como pistas, não como comprovação automática.
- Esta é **avaliação interna de código**, sem navegação Chrome ou homologação operacional dos 2.661 fluxos. A existência de testes e o build aprovado não comprovam, isoladamente, um requisito. Os testes de uso realizados pelo usuário devem ser comparados à matriz anexa.
- Integrações externas, certificações e garantias contratuais só pontuam quando há evidência suficiente do requisito. “Não atende” por evidência insuficiente não afirma inexistência do serviço fora do repositório; a justificativa individual esclarece a limitação.
- O item 10.3 do PDF exige **95% de cada módulo**. O total geral é informativo e não compensa um módulo abaixo de 95%. CF32 também está expressamente identificado como obrigatório; esta análise não declara aprovação oficial da POC.

## Tabela consolidada

| Módulo | Atende / total | Percentual | Itens adicionais para 95% | O que falta para 100% — síntese |
| --- | ---: | ---: | ---: | --- |
| CF01 — Assinatura Digital/Eletrônica (web) | 10/20 | **50,00%** | 9 | Prazos e alertas de assinatura, notificações, filtros e download do documento assinado. |
| CF02 — Gerenciamento Eletrônico de Documento (web) | 47/52 | **90,38%** | 3 | FTP/WebDAV, LDAP/AD, Internet Explorer e envio efetivo de alertas de validade. |
| CF03 — Informações Gerenciais (web) | 8/20 | **40,00%** | 11 | Relatórios e gráficos configuráveis, fontes Excel, drill-down, aplicativo móvel e exportações completas. |
| CF04 — Ouvidoria Pública (web) | 24/25 | **96,00%** | 0 | Sincronizar o andamento público com a situação interna do manifesto. |
| CF05 — Recursos Humanos e Folha de Pagamento | 179/219 | **81,74%** | 30 | Relatórios contábeis e folhas especiais fora do modo demo; leiautes oficiais, pensões, consignações e bloqueio retroativo. |
| CF06 — E-social (web) | 1/26 | **3,85%** | 24 | Transporte oficial, XML/XSD, certificado, retornos e totalizadores reais; console atual é demonstrativo. |
| CF07 — Portal do Servidor (web) | 14/18 | **77,78%** | 4 | Notícias/eventos/avisos completos e consulta de atividades com filtros efetivos. |
| CF08 — Tributario (web) | 68/399 | **17,04%** | 312 | Relatórios completos, certidões finais, parâmetros efetivos, parcelamentos e integrações bancárias/cartorárias. |
| CF09 — Portal do Cidadão e Gestão do ISSQN (web) | 58/122 | **47,54%** | 58 | Submissões reais do portal, cobrança/PIX, conversão de RPS, cancelamentos e certidões finais. |
| CF10 — Gestão de Resíduos (web) | 13/13 | **100,00%** | 0 | Nenhuma lacuna identificada no código; confirmar os fluxos no teste de uso. |
| CF11 — Licitação | 56/192 | **29,17%** | 127 | Documentos Word, operações efetivas do certame, saldos/cálculos, relatórios e integrações externas. |
| CF12 — Compras/Requisição de materiais | 47/126 | **37,30%** | 73 | Relatórios reais, CRC/CRJF, estornos, operações de ACS/estoque e transmissão PNCP. |
| CF13 — Património Público | 56/61 | **91,80%** | 2 | Clonagem integral, manutenção financeira, leitor QR integrado e transferência de centro de custo. |
| CF14 — Frotas | 64/66 | **96,97%** | 0 | Relatório de incorporações/desincorporações e correção do total de entradas/retornos. |
| CF15 — Almoxarifado | 27/70 | **38,57%** | 40 | Estoque virtual/conversões reais, devoluções, inventário, relatórios e regras de acesso/movimentação. |
| CF16 — Contratos | 17/35 | **48,57%** | 17 | Saldos e impactos corretos, manutenção contratual, filtros e conversão real DOC/DOCX para PDF. |
| CF17 — Portal da Transparência e Acesso à Informação (web) | 23/32 | **71,88%** | 8 | Dados reais de estrutura/pessoal, recortes de remuneração/COVID e sincronização e-SIC. |
| CF18 — Contabilidade Pública | 105/319 | **32,92%** | 199 | Demonstrativos/anexos legais completos, consultas reais, rotinas contábeis e integrações oficiais. |
| CF19 — Protocolo e Controle de Processos (web) | 72/118 | **61,02%** | 41 | Subassuntos/anexos, remessas/workflow, relatórios integrais, código de barras válido e notificações. |
| CF20 — Ponto Eletrônico | 14/24 | **58,33%** | 9 | Batidas e minutos completos, afastamentos, escalas sem presenças presumidas e relatórios corretos. |
| CF21 — Nota Fiscal Nacional (web) | 12/37 | **32,43%** | 24 | Integração nacional ADN, certificado, NSU, consultas reais e painéis/relatórios completos. |
| CF22 — Gestão de Fiscalização Tributária (web) | 31/47 | **65,96%** | 14 | Gestão por órgão, impressão correta de OS, relatórios, infrações e APIs exigidas. |
| CF23 — Cemitério | 23/27 | **85,19%** | 3 | Consulta correta de falecidos, contexto por cemitério e relação de proprietários atuais. |
| CF24 — Ação Social (web) | 33/35 | **94,29%** | 1 | Avaliação do benefício com dados completos e importação compatível com o CADUNICO federal. |
| CF25 — Educação (web) | 36/244 | **14,75%** | 196 | Calendário operacional, apuração acadêmica, documentos, nutrição, transporte e Educacenso oficial. |
| CF26 — Arrecadação Online Service (web) | 0/7 | **0,00%** | 7 | Implementar os métodos FEBRABAN de arrecadação online exigidos. |
| CF27 — Gestão do Simples Nacional (web) | 46/156 | **29,49%** | 103 | Leiautes reais, dossiês/relatórios sem dados sintéticos, reprocessamento, DTE-SN e webservices corretos. |
| CF28 — Declaração das Informações dos Bancos (web) | 41/81 | **50,62%** | 36 | BCB/ESTBAN reais, ABRASF 3.1, isolamento por instituição, autos e exportações válidas. |
| CF29 — Declaração das Informações das Administradoras de Cartões | 2/9 | **22,22%** | 7 | Persistência no portal, declarações, DAM, conta-corrente e recepção por webservice. |
| CF30 — Planejamento, governança e documentos das contratações | 7/14 | **50,00%** | 7 | IA efetiva, auditoria/classificação documental completa e comprovação de SLA/garantia. |
| CF31 — Backup | 0/11 | **0,00%** | 11 | Backup integral automatizado, retenções, logs horários e comprovações técnicas/contratuais exigidas. |
| CF32 — Serviço Data Center (Requisito Obrigatório) | 3/21 | **14,29%** | 17 | Comprovar certificações, SLA, redundância, segurança, backup, suporte, licenças e wildcard/subdomínios. |
| CF33 — Registro de Atos Administrativos e Textos Legais (web) | 14/15 | **93,33%** | 1 | Conector completo para importação automática do banco do aplicativo anterior. |

## Matriz detalhada e comparação com os testes do usuário

- [Avaliação item a item — CSV para Excel](poc-auditoria-2026-11-09/avaliacao-item-a-item.csv): 2.661 linhas, requisito integral, página, decisão, justificativa e evidências. As colunas `resultado_usuario` e `observacoes_usuario` estão vazias para conferência.
- [Evidências e decisões estruturadas](poc-auditoria-2026-11-09/evidencias.json): todas as decisões e referências por item, além dos totais.
- [Requisitos extraídos e identificação da fonte](poc-auditoria-2026-11-09/requisitos-fonte.json): texto dos requisitos, módulos, páginas e SHA-256 do PDF, preservados para rastreabilidade mesmo após a limpeza autorizada da pasta de origem.
- [Validação da entrega](poc-auditoria-2026-11-09/validacao-entrega.json): cobertura, contagens, correspondência CSV/JSON/fonte, 930 registros de evidência e 1.979 citações de arquivos de código conferidas.

## Lacunas detalhadas e ressalvas por módulo

### CF01 — Assinatura Digital/Eletrônica (web)

- Configuração de servidor de e-mail sem ligação operacional com a assinatura e ausência de envio/reenvio aos assinantes e de aviso ao criador a cada movimentação.
- Solicitações não têm prazo final por assinante nem alerta antecipado desse prazo.
- Faltam consulta de visualização por assinante, pesquisa reunindo todos os filtros exigidos e consulta pública de assinantes pendentes por token.
- Download entrega original e comprovante JSON destacado; não foi encontrado arquivo documental assinado distinto.

**Ressalva:** Auditoria estática da Central de Assinaturas e do fluxo compartilhado GED/DocumentSignature. O registro de IP/navegador existe no fluxo de assinaturas solicitadas; a assinatura avulsa da Central não inclui esses campos. A1 tem operação criptográfica real, mas certificados, cadeia, segredos e armazenamento externos não foram verificados. Sem execução de testes ou homologação visual.

### CF02 — Gerenciamento Eletrônico de Documento (web)

- Transferência FTP e WebDAV não implementada.
- LDAP v3/Active Directory não operacionais; opções de login desabilitadas.
- Internet Explorer não coberto pela plataforma atual e sem homologação comprovada.
- Alerta de validade gera GedMailIntent, mas não há consumidor que envie o e-mail.

**Ressalva:** Fluxos internos do GED foram seguidos da interface à persistência. OCR, conversão Office, PDF/A e busca semântica possuem implementação real local/Sandbox/serviço; disponibilidade de binários, modelo, snapshot, Blob e parâmetros de produção não foi verificada. Regras de revalidação/publicação encaminham tarefas, conforme rótulos da UI; não publicam automaticamente. Modelos DOCX importados são tratados como texto com marcadores, sem preservação integral da diagramação. Limites operacionais encontrados: 20 MiB por arquivo, 200 páginas por PDF e 2.000 resultados por relatório; não há teto de quantidade de versões. Sem execução de testes ou homologação visual.

### CF03 — Informações Gerenciais (web)

- Editor limitado a painéis Smart TV e indicadores predefinidos; não há construtor de relatórios nem objetos analíticos completos por instância.
- Publicação/link anônimo cobre a programação Smart TV, não relatórios criados pelo usuário.
- Não foi encontrada planilha Excel como fonte de dados do BI, criação de tabelas self-service ou de filtros externos analíticos.
- Não há criação de gráficos com drill-down configurável, aplicativo móvel dedicado ou todas as exportações exigidas.

**Ressalva:** Foram considerados o editor Smart TV, o painel administrativo, auditoria/perfis compartilhados e o BI Tributário como possível equivalente. O BI Tributário possui visualizações fixas e tabela limitada de dívidas; isso não demonstra criação de gráficos com hierarquia de drill-down. O item 15 considera a visualização web dos gráficos e do comparativo tabular administrativo, sem presumir criação/publicação de relatórios. Compatibilidade Smart TV é evidenciada pelo player responsivo, rotação e controle por teclado, sem teste em aparelho.

### CF04 — Ouvidoria Pública (web)

- Consulta pública mantém status de TransparencyCitizenRequest em RECEBIDO durante mudanças nativas de triagem/encaminhamento/cancelamento; só substitui por RESPONDIDO quando há resposta em estado final reconhecido.

**Ressalva:** Cadastros de pessoa, órgão, unidade, setor e responsável foram creditados pelos fluxos compartilhados realmente consumidos na Ouvidoria. O cadastro completo do requerente fica no cadastro geral de pessoas; a abertura interna vincula pelo CPF. O autocadastro cidadão cria conta Firebase e solicitação de acesso, sujeita à aprovação. Assuntos urbanos predefinidos foram creditados porque o formulário público os utiliza e o serviço efetivamente grava manifestações, não por existência de seed. Identificado problema secundário no roteiro: a consulta do vínculo setor-unidade é executada, mas seu resultado não é validado; os campos do cadastro são persistidos. Sem validação visual, testes ou escrita no banco.

### CF05 — Recursos Humanos e Folha de Pagamento

- Relatórios contábeis e evolução por natureza rejeitam folhas fora de DEMONSTRACAO, inclusive várias visões por dotação/fonte.
- Folhas especiais, inclusive rescisão, são bloqueadas fora do escopo demonstrativo.
- Exportador de obrigações é configurável, mas não comprova layouts oficiais TCE, SIOPE, DIRF/SEFIP; não foram encontrados RAIS/CAGED, layouts das consignadoras, abertura de conta ou adaptadores atuariais específicos.
- Pensões têm cálculo e demonstrativo de desconto, mas não o fluxo completo de arquivo bancário por beneficiário e recibo de pagamento exigido.
- Ausências/cessões não demonstram agrupamento de pagamento; filtros não implementam todos os intervalos pedidos; previsão de ATS existe como consulta paginada, sem emissão integral localizada.
- Consulta de consignações por entidade mostra cronograma/reservas, não concilia os valores efetivamente descontados; proteção de mês encerrado não cobre inclusão retroativa de movimentos.

**Ressalva:** Auditoria estática integral dos 219 itens de module-05.json, confrontados individualmente com código atual. Totais após revisão cruzada: 179 atende e 40 nao_atende, em 219 itens. Não houve navegador, execução de aplicação, testes, build, acesso ao banco, alteração do repositório ou Git. Atende significa capacidade funcional demonstrável no código, sujeita ao cadastro e à parametrização próprios; não certifica dados carregados, legislação municipal parametrizada, credenciais, agendamento implantado ou homologação bancária. Equivalências de relatórios e fluxos compartilhados foram aceitas quando preservam o conteúdo exigido. Os IDs do catálogo interno não foram tratados como numeração CF05. Relatórios gerais de IRRF/FGTS/contribuições aprovados representam valores calculados/retidos a recolher, não atestados de quitação. O informe IRRF_ANUAL dos documentos funcionais do Portal, distinto dos relatórios POC, usa folhas oficiais fechadas de PRODUCAO, pagamentos Paga no ano, conciliação individual comprovada e grupos fiscais parametrizados, gerando PDF preservado no GED; comprova a origem dos rendimentos pagos, não o recolhimento do imposto ao fisco. A revisão cruzada corrigiu CF05.35 e, pela mesma evidência diretamente aplicável, CF05.165 para atende. CF05.131 permanece nao_atende pelas lacunas de DIRF/RAIS, com justificativa corrigida quanto ao comprovante anual. A emissão depende de modelo RH publicado, classificação fiscal das rubricas, liberação ao titular e conciliação; essas condições não restringem a fonte à demonstração. O agendamento de direitos depende de ator e configuração de execução externos não verificados. Nenhuma mudança de schema ou de tabela visual foi realizada.

### CF06 — E-social (web)

- Console eSocial usa fixtures, XML conceitual e transporte DEMO; transporte oficial lança erro e não há cliente XML/XSD/XMLDSig/mTLS/worker instalado.
- Diárias/prestadores, totalizadores, migração, notificações, permissões de envio e downloads apresentados pertencem ao cenário simulado, sem ligação operacional equivalente com eventos governamentais.
- Configuração real guarda referências de credencial; não importa certificado A1. Preparação SST persiste origens reais, mas também bloqueia transmissão sem adaptador REAL.

**Ressalva:** Auditoria estática. Resultado: 1/26. Foram distinguidos console DEMO persistido, preparação RH/Folha real e backend SST real incompleto. Persistência real de simulações não comprova integração eSocial. O link da documentação oficial é funcional independentemente da transmissão.

### CF07 — Portal do Servidor (web)

- Notícias/eventos compartilhados não têm fluxo completo de imagem, período de publicação e inativação; avisos de Protocolos não possuem imagem.
- Auditoria de atividades lê somente os últimos 100 eventos; CPF/matrícula são recebidos mas não aplicados ao filtro.
- Envio de links depende de Firebase, SES e configuração pública; o serviço ainda exige variáveis RESEND/EMPLOYEE_PORTAL_EMAIL_FROM embora o dispatcher use SES, que retorna sucesso simulado quando faltam credenciais.

**Ressalva:** Resultado: 14/18, por capacidade demonstrável no código, não por homologação externa. Fluxo de primeiro acesso pressupõe conta funcional previamente autorizada/provisionada; cria a credencial pessoal por link, não cadastro irrestrito. Firebase/SES/Blob e políticas publicadas não foram verificados externamente. O informe da central de relatórios usa POC_FINANCEIRO; a aprovação do item 8 decorre do fluxo alternativo Documentos funcionais/IRRF_ANUAL, com fontes de produção e pagamentos individuais conciliados. Código de recibo é UUID criptograficamente aleatório associado a hashes, não criptografia reversível.

### CF08 — Tributario (web)

- Relatórios imobiliários, econômicos, de arrecadação e fiscalização não demonstram todos os filtros, agrupamentos, colunas e totalizações expressamente exigidos.
- Certidões tributárias são registradas como rascunho interno; documentos personalizados e AIDF do portal contêm simulação sem persistência operacional.
- Mensagens documentais e regras de anistia têm cadastro, mas não foi demonstrada sua aplicação nos emissores internos e no portal.
- Remessas de protesto são internas e sem convênio; não foram demonstrados os leiautes operacionais bancários, Sisobra-Pref e importações oficiais completas do Simples Nacional.
- Parcelamento negociado não emite suas guias no fluxo examinado; cancelamento/reativação existe em serviço sem consumidor localizado.
- Parâmetros e retenções de NFA-e, regras de vencimento em certidões/alvarás, tratamentos de pagamentos duplicados e vários modelos documentais estão incompletos.
- Certidões fiscais permanecem como rascunhos internos; faltam emissão final, campos e gestão documental completos.
- PIX tributário é referência interna, sem cobrança bancária real; retorno bancário e protesto não implementam os importadores de arquivos exigidos.
- Muitas parametrizações não possuem consumidor efetivo; ocultação da taxa de expediente tem action sem persistência.
- Relatórios, filtros, campos e operações compostas de fiscalização, dívida ativa, parcelamentos e NFS-e estão incompletos.
- CADMEI/eventos, TSE, retenções federais da NFA-e e fechamento diário da arrecadação não foram demonstrados como fluxos completos.
- Imprimir Ordem usa identificador de OS em endpoint de documento fiscal, que pode retornar o último documento em vez da ordem selecionada.

**Ressalva:** Auditoria estática do código atual, requisitos 1 a 200 do campo items de module-08.json; itens 201 a 399 fora deste grupo. Foram examinados consumidores compartilhados em cadastro, financeiro, portal, protocolo e obras. Não houve navegador, execução de testes/build, acesso operacional a banco ou alteração do repositório. Firebase, armazenamento de blobs/GED e demais configurações externas não foram homologados. Item 6 foi interpretado como cadastro dos parâmetros, sem presumir consumo dos três valores fixos pelo cálculo. Item 67 foi aceito pela emissão materializada de CDA com valores reais: o PDF informa natureza interna e não comprova certificação/protocolo externo, não exigidos literalmente nesse item. Itens 31 e 133 usam a relação exportável de notificações como saída equivalente de débitos selecionados, com posição congelada na emissão. Itens 141 e 145 consideram a baixa/extinção fundamentada sem ingresso de caixa como equivalente fiscal à alocação manual pedida, sem classificá-la como arrecadação. Item 194 foi interpretado como parametrização da modalidade de cobrança, cota única/parcelas e condições, cuja aplicação está demonstrada. Requisitos compostos receberam nao_atende quando faltou qualquer condição obrigatória; ausência significa não demonstrada no escopo de código indicado, e não inexistência inferida de uma pesquisa nominal isolada.
**Ressalva:** Auditoria estática do código atual em 09/11/2026, exclusivamente itens 201 a 399 de module-08.json. Foram considerados consumidores compartilhados de Obras, Financeiro, Administração, cadastros e portal. Critério binário: requisitos compostos só atendem quando todas as condições estão demonstradas. Configurações e credenciais externas não foram verificadas. Não houve navegação, execução de testes/build, alteração de implementação, banco ou Git. Modelos de Obras são funcionais como configuração/emissão; a assinatura interna é explicitamente demonstrativa e a alternativa A1 depende de configuração externa. CSV isolado não foi equiparado a relatório integral imprimível quando a impressão é exigida. O registro imobiliário de decisões do item 332 foi aceito pela rotina funcional de registros vinculados a processo, sem inferir automatização de seus efeitos.

### CF09 — Portal do Cidadão e Gestão do ISSQN (web)

- Portal CF09 possui submissões, recibos, guias, PIX, parceiros, deduções, mensagens e AIDF simulados, sem persistência nas respectivas actions.
- Guias locais não demonstram instrumento bancário pagável; PIX do portal é SVG decorativo e texto montado, e o serviço compartilhado registra somente referência interna.
- Cancelamento não implementa integralmente entrega da competência, vencimento, deferimento/indeferimento e anuência do tomador substituto.
- RPS é recebido e protocolado, mas não há fluxo alcançável de conversão para NFS-e.
- Certidões negativas ficam como rascunho interno; livros e placares específicos usam dados fixos; integração de cartões anunciada não tem endpoint.

**Ressalva:** Auditoria estática integral dos 122 itens. Requisitos curtos foram avaliados literalmente; funcionalidades internas compartilhadas realmente executáveis foram reconhecidas, mesmo quando a tela CF09 paralela é simulada. Emissão de guia local foi distinguida de guia efetivamente pagável/PIX. Consultas e alterações administrativas de diversos/cartório foram reconhecidas, mas seu registro administrativo sem apuração/entrega não foi equiparado à declaração fiscal completa. Autenticação/recuperação dependem de Firebase configurado; envio SES não foi homologado e contém sucesso simulado/erro ignorado. Nenhuma validação visual ou operacional; nenhum build/teste executado.

### CF10 — Gestão de Resíduos (web)


**Ressalva:** Auditoria estática de UI, actions, serviços e SQL. Os 13 requisitos têm fluxo interno demonstrável. A configuração da instância, a aplicação das migrações e o provisionamento Firebase não foram executados/verificados em ambiente. Sem navegador, build, testes ou escrita no banco.

### CF11 — Licitação

- Mala direta e minutas Word exibem alertas de sucesso sem gerar documentos.
- Registro de preços externo, participantes de alienações e disputa por desconto contêm dados simulados ou estado local.
- Várias operações auxiliares apenas persistem descrições: transferências, clonagens, reajustes SRP, distribuição homologada e bloqueios por fornecedor.
- Propostas iniciais, negociação final, classificação por item e atualização dos valores individuais dos lotes estão incompletas.
- Relatórios de valores repetem o total do lote em cada item; saldo usa quantidade original menos recebimentos, sem considerar integralmente homologação e ACS.
- Filtros e conteúdos de vários relatórios obrigatórios estão ausentes; o consolidado mistura datas nos limites do período e usa situações incompatíveis com o workflow.
- Reabertura aceita qualquer senha não vazia e não verifica ACS; bloqueio orçamentário registra somente ato textual.
- Integrações Licitanet/AMM, importação de propostas e conversão Word/PDF com sincronização diária não têm execução demonstrada.

**Ressalva:** Auditoria estática dos 192 itens de module-11.json, incluindo interfaces, actions, serviços e persistência e equivalentes compartilhados de Cadastros, Compras e Patrimônio. Cadastros auxiliares persistidos foram aceitos quando o requisito exige somente cadastro; registros descritivos não foram equiparados à execução de operações. Não houve navegador, execução do aplicativo, build, testes, acesso/escrita no banco ou alteração do repositório. Configuração de instância, permissões, base efetiva e entrega de notificações externas não foram verificadas. A consulta tributária foi interpretada como consulta dos dados tributários cadastrados, não emissão de certidão externa. No item 175, recebimento do cadastro foi interpretado no contexto dos itens 173-177 como recepção/importação externa, não cadastro manual. Os itens 33, 83 e 109 reconhecem respectivamente substituição de designação, cadastro da regulamentação e cancelamento cadastral de ACS; não afirmam funcionalidades adicionais de automação jurídica ou contábil.

### CF12 — Compras/Requisição de materiais

- Relatórios com médias, medianas, gastos e saldo simulados; vários relatórios anunciados não possuem corpo e faltam filtros obrigatórios.
- CRC e CRJF têm validade submetida indevidamente à validação numérica; o CRC exige simultaneamente data ISO e número.
- Estorno de cancelamento de SD fica inacessível pela política da própria interface; clonagem não troca administração.
- ACS, pedidos e parâmetros auxiliares não demonstram todas as operações contábeis, vínculos e automatizações solicitadas.
- PNCP prepara pacote manual sem transmissão; liquidação não gera entrada de estoque e seu estorno não reverte estoque.
- Não foi demonstrado contexto operacional de exercício/administração nem autorização específica por almoxarifado e centro de custo.

**Ressalva:** Auditoria estática integral, sem navegador, execução da aplicação ou alterações no repositório. Cadastros simples com formulário, validação e persistência foram aceitos, inclusive equivalentes em Cadastros e Patrimônio. Registros auxiliares não foram tomados como prova de rotinas operacionais que não os consomem. O PCA principal consolida purchasePlannings, enquanto o cadastro auxiliar por requisitante é independente. Instância municipal configurada é pré-condição dos cadastros auxiliares; configuração externa não verificada.

### CF13 — Património Público

- Clonagem reaproveita apenas parâmetros iniciais e exige novo recebimento; não replica integralmente o cadastro de origem.
- Movimentações financeiras permitem estorno, mas não alteração/exclusão conforme o item 26.
- Não foi localizado leitor QR integrado à versão móvel.
- Transferência patrimonial não altera centro de custo, condição do item 54.

**Ressalva:** Web responsiva considerada versão móvel para funcionalidades demonstráveis sem exigir aplicativo nativo. Câmera externa pode abrir a URL impressa no QR, mas isso não comprova leitura integrada. Exercício pode ser escolhido nos cadastros e relatórios sem logout; não foi identificado seletor global de exercício. Categorias e cálculos contábeis são parametrizáveis; conformidade normativa/homologação da Lei 448/2002 e NBCASP não foi certificada. Lançamentos dependem de UG, exercício e eventos contábeis conciliados. Trigger de bloqueio de inventário inspecionado em código; aplicação no banco não verificada.

### CF14 — Frotas

- Relatório denominado incorporações usa eventos genéricos de alteração patrimonial e não demonstra captura completa das incorporações/desincorporações exigidas para TCE-MG.
- Relatório de monitoramento calcula incorretamente o subtotal de entradas/retornos: filtra RETORNO, mas a operação persiste ENTRADA.

**Ressalva:** Baixa/reativação do item 9 interpretada como disponibilidade operacional de Frotas; baixa patrimonial formal permanece em Patrimônio. Cadastro de roteiros com distância existe no catálogo compartilhado, separado de FleetRoute. O relatório de cadastro com período é atendido pelo caminho report.ts -> queries.ts. A revisão central reclassificou o item 64 como não atende: embora o detalhe seja real, o total emitido de entradas não corresponde aos eventos persistidos. Resultado consolidado: 64/66. Relatórios de saldo por empenho são controles operacionais por referência/limite cadastrado, não saldo contábil oficial. Anexos dependem de armazenamento externo configurado; importações CSV e serviços internos foram inspecionados, sem homologação de fornecedor ou execução.

### CF15 — Almoxarifado

- Consulta analítica corta em 100 movimentos sem paginação; conversão exibe fator fixo 1:1 e estoque virtual fixa reservas em zero.
- Faltam liberação específica usuário/centro de custo e cadastro operacional de tipos documentais de estoque.
- Entradas/saídas e estornos não cobrem todos os campos e cenários compostos; não estocável, doação geral, fabricação própria e entrada de RAP não demonstrados.
- Devolução genérica tem serviço sem consumidor de UI/API localizado; transferência encontrada é restrita à Saúde.
- Inventário não recorta grupo/subgrupo nem oferece emissão completa dos relatórios de inventário.
- Diversos relatórios especializados, reemissões e consolidação contábil de todas as saídas não foram demonstrados.
- Não foi encontrada configuração de uso da tela monitora ou troca de administração da sessão.

**Ressalva:** Foram considerados equivalentes reais em Compras e Financeiro: relação simples de requisições e autorizações, cancelamento de liquidações e liquidação/estorno nativo de RAP. O relatório compartilhado de requisições em Compras não aplica período/status nem gera requisição individual, portanto cobre 46, mas não 8/47. A listagem operacional com filtros de situação cobre a visualização pedida em 61; não comprova a preferência de uso pedida em 16/69. Requisitos repetidos 63-70 receberam avaliação individual. Nenhuma validação visual, execução de testes/build ou alteração de repositório/banco foi realizada.

### CF16 — Contratos

- Relatório de impactos descarta JSON já desserializado; fonte de recursos é fabricada a partir da UG.
- Saldos financeiros desconsideram movimentos/anulações e itens são indevidamente herdados de todo o processo.
- Filtros compostos e ordenações dos relatórios estão incompletos.
- A atualização de órgão gestor tem action sem consumidor e a secretaria está bloqueada na edição comum.
- Novas dotações são metadados de unidade; publicação não oferece manutenção completa.
- Conversão DOC/DOCX apenas renomeia extensão e grava hash fictício; contratos sem processo e vários campos obrigatórios não são suportados.

**Ressalva:** Cadastros auxiliares de planilhas, impactos, apostilamentos e remanejamentos têm persistência efetiva. Consórcios podem ser cadastrados pela tela auxiliar genérica; a tela especializada omite dataRegistro exigida pelo parser. Esse desvio foi registrado sem reprovar o requisito simples que possui caminho equivalente funcional. Validação estática, sem homologação visual ou operacional.

### CF17 — Portal da Transparência e Acesso à Informação (web)

- Estrutura organizacional pública contém competências e contatos genéricos e fallback de órgãos.
- Recorte temporal de remuneração não corresponde necessariamente à competência; detalhamento repete salário-base e quadro de cargos usa valores fixos.
- Classificação de pessoal pode inventar função/subfunção; consulta COVID inclui despesas gerais de saúde.
- Estatísticas e fila e-SIC não acompanham corretamente as respostas dos chamados integrados.

**Ressalva:** Auditoria estática de UI, actions, consultas, serviços e persistência. Publicação documental funcional aceita acervos de RGF, RREO, contas, editais e contratos; não foi verificada a existência de acervo publicado. Entrega de e-mail depende de configuração externa não verificada. Nenhum navegador, build ou teste de aplicação executado.

### CF18 — Contabilidade Pública

- Relatórios especializados e anexos fiscais completos não demonstrados; emissão de Saúde/Educação executadas difere da consulta de índices e dos relatórios apenas orçados.
- Cotas e programação não cobrem cancelamentos previstos, transferências previdenciárias e todos os limites exigidos.
- Cadastros de signatários existem, mas sua composição automática nas notas e relatórios financeiros não foi localizada.
- Dívida fundada permanece demonstrativa; faltam borderôs, lotes multidespesa e remessa/retorno bancário em arquivos com a abrangência exigida.
- Despesas extraorçamentárias genéricas, manutenção completa de RAP e encerramentos por conta/competências 13 e 14 têm lacunas.
- Integração tributária real é parcial perante os requisitos de mapeamento geral PCASP e painel de contabilizadas/não contabilizadas; assinatura contratual não gera controle contábil demonstrado.
- Consultas de cotas, execução mensal e saldos por fonte contêm valores simulados; vários dossiês e relações exigidos estão incompletos.
- Anexos da Lei 4.320, DCASP e demonstrativos fiscais oficiais não estão integralmente implementados; parte dos relatórios é apenas síntese interna ou orçamento previsto.
- Não foram comprovados os fluxos contábeis oficiais SICOM/SIACE, DCA, SIOPE/SIOPS, EFD-Reinf, DIPR, MANAD e exportação UnB/MEC/PILab.
- Correção de empenhos e liquidações exige anulação/cancelamento; faltam correções de histórico, documento fiscal e conta sem estorno.
- Consolidação por arquivos de terceiros, lançamentos acumulados de consórcios, prioridades de RAP e integração de receitas do saneamento não foram demonstrados.

**Ressalva:** Auditoria estática individual dos 160 requisitos de module-18.json. Sem navegador, execução de testes/builds, banco ou alterações no repositório. Foram considerados consumidores compartilhados de Planejamento, Financeiro, Cadastros, RH e Tributação. Atende indica fluxo demonstrável no código, não homologação nem dados/configuração da instalação verificados. Matrizes contábeis, composições fiscais, catálogos municipais, GED e provedores externos requerem configuração operacional. Nos itens 3/4, evolução é interpretada como distribuição anual dos valores orçados na peça plurianual, pois o texto não exige realizado; os itens 95/97 exigem comparação histórica/realizado e foram avaliados separadamente. Item 40 considera ingresso do arquivo DOC da lei, não extração automática de dotações, que não é pedida explicitamente. Nos itens 6/7, consulta de índices executados em tela não foi equiparada à emissão do demonstrativo de gastos; a emissão PDF/CSV encontrada usa valores orçados.
**Ressalva:** Auditoria estática funcional dos 159 itens atribuídos, incluindo equivalentes em Planejamento, Cadastros, RH, Patrimônio, Compras, Obras e Transparência. Nenhum teste do aplicativo, build, navegador, escrita no banco ou alteração do repositório foi realizado. Atende significa fluxo demonstrável no código, não homologação operacional nem certificação legal. MSC implementada para 2026, inclusive competência 13, dependente de referência oficial, de-para, perímetro e fechamentos; transmissão/homologação externa não verificadas. Composições fiscais dependem de parametrização municipal, cuja configuração efetiva não foi consultada. Itens 293 e 294 são continuação descritiva do 292 na extração e foram preservados separadamente. Item 213 tem terminologia ambígua (corrente/custeio); item 218 cita Art. 22 e legislação histórica. Relações públicas nativas foram consideradas como equivalentes quando satisfazem efetivamente o pedido; sua publicação depende da configuração de entidades e exercícios.

### CF19 — Protocolo e Controle de Processos (web)

- Ativação de assuntos/tipos não controla corretamente a publicação; subassuntos e links usam contratos incompatíveis entre cadastro e portal.
- Backend de arquivos recusa vários formatos anunciados pela UI; integração de licitação compara identificadores de tabelas distintas.
- Remessas têm numeração suscetível a colisões, elegibilidade incompatível com recebimento normal e encerramento apenas por evento.
- Relatórios e exportações têm truncamentos, filtros sem efeito e histórico reduzido à última movimentação; mapa estatístico ausente.
- Código de barras é desenho determinístico sem codificação válida; estilos de etiqueta não governam a impressão.
- Reprovação pelo gestor é bloqueada, notificações não cobrem todas as tramitações e atualização de pendência é enviada a endereço fixo.
- Escopo de visualização, origem portal/balcão, edição inicial de workflow e menu por permissão têm inconsistências.

**Ressalva:** Itens 73 e 81 atendidos pelo extrato individual integral, apesar das limitações do relatório dedicado. Item 72 considerado atendido: a junção real preserva a escolha Anexação/Apensação no motivo; não foi inferida exigência adicional de efeitos jurídicos distintos. Situação cadastrada é usada como texto no motivo da movimentação (47), sem satisfazer o filtro estruturado do item 27. Hospedagem Windows/Linux avaliada pela implementação Node/Next, sem implantação. E-mail, Firebase e ViaCEP têm chamadas reais; configurações/serviços externos não foram exercitados. Usabilidade e shell foram inspecionados em código, sem validação visual. Telas auxiliares apresentam tabelas HTML fora do padrão operacional compartilhado.

### CF20 — Ponto Eletrônico

- Geração automática grava presenças/horas realizadas, perde minutos da faixa e ignora a opção de afastamentos.
- Relatórios de horas extras e informações complementares inventam texto de autorização/conferência quando não existe fonte; local/relógio e equipe também recebem valores padrão não comprovados.
- Lançamento de frequência manual permite justificativa padrão em vez de digitação obrigatória; importador perde batidas intermediárias e não resolve PIS real pelo cadastro consultado.
- Tipo de ponto é inferido de dispensa/nome do cargo; ausência de marcação consulta apenas linhas existentes, omitindo dias previstos sem linha.

**Ressalva:** Resultado: 14/24. Foram procurados equivalentes no catálogo geral RH e no Portal: cartão/calendário, espelho e resumo possuem emissão integral PDF/CSV/XLSX independente do window.print da página paginada. O item 10 atende pelo layout delimitado com mapeamento de colunas; opções anunciadas de formato/fixo/evento não são integralmente consumidas e não foram consideradas capacidades adicionais. Relatórios especializados também não recebem o escopo de unidades do usuário no gerador, desvio observado. Não houve validação visual, execução de fluxos ou acesso ao banco.

### CF21 — Nota Fiscal Nacional (web)

- Conector NFSE restrito a MOCK, sem recepção/envio automático ADN com certificado do órgão.
- Consulta RFB abre submodal que declara autorização e protocolo fabricados; chave nacional é concatenada localmente e link aponta ao portal municipal.
- Faltam painéis nacional/contribuinte, consolidações mensais por papel, gerenciador NSU e relatórios com todos os filtros exigidos.
- Validade de usuário é inventada a partir da criação/alteração; análise fiscal de cancelamento e relatório decisório completos ausentes.

**Ressalva:** Auditoria estática dos 37 itens. Cadastro, perfis múltiplos, pesquisa, bloqueio, senha, CPF e referências territoriais foram confrontados com implementações compartilhadas. NFS-e municipal, DANFSE e XML CeleriFlow não foram tratados como integração nacional. Login CPF observado aplica-se a usuário vinculado a servidor ativo; Firebase é dependência externa não homologada. Não houve Chrome, build, testes ou operações externas.

### CF22 — Gestão de Fiscalização Tributária (web)

- Validade de usuário calculada artificialmente; parametrização e acesso multi-órgão da fiscalização incompletos.
- Imprimir Ordem envia ID de ordem a uma rota de documentos que pode retornar outro documento.
- Relatórios gerenciais não filtram usuário nem individualizam adequadamente termos/autos.
- Tipo de infração sem edição completa, penalidade fixa e vigência selecionável; apuração não vincula documento e tipo de infração.
- Integrações por API de CNPJ, documentos fiscais, pagamentos e atualização por período não demonstradas.

**Ressalva:** Auditoria estática dos 47 itens, incluindo todos os subitens de 18 e 46. Cadastros, autenticação, perfis e conta compartilhados foram considerados quando o fluxo é demonstrável. Firebase depende de configuração externa; envio de e-mail e execução operacional não foram verificados. O defeito do botão Imprimir Ordem foi distinguido da impressão funcional de termos/autos por ID de documento.

### CF23 — Cemitério

- Consulta de óbito substitui ID inexistente pelo registro mais recente e gera óbito de demonstração quando não há dados.
- Alternância de cemitério é filtro de URL, sem login/contexto autenticado específico; seletor carrega apenas a primeira página.
- Consulta de proprietários mostra movimentos históricos, sem relação consolidada de proprietários atuais.

**Ressalva:** Itens 10 e 11 são duplicados na fonte e foram preservados individualmente. Item 8 possui redação incompleta; avaliado pelo cadastro de jazigos expressamente exigido. Item 26 interpretado como acesso/contexto autenticado a outro cemitério; existe alternativa parcial de navegação filtrada. Cadastro PF/PJ e contribuinte foi rastreado nos módulos compartilhados. Relatórios complementares usam tabelas HTML fora do padrão operacional, desvio visual registrado sem inspeção em navegador. Sem alterações de banco/schema ou implementação.

### CF24 — Ação Social (web)

- Tela de avaliação do benefício não apresenta todos os dados preenchidos da solicitação.
- Importação implementa CSV municipal mapeável de 11 campos, sem demonstrar leitura integral de arquivo federal CADUNICO.

**Ressalva:** Foram consideradas as funcionalidades compartilhadas de Pessoas/Cadastros, Administração e Frotas. Prontuário e prestação de contas têm campos, blocos e persistência reais; não houve homologação normativa externa. SMS tem adaptadores operacionais SMSGate/Textbelt, mas o padrão é fila e depende de provedor/credenciais não verificados. Auditoria estática, sem testes, navegador, acesso ao banco ou alterações no repositório.

### CF25 — Educação (web)

- Calendário escolar apenas consultivo: Novo evento sem handler; não há configuração operacional de etapas, feriados, recuperações e calendários por ano de ensino.
- Notas individuais e frequência diária existem, mas faltam apuração por etapa/final, regras de recuperação, conceitos parametrizados, progressão parcial e diário mensal automático.
- Documentos acadêmicos usam um PDF genérico; faltam históricos completos, fichas individuais, atas, declarações específicas e grande parte dos relatórios exigidos.
- Remanejamento/reclassificação apenas alteram classId da matrícula: faltam validação da série, transporte de notas/faltas e preservação funcional do diário de origem.
- Nutrição limita-se a restrições alimentares, cardápio textual e movimentos de materiais; não há receitas estruturadas, nutrientes ou avaliação nutricional de alunos.
- Transporte não controla vagas especiais, exclusividade de lotação, escopo da escola e sequência incluindo escolas; Educacenso usa formato próprio e não importa o leiaute oficial completo.
- Cadastros e regras de profissionais, níveis/anos de ensino, BNCC e unidades/perfis escolares permanecem parciais.

**Ressalva:** Auditoria estática dos 244 itens de module-25.json, páginas 86-99. Inspecionados UI, actions, services, repositories, schemas e referências SQL pertinentes; nenhum navegador, build, execução de testes ou acesso/escrita ao banco. O item 18 contém somente o título Cadastro Escolar, interpretado como existência de cadastro escolar operacional. Itens introdutórios 48, 92 e 139 foram interpretados com as condições subsequentes que explicitamente incorporam. Relatórios CSV funcionais foram aceitos quando satisfazem o conteúdo literal pedido. Recursos compartilhados foram considerados, inclusive RH para 110/136/244 e Patrimônio para 40. Firebase, ViaCEP e dados/configurações externos não foram homologados; a busca local de endereços dispensa ViaCEP. Nenhum atendimento foi baseado exclusivamente em seed, schema ou nome de rota. Desvios visuais observados no código: disciplinas e tipos de licença usam tabela HTML própria, e calendário é listagem; não houve validação visual. Nenhuma alteração de banco ou repositório foi realizada.

### CF26 — Arrecadação Online Service (web)

- Nenhum dos seis métodos nominados FEBRABAN foi encontrado em implementação de API/service.
- Baixa e estorno tributários são operações internas; não há contrato/layout de arrecadação online integrado aos aplicativos bancários.
- Integração bancária compartilhada limita-se a sandbox de banco virtual; não comprova arrecadação FEBRABAN.

**Ressalva:** Busca em src e arquivos TS/TSX/XML/WSDL do repositório por consultarDebitoIPTUOp, consultarDebitoISSOp, consultarDebitoDividaAtivaOp, consultarDebitoParcelamentoOp, cancelamentoOp e confirmacaoOp não encontrou implementação. Foram examinados os serviços próximos de consulta fiscal, guias, pagamento e estorno para evitar confundir operações internas com webservice externo. Auditoria estática, sem tráfego bancário.

### CF27 — Gestão do Simples Nacional (web)

- Importação dos leiautes federais não implementada: TXT/CSV é convertido em até 25 registros com contribuinte e valores fabricados; JSON exige o modelo interno já normalizado.
- Cancelamento de importação é apenas estado React; reprocessamento aciona a malha, não o arquivo; etapas do log não são eventos reais de processamento.
- Dossiê apresenta números, datas, sócios, DEFIS, MEI, parcelamentos, DAS e situações fiscais sintéticos ou presumidos.
- Os 22 relatórios gerenciais compartilham a mesma lista demonstrativa; o QR é desenho sem codificação e a chamada PDF omite contribuinte obrigatório.
- Arquivos DTE-SN são textos internos com os primeiros 15 contribuintes, sem seleção fiscal específica nem leiaute oficial demonstrado; exclusão/SIMEI só têm preparação interna.
- Webservices substituem CNPJ não encontrado por outro contribuinte; alíquota pode vir de outra competência, atividade ou empresa, ou assumir 2%.
- Expiração de senha é calculada artificialmente a partir de updatedAt; reset não gera senha padrão; habilitação operacional multiórgão/município do CF27 não está completa.

**Ressalva:** Auditoria estática integral do código atual, com leitura dos 156 objetos items de module-27.json, inclusive 154. Foram seguidos UI, actions, services e persistência e examinados equivalentes compartilhados. Atendimento reconhecido em 46/156 itens; 110 não atendem. Fluxos Firebase têm integração efetiva no código, mas credenciais, configuração do provedor, envio/recepção de e-mail e execução externa não foram verificados. Cadastros auxiliares foram avaliados como cadastros; isso não comprova utilização dos parâmetros em cálculos ou integrações. Itens 54, 55 e 62 aproveitam funcionalidades compartilhadas reais de fiscalização, dívida municipal e DTE; os requisitos específicos de importação AINF/INSCOBRA/DTE-SN continuam não atendidos. As telas contêm referências numéricas divergentes do PDF; a numeração adotada é exclusivamente a da fonte obrigatória. Não houve homologação visual ou operacional, nem alteração do repositório ou banco.

### CF28 — Declaração das Informações dos Bancos (web)

- Cadastro complementar do auto não atualiza integralmente o auto operacional; edição/impressão podem substituir silenciosamente o identificador selecionado.
- Seleção COSIF mistura instituições/períodos e usa recomendações e valores artificiais; anexos têm fallback fictício e acréscimos fixos.
- BCB e ESTBAN simulados; dedução Webservice fixa imposto pago em vez de consultar pagamentos.
- Recepção JSON proprietária não implementa os quatro layouts ABRASF 3.1.
- Ausência de isolamento por instituição em consultas e perfil DES-IF escolhido no cliente.
- Exportações XLS/DOC contêm arquivos XLSX/DOCX renomeados; parametrização de portal/Webservice sem consumidor operacional.

**Ressalva:** Auditoria estática de 81 itens. CRUDs auxiliares persistidos/versionados contam para os requisitos de cadastro isolado, sem atestar integração ao processamento ABRASF. O CRUD auxiliar homônimo de instituição financeira não edita/exclui as instituições operacionais usadas nas declarações. Consultas de gestão limitam-se a 500 registros; painel principal usa até 100 lotes/apurações. Integração interna com TaxAssessment/TaxGuide foi reconhecida no item 66, apesar da conciliação Webservice simulada. Nos itens 69-73, PDF/TXT e consultas reais existem, mas o atendimento composto foi negado pela exigência literal de XLS/DOC. Nos itens 39/41, link de definição de senha não equivale ao recebimento da senha exigido no texto. Firebase e entrega de e-mail não homologados.

### CF29 — Declaração das Informações das Administradoras de Cartões

- Portal de equipamentos retorna objetos sem persistência nem edição completa.
- Não há aceite obrigatório demonstrado dos termos de responsabilidade de cartões.
- Declarações e DAM retornam dados aleatórios sem lançamento persistido; conta-corrente usa mockTransactions.
- Endpoint Webservice anunciado não localizado; relatório por natureza não consulta movimentação declarada real.

**Ressalva:** Auditoria estática de nove itens. Item 1 interpretado como inclusão/consulta/edição pelas pessoas físicas ou inscrições municipais habilitadas: há CRUD administrativo real, mas não fluxo persistido do contribuinte no portal. Se a banca admitir exclusivamente cadastro interno pelo servidor, esse item merece revisão. Item 9 reconhece o relatório compartilhado dos equipamentos persistidos. Item 2 avalia disponibilização de informações legais, não a correção jurídica do conteúdo.

### CF30 — Solução tecnológica para planejamento, governança e elaboração dos documentos das contratações públicas, destinada ao apoio técnico e operacional à fase de planejamento e à fase interna dos procedimentos de contratação

- O assistente chamado de IA usa templates e regras determinísticas; não foi localizada inferência de IA na fase interna.
- Tramitações sobrescrevem autor/despacho na versão e a auditoria genérica não identifica versão nem preserva cada transição integralmente.
- Gestão documental não demonstra apoio inteligente para classificação e recuperação.
- Conformidade legal integral, segurança/disponibilidade de produção e desempenho não ficam comprovados pelo descritor declaratório.
- Garantia é apenas texto no código e conta do aceite definitivo, não da ativação solicitada.

**Ressalva:** ETP, TR, DFD, consolidação do PCA, painéis e reaproveitamento de dados possuem implementações reais. No item 9, apoio inteligente foi interpretado como assistência por regras e preenchimento orientado, pois o texto não exige explicitamente inferência de IA; a interface foi inspecionada em código, sem validação visual. IA explícita do item 2 não foi considerada atendida por templates. TLS, SLA e contrato de licença externos não foram verificados.

### CF31 — Backup

- Backup integral de banco e arquivos, automático em nuvem, com retenção diária/mensal e logs horários.
- Comprovação de data center certificado, AES-256, serviço Windows e capacidade de 3 TB exigidos.

**Ressalva:** Não atendimento por ausência de solução/configuração comprobatória no escopo inspecionado. Snapshots de migração e cópias de PDFs não satisfazem o serviço completo. Não se afirma inexistência de backups gerenciados fora do repositório.

### CF32 — Serviço Data Center (Requisito Obrigatório)

- Comprovar ISO 27001/20000, SLA 99,6%, redundância, recuperação, segurança física/virtual e suporte 24×7.
- Completar serviço de backup, monitoramento pela entidade, licenciamento, plataforma desktop via web e subdomínios/certificado wildcard exigidos.

**Ressalva:** Infraestrutura parcialmente externa ao código. Hospedagem Vercel e domínio ativo confirmados pela CLI; garantias contratuais, certificados e configurações de nuvem ausentes da evidência disponível são classificados não atende, sem inferir que o provedor não os oferece.

### CF33 — Registro de Atos Administrativos e Textos Legais (web)

- Importação do banco existente consome tabela intermediária LegacyLegalTextSource e GED local; não foi localizado conector que leia o banco do aplicativo anterior e alimente automaticamente a origem.
- Na importação GED, ausência de texto extraído é substituída pela ementa/título, sem garantir íntegra do texto importado.

**Ressalva:** Resultado: 14/15. Associação/consulta considera relações nos dois sentidos e links para os atos relacionados. Armazenamento de arquivos foi examinado tanto no GED/Blob quanto em tabela de blobs no banco. Disponibilidade das migrações e infraestrutura não foi verificada no banco. A extração inicial anexava seções administrativas ao item 15; isso foi corrigido na consolidação da fonte. Foi auditada apenas a oração funcional do requisito 15, preservando o denominador de quinze itens.

## Integridade e alterações

- Cobertura conferida: 33 módulos, 2.661 IDs únicos, nenhum requisito omitido ou duplicado; decisões restritas a atende/não atende e referências verificadas documentalmente.
- Revisão cruzada corrigiu falsos negativos de CF05.35 e CF05.165: o fluxo IRRF_ANUAL de produção atende os documentos anuais, embora a central de relatórios POC use fontes demonstrativas. CF05.131 permanece não atendido por DIRF/RAIS. CF14.64 foi reclassificado como não atende por total incorreto de entradas/retornos no relatório emitido.
- Enunciados textualmente iguais foram confrontados: os itens CF09.6/31/50/103 tratam de declarações diferentes (DES-IF, DMS e cartórios); a divergência de classificação decorre dos fluxos específicos, não de contagem inconsistente.
- A auditoria não executou alterações de banco/schema, nem alterou telas, tabelas visuais ou fluxos. Correções eventualmente necessárias estão descritas como lacunas, não implementadas por esta revisão.
- Corte de código inclui a padronização de matrículas e a correção de serialização do dashboard em `aeaf772b`. Build completo desse corte aprovado. Deployment de produção `dpl_7N2pKrVQkyF3CPc1aBppzaoPrjgQ`, READY, SHA confirmado pela API Vercel.
- Hash SHA-256 do documento-fonte: `79333343c6cbf63186c9fadc5f631ae413125beef22c9daddee68fb2cd8aec8f`.

## Limpeza e publicação

- [Comparação posterior com branches e previews](ANALISE_PREVIEWS_FORA_MAIN_2026-11-09.md): foi localizado código exclusivo de CF26/CF29/CF31/CF32 em preview. A inspeção encontrou bloqueios funcionais que impedem aumentar as notas apenas pelo merge; os percentuais deste relatório continuam referidos ao código da main auditado.
- Limpeza autorizada concluída após a geração e entrega deste relatório: 1.852 arquivos removidos, 989,9 MB retirados; `docs` passou de aproximadamente 1,05 GB para 66 MB. [Detalhes e recuperação](LIMPEZA_DOCUMENTACAO_2026-11-09.md).
- O deployment do código auditado está em produção e `/api/health` respondeu HTTP 200, com banco disponível. A navegação autenticada pós-correção do dashboard permanece pendente: a credencial de teste não estava disponível nesta retomada. [Registro das matrículas e publicação](rh-matriculas-padrao.md).
