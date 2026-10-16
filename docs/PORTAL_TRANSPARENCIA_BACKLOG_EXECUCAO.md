# Portal da Transparência — backlog de atualização T00–T09

Data: 12/10/2026. **Backlog com implementação parcial de acessos, consultas e biblioteca documental.**

Fechamento da execução e dependências de conteúdo/adoção: [PORTAL_TRANSPARENCIA_FECHAMENTO_T00_T09.md](PORTAL_TRANSPARENCIA_FECHAMENTO_T00_T09.md). Os checkboxes históricos abaixo preservam o aceite integral original; a tabela de fechamento distingue implementação entregue de homologação e fontes institucionais.

O fluxo implementado e as dependências de ativação estão em [Acessos e publicações](PORTAL_TRANSPARENCIA_ACESSOS_E_PUBLICACOES.md). As fases abaixo conservam os critérios de aceite integral; a entrega funcional não equivale à homologação de todas as integrações ou requisitos legais.
Atualização operacional: a carga das 136 fontes no Vercel Blob/banco configurados foi concluída nesta rodada. [Entrega funcional, roteiro e limites de integração](PORTAL_TRANSPARENCIA_TESTES_E_ENTREGA.md) é a referência atual para testes.

Referências: [mapa de atualização](MAPA_ATUALIZACAO_PORTAL_TRANSPARENCIA.md) e [matriz dos 58 itens de cada Poder](MATRIZ_PORTAL_TRANSPARENCIA_CHECKLIST.md).

## 1. Objetivo e limites da primeira entrega

Entregar uma apresentação básica **funcional**, semelhante à organização de Ibema, com Prefeitura/Câmara/consolidado e prioridade nas pesquisas/filtros/ordenações/detalhes do edital. API pública, PDFs/CSVs disponíveis e dados fictícios complementares podem compor cenários de apresentação, conservando a origem.

O escopo completo do edital permanece mapeado. Módulos nativos, biblioteca legal integral, PNTP e homologação de produção não são considerados entregues por um cenário visual/exemplificativo ou por importação da API de Ibema.

## 2. Contrato comum de consulta

### 2.1 Contexto e comportamento

- `governmentEntityId` ou chave pública equivalente, exercício e modo consolidado são o contexto. Código externo de entidade Elotech é outra referência, não o ID interno.
- Ao trocar entidade/ano, recalcular filtros e opções válidos, zerar apenas a paginação e manter contexto claro na URL/breadcrumb. Não transportar código de unidade de uma entidade para outra silenciosamente.
- Filtros declarados na consulta; normalização/validação server-side; ordenação permitida por colunas conhecidas com desempate estável; página/tamanho e total real.
- Aplicar entidade/período/filtros/ordenação **antes** de count, totais, paginação e exportação. Totais são do conjunto filtrado, não das linhas visíveis.
- Consulta vazia, categoria não adotada, fonte indisponível e dado não publicado são estados distintos. Zero financeiro não substitui nenhum desses estados.
- Detalhe usa chave pública que preserva entidade/exercício/registro/evento e links entre dados autorizados. Não expor chaves/URLs privadas apenas para habilitar drill-down.
- Cabeçalho da consulta apresenta fonte, corte/período, atualização do dataset, metodologia, total e formatos. A data de um arquivo não substitui a competência dos fatos.

### 2.2 Filtros e detalhes por família

| Consulta | Pesquisa/filtros necessários | Ordenação / detalhe |
|---|---|---|
| Receitas/tributos | Entidade/exercício, de/até ou competência, natureza/código/descrição/nível, fonte, tributo, classificação, previsto/atualizado/realizado/dedução | Código/data/descrição/valor; hierarquia e lançamentos/deduções, não dupla soma de pais/filhos |
| Empenhos | Entidade, exercício de origem, número inicial/final/específico, período de emissão ou movimento, credor/documento público autorizado, órgão/unidade/função/subfunção/programa/ação/natureza/fonte, procedimento/contrato/situação | Número/data/credor/valor; itens/unitário/total, histórico público, anulações, documentos e vínculos |
| Liquidações/pagamentos/RP | Datas próprias da etapa, origem do empenho, número/evento/ordem/NF, pagas/a pagar, exercício de inscrição RP, credor/classificações/fonte | Data/número/valor; evento, bruto/retido/líquido, estorno, saldo, ligação à etapa anterior |
| Pessoal/remuneração | Entidade/competência/tipo de folha; nome/matrícula; cargo/função/lotação/classe/natureza/regime/contrato/situação; faixas de valor; vigência estágio; categoria de cessão/inativo | Nome/matrícula/cargo/valor/datas; vínculo histórico e valores públicos agregados. Jornada semanal/horário só com fonte/unidade explicitamente definida |
| Vagas/padrão remuneratório | Cargo/categoria/regime/lei/data de referência, criadas/ocupadas/disponíveis, classe/faixa/vigência | Código/cargo/quantidade/valor; lei/plano e referência; pessoas e vínculos são contagens distintas |
| Diárias/ajudas | Beneficiário/cargo, data/período/destino/finalidade, autorização/empenho, situação da despesa, valor/quantidade | Nome/data/valor/destino; unitário/total e vínculo ao empenho, sem dados bancários/documentos pessoais |
| Licitações/compras diretas | Entidade/exercício, modalidade/categoria/natureza/lei/situação, número/processo/objeto, publicação/abertura, contratado/valor, adjudicação/homologação | Número/data/valor/objeto; itens/propostas/resultados/ata/edital/anexos públicos e procedimento da contratação direta |
| Contratos/convênios | Número/processo/contratado/objeto/tipo, vigência/situação, entidade/concedente/recebedor, fiscal, repasse/valor | Número/vigência/valor; íntegra/aditivos/fiscalização/execução/prestação e vínculos financeiros |
| Obras | Objeto/local/situação/contrato/fiscal, datas/cronograma/valor, fase/medição | Data/valor/percentual; itens/quantidades/preços unitários/totais/medições/documentos; físico e financeiro separados |
| Patrimônio/estoque/frota | Categoria/código/material/bem/veículo, unidade/local, data/período, entrada/saída/tipo/situação | Código/quantidade/valor/data; movimentos e bens publicáveis, sem documentos pessoais ou localização sensível não autorizada |
| Publicações/leis/contas/planos | Entidade/ano/competência, grupo/assunto/categoria, número/edição/título/texto, vigência/publicação/formato | Número/data/ordem; versão/hash/tamanho/formato/íntegra, árvore e ordenação de anexos |
| Catálogo de consultas | Texto, grupo/subgrupo, assunto/tags, entidade, disponibilidade e formatos | Título/ordem; abre consulta certa sem confundir busca do catálogo com busca dos seus registros |

## 3. Arquitetura e reutilização

| Componente proposto | Responsabilidade | Reutilização/atenção |
|---|---|---|
| Shell público de transparência | Identidade/entidade/ano, menu, busca, acessibilidade, breadcrumbs, contato e atalhos | `PortalShell`/componentes ERP e identidade da instância; evitar dois cabeçalhos e blocos repetidos |
| Catálogo de grupos/consultas | Publicação, campos/filtros/sort, hints/metodologia, formatos e fontes | Administração `TRANSPARENCIA`, modelos de publicação; conteúdo editorial não é query SQL livre |
| Adapters públicos de dados | DTO por categoria, entidade/período, contagem/totais/detalhes e origem | Financeiro/RH/Compras/Planejamento/etc.; corrigir fallbacks e rotinas atuais antes de reaproveitar o resultado |
| Provider de exemplos externos | Leitura configurada/coleta de API, normalização, cache/última atualização e falhas | OpenAPI Elotech, base com porta 8087, paging 0-indexed, headers por endpoint, filtros RSQL construídos internamente |
| Dataset fictício complementar | Casos ausentes, entidades/vínculos/documentos coerentes e marca de origem | Fonte/namespace próprio, exemplos não são eventos oficiais. Nunca acrescentar remuneração fictícia ao cadastro de pessoa real |
| Exportador público | Conjunto integral autorizado, mesmo filtro/sort, Decimal/centavos e formatos reais | Renderizadores tabulares/PDF existentes; proteção de fórmulas e nomes amigáveis; tirar `take:100` silencioso do contrato/licitacao |
| Biblioteca de publicação | Grupo/competência/versão/anexos/ordem/links, geração/upload/publicação/retirada | Padrão robusto `planejamento/publication.ts` e GED/hash de bytes; não usar hash da URL |
| Governança/acesso técnico | RBAC, rastreio, contador, inventário, IP administrativo e proteção seletiva | Auditoria nativa; projeções e documentos pessoais/clinicos não herdam publicidade automaticamente |

Modelos e migrations futuros devem ser aditivos e definidos após inventário de consumidores. Descrever consultas por contratos/adapters conhecidos, nunca oferecer SQL/RSQL arbitrário a um navegador ou a editor editorial. Camada pública acessa DTOs permitidos, não tabelas inteiras por cliente.

## 4. Fases e tarefas

As tarefas abaixo conservam seu aceite integral; várias receberam implementação parcial nesta rodada. Foram implementados o endereço público institucional, gestão/configurações/upload PDF em lote, estados rascunho/publicado/retirado, download privado mediado com SHA-256, catálogo e contrato de pesquisa/ordenação/paginação/CSV completo/JSON. Configuração efetiva, carga de PDFs, integração das fontes e aceite completo de cada fase ainda exigem conclusão.

### T00 — cobertura, entidades e fontes de exemplo

- [x] T00-01 — Consolidar matriz TP-001–058 e os nove detalhes de pessoal; preservar referências/páginas do descritivo. **Levantamento documental concluído nesta rodada; não é implementação das consultas.**
- [ ] T00-02 — Obter e versionar cartilha/matriz PNTP 2026 e desdobrar critérios Executivo/Legislativo; não omitir áreas setoriais ou critérios específicos da Câmara.
- [ ] T00-03 — Configurar Prefeitura/Câmara, identidade, códigos e correspondências de entidade/unidade. Confirmar a fonte/código da Câmara; não assumir entidade 2.
- [ ] T00-04 — Definir providers `API`, `DOCUMENTO`, `NATIVO`, `EXEMPLO` e chaves de origem; planejar cache/coleta/corte/hash e indisponibilidade.
- [ ] T00-05 — Selecionar amostras API/PDF/CSV e casos fictícios complementares; inventário de fonte/competência, sem carga de dados reais no livro financeiro como efeito colateral da apresentação.

**Aceite:** exemplos têm procedência e entidade corretas; nenhum total/informação fictícia é atribuído a pessoa real ou a contas oficiais. Escopo de PNTP é identificado, mesmo que ainda não executado.

### T01 — estrutura visual e catálogo público semelhante a Ibema

- [ ] T01-01 — Shell com entidade/ano/consolidado, identidade, menu temático, busca de consultas, e-SIC/ouvidoria/Radar e estado da fonte.
- [ ] T01-02 — Grupos/subgrupos, consultas habilitadas, ordem, ano inicial, hints e contatos/horários; CRUD administrativo protegido.
- [ ] T01-03 — Modelar aviso com imagem, vigência, entidade, frequência de exibição e fechamento; não duplicar banners editoriais.
- [ ] T01-04 — Mapa do site do catálogo publicado e navegação sem links mortos/duas faixas de menu.

**Aceite:** cidadão localiza consulta e troca contexto sem misturar dados; mobile e teclado funcionam; administração não é liberada ao cidadão.

### T02 — pesquisas, filtros, ordenação e exportações

- [ ] T02-01 — Contrato de filtros por família, entity/year/período/opções e validação server-side.
- [ ] T02-02 — Busca combinada, aplicar/limpar, URL compartilhável, ordenação estável por código/nome/data/valor e paginação real.
- [ ] T02-03 — Totais integrais e detalhe autorizado por registro/evento; corrigir atualização que hoje representa só a página.
- [ ] T02-04 — CSV/JSON completos; PDF/planilha/impressão e DOC/JPEG/TXT conforme escopo do edital, usando renderer específico para cada formato solicitado.
- [ ] T02-05 — Dicionário/layout/formato, interpretação de campos e metadados de período/fonte/corte.

**Aceite:** resultado de filtros/sort, total da tela e arquivos coincidem; exportação não se limita à página nem 100 registros; simular pelo menos 125 registros e páginas intermediárias.

### T03 — execução, orçamento e painéis

- [ ] T03-01 — Corrigir programa/ação/função/subfunção reais e indicação de ausências; remover valores/classificações fictícios dos fallbacks atuais.
- [ ] T03-02 — Emitido→liquidado→pago com dados próprios da etapa, anulações, bruto/retido/líquido, saldo e RP por exercício de origem/movimento.
- [ ] T03-03 — Receitas/tributos/previsão inicial/atualizada/deduções/arrecadação e recursos recebidos, sem soma de hierarquia ou acumulados.
- [ ] T03-04 — Dashboard semelhante às capturas: receitas/despesas mensais, repasses, pessoal/Saúde/Educação, fórmulas e tabela equivalente aos gráficos.
- [ ] T03-05 — Consolidação por entidade/escopo com eliminação de fluxos internos quando aplicável; reconciliação Decimal/centavos e origem das diferenças.

**Aceite:** casos julho/agosto preservam competência; empenho não é pagamento; consolidado não duplica repasse Prefeitura→Câmara; cada indicador indica metodologia e fonte de exemplo/nativa.

### T04 — pessoal, remuneração, vagas, diárias e concursos

- [ ] T04-01 — DTO nominal básico específico e parametrizado, incluindo agentes/servidores/estagiários/autônomos, filtros de tipo/competência e histórico.
- [ ] T04-02 — Carga semanal/horário com unidade validada; remuneração pública de fonte própria; CPF protegido e rubricas/dados pessoais não publicados indiscriminadamente.
- [ ] T04-03 — Pessoas/vínculos/regimes, quadro remuneratório, vagas criadas/ocupadas/desocupadas, cessões e inativos.
- [ ] T04-04 — Diárias/ajudas/adiantamentos com finalidade/beneficiário/cargo/destino/quantidade/valor/empenho e fase; declaração de não adoção quando houver fonte.
- [ ] T04-05 — Atos/editais/retificações/resultados de concurso/PSS, preservando o fluxo de inscrição privada já existente.

**Aceite:** filtros visuais do modelo de Ibema têm retorno; exemplos reais não ganham remuneração/direito fictício; múltiplas matrículas não são fundidas pelo nome; Portal do Servidor privado continua privado.

### T05 — compras/contratos/convênios/obras/patrimônio/estoque/frota

- [ ] T05-01 — Licitações por modalidades/categorias/lei/situação/datas/processo/objeto, com editais, itens, resultados e documentos publicáveis.
- [ ] T05-02 — Contratação direta e compras mensais com quantidade/preço unitário/total/NF; contratos/aditivos/objeto/valor/fiscais/vigência.
- [ ] T05-03 — Convênios/termos/transferências recebidas e concedidas, repasses/anexos/fiscais/execução/prestação por estágio.
- [ ] T05-04 — Obras com cronograma, situação, local, fiscais, orçamento/itens/unitários/totais/medições e evolução físico-financeira.
- [ ] T05-05 — Consultas de bens, entradas/saídas de materiais e veículos nos campos publicáveis, com filtros/detalhes.

**Aceite:** caso documental de obras traz custos unitários/totais; compras não duplicam item repetido em NF; repasse não vira prestação aprovada; relação pública não libera documentos pessoais/operacionais restritos.

### T06 — publicações, legislação e relatórios

- [ ] T06-01 — Biblioteca em árvore por grupo/assunto/entidade/exercício/competência, com upload/link e anexos ordenados.
- [ ] T06-02 — Geração de PDF/CSV/etc. das fontes, registro de publicação, hash de bytes, arquivo privado servido por endpoint público específico e retirada/retry.
- [ ] T06-03 — PPA/LDO/LOA/alterações, RGF/RREO/anexos/DCASP/balancetes/PCA, contas/planos/audiências; edição/leiaute/competência e fontes.
- [ ] T06-04 — Lei/decreto/portaria/regulamento com categoria/ano/número/vigência, Diário Oficial e templates/dicionários.
- [ ] T06-05 — Versionar status processual das contas e distinguir **PCA — Plano de Contratações Anual** de **PCA — Prestação de Contas Anual**; nenhuma sigla ambígua recebe cálculo ou etiqueta errada.

**Aceite:** documento acessível sem cadastro tem versão/corte/formato e bytes íntegros; publicação retirada perde acesso; PDF de referência ou relatório `NOT_STATUTORY` não é automaticamente relatório oficial homologado.

### T07 — LAI, PNTP e publicação setorial

- [ ] T07-01 — Estrutura organizacional, competências, titulares/contatos/horários e FAQ realmente ligado às consultas.
- [ ] T07-02 — Entrada visível e percurso de pedido/protocolo/acompanhamento/retorno do e-SIC e ouvidoria, com proteção das identidades/narrativas.
- [ ] T07-03 — Renúncia/benefícios: fundamento/modalidade/beneficiário/valor/período conforme a projeção pública definida, sem publicar indiscriminadamente dívida ou dados fiscais individuais.
- [ ] T07-04 — Saúde/Social/Conselhos: PMS/PAS/RAG/RDQA/PMAS/atas/resoluções/gestão e indicadores agregados por referência; anexos da apresentação com fonte identificada.
- [ ] T07-05 — Desdobramentos PNTP, inclusive Legislativo, com evidências específicas e aplicabilidade justificada por entidade/período.

**Aceite:** não há circuito Fale Conosco→Ouvidoria→Fale Conosco sem serviço; cada critério PNTP avaliado tem URL/evidência ou pendência explícita; notas históricas de Ibema não são notas do software.

### T08 — acessibilidade, telemetria e proteção das consultas

- [ ] T08-01 — A+/A-/Aa, contraste, foco/teclado/atalhos, labels/tabelas/gráficos acessíveis e Libras funcional no shell de Transparência.
- [ ] T08-02 — Proteção seletiva por limites/desafio/equivalente, sem inviabilizar navegação, prefetch, teclado e consumo legítimo de dados abertos.
- [ ] T08-03 — Inventário dos itens publicados e relatório de acessos/IP administrativo protegido; contador habilitável e definição de visitas/usuários.
- [ ] T08-04 — Validação de arquivo, neutralização de fórmulas, integridade, endpoint público e política dos campos por categoria, sem transformar privacidade em ocultação geral dos campos obrigatórios.

**Aceite:** ações de acessibilidade mudam a consulta real; relatório público não divulga IP; controle automatizado não exige login para ler dados públicos nem bloqueia a demonstração dos filtros.

### T09 — integração nativa e fechamento do escopo completo

- [ ] T09-01 — Completar projeções automáticas dos módulos instalados, mantendo versão, eventos, fontes e publicação; não usar a API externa como prova de integração interna.
- [ ] T09-02 — Migrar/conciliar histórico quando autorizado, com idempotência por origem e prevenção de duplicidade entre API/CSV/PDF.
- [ ] T09-03 — Executar a jornada de apresentação nos dois Poderes, critérios do edital e matriz PNTP; confirmar filtros/totais/detalhes/exportações/situações de fonte.
- [ ] T09-04 — Validar implementação com testes de domínio/contrato/escopo, lint/typecheck/build e comportamento visual/móvel/teclado; registrar cenários efetivamente realizados.

**Aceite:** entregas são sustentadas por evidência, e os estados apresentação/integração nativa/homologação legal são explícitos. Um botão ou fixture não fecha requisito global.

## 5. Sequência para o básico funcional da apresentação

1. **Primeiro bloco:** T00 + T01 + T02. Entidades/fontes de exemplo, visual semelhante a Ibema, consultas navegáveis com filtros, sort, paginação e exportação real.
2. **Segundo bloco:** T03 + T04. Painéis, execução financeira e pessoal/diárias, usando exemplos existentes e complementos fictícios separados.
3. **Terceiro bloco:** T05 + T06. Contratos/licitações/obras e biblioteca documental com os arquivos de Novos Docs.
4. **Quarto bloco:** básico T07 + T08. Publicações setoriais, acessibilidade, atalhos e percursos de apresentação.
5. **Fechamento integral:** critérios restantes PNTP e T09, com dados/fontes e operação/homologação pertinentes.

Não usar o primeiro bloco como declaração de atendimento de todos os 58 itens.

## 6. Roteiro mínimo de apresentação

| Cenário | Resultado que precisa ser demonstrado |
|---|---|
| A — Prefeitura/Câmara | Alterar entidade e exercício; identidade, filtros/opções e resultados pertencem ao contexto selecionado |
| B — consolidado | Exibir total e explicar escopo/eliminações; não repetir transferências internas |
| C — receita julho/agosto | Combinar período/tributo/fonte, ordenar código/valor e distinguir mês/acumulado |
| D — despesa | Pesquisar empenho e mostrar liquidações/pagamentos/retido/anulado/saldo, inclusive RP de exercício anterior |
| E — paginação/exportação | 125+ registros de exemplo; ordenar e ir à página intermediária; CSV/PDF incluem todo o filtro e total coincide |
| F — pessoal | Nome/cargo/lotação/situação/faixa de valor, abas de estagiários/inativos/vagas/quantidades e detalhe de competência |
| G — diárias | Beneficiário/finalidade/destino/período/quantidade/valor/empenho; não mostrar conta bancária |
| H — licitação/contrato | Modalidade/objeto/status/período, íntegra e aditivos; contratação direta distinguível |
| I — obras | Cronograma/fiscal/itens com preços unitários e totais/medições/situação |
| J — publicação | Navegar árvore, pesquisar lei/categoria/competência, baixar formato correto e versão íntegra |
| K — saúde/renúncia | Localizar PMS/PAS/RAG e consulta/documento da renúncia com origem e período |
| L — acessibilidade | A+/A-/Aa e contraste funcionam na tabela/filtros; teclado, mapa e Libras acessíveis |
| M — serviço público | Acessar e-SIC/ouvidoria e demonstrar o percurso previsto, sem expor pedido/identidade de terceiros |
| N — fonte indisponível/fictícia | Mensagem de ausência/falha distinta de zero; origem de exemplo indicada, sem inventar atualização oficial |

## 7. Pendências de informação, não novas decisões de escopo

- Confirmar URL/código externo/dataset de Câmara. Até lá, o cenário complementar autorizado é fictício e identificado.
- Selecionar edição/aplicabilidade integral do PNTP 2026 para os dois Poderes e transcrever sua matriz.
- Definir anos/cortes e subconjunto de exemplos da API/documentos; a amostra de 1 registro não é coleta completa.
- Definir no cadastro de publicação os campos nominais básicos por categoria, CPF protegido e estados/fontes dos exemplos.
- Confirmar arquivo autônomo da PAS ou sua publicação de origem, documentos integrais/aditivos/obras e demais fontes faltantes. Exemplos sintéticos não substituem documentos oficiais.

As decisões Prefeitura+Câmara, uso da API/exemplos/fictícios e foco básico funcional foram confirmadas com o usuário. A implementação funcional para teste e a carga documental estão registradas no roteiro de entrega; os checkboxes acima conservam o aceite integral de cada requisito, incluindo integração nativa e homologação quando aplicáveis.
