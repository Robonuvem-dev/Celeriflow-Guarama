# Matriz atualizada — Portal de Autoatendimento

119 itens do checklist Executivo, p.151–163. Referência funcional do descritivo Executivo p.99–107. A regra de correspondência foi conferida: PA-001–104 → 1.(1254+PA); PA-105–119 → 1.(1255+PA). O descritivo 1.1359 é o enunciado transversal da avaliação, não um item adicional do checklist.

Plano: [PLANO_PORTAL_AUTOATENDIMENTO.md](PLANO_PORTAL_AUTOATENDIMENTO.md). B01–B16 são as bases de código descritas nesse plano. A00–A10 são as fases propostas.

**Atualização de execução (13/10/2026):** o núcleo de catálogo versionado, acesso/conferência, pedido–Process–executor, complemento/resposta/documento e programação foi implementado. Consulte [SERVICOS_INTEGRADOS_EXECUCAO_20261013.md](SERVICOS_INTEGRADOS_EXECUCAO_20261013.md) para evidências e pendências atuais. As linhas abaixo preservam o levantamento inicial; os estados P/R/N/E não são selo de aceite posterior.

**Legenda:** P = superfície externa parcial; R = fonte/fluxo reaproveitável em módulo ou área especializada, sem aceite do portal geral; N = operação externa geral não localizada; E = integração/contrato externo ainda necessário. Nenhum desses estados representa homologação integral. A matriz integrada anterior de 356 itens é preservada como levantamento histórico.

| PA | Descritivo | Requisito | Estado/base atual | Fase e entrega necessária |
|---|---|---|---|---|
| 001 | 1.1255 | Solicitar/liberar acesso do contribuinte | R B01/B04: conta autorizada/concessão interna | A01/A02: cadastro, conferência, protocolo e liberação do titular correto |
| 002 | 1.1256 | Processo digital com imóvel/empresa/taxa | R B05/B08/B11 | A02/A04: solicitação integrada, Process central e guia contextual |
| 003 | 1.1257 | Serviços/roteiros por assunto | R B08/B12/B15 | A02: catálogo geral, versão e destino do serviço |
| 004 | 1.1258 | Serviços terceiros por token | E B01/integrações | A10: token por identidade/escopo/serviço e retorno real |
| 005 | 1.1259 | Requerimento e-SIC | P B10: protocolo/chave e resposta | A02/A06: Process central obrigatório, sem duplicar protocolo histórico |
| 006 | 1.1260 | Ouvidoria/anônimo | P B09/B10 | A06: vínculo ao Process com sigilo e distribuição preservados |
| 007 | 1.1261 | Acompanhamento número/chave/documento | P B10/B11/B12 | A03: acompanhamento único autorizado; CPF/CNPJ não é senha |
| 008 | 1.1262 | Alterar/recuperar senha | R B01/Portal do Servidor | A01: fluxos gerais, e-mail validado e retorno à rota |
| 009 | 1.1263 | Revisão de cadastro único | R B03/B12 | A02/A04: solicitação, análise e aplicação transacional |
| 010 | 1.1264 | Aviso cadastral desatualizado | N B03 | A01/A09: data/política e alerta do próprio titular |
| 011 | 1.1265 | Autenticidade CRC | R B13/B14 | A07: documento emitido e validação pública redigida |
| 012 | 1.1266 | Readequar vencedor por itens do lote | R B13 | A07: fonte de preços/resultado, reconciliação ao total |
| 013 | 1.1267 | Proposta online cifrada/senha | R B13, não comprovado ciclo completo | A07: sigilo/cifra/ato de abertura sem redigitação |
| 014 | 1.1268 | Cotação de preços do fornecedor | R B13: convite/token/digitação | A07: agregar área externa autorizada e acompanhamento próprio |
| 015 | 1.1269 | Agenda de licitações | P B15/B13 | A07: agenda por evento/hora publicada e filtros |
| 016 | 1.1270 | Publicação licitatória selecionável | P B13/B15 | A07: configurar visibilidade/documentos, nunca publicar proposta sigilosa automaticamente |
| 017 | 1.1271 | Consulta Lei 13.019 | R B13/B15 | A07: consulta específica de parcerias com íntegra e estado |
| 018 | 1.1272 | Manifestação de Interesse Social | N B08/B13 | A02/A07: serviço, protocolo e encaminhamento OSC |
| 019 | 1.1273 | Prestação financeira/objeto | R B13 | A07: área da entidade, documentos/pendência/análise |
| 020 | 1.1274 | Retenções do fornecedor | R B05/B13 | A07: leitura do credor autorizado, sem dados de fornecedor alheio |
| 021 | 1.1275 | Saldo por empenho/data | R B05/B13 | A07: saldo canônico, recorte e representação |
| 022 | 1.1276 | Empenhos/pagos/retenções/saldos | R B05/B13 | A07: extrato próprio completo, distinguindo etapas |
| 023 | 1.1277 | Folha/layout pessoal | R B12/B14 | A08: reusar fonte e layout do Portal do Servidor |
| 024 | 1.1278 | Períodos/saldos de férias | R B12 | A08: área especializada e fonte de direitos |
| 025 | 1.1279 | Ficha financeira/pagamentos | R B12 | A08: documento próprio por período, fonte de pagamento |
| 026 | 1.1280 | Ponto/totalizadores | R B12 | A08: reusar configuração e emissão pessoal |
| 027 | 1.1281 | IRRF | R B12 | A08: pagamentos individuais conciliados e exercício |
| 028 | 1.1282 | Tempo de serviço/layout | R B12 | A08: histórico/layout e documento do titular |
| 029 | 1.1283 | Tempo no magistério | R B12 | A08: fonte histórica/declaração pessoal |
| 030 | 1.1284 | Dados pessoais/dependentes | R B03/B12 | A01/A08: proposta/conferência, sem mudar credencial indevidamente |
| 031 | 1.1285 | Empréstimos | R B12 | A08: contratos/parcelas próprios |
| 032 | 1.1286 | Solicitações RH | R B12: pedido–Process persistente | A02/A08: preservar binding, expor no catálogo geral |
| 033 | 1.1287 | Ajuste de ponto | R B12 | A08: decisão/cálculo nas fontes, sem alterar ponto pelo portal geral |
| 034 | 1.1288 | Autenticidade recibo | R B12/B14 | A08: reusar validação sem remuneração pública |
| 035 | 1.1289 | Convenente/departamento lança descontos | R B12: autorização específica | A08: ator especializado, sem consulta salarial coletiva |
| 036 | 1.1290 | Editais concurso/PSS | R B12/B15 | A08: catálogo público e GED publicado |
| 037 | 1.1291 | Inscrição candidato | R B12: candidato sem Employee | A08: integrar entrada sem exigir vínculo funcional |
| 038 | 1.1292 | Avaliação desempenho | R B12 | A08: comissão/ciclo/resultado autorizado |
| 039 | 1.1293 | Estágio probatório | R B12 | A08: preservar regras e comissões da fonte |
| 040 | 1.1294 | Atestados pelo departamento | R B12/SST | A08: área/setor autorizado, não autosserviço pessoal indistinto |
| 041 | 1.1295 | Previdência anual | R B12 | A08: relatório próprio por previdência/exercício |
| 042 | 1.1296 | Margem/banco conveniado | R B12 | A08: validade/bloqueio/cálculo existentes |
| 043 | 1.1297 | Solicitar/analisar/programar férias | R B12: protocolo funcional | A08: preservar solicitação e efeito do RH |
| 044 | 1.1298 | Períodos licença-prêmio | R B12 | A08: direitos/gozo/saldo, leitura pessoal |
| 045 | 1.1299 | Termo rescisão | R B12/B14 | A08: fonte/conferência/liberação pessoal |
| 046 | 1.1300 | Ficha registro | R B12 | A08: emissão do próprio vínculo |
| 047 | 1.1301 | Ponto externo habilitado | R B12 | A08: servidor habilitado, autorização na API |
| 048 | 1.1302 | Aniversariantes | R B12 | A08: escopo funcional configurado, não lista geral de cidadãos |
| 049 | 1.1303 | Certificados capacitação | R B12/B14 | A08: conclusão reconhecida, versão própria |
| 050 | 1.1304 | Inscrição curso | R B12 | A08: vaga/concorrência/comprovante |
| 051 | 1.1305 | Afastamentos/faltas | R B12 | A08: leitura pessoal sem ampliar dado clínico |
| 052 | 1.1306 | Compensação/banco horas | R B12 | A08: totalizadores/estornos da fonte |
| 053 | 1.1307 | Declaração vínculo | R B12/B14 | A08: histórico/modelo/assinante próprios |
| 054 | 1.1308 | Licença-prêmio gozada | R B12 | A08: consulta dos períodos efetivos |
| 055 | 1.1309 | Inscrição CIPA | R B12/SST | A08: elegibilidade e processo eleitoral |
| 056 | 1.1310 | Voto CIPA | R B12/SST | A08: voto/eleitor e controles próprios |
| 057 | 1.1311 | Atos legais pessoais | R B12/B14 | A08: vínculos/liberação documental |
| 058 | 1.1312 | PPP | R B12/SST | A08: fontes ambientais/responsáveis/assinatura |
| 059 | 1.1313 | CAT pessoal | R B12/SST | A08: registro e comprovante sem expor pareceres |
| 060 | 1.1314 | Outras previdências | R B12 | A08: provedor e relatório por referência |
| 061 | 1.1315 | Recibo férias | R B12 | A08: documento de cálculo/gozo próprio |
| 062 | 1.1316 | Planos de saúde/despesas | R B12/SST | A08: titular/dependentes/pagamentos e escopo protegido |
| 063 | 1.1317 | Histórico ATS | R B12 | A08: percentuais/averbações sem regras novas no portal |
| 064 | 1.1318 | Agenda SST | R B12/SST | A08: vagas/agenda/profissional e comprovante |
| 065 | 1.1319 | Recadastramento | R B12/B03 | A08: campanha ativa e atualização após análise |
| 066 | 1.1320 | Obras públicas | P B15/Obras | A09: reusar projeções publicadas e filtros, sem protocolo por consulta |
| 067 | 1.1321 | Guias atualizadas/PIX/cartão | R/E B05 | A04/A10: adapter externo, convenção e retorno de pagamento real |
| 068 | 1.1322 | Extratos contribuinte/econômico/imóvel | P B04/B05 | A04: DTO/paginação/escopo e totais pessoais corretos |
| 069 | 1.1323 | Débitos na home | P B04, sem painel geral | A04/A09: indicadores calculados por vínculo, nunca por CPF informado |
| 070 | 1.1324 | Imóvel/arquivos/espelho | R B03/B04 | A04: titular/representante e documentos próprios |
| 071 | 1.1325 | Doação social | N B05/Social | A06: programa/solicitação/protocolo e recebimento sem criação de receita fictícia |
| 072 | 1.1326 | Correspondência imóvel/empresa/pessoa | R B03 | A02/A04: revisão protocolada com aplicação no cadastro |
| 073 | 1.1327 | Alvarás próprios | P B04/B05 | A04/A08: consulta/emissão real por estabelecimento/licença |
| 074 | 1.1328 | CND/autenticidade | R B05/B14 | A04: solicitação instantânea ou análise protocolada, dívida e documento canônicos |
| 075 | 1.1329 | Comprovante retenção ISS | R B05/B07 | A05: relação própria, documento e origem fiscal |
| 076 | 1.1330 | NFS-e avulsa/lista | R B07; só autenticidade é pública | A05: pedido/protocolo/liberação/emissão e notas do titular |
| 077 | 1.1331 | Contador representa clientes | R B06/B04 | A01/A05: poderes, legitimidade, validade e operações permitidas |
| 078 | 1.1332 | Extrato por abas/guia | P B04/B05 | A04: área externa, filtros e geração contextual |
| 079 | 1.1333 | Construção/habite-se | R B11: abertura e Process existentes | A08: integrar ao catálogo/Meus pedidos sem segundo protocolo |
| 080 | 1.1334 | Documentos obrigatórios | R B11/B12 | A02: requisitos versionados por serviço, consumo/validação dos anexos |
| 081 | 1.1335 | ITBI externo | R B06 | A05: legitimidade das partes/imóvel/matrícula/valores e Process central |
| 082 | 1.1336 | Reserva espaço/processo | N/fonte setorial a conferir | A06: disponibilidade concorrente, protocolo e executor |
| 083 | 1.1337 | Direitos titular LGPD | N B03/B08 | A06/A08: pedido validado, protocolo restrito e resposta do controlador |
| 084 | 1.1338 | Relatório tratamentos LGPD | R administração/governança, cobertura não comprovada | A08: fonte de tratamentos real e relatório, sem inventário vazio como prova |
| 085 | 1.1339 | Legislação/categoria/assunto/ementa | P B15 | A09: reusar catálogo e completar filtros/destinos |
| 086 | 1.1340 | Diário Oficial | P B15, atalho com âncora quebrada | A09: entrada real nas edições/provedor, sem link genérico sem seção |
| 087 | 1.1341 | Processos administrativos próprios | R B08/B11/B12 | A03: consolidar processos autorizados e projeção externa |
| 088 | 1.1342 | Comunicação número/ano/chave | R B14/comunicações | A08: lookup autorizado e documento correto |
| 089 | 1.1343 | Assinatura solicitada | R B14 | A08: caixa própria, versão/hash e modalidade de assinatura |
| 090 | 1.1344 | Pedido manutenção/serviços públicos | R B09/Obras | A02/A06: protocolo central, ocorrência/execução vinculados |
| 091 | 1.1345 | Cronograma manutenção | R executor, sem jornada geral | A03/A06: agenda/reprogramação/status no mesmo pedido |
| 092 | 1.1346 | Guichê/agendamento | R agenda/atendimento, operação externa a confirmar | A06: vagas/reserva, protocolo/comprovante e cancelamento |
| 093 | 1.1347 | Recados público/logado | N geral; aviso Transparência é específico | A09: cadastro/alvo/vigência no shell de Autoatendimento |
| 094 | 1.1348 | Boxes débitos/processos | P B04/B02 | A04/A09: dados do usuário, vínculos e navegação contextual |
| 095 | 1.1349 | Boxes serviços/texto | R B15, lista fixa | A09: editor/destino/estado operacional |
| 096 | 1.1350 | Serviços em destaque | P B15 | A02/A09: configuração e consumo do catálogo |
| 097 | 1.1351 | Favoritos pessoais | N | A09: persistência por identidade e disponibilidade |
| 098 | 1.1352 | Endereço/contato entidade | P B15: institucional existente | A09: contexto/atualização por entidade e canal |
| 099 | 1.1353 | Busca de serviços | P B15, não catálogo operacional geral | A02/A09: busca por serviço/perfil/requisito/destino |
| 100 | 1.1354 | Acessibilidade | P B15 | A09: fonte/contraste/teclado nos formulários/tabelas reais |
| 101 | 1.1355 | Pop-up configurável | R Transparência específica | A09: aviso do portal geral, público/alvo/frequência/vigência |
| 102 | 1.1356 | CAPTCHA/equivalente envios públicos | P limite seletivo B01/B10 | A09: controle nos envios do serviço, sem bloquear leitura/prefetch |
| 103 | 1.1357 | Serviços informativos/requisitos | R PublicService B15/B12 | A02/A09: catálogo administrativo completo e público operacional |
| 104 | 1.1358 | Carta completa/login/acesso | P B15: grupos fixos | A02/A09: todos os serviços ativos, requiresLogin, requisitos e abertura |
| 105 | 1.1360 | Satisfação com serviço | P B16: nota global existente | A09: quesito próprio e vínculo serviço/pedido |
| 106 | 1.1361 | Qualidade atendimento | N quesito geral separado | A09: nota específica, sem reaproveitar indevidamente nota global |
| 107 | 1.1362 | Prazo/compromisso | N quesito geral separado | A09: nota específica e recorte do serviço |
| 108 | 1.1363 | Descrição avaliação | P B16 | A09: texto com os três quesitos, acesso/privacidade próprios |
| 109 | 1.1364 | Resultados por serviço na Carta | P B16: agregados por canal, não Carta geral | A09: consolidar serviço/referência, sem identificar avaliadores |
| 110 | 1.1365 | Pedido alvará sanitário | R fonte setorial/licença | A08: estabelecimento autorizado, protocolo e análise sanitária |
| 111 | 1.1366 | Licença transporte sanitário | R fonte setorial a conferir | A08: veículo/estabelecimento, documentos e processo |
| 112 | 1.1367 | Alvará evento | R fonte setorial a conferir | A08: data/local/requisitos, protocolo e executor |
| 113 | 1.1368 | Alvará temporário | R fonte setorial a conferir | A08: período e operação/licença própria |
| 114 | 1.1369 | Carteira saúde funcionário estabelecimento | R Saúde/Vigilância, cobertura externa não comprovada | A08: vínculo/pedido/documento restrito e assinatura, não cartão público pessoal |
| 115 | 1.1370 | Denúncia Vigilância | P B10/Ouvidoria geral | A06/A08: assunto/setor sanitário, anonimato e Process sigiloso |
| 116 | 1.1371 | Processos Vigilância por estabelecimento | R fonte setorial/B08 | A03/A08: escopo do estabelecimento e executor, não só processos gerais |
| 117 | 1.1372 | Documento sanitário assinado | R B14/fonte sanitária | A08/A10: emissão/liberação após assinatura real do fiscal |
| 118 | 1.1373 | Notificação receita médico/clínica | R Saúde/Vigilância, cobertura externa a conferir | A08: habilitação, solicitação e protocolo restrito |
| 119 | 1.1374 | Assunção/baixa responsabilidade técnica | R fonte profissional/sanitária | A08: legitimidade, vigência, processo e certidão de origem |

## Regras transversais de fechamento

- `1.1359`: a avaliação precisa contemplar serviço, qualidade, prazo/compromisso e descrição, com resultados por serviço. Nota única de satisfação não encerra os três quesitos.
- Todo serviço solicitado se liga ao Process central e ao executor, visível no card Processos e Protocolos. Não aplicar isso como geração de protocolo por leitura/validação/reimpressão.
- Os itens R de RH/Construção são reaproveitamento de trabalho existente, não promessa de reescrever esses módulos.
- Itens setoriais sanitários, LGPD, espaços e guichês continuam com auditoria de operação marcada para a fase respectiva. Nenhuma linha foi declarada entregue por haver um modelo Prisma ou botão.
- Pagamentos/PIX/cartão, ADN/Gov.br/terceiros e assinatura oficial têm aceite de integração separado. Dados fictícios/modelos são explicitamente de apresentação e não cumprimentos legais homologados.
