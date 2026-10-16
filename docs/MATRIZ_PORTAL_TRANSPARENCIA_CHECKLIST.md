# Portal da Transparência — matriz de requisitos e lacunas

Data: 12/10/2026. Referência de código: `c778b7b`.

Esta tabela preserva o levantamento de lacunas nessa referência. A implementação posterior — consultas, biblioteca com 136 fontes no Vercel Blob, gestão, formatos, grupos/consultas documentais e canal do cidadão — está em [Entrega e testes](PORTAL_TRANSPARENCIA_TESTES_E_ENTREGA.md). Os estados abaixo não devem ser lidos como inventário atualizado de telas nem como aceite de conformidade integral.

Fechamento atualizado por fase: [T00–T09](PORTAL_TRANSPARENCIA_FECHAMENTO_T00_T09.md). Matriz PNTP 2026 importada no sistema e cartilha preservada no Blob: 181 critérios, aplicabilidade Executivo 96 e Legislativo 83; 60 evidências PARCIAIS registradas. Modelos de Aurora estão em REFERENCIA, sem decisões/atos presumidos.

Mapa principal: [MAPA_ATUALIZACAO_PORTAL_TRANSPARENCIA.md](MAPA_ATUALIZACAO_PORTAL_TRANSPARENCIA.md). Execução: [PORTAL_TRANSPARENCIA_BACKLOG_EXECUCAO.md](PORTAL_TRANSPARENCIA_BACKLOG_EXECUCAO.md).

## Método e legenda

- **58 requisitos numerados**, tanto para Prefeitura (checklist p. 163–169) como Câmara (p. 291–297), com mesmo conteúdo funcional examinado.
- **P**: encontrado parcialmente; inclui casos com base interna/funcionalidade adjacente que ainda não atende a consulta pública exigida.
- **N**: não localizada a funcionalidade pública/administração específica exigida. Cadastro interno existente é registrado como dependência, não como entrega pública.
- **NV**: avaliação integral ainda não verificada; não transformar link, texto comercial ou base exemplificativa em comprovação de conformidade.
- B01–B09 são as bases inventariadas no mapa principal. T00–T09 são as fases planejadas no backlog.
- Coluna “Descritivo EXE” corresponde ao PDF funcional do Executivo, p. 107–110. O checklist reposiciona PNTP como item 4; o descritivo o coloca em 1.1441.
- Esta matriz é de **planejamento**, não percentual de atendimento ou aceite de apresentação/produção.

## 1. Os 58 requisitos — aplicação nos dois Poderes

| ID / item | Requisito resumido | Descritivo EXE | Estado/evidência atual | Atualização necessária / fase |
|---|---|---|---|---|
| TP-001 / 1 | LC 101/131: execução orçamentária/financeira pormenorizada e tempestiva | 1.1375 | P · B01/B02: consultas de execução sem toda a cadeia, escopo e atualização | Detalhes/eventos/competências/totais/fonte/atualização; não declarar conformidade só pela tela. T02/T03/T09 |
| TP-002 / 2 | Anexos Lei 9.755/98/TCU | 1.1376 | P · B04/B05: alguns snapshots/documentos | Catálogo por anexo/assunto/exercício/competência, íntegra e fonte. T06/T07 |
| TP-003 / 3 | Preceitos LAI | 1.1377 | P · B07: páginas e links institucionais | Acesso ativo/passivo funcional, formatos, busca, organização e percurso do pedido. T01/T06/T07/T08 |
| TP-004 / 4 | Todos os itens da Cartilha PNTP/ATRICON | 1.1441 | NV · cartilha/matriz 2026 localizadas; não auditadas integralmente | Desdobrar critérios por Poder/versão e registrar evidencia/aplicabilidade. T00/T07/T09 |
| TP-005 / 5 | Contratos, convênios, compras diretas/licitações, estoque, patrimônio e frota | 1.1378 | P · B01/B03: contratos/licitações; outras bases B09 internas | Consultas públicas separadas, detalhes e anexos conforme categoria. T02/T05 |
| TP-006 / 6 | Obras: cronograma, início/fim e responsáveis de fiscalização | 1.1379 | N · não encontrada consulta pública de obras | Obra/contrato, situação, cronograma, fiscais, medições, itens/custos e documentos. T05 |
| TP-007 / 7 | Orçamento/emendas/créditos, balanços anteriores, relatórios bimestrais/quadrimestrais | 1.1380 | P · B04/B05: planejamento e snapshots | Biblioteca e versões integrais por período; origem inicial/alterada e alterações legais. T03/T06 |
| TP-008 / 8 | Tributos arrecadados e recursos recebidos | 1.1381 | P · B02: arrecadação/classificação/fonte | Filtro tributo/origem/ente/período e totais líquidos/deduções, sem duplicar hierarquia. T03 |
| TP-009 / 9 | Balanço consolidado de administração direta/autarquias/beneficiados | 1.1382 | P · B04/B09: estrutura de entidade/exercício e relatórios internos | Consolidar escopo e eliminar transferências internas; manter cortes e notas. T03/T06/T09 |
| TP-010 / 10 | Programas estaduais/federais e verbas repassadas | 1.1383 | N · bases/referências internas não são consulta dedicada | Programa/concedente/recebedor/instrumento/recebido/saldo/período e documentos. T03/T05 |
| TP-011 / 11 | Compras mensais da administração direta/indireta, vinculadas a licitação | 1.1384 | P · B02: origem contrato/recebimento/processo na execução | Consulta mensal com itens/quantidade/unitário/total, procedimento e NF/atesto publicável. T05 |
| TP-012 / 12 | Empenhos emitidos, liquidados e pagamentos | 1.1385 | P · B02: valores/counts/datas agregados | Abas e detalhe dos eventos, datas próprias, anulações/retido/bruto/líquido/RP. T03 |
| TP-013 / 13 | Área de pessoal com todos os componentes enumerados | 1.1386 e 1.1387–1.1395 | N pública · B09 oferece bases RH/autosserviço; ver nove subitens | Área nominal pública própria e parametrizada, separada dos documentos pessoais. T04 |
| TP-014 / 14 | Diárias: finalidade, data e valor | 1.1396 | N pública · rotina RH/Financeiro interna | Beneficiário/cargo/destino/período/quantidade/unitário/total/empenho e situação. T04 |
| TP-015 / 15 | Atos de concursos e processos seletivos | 1.1397 | P · `/portal/concursos` e GED do Portal do Servidor | Integrar catálogo, atos/resultados/retificações/anexos ao contexto entidade/ano da Transparência. T04/T06 |
| TP-016 / 16 | Ordenação por códigos e valores | 1.1398 | N · ordenação fixa nas queries | Ordenação server-side permitida e estável, comum à tela/API/exportação. T02 |
| TP-017 / 17 | Relatórios legais da gestão fiscal/metas/execução | 1.1399 | P · B04/B05; `NOT_STATUTORY`/leiaute não homologado em bases internas | Cobrir anexos, competência, versão e origem; marcar exemplo/conferência sem afirmar oficialidade. T06 |
| TP-018 / 18 | Folha pública mediante parametrização no sistema de gestão | 1.1400 | N pública · B09 tem folha e documentos privados | Projeção pública aprovada por competência/tipo/versão/vínculo, sem publicar contracheque pessoal. T04 |
| TP-019 / 19 | Quantidade de funcionários por regime | 1.1401 | N pública · relatórios RH internos existem | Totais públicos de pessoas/vínculos, referência e regras de contagem. T04 |
| TP-020 / 20 | Vagas criadas/ocupadas por tipo de cargo | 1.1402 | N pública · quadro/relações nos documentos de referência | Plano/lei de cargos + ocupação por referência; não derivar criadas de contagem de ativos. T04 |
| TP-021 / 21 | Funcionários por tipo de contrato | 1.1403 | N pública · contratos RH internos | Filtros e projeção dos regimes/vínculos/cargos/categorias. T04 |
| TP-022 / 22 | Cedidos e recebidos por cessão | 1.1404 | N pública | Ente origem/destino, ônus, vigência e ato, conforme campos públicos. T04 |
| TP-023 / 23 | Cargos com vagas disponíveis/ocupadas | 1.1405 | N pública | Lei/plano de cargos, totais e disponibilidade por cargo/referência. T04 |
| TP-024 / 24 | Inativos com tipo de aposentadoria/pensão | 1.1406 | N pública | Histórico público por referência; tipo administrativo sem motivo clínico/diagnóstico. T04 |
| TP-025 / 25 | Estagiários: local de trabalho e contrato | 1.1407 | N pública · documento 058 e RH interno | Aba própria, bolsa/remuneração, jornada, instituição/local e vigência. T04 |
| TP-026 / 26 | Consulta consolidada e por entidade gestora | 1.1408 | P · B04/B05 distinguem entidades em alguns documentos | Seletor Prefeitura/Câmara/consolidado aplicado em todas as consultas e nos totais. T00/T01/T02/T03 |
| TP-027 / 27 | Filtro de período | 1.1409 | P · B02: ano; B05: ano de instrumento | De/até, mês/competência e datas específicas de cada etapa, sem confundir emissão com pagamento. T02/T03 |
| TP-028 / 28 | Dados automáticos em tempo real a partir dos módulos instalados | 1.1410 | P · consultas diretas para subconjunto dos dados; API externa não é conector instalado | Adapters/projeções nativas, disponibilidade, atualização e publicação. API/fixtures só apresentam exemplos. T03/T04/T05/T09 |
| TP-029 / 29 | Gerenciar/parametrizar consultas disponibilizadas | 1.1411 | P · B06 administra conteúdo, não catálogo de consultas | Cadastro de consulta/canal/entidade/público/filtros/colunas/publicação/hints. T01/T06 |
| TP-030 / 30 | Aviso pop-up com imagem | 1.1412 | P · banners/avisos em bases separadas; sem pop-up público encontrado | CRUD, imagem/link, vigência, entidade, frequência e fechamento acessível. T01/T06 |
| TP-031 / 31 | Novos grupos de consulta | 1.1413 | N · menu atual fixo | Grupos/subgrupos ordenados com consultas associadas. T01/T06 |
| TP-032 / 32 | Busca para localizar consultas | 1.1414 | P · busca de registros financeiros/institucional | Busca do catálogo por título/assunto/tags e entrada direta na consulta, com filtros de registro separados. T01/T02 |
| TP-033 / 33 | Novas consultas com upload ou links externos | 1.1415 | P · B06: páginas/links/diário; sem consulta configurável | Tipos nativa/documental/link, cadastro de anexos e governança de publicação. T06 |
| TP-034 / 34 | Impressão/exportação PDF/DOC/XLS/JPEG/CSV/TXT etc. | 1.1416 | P · CSV público; utilitário TXT e PDF/CSV de planejamento | Formatos com renderizadores reais, conteúdo integral e mesmos filtros/colunas; adequar DOC/XLS/JPEG à demonstração do edital. T02/T06 |
| TP-035 / 35 | Publicar PDF de relatório gerado e vinculá-lo a registro | 1.1417 | P · B05 confirma PDF/CSV preservados de planejamento | Reutilizar fluxo de arquivo verificado para outras fontes/consultas/documentos. T06 |
| TP-036 / 36 | Upload/publicação de relatórios em vários formatos | 1.1418 | P · B06 diário/conteúdo e B05 publicação, sem biblioteca geral | MIME/tamanho, versão, metadados, pasta, formatos e URL pública própria. T06 |
| TP-037 / 37 | Ajuda de custo/adiantamentos com respectivo empenho | 1.1419 | N pública · documento 087 informa não adoção na fonte | Consulta genericamente disponível; quando não adotado, declaração por entidade/período. Cenário fictício separado pode apresentar capacidade. T04 |
| TP-038 / 38 | Convênios de repasse e anexos | 1.1420 | P · número de convênio em DTO financeiro; sem íntegra pública dedicada | Recebidos/concedidos, instrumentos, repasses, fiscais, anexos e prestação por estágio. T05/T06 |
| TP-039 / 39 | Alto contraste, fonte, atalhos e Libras | 1.1421 | P · B07 fonte/contraste, mas rota Transparência não herda o shell | Shell público acessível próprio/compartilhado, ações reais em tabelas/filtros, teclado e Libras funcional. T01/T08 |
| TP-040 / 40 | Visualizar formatos de estruturação da informação | 1.1422 | P · B03/B07 têm API/CSV e nomes de campos | Catálogo/dicionário/layout, encoding, decimal, tipos, atualização e exemplos por dataset. T02/T08 |
| TP-041 / 41 | Mapa do site com todas as consultas | 1.1423 | P · mapa institucional separado | Mapa gerado do catálogo publicado, por entidade, sem links mortos. T01/T08 |
| TP-042 / 42 | Legislação municipal com filtro de categoria | 1.1424 | P · página informativa, sem biblioteca/filtro comprovado | Leis/decretos/portarias/regulamentos por número/ano/categoria/vigência, íntegra e atualização. T06 |
| TP-043 / 43 | Link direto para Diário Oficial | 1.1425 | P · gestão de diário e atalhos institucionais; links atuais não constituem consulta pública de edições | Link real e biblioteca por edição/data/entidade, íntegra e busca. T01/T06 |
| TP-044 / 44 | Licitações por categorias/modalidade | 1.1426 | P · modalidade consta do DTO; sem filtro público encontrado | Modalidade/natureza/lei/situação/processo/data/objeto, detalhes e documentos. T02/T05 |
| TP-045 / 45 | Estrutura/FAQ e pedidos de acesso à informação | 1.1427 | P · B07 e utilitário FAQ; e-SIC público informativo | Estrutura/contatos, FAQ de consultas e ligação a registro/protocolo/acompanhamento real do pedido. T01/T07 |
| TP-046 / 46 | Cadastrar horário de atendimento da entidade | 1.1428 | N no portal consultado · contato não mostra horário | Horário/canal por entidade, cadastro e exibição consistentes. T01/T06 |
| TP-047 / 47 | Brasão e endereço | 1.1429 | P · contato/endereço; sem brasão no portal público atual | Identidade/brasão/endereço por entidade, preservando contexto do consolidado. T01 |
| TP-048 / 48 | Templates para novas consultas e download | 1.1430 | P · renderizadores/arquivos internos B05/B09, sem associação ao catálogo geral | Modelo/layout versionado, renderer ou arquivo de origem e download público específico. T06 |
| TP-049 / 49 | Agrupadores dos arquivos de novas consultas | 1.1431 | N | Árvore grupo/assunto/exercício/competência e associação estável dos anexos. T06 |
| TP-050 / 50 | Relatório dos itens disponibilizados e IP de acesso | 1.1432 | N específico · auditoria geral é base adjacente | Inventário de publicação e acesso por consulta/item. IP fica em relatório administrativo autorizado; página pública usa agregados. T08 |
| TP-051 / 51 | Configurar entidades disponibilizadas | 1.1433 | P · entidades financeiras existem; não governam todas as consultas | Cadastro/ativação/identidade/mapeamento externo e fonte de cada entidade. T00/T01 |
| TP-052 / 52 | Ano inicial parametrizado das consultas | 1.1434 | N · limites 2000–2100 no parser não são parâmetro municipal | Ano inicial por entidade/consulta, anos disponíveis e tratamento do histórico. T01/T02 |
| TP-053 / 53 | Contador de acesso/usuários às consultas | 1.1435 | N | Contador habilitável, definição visitas/usuários e apresentação sem identificar pessoas. T08 |
| TP-054 / 54 | Hints explicativos nas consultas | 1.1436 | P · textos fixos da página | Hints/metodologia configuráveis por coluna/consulta; explicar bruto/líquido/acumulado/fórmula. T01/T02 |
| TP-055 / 55 | Ordenar anexos de consultas específicas | 1.1437 | N · ordem de banners não é de anexos | Ordem persistida na associação consulta–anexo, comum ao site e API. T06 |
| TP-056 / 56 | CAPTCHA/reCAPTCHA/equivalente sem prejudicar consultas | 1.1438 | P · rate limit de validações públicas; APIs excluídas do matcher Proxy | Proteção compatível com consulta/dados abertos/acessibilidade, limites e desafio seletivo quando aplicável. T08 |
| TP-057 / 57 | Cadastro/consulta de ouvidoria por link | 1.1439 | P · página institucional; sem entrada direta no portal atual | Atalho visível e percurso funcional à ouvidoria, preservando sigilo das manifestações. T01/T07 |
| TP-058 / 58 | Acesso fácil a registro de pedido de informação | 1.1440 | P · e-SIC informativo ligado a Fale Conosco sem protocolo próprio | Atalho e registro/acompanhamento operacionais, não circuito de páginas informativas. T01/T07 |

## 2. Os nove componentes de TP-013

São detalhes do item 13, não nove pontos adicionais para cálculo do checklist.

| Controle | Obrigação pública | Descritivo | Base encontrada / lacuna |
|---|---|---|---|
| TP-013a | Agentes nominais: regime/cargo/função/lotação/jornada semanal/horário/remuneração/admissão/desligamento/motivo | 1.1387 | RH tem pessoas/vínculos/revisões/folha e relatório autenticado de ativos; não encontrada listagem pública desse conjunto. Criar DTO nominal restrito por campo, competência e versão. |
| TP-013b | Estagiários nominais, jornada/horário/remuneração/admissão/desligamento/motivo | 1.1388 | Documento 058 orienta estrutura, mas não fornece CPF/bolsa integral; cenário público e fonte própria necessários. |
| TP-013c | Quantidade por vínculo/regime | 1.1389 | Relatório interno distingue pessoas e vínculos. Projetar público por referência; não somar o total geral duas vezes. |
| TP-013d | Padrão remuneratório de cargos/funções | 1.1390 | Bases/plano de cargos RH; faixas dos PDFs não informam valores integrais. Publicar tabela efetivamente configurada ou exemplo fictício identificado. |
| TP-013e | Cedidos/recebidos por cessão | 1.1391 | Precisa de relação e atos por origem/destino/ônus/vigência, mantendo identidade por vínculo. |
| TP-013f | Vagas ocupadas/desocupadas por cargo | 1.1392 | Quadro/documento 111 é referência, não substitui legislação e contagem temporal. |
| TP-013g | Atos de concursos/PSS | 1.1393 | `/portal/concursos` oferece edital/inscrição/comprovante; publicações de atos/resultados precisam do catálogo de transparência. Não publicar CPF/documentos dos candidatos como lista geral. |
| TP-013h | Diárias/ajudas/adiantamentos: nome/cargo/total/quantidade/período/motivo/destino/empenho | 1.1394 | Rotina de viagem/diárias e cadeia financeira internas; criar visão pública dos atos/valores, com dados bancários/documentos pessoais excluídos. |
| TP-013i | Vagas criadas/ocupadas por tipo de cargo | 1.1395 | Quadro/documentos e fontes RH; necessidade de lei/plano por vigência e regra de ocupação. |

## 3. Critérios documentais adicionais de Novos Docs

| Controle | Documento/origem | Requisito no plano |
|---|---|---|
| ND-TP-01 | Monitoramento 127, p. 2–3 | Obras com preços unitários/totais, cronograma/medição/fiscal e fonte. Registrar que a correção foi declarada no portal de Ibema em p. 3, sem atribuí-la ao nosso código. |
| ND-TP-02 | Monitoramento 127, p. 2 | Redimensionamento de texto e acessibilidade efetiva na rota Transparência, não apenas no site institucional. |
| ND-TP-03 | Monitoramento 127, p. 2–3 | Beneficiários de renúncia de receita, fundamento, benefício/valor/período e modalidade de publicidade; evidência própria. |
| ND-TP-04 | Monitoramento 127, p. 2–3; PMS/RAG/RDQA | Publicar PMS, PAS e RAG/RDQA no período correto. PAS não foi localizada como arquivo autônomo no inventário recebido; eventual complemento fictício não é PAS oficial de Ibema. |
| ND-TP-05 | Capturas 014/022 | Filtros de nome/situação/cargo/lotação/classe/natureza/faixa salarial, abas e detalhes; decidir campos públicos sem copiar busca por CPF integral automaticamente. |
| ND-TP-06 | Captura 110 | Painéis de receitas/despesas/repasses/pessoal/Saúde/Educação com metodologia e tabela equivalente. Indicadores fiscais computáveis não se confundem com somar toda uma secretaria. |
| ND-TP-07 | Links 087 | Quando a entidade/período não adota adiantamento/verbas de gabinete, apresentar declaração de não adoção com fonte. Outros cenários/entidades ficam separados. |
| ND-TP-08 | Relações 132–134, notas 054–056, receita 113–115 | Importação/coleta exemplificativa idempotente e conferência por etapa, preservando origem; nunca somar documento, subtotal e movimento como fatos novos. |
| ND-TP-09 | Contas 025/109/128 | Versão/estágio de contas: apresentação, tramitação, análise técnica e julgamento final são estados distintos. |

## 4. PNTP ainda a detalhar

TP-004 continua **NV** quanto à cartilha integral. As fontes oficiais 2026 foram localizadas no site PNTP, e o backlog exige uma matriz complementar com critério, Poder, versão, aplicabilidade, URL pública e evidência. Planejar desde já: informações institucionais, receitas/despesas, pessoal/diárias, contratação/obras, planejamento/contas, LAI/ouvidoria/acessibilidade/dados abertos, renúncia/benefícios, emendas/transferências e áreas setoriais, além do conteúdo específico do Legislativo (vereadores, atividade legislativa, sessões/votações e demais critérios aplicáveis).

Não utilizar essa lista temática como transcrição certificada da cartilha 2026 ou como nota PNTP do portal. Nenhum requisito legal global recebe aceite integral por presença de base de exemplo.
