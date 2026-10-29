# Lote de tabelas — Saúde e Portal do Servidor

Data: 29/10/2026. Referências lidas: `AGENTS.md`, `docs/TABELAS_CONTRATO_EXECUCAO.md`, `docs/Padrão de Tabelas.md`, plano, inventário e guias instalados de Server/Client Components e Layouts/Pages do Next.

## Resultado e significado dos estados

- **42/42 estruturas com adaptação de código:** 27 de Saúde e 15 do Portal do Servidor, incluindo as duas grades de detalhe de Saúde e as duas variantes de férias/afastamentos.
- **Grade adicional de edição clínica concluída:** `AdministrationForm`, associada ao baseline `saude/atendimentos/[id]/complementos/AdministrationForm.tsx:9:1758`; evidência específica na seção C01 abaixo, sem somá-la novamente às 42 estruturas operacionais.
- **59 configurações de colunas verificadas em Chromium em 1280×720**, com área útil de 1224px. Essa primeira suíte verifica configuração/renderer, não certifica todos os wrappers. A revisão final C02 acrescenta **28 composições de componentes reais e 104 observações** com header/sidebar reais em dois notebooks e tablet. Nenhuma dessas contagens representa homologação autenticada de todas as rotas.
- **API comum disponível, typecheck direcionado aprovado.** A dependência antiga de B01 foi resolvida pela central. Os arquivos compartilhados continuam sendo reserva do executor principal e não foram alterados pelo lote.
- Manifesto `src/components/app-ui/operational/modules/saude-servidor.ts`: **29 rotas de Saúde + 14 do Portal**, sem registrar formulários/detalhes por wildcard. O helper de Saúde continua contado uma só vez, apesar de seus 12 consumidores.

## Implementação

Todos os corpos tabulares inventariados passaram a consumir `OperationalTable`, diretamente ou pelos adaptadores locais `HealthReadTable`/`PortalOperationalList`. A composição consome `OperationalListFrame`; paginação de rota usa `OperationalLinkPagination`, coleções legitimamente carregadas usam `OperationalPagination`. O tamanho é `OPERATIONAL_PAGE_SIZE`; fonte, linha, larguras, detalhes por overflow e identificação do dispositivo pertencem à base comum (13px/24px a 100%). Não foram criados CSS de tabela ou algoritmos de resize locais.

As configurações de domínio ficam nos consumidores e usam `healthColumn`/`portalColumn`: cada chamada declara largura inicial e mínima; ações/seleção têm limites utilitários explícitos. Nenhuma coluna recebe ocultação responsiva na renderização operacional. Os antigos metadados `responsive` do helper permanecem compatíveis com os consumidores, mas não ocultam campos.

`HealthPageTools` transporta operações e contexto para o header através da sobreposição comum. `HealthListRegion` tem slots explícitos: lista primeiro, contexto complementar depois. As consultas e formulários de domínio continuam no servidor; não há introspecção do DOM para converter dados/tabelas.

### Revisão após a auditoria independente

- Removidas as alturas `h-[calc(100dvh-7.5rem)]` dos 12 hosts operacionais de Saúde e os ancestrais de recorte das listagens client. O dimensionamento vem do flex do workspace; o lote não depende de um override global de `PageFrame` para recuperar a altura.
- Agenda: busca avançada e chamada no header; `AgendaEngineClient` passa a renderizar suas ferramentas no header, mantendo o componente e seus rascunhos montados fora das sobreposições. Cronogramas, esperas e chamada têm painéis próprios com 20 registros por página, preservando os conjuntos carregados. Motivos de bloqueio são controlados por ID e persistem ao mudar de página e fechar/reabrir os painéis.
- Vacinação: navegação removida da faixa acima da tabela. Farmácia: entradas e aprovação também retiradas da região da listagem. Mensagens de operação de Catálogo/Grupos/Agendamentos/Laboratório/Agenda/Acolhimento/Atendimentos não geram mais filhos extras no grid de três faixas.
- `HealthReadTable` deixou de criar um workspace aninhado com altura percentual e provider herdado. Os detalhes de S08/S12 usam `OperationalTablePanel`, que fornece `OperationalSurface`, header local de 36px, provider e host de ações próprios. O painel ocupa `100dvh`, sem o desconto antigo de `90dvh`.
- Retirados padding/gaps dos wrappers operacionais de Aniversariantes, Emissões, Demonstrativos e Protocolos do Portal. Ações administrativas foram agrupadas em sobreposições para também manter o header dentro da largura do notebook.
- Relatórios mantêm todas as colunas. O mínimo por campo passa a `max(40, min(110, floor(1200 / N)))`, com detalhes integrais de cabeçalhos/células da base; não há redução de fonte ou descarte de campos. A variante sintética com **21 colunas** declarou 1197px e foi renderizada integralmente na área de 1224px. Distribuição por município preserva valores, percentuais e barras em painel próprio paginado.
- Política atual autorizada pelo proprietário: **scroll em tablet e celular; nunca em notebook/desktop**. O lote consome a política central por dispositivo, sem acrescentar breakpoints que liberem scroll desktop.

Além das 42 estruturas do inventário-base, a revisão organiza quatro superfícies auxiliares antes em cartões/gráfico: chamada, cronogramas, espera e distribuição por município. Elas estão identificadas como auxiliares, sem aumentar artificialmente a contagem original de cobertura.

No Portal, `PortalLayoutShell` usa `useOptionalOperationalWorkspace`: entrega os filhos quando a central fornece o workspace e mantém `EmployeePortalShell` nas demais rotas. A verificação de sessão/vínculo funcional no layout servidor permanece. Os links de Portal institucional/Minha senha continuam disponíveis no header operacional. O menu Saúde foi extraído, sem mudar destinos ou `exact`, para `saude/navigation.ts`; o manifesto reutiliza ambos os menus existentes.

## Saúde — 27 estruturas

Base dos arquivos: `src/app/app-domain/saude/`. Todas as linhas abaixo têm verificação estática ESLint e revisão do recorte; homologação funcional/visual depende de B01 e da matriz ao final.

| ID | Estrutura/arquivo | Rota ou variante | Colunas e comportamento preservado | Origem e paginação | Estado |
|---|---|---|---|---|---|
| S01 | `acolhimento/AcolhimentoClient.tsx` | `/saude/acolhimento` | Chegada, paciente, origem, unidade, risco, queixa, ações. Demanda espontânea, acolher/chamar e restrição ao profissional ativo preservados. | Coleção recebida; ordenação por risco/chegada antes do recorte local 20; página limitada ao total atual. | Implementada |
| S02 | `administracao/AccessTab.tsx` | `/saude/administracao?aba=acessos` | Usuário, e-mail, pessoa, CPF, perfil, escopo integral, situação, edição. Gráfico de utilização em contexto; senha/links no header. | Página do servidor, sem segundo recorte; pai administra paginação 20. | Implementada |
| S03 | `administracao/CatalogTab.tsx` | `aba=especialidades`, `servicos`, `cbo` | Código, descrição/ocupação, classificação quando serviço, situação, editar/ativar. | Página do servidor; pai 20. Variantes conservam seus writers e DTOs. | Implementada |
| S04 | `administracao/documentos/DocumentsClient.tsx` | `/saude/administracao/documentos` | Documento, categoria, módulo, situação, visualizar/assinar. Upload, reautenticação, PDF, versões e assinatura preservados. | GET/total/offset existentes; frame e filtros na página; servidor 20. | Implementada |
| S05 | `administracao/GroupsTab.tsx` | `aba=grupos` | Grupo, especialidades, serviços, situação, editar/ativar; vínculos integrais. | Página do servidor; pai 20. | Implementada |
| S06 | `administracao/HolidaysTab.tsx` | `aba=feriados` | Data UTC, feriado, tipo, descrição, edição. | Página do servidor; pai 20. | Implementada |
| S07 | `administracao/importacoes/ImportHistory.tsx` — histórico | `/saude/administracao/importacoes` | Origem, competência, data, registros, situação, detalhes. ImportPanel em operações; sem novo limite de consulta. | Coleção carregada pela origem; recorte local 20. | Implementada |
| S08 | Mesmo arquivo — inconsistências | Painel da carga | Linha, entidade, motivo integral. `OperationalTablePanel` com provider/header local; informa quantidade carregada/total. | Recorte da origem preservado; paginação local 20. | Implementada; painel 20+1, foco e corpo de 624px verificados em Chromium |
| S09 | `administracao/laboratorio/LaboratoryClient.tsx` | `/saude/administracao/laboratorio` | Laboratório, unidade, início/fim coleta, início/fim vigência, situação, visualizar/alterar; configuração e detalhes preservados. | Repositório existente recebe página; frame pai com GET e total, 20. | Implementada |
| S10 | `administracao/PeopleTab.tsx` | `aba=pessoas`, `empresas` | Pessoa/razão, CPF/CNPJ, contato/vínculos ou fantasia/código, situação, detalhes. Cadastro único e diálogos mantidos. | Página do servidor; pai 20. | Implementada |
| S11 | `administracao/procedimentos/ProcedureCatalog.tsx` — catálogo | `/saude/administracao/procedimentos` | Código, descrição, grupo, complexidade, competência, situação, detalhes. | GET e consulta Drizzle existentes; servidor 20. | Implementada |
| S12 | Mesmo arquivo — versões | Painel das versões | Competência, situação, origem e arquivo separados, valores integrais. `OperationalTablePanel` com provider/header local, a partir do detalhe. | Coleção de versões recebida; recorte local 20. | Implementada; painel 20+1 e corpo de 624px verificados em Chromium |
| S13 | `administracao/ProfessionalsTab.tsx` | `aba=profissionais` | Profissional, CPF, CNS, especialidade, situação; detalhes, vínculos, edição e motivo de inativação mantidos. | Página do servidor; pai 20. | Implementada |
| S14 | `administracao/SchedulingGroupsTab.tsx` | `aba=agendamentos` | Grupo de agendamento, unidade, grupo de especialidades, situação, ações. | Página do servidor; pai 20. | Implementada |
| S15 | `administracao/unificacoes/UnificationsClient.tsx` | `/saude/administracao/unificacoes` | Tipo, destino, responsável, data, resultado integral. Comparação/confirmação e seleção origem/principal permanecem. Paginação de candidatos separada do histórico. | Consulta original limita histórico aos últimos 20; isso é identificado como recorte, sem inventar total histórico. | Implementada |
| S16 | `administracao/UnitsTab.tsx` | `aba=unidades` | Unidade, tipo, CNES, telefone, situação, detalhes/edição/ativação. Turnos, habilitações e histórico mantidos nos detalhes. | Página do servidor; pai 20. | Implementada |
| S17 | `agenda/AgendaClient.tsx` | `/saude/agenda` | Data/hora, paciente, unidade, profissional, especialidade, situação; ações em menu compacto. Confirmação, chegada, falta, cancelamento com motivo e vacinação mantidos. | Busca/filtro anteriores ao recorte local 20; criação e refresh preservados. | Implementada |
| S18 | `atendimentos/AtendimentosClient.tsx` | `/saude/atendimentos` | Data, tipo, paciente, unidade, profissional, desfecho, abrir prontuário. Início/autoria/elegibilidade mantidos em operações. | Busca/tipo antes do recorte local 20. | Implementada |
| S19 | `equipes/EquipesClient.tsx` | `/saude/equipes` | Equipe, código, microárea, unidade, situação, ações. Confirmações e formulário inalterados. | Busca antes do recorte local 20. | Implementada |
| S20 | `HealthSimpleListClient.tsx` | 12 consumidores abaixo | Configuração por consumidor; sem ocultação, acesso integral comum e busca/filtro compatíveis. Extras GET agora são enviados também no formulário de busca, não somente na paginação. | Mantém página/total do servidor; fallback local somente sem serverPagination. Sempre 20. | Implementada |
| S21 | `pacientes/PacientesClient.tsx` | `/saude/pacientes` | Nome, CPF, CNS, nascimento, situação, ações. Nascimento/sexo em filtros; criação, inativação/exclusão e destino de edição preservados. | Nome/CPF/CNS/nascimento/sexo antes do recorte local 20. | Implementada |
| S22 | `producao/laudos/page.tsx` + `TreatmentReportsTable.tsx` | `/saude/producao/laudos` | Seleção, paciente, unidade, situação, identificação manual de pagamento, número, abrir. Autorização coletiva, faixas, órgãos e configuração preservados. | Consulta 30 → constante 20, mesmas condições/joins; seleção client com hidden inputs associados ao mesmo `bulk-authorization`, inclusive outras páginas; escopo reinicia ao trocar AIH/APAC. | Implementada; seleção de páginas 1/2 e FormData com os dois IDs verificados em Chromium (B04) |
| S23 | `producao/previas/page.tsx` | `/saude/producao/previas` | Origem, identificador integral, paciente, código e procedimento, unidade e profissional separados, quantidade, valor, situação, fato. Grupos, consumo e exportações integrais mantidos no contexto. | Dataset analítico existente intacto; recorte 100 → constante 20. | Implementada; mínimos largos (B03) |
| S24 | `profissionais/ProfissionaisClient.tsx` | `/saude/profissionais` | Nome, especialidade, conselho, número, situação, ações e confirmações. | Busca antes do recorte local 20. | Implementada |
| S25 | `relatorios/HealthReportsClient.tsx` | `/saude/relatorios` e tipos do catálogo | Todas as chaves dos resultados, sem limitar aos primeiros sete campos. Texto integral, CSV/XLSX/PDF/print, permissão e filtros mantidos. **Tabela aninhada eliminada**. Distribuição em painel próprio, preservando barras. | Prévia completa do endpoint, recorte local 20. Versão de requisição invalida respostas antigas ao trocar relatório/filtros; estados loading/error/retry. | Implementada; 21 colunas e distribuição 20+1 verificadas em Chromium |
| S26 | `tfd/laudos/page.tsx` | `/saude/tfd/laudos` | Paciente, unidade, destino, versão, diagnóstico, situação, processo. Relatório CSV e seus filtros preservados. | Consulta 30 → constante 20; condições/escopo/joins originais. | Implementada |
| S27 | `unidades/UnidadesClient.tsx` | `/saude/unidades` | Nome, tipo, CNES, telefone, situação, ações e confirmações. | Busca antes do recorte local 20. | Implementada |

### Consumidores de S20 — sem multiplicar a estrutura

Os arquivos foram inspecionados individualmente. Mantêm queries/DTOs/actions e usam a mesma definição de tabela:

| Rota | Campos configurados/origem | Adaptação de composição |
|---|---|---|
| `/saude/centro-especializado` | Paciente, unidade, equipe, início, consultas, último registro, situação; Drizzle servidor 20. | Operações no header. |
| `/saude/farmacia` | Produto, estoque, lote, validade, saldo, situação; `readPharmacyStockPage`. | Cadastros/operações no header; entrada/recebimento e recortes preservados. |
| `/saude/laboratorio` | Paciente, exame, coleta, agenda, prioridade, etapa; Drizzle servidor 20. | Operações e laudos complementares em contexto. |
| `/saude/prestador` | Guia, paciente, serviço, situação; escopo do prestador/redirect preservados. | Realização e histórico em contexto. |
| `/saude/producao` | Data, origem, procedimento, CID, unidade, município, quantidade, competência, situação. | Operações, filtros excedentes e arquivos no header; extras GET preservados. |
| `/saude/pronto-atendimento` | Chegada, paciente, unidade, espera, prioridades, sala, destino, situação. | Recepção/risco/leitos/observação em operações. |
| `/saude/regulacao` | Protocolo, paciente, unidade, especialidade/serviço, prioridade, situação, guia, cota. | Operações e cotas em contexto; validação de guia mantida. |
| `/saude/sisab` | Ficha, cidadão, unidade, competência, situação. | Fichas/operações e lotes em contexto; downloads preservados. |
| `/saude/territorio` | Data, família/domicílio, equipe, ações, pessoas, situação. | Operações no header; **removido slice(0,60)** do valor tabular das ações para permitir leitura integral. |
| `/saude/tfd` | Data, origem, destino, veículo, condutor, lotação, situação. | Solicitações, passageiros, dupla custódia e viagens preservados em operações. |
| `/saude/vacinacao` | Data, paciente, vacina, profissional, unidade, dose, lote. | Aplicação, frascos/perdas e envio e-SUS preservados; redirect por paciente mantido. |
| `/saude/vigilancia` | Estabelecimento, documento, CNAE, risco, alvará, situação. | Operações e denúncias/inspeções em contexto. |

## Portal do Servidor — 15 estruturas

Base: `src/app/app-domain/portal-servidor/`. Autorização funcional, política de publicação/revogação de folha e identidades das consultas foram mantidas. Valores Decimal são formatados no servidor antes da fronteira client.

| ID | Arquivo / rota | Colunas e preservação | Origem / paginação | Estado |
|---|---|---|---|---|
| P01 | `aniversariantes/page.tsx` | Nome, dia/mês; ativação pelo RH, mês, fundamento e relatório próprio preservados. | Coleção autorizada; recorte 20, rota preserva month. | Implementada |
| P02 | `banco-horas/page.tsx` | Data, matrícula, horas, escopo, operação, fundamento, origem; créditos/débitos/saldo e observação continuam no contexto. | Drizzle servidor 20, contractId/scope preservados. | Implementada |
| P03 | `beneficios/page.tsx` | Benefício, tipo, valor vigente, concessão; valor customizado/base e filtro de ativos mantidos. | Drizzle servidor 20; q/limpar preservados. | Implementada |
| P04 | `capacitacao/page.tsx` | Curso, inscrição, situação, comprovante/certificado condicionado à conclusão. Cursos e inscrição continuam acessíveis no header. | Coleção autorizada; recorte 20 de participações, sem reduzir catálogo de cursos. | Implementada |
| P05 | `consignacoes/page.tsx` + `ConsignmentList.tsx` | Parcela, competência, valor BRL, situação. Contrato/matrícula/escopo/consignatária/rubrica em contexto e seletor de contrato. Cancelamento/lançamento/reserva mantidos. | Contratos continuam paginados no servidor 20 com q; parcelas integrais dos contratos carregados recebem paginação local 20 independente. Navegação de contratos no contexto. | Implementada |
| P06 | `demonstrativos/page.tsx` | Competência, matrícula, bruto, descontos, líquido, PDF integral; atalhos preservados no header. | Drizzle servidor 20; filtro competência e publicação oficial/liberada/não revogada intactos. | Implementada |
| P07 | `documentos/page.tsx` | Documento, tipo, situação, solicitação; somente assinaturas do próprio servidor. | Drizzle servidor 20; q/status/limpar preservados. | Implementada |
| P08 | `emissoes/page.tsx` | Documento, tipo, ano, liberação, emitir versão integral. | Coleção autorizada, filtro antes do recorte 20; kind/year preservados. | Implementada |
| P09 | `ferias/page.tsx` — férias | Início/fim aquisitivo, início/fim gozo, dias, situação. | Drizzle servidor 20; view/status, ordenação e datas UTC preservados. | Implementada |
| P10 | Mesmo arquivo — afastamentos | Início, término, situação; navegação para férias mantida. | Drizzle servidor 20, consulta distinta sem misturar totais. | Implementada |
| P11 | `ficha-funcional/page.tsx` | Data, tipo de ato, número, arquivo; dados e indicadores funcionais em resumo integral no contexto. | Drizzle servidor 20; perfil e atos continuam restritos ao empregado. | Implementada |
| P12 | `folha/page.tsx` | Competência, tipo/situação folha, evento, código, referência, tipo evento, valor; campos antes empilhados separados. Totais **da página** explicitamente mantidos no contexto. | Drizzle servidor 20; conciliação com demonstrativos liberados, filtro competência e configuração RH mantidos. | Implementada |
| P13 | `licenca-premio/page.tsx` | Matrícula, início/fim aquisitivo, dias, operação, tipo, início solicitado, fundamento; saldo e ressalva da pecúnia no contexto. | Serviço existente pagina 20; scope/contractId/periodStart preservados. | Implementada |
| P14 | `ponto/page.tsx` | Data, entrada, saída, horas, extras, banco, situação, sem esconder campos. | Drizzle servidor 20; month, UTC da data e fuso São Paulo das horas mantidos. | Implementada |
| P15 | `protocolos/page.tsx` | Protocolo, serviço, abertura, tramitação, setor, decisão, execução, pendência, abrir. Complementação solicitada continua explícita. | Drizzle servidor 20; status, parsing do payload e processos vinculados preservados. | Implementada |

## Integração e limites verificados

### B01 — API comum resolvida

A revisão foi executada com Next 16.4.3 e dependências restauradas. `OperationalListFrame`, `OperationalTablePanel`, `OperationalSurface`, o hook opcional e as extensões de `OperationalTable` estão disponíveis. **234 arquivos de entrada, zero diagnósticos** no TypeScript direcionado. O manifesto e os dois módulos foram verificados contra os tipos reais; não há mais bloqueio de imports da rodada anterior. Integração/build completos e autenticação real continuam com a central, conforme a reserva de execução.

### B02 — orçamento vertical e diálogos

A base exige `(20 + 1) × 24 = 504px` de corpo+cabeçalho da tabela, além da faixa de 32px e rodapé de 28px. Na fixture Chromium de **1280×720**, as 59 configurações declaradas tiveram **1224×624px de corpo**, linhas de 24px e fonte computada de 13px. A linha 20 terminou em y=572; o corpo em y=692; o rodapé em y=720. Os painéis S08/S12 também entregaram corpo de 624px, sem herdar o host de ações global.

Em desktop 1280×590, o corpo não comporta 504px: foi verificado o estado de conflito, sem liberar scroll ou reduzir a fonte/quantidade. A primeira suíte também exercitou a política de identificação tablet/celular, mas não é usada como evidência de largura mobile: sua HTML não tinha meta viewport e o navegador podia usar layout de 980px. C02 corrige essa limitação e mede tablet com **innerWidth=768 e innerHeight=1024**, sem criar exceção de scroll para computador com janela estreita.

### B03 — mínimos horizontais reais de configuração

Exemplos de somas declaradas a 100%, também exercitadas na área útil de 1224px:

| Estrutura | Soma mínima configurada |
|---|---:|
| S21 Pacientes | 646px |
| S17 Agenda com ações | 693px |
| S26 Laudos TFD | 740px |
| P12 Folha | 745px |
| S22 AIH/APAC | 765px |
| S02 Acessos | 768px |
| P13 Licença-prêmio | 780px |
| P15 Protocolos | 862px |
| S23 Prévias | 1.065px |

As 59 configurações estáticas e variantes dos consumidores não excederam 1224px de mínimos. Não há configuração do lote exigindo 1500px para notebook. Prévias/Protocolos podem usar scroll em tablet conforme a autorização atual. Relatórios usam o mínimo por campo descrito na revisão; a fixture com 21 campos exige 1197px e mantém todos os campos e seus detalhes. Preferências continuam revalidadas pela distribuição central.

### B04 — homologação funcional de seleção

S22 foi exercitado em Chromium atualizando as props paginadas na mesma instância client: selecionar Paciente 1, ir à página 2, selecionar Paciente 21, submeter o formulário associado e voltar à página 1. O `FormData` contém exatamente `report-1` e `report-21`, sem duplicação; a primeira seleção continua marcada. Nenhuma action real foi invocada. O serviço de autorização permanece a autoridade para elegibilidade, escopo, faixa e numeração.

Os rascunhos da Agenda também foram verificados: vagas preenchidas sobrevivem ao fechamento/reabertura das ferramentas; motivo de bloqueio sobrevive à ida/volta da paginação e ao fechamento/reabertura tanto do painel como da sobreposição que o contém. Não há alteração das assinaturas ou retornos das actions.

### B05 — histórico do handle da base comum; resolvido pela central

Na primeira suíte, **27 das 59 configurações** apresentaram 12px de excedente quando a última coluna era redimensionável (`right: -12px`). O achado foi comunicado à central, com todas as células e rodapé dentro dos limites; o único controle excedente era o handle final.

A base atual contém regra específica para o último handle (`right: 0`, largura de 12px). Em C02 não houve excedente de `scrollWidth` nos notebooks nem controles de header/toolbar/footer fora dos limites nas composições medidas; `baseIssues` ficou vazio. A correção é da central: nenhum CSS/shared foi modificado pelo lote. Não foi repetida a varredura de 59 configurações apenas para reproduzir uma evidência já existente.

## Checks executados na revisão

```powershell
$files = @(git diff --name-only -- "src/app/app-domain/saude" "src/app/app-domain/portal-servidor")
$files += @(git ls-files --others --exclude-standard -- "src/app/app-domain/saude" "src/app/app-domain/portal-servidor")
$files += "src/components/app-ui/operational/modules/saude-servidor.ts"
node node_modules/eslint/bin/eslint.js @files
node --max-old-space-size=4096 "C:\Users\thiag\AppData\Local\Temp\opencode\saude-servidor-typecheck.cjs"
node "C:\Users\thiag\AppData\Local\Temp\opencode\saude-servidor-browser.cjs"
git diff --check -- "src/app/app-domain/saude" "src/app/app-domain/portal-servidor" "src/components/app-ui/operational/modules/saude-servidor.ts"
```

- ESLint próprio: **exit 0, zero erros e zero avisos**. A primeira varredura ampla também encontrou um aviso preexistente em `atendimentos/[id]/ClinicalAccessSwitch.tsx`, fora das estruturas deste lote; a checagem própria usa a lista Git dos arquivos alterados/novos, sem suprimir regras. `PacientesClient` passou a usar `router.push`, preservando o destino e eliminando o aviso da nova versão do Next no arquivo do lote.
- TypeScript direcionado: **234 roots, zero diagnósticos**. Usa opções reais de `tsconfig.json`, inclui `next-env.d.ts`, resolve dependências reais, verifica semântica dos dois módulos e manifesto; não executa o typecheck/build global.
- Chromium headless: **59 configurações de colunas**, 20+1 registros, fonte/linha/encaixe, filtros antes da paginação, feedback sem linha extra, painéis S08/S12 com header/provider local e retorno de foco, seleção e `FormData`, parcelas/contratos, relatório com 21 campos, distribuição com barras, rascunhos da Agenda e política tablet/celular/desktop. **Sem erros JavaScript.** Excedente de handle separado em B05.
- Fixtures usam componentes e CSS/Tailwind reais, com adapters de navegação e actions de teste. O bundler rejeita imports de banco; fetch de relatório é interceptado com dados sintéticos. Não há login, consultas de produção ou mutações.
- Artefatos reproduzíveis no diretório temporário aprovado: `saude-servidor-typecheck.cjs`, `saude-servidor-browser.cjs`, `saude-servidor-fixture.tsx`, `saude-servidor-columns.json` e `saude-servidor-browser-results.json` em `C:\Users\thiag\AppData\Local\Temp\opencode\`.
- `git diff --check`: **exit 0**, sem erros de whitespace; somente avisos do Git sobre conversão LF/CRLF.
- Busca estática nos dois módulos: nenhum `<table>`/`ErpTableContainer` restante; a tabela aninhada deixou de existir. Isso não substitui reconciliação do scanner central e não multiplica wrappers por rota.
- Tentativa adicional de contagem com `rg --count-matches`: executável `rg` indisponível no PowerShell. A conferência nominal foi repetida pela ferramenta especializada de busca, sem ocorrências; não há contagem de scanner certificada nesta frente.
- Não houve full build, acesso/mutação de banco, alteração de actions/permissões, commit ou push. Os recortes 30/100 que pertenciam às páginas tabulares foram ajustados a 20; recortes de origem (ex.: histórico recente/importação) e exportações permanecem identificados e preservados.

## C01 — grade baseline de insumos da administração clínica

Rota consumidora: `/saude/atendimentos/[id]/complementos`, chamada em `complementos/page.tsx:117`. O formulário clínico completo mantém sua composição própria; somente a coleção editável abre em `OperationalTablePanel`. Não foi registrada a página de várias áreas como listagem operacional de tela inteira.

- Arquivo: `saude/atendimentos/[id]/complementos/AdministrationForm.tsx`. Associação em `operationalEditingGrades` do manifesto, com owner `AdministrationForm`, renderer AST `OperationalTable` e preferenceId `saude-administracao-materiais`; o renderer fica dentro do painel com provider/header locais.
- Colunas: item, produto, estoque, lote, quantidade e remover. Larguras mínimas somam **610px**; fonte/linha, resize e leitura integral são os da base comum. Paginação usa `OPERATIONAL_PAGE_SIZE = 20`, sem reduzir o conjunto editado.
- `supplies` permanece no componente pai. Cada linha tem ID client estável; paginação, fechamento do painel, remoção/inclusão não reaproveitam rascunhos de outra linha. Ao remover na última página, a página efetiva é limitada ao novo total.
- Inputs das células são controlados pelo rascunho e não se tornam fonte de envio do formulário clínico. O hidden `materials` do pai serializa **todos** os insumos, mantendo a ordem e somente `materialId`, `warehouseId`, `batchNumber`, `quantity: Number(...)`. IDs client não entram no payload estrito da action. Nenhuma seleção fica condicionada a a célula estar montada.
- Dose, quantidade/data do medicamento, produto, lote, estoque e a opção de propriedade do paciente conservam os nomes e o contrato original de `FormData`. A action continua sendo `administerMedicationAction`; não houve alteração de assinatura, retorno, validação no servidor, queries ou transações.
- `validateAdministrationSupplies` percorre o rascunho completo no `onSubmit`: produto/estoque disponíveis, lote preenchido e quantidade finita de pelo menos `0.000001`, igual ao mínimo dos inputs anteriores. Uma linha inválida fora da página ou com painel fechado bloqueia o submit, identifica a linha/campo e seleciona a página para correção, preservando os demais campos clínicos.

**Situação:** implementada e verificada em testes unitários, tipos, AST direcionada e Chromium com componentes reais/dados sintéticos.

### Checks específicos de C01

```powershell
node --import tsx "src/app/app-domain/saude/atendimentos/[id]/complementos/administration-supplies.test.ts"
node node_modules/eslint/bin/eslint.js "src/app/app-domain/saude/atendimentos/[id]/complementos/AdministrationForm.tsx" "src/app/app-domain/saude/atendimentos/[id]/complementos/administration-supplies.ts" "src/app/app-domain/saude/atendimentos/[id]/complementos/administration-supplies.test.ts" "src/components/app-ui/operational/modules/saude-servidor.ts"
node --max-old-space-size=4096 "C:\Users\thiag\AppData\Local\Temp\opencode\saude-administration-typecheck.cjs"
node "C:\Users\thiag\AppData\Local\Temp\opencode\saude-administration-browser.cjs"
```

- **5 testes unitários aprovados**, incluindo payload de 41 linhas, limite decimal mínimo, quantidades não finitas/zero/negativas, catálogo indisponível, lote vazio fora da página e preservação do payload após remoção. O comando executa o arquivo diretamente porque o runner `--test` interpreta `[id]` como glob e pode produzir zero testes.
- **ESLint:** zero erros/avisos nos quatro arquivos de código do recorte.
- **TypeScript direcionado:** cinco roots (formulário, helpers, testes, manifesto e `next-env.d.ts`), zero diagnósticos, opções strict/dependências reais e sem emit. O check não repete o typecheck global da central.
- **Chromium 1280×720, sem workspace externo:** painel com provider próprio e corpo de **1280×624px**, 20 linhas na primeira página e uma na segunda, fonte 13px, linha 24px e sem overflow horizontal.
- **Teste de estado e validação:** 21 materiais preenchidos; quantidade inválida na linha 21; página 1 ativa e painel fechado; submit bloqueado sem chamada à action, preservando a dose `2 mL` e a quantidade do medicamento `2.25`. Ao reabrir, a página 2 e o campo inválido permanecem identificados. Produto/estoque/lote/quantidade da linha 21 são restaurados do estado do pai.
- **Teste de envio:** depois da correção, remover a primeira linha preserva o antigo material 21 com quantidade `4.5`; adicionar outro material gera nova identidade e aceita `0.000001`. Com o painel fechado, o `FormData` do pai e o argumento recebido pelo stub da action contêm os 21 insumos completos e todos os campos do medicamento, sem IDs client.
- **AST direcionada:** baseline/owner/target/renderer/preferenceId conferidos; chamadas reais ao painel e à tabela encontradas; não resta `supplies.map` produzindo a grade JSX antiga. Reconciliação strict global continua sob o executor principal, juntamente com os outros lotes.
- Artefatos temporários aprovados: `saude-administration-typecheck.cjs`, `saude-administration-browser.cjs`, `saude-administration-fixture.tsx` e `saude-administration-browser-results.json` em `C:\Users\thiag\AppData\Local\Temp\opencode\`. O bundler da fixture rejeita imports de banco e substitui somente a action por captura de `FormData`; nenhum writer real é executado.

## C02 — revisão visual final com componentes e wrappers reais

### Escopo da evidência

Esta rodada complementa a suíte de colunas: usa **`OperationalWorkspace` real**, seus menus reais de Saúde/Portal, sidebar, header, `SaudeLayout`/`ModuleShell`, `PageFrame`, `PageHeader`, `HealthPageTools`/`HealthListRegion`, `HealthReadTable`, `HealthSimpleListClient` e `PortalLayoutShell`/`PortalOperationalList`. Não foi criada uma cópia visual do workspace nem uma sidebar placeholder de 56px.

`HealthOperationalList` não é um componente existente nesta pasta: os adaptadores efetivos verificados são `HealthSimpleListClient` e `HealthReadTable`. Os renderers listados abaixo são importados dos arquivos reais do projeto. Os hosts de servidor que dependem de queries são compostos na fixture com o `PageFrame`/frame e controles representativos, sem executar a função de página ou seu carregamento de dados. **Não se afirma que todas as 43 rotas, todas as 390 tabelas globais ou todo parâmetro de servidor foram visualmente homologados.**

Limites deliberados da fixture: dados sintéticos com 21 registros, navegação Next e actions substituídas somente nas fronteiras, fonte sans de fallback **Arial** na variável `--font-inter` (sem baixar a fonte Inter pelo Next), `globals.css`/Tailwind/CSS Modules reais e meta viewport igual à saída mobile esperada. O bundler rejeita imports `@/db/**`. Não há autenticação, chamadas de domínio ou acesso a banco; `stubbedActions` permaneceu zero.

### Cobertura real de composição

| Grupo | Componente(s) renderizado(s), além do workspace real | Combinações |
|---|---|---:|
| Adaptador Saúde | `PageFrame` + `PageHeader` + `HealthPageTools` + `HealthListRegion` + `HealthSimpleListClient` | 1 |
| Agenda | `PageFrame` + ferramentas no header + `AgendaEngineClient` + `AgendaClient` | 1 |
| Cadastros assistenciais | `PacientesClient`, `EquipesClient`, `UnidadesClient`, `ProfissionaisClient`, cada um dentro do host real `PageFrame` | 4 |
| Atendimento | `AtendimentosClient` e `AcolhimentoClient` com suas ferramentas, registros, ações e hosts | 2 |
| Administração | `AdministracaoClient`, com abas unidades, profissionais, especialidades, grupos, serviços, CBO, agendamentos, feriados, pessoas, empresas e acessos; inclui seus componentes filhos reais | 11 |
| Importação | `PageFrame` + `ImportPanel` nas ferramentas + `ImportHistory`; detalhe e painel de 21 inconsistências reais | 1 |
| Procedimentos | `OperationalListFrame` + `ProcedureCatalog`; detalhe e painel de 21 versões reais | 1 |
| Apoio administrativo | `DocumentsClient`, `LaboratoryClient` e `UnificationsClient`, com frames/hosts representativos | 3 |
| Relatórios | `PageFrame` + `HealthReportsClient`, prévia sintética de 21 campos/21 registros e ações de saída reais | 1 |
| Portal do Servidor | `PortalLayoutShell` + `PortalOperationalList` em composições de protocolos e demonstrativos, e `ConsignmentList`; inclui atalhos do Portal no header | 3 |
| **Total** | **Componentes reais; não uma contagem de rotas autenticadas** | **28** |

Foram guardadas **104 observações**: 84 de composição principal (28 × 3 viewports), mais 20 de abrir/fechar ferramentas, expansão/recolhimento da sidebar, detalhes/painéis de Importação e Procedimentos e o painel C01. Após a aprovação das primeiras 27 composições (101 observações), somente Relatórios foi acrescentado e executado separadamente (+3), evitando repetir os casos já aprovados sem nova preocupação.

### Dimensões medidas após as correções

| Ambiente real do navegador | Header | Sidebar recolhida | Corpo da tabela principal | Fonte/linha | Resultado |
|---|---:|---:|---|---|---|
| Notebook **1280×720** | 36px | **56px** | **1224×624px** | 13px / 24px | 20 registros, colunas e rodapé contidos; sem scroll do documento/tabela |
| Notebook **1366×650** | 36px | **56px** | **1310×554px** | 13px / 24px | Corpo acima de 504px; registro 20 e rodapé acessíveis |
| Tablet **768×1024**, meta viewport presente | 36px | **56px** | **712×928px** | 13px / 24px | Política tablet reconhecida; scroll horizontal somente quando os mínimos exigem; controles de header/toolbar/footer contidos |

Os painéis completos de inconsistências e versões possuem provider/header próprios: **624px** de corpo em 1280×720, **554px** em 1366×650 e **928px** no tablet. A largura é a do próprio painel (1280/1366/768), sem descontar a sidebar que permanece no fundo. Abrir/fechar os painéis e as ferramentas não descontou altura adicional da listagem principal. Expandir/recolher a sidebar foi exercitado no adaptador Saúde; ao recolher, retornou aos 56px e à área útil original.

### Falhas reais encontradas e corrigidas nesta rodada

1. **Pacientes:** input de busca de 36px ultrapassava a toolbar de 32px (y=34 a 70, enquanto a faixa era y=36 a 68). Passou a usar o `searchInput` central de 28px, preservando busca e filtros.
2. **Configuração Laboratorial:** botão de detalhe de 28px aumentava todas as linhas para 28px. Em 1366×650, a última linha terminava em y=652, além do corpo em y=622. O botão agora tem 24px; as linhas reais ficaram em 24px e o registro 20 dentro do corpo.
3. **Agenda:** o trigger inline do menu de ações acrescentava espaço de baseline com a fonte sans, elevando a linha para **25,5px**. O menu passou ao wrapper `rowActions` central, sem alterar ações/permissões, e as linhas voltaram a 24px.
4. **Tablet:** rótulos nus de “Novo/Nova” vazavam dos botões compactados pela base para 28px. Equipes, Unidades, Profissionais, novo cadastro administrativo e adicionar material de C01 agora usam `newLabel`, ícone e nome acessível explícito; os rótulos visuais acompanham o comportamento compacto da base.

Somente DOM/classes/semântica acessível do lote foram ajustados. Não houve alteração de queries, payloads, actions, permissões ou base compartilhada. Nenhuma falha de base permaneceu nos cenários desta rodada (`baseIssues: []`); a antiga B05 não foi reproduzida com a regra atual do último handle.

### Checks e artefatos de C02

- **Chromium:** 104 observações aprovadas; zero falhas de geometria, zero controles de header/toolbar/footer excedentes, zero erros JavaScript. A verificação mede também a caixa do texto de botões no header, não somente o retângulo do botão.
- **Revisão de screenshots:** Pacientes, Agenda e Relatórios finais em 1366×650 foram inspecionados, além dos painéis e capturas administrativas/Portal. Os títulos de fixture identificam o cenário sintético; não são páginas autenticadas.
- **ESLint específico:** oito arquivos de componentes alterados nesta rodada, zero erros e zero avisos.
- Os testes lógicos e de payload já aprovados em C01 não foram repetidos: as mudanças atuais são apenas de apresentação.
- Não houve build, typecheck global, execução de Next ou manipulação de `.next`; o bundle isolado e todos os resultados ficam no diretório temporário aprovado.

Artefatos em `C:\Users\thiag\AppData\Local\Temp\opencode\`:

- `saude-wrappers-fixture.tsx` e `saude-wrappers-browser.cjs`.
- `saude-wrappers-results.json`: rodada final das 27 composições iniciais, 101 observações, sem falhas.
- `saude-wrappers-reports-results.json`: acréscimo isolado de Relatórios, três observações, sem falhas.
- Screenshots `saude-wrapper-*-1366x650.png`, incluindo `patients`, `agenda`, `reports`, `admin-acessos`, `portal-statements`, `portal-consignments`, e os painéis `import-panel`/`procedure-panel`.

Reprodução: `node "C:\Users\thiag\AppData\Local\Temp\opencode\saude-wrappers-browser.cjs"` executa hoje a composição consolidada das 28 variantes; passar um nome, por exemplo `reports`, executa somente aquele acréscimo. A suíte antiga de 59 configurações não é chamada por essa revisão.

## Homologação autenticada da central

A central mantém o build completo, integração e homologação autenticada das 43 rotas com os perfis e dados reais, incluindo exportações, ações de domínio e zoom. Os testes desta revisão comprovam os comportamentos isolados e as composições explicitadas, sem alegar certificação das permissões, do ORM ou de todas as tabelas globais por fixture. B05 foi resolvida na base; nenhuma regra de scroll desktop foi flexibilizada.
