# Construção Civil — evidências por requisito

Referência: checklist POC, páginas 126–131. Esta matriz registra caminhos verificáveis e limites; **não é termo de homologação**. Os testes de serviços usam PostgreSQL embarcado/PGlite, incluindo Prisma onde indicado. Nenhum cenário visual autenticado foi comprovado, pois o navegador da sessão permanece desconectado.

| Item | Evidência de implementação / percurso | Verificação adicional necessária para aceite |
|---|---|---|
| 1 | Solicitação urbana/rural, categorias/modalidades, documentos e ciclo; fiscalização própria | Licenças municipais específicas e percurso autenticado por modalidade |
| 2 | Categoria parcelamento, viabilidade, alvará, vistorias e conclusões | Categorias/lotes/dados territoriais exigidos pelo município e percurso completo |
| 3 | `construction-policy.ts`; testes de precisão e pesos | Validar fórmula municipal e cenários sem sobreposição |
| 4 | Contador/reenvio/franquia e taxas REANALYSIS | Repetir ciclo externo com pagamentos reais de teste |
| 5 | Configuração `checkPropertyDebts`, consulta tributária e gate de conclusão | Débitos reais/imóvel, políticas municipais de exigibilidade |
| 6 | `construction-distribution.ts`; menor demanda, elegibilidade e locks testados | Exercitar as quatro estratégias com contas operacionais |
| 7 | `RealEstate`, processo edilício e fiscal vigente | Conferir cadastro territorial e tramitação municipal |
| 8 | Perfil construtora, vigência, vínculo profissional e ledger | Cadastros reais autorizados e testes de vencimento autenticados |
| 9 | Perfil BROKER/CRECI, identidade externa e autorização | Corretor habilitado percorrendo viabilidade e restrições de serviço |
| 10 | Papéis ANALYST/INSPECTOR/MANAGER por setor/vigência | Contas de teste e negativa em todas as superfícies |
| 11 | Catálogos publicados e snapshot na solicitação | Modelos/modalidades municipais e impressão |
| 12 | Definições FORM/VIABILITY/PERMIT/INSPECTION/COMPLETION | Confirmar obrigatoriedade em cada etapa, inclusive decisão automática |
| 13 | Pedido START, `ConstructionLifecycleStart` e lote federal | Canal federal oficial e recibo validado |
| 14 | PDF derivado com texto/nota/seta/formas/cores, coordenadas e hash | Conferir visualmente PDF/páginas/rota externa e impressão |
| 15 | Seed dos 14 tipos, teste de upgrade do baseline | Conferir manutenção pela UI e preservação de classificações |
| 16 | Instruções versionadas exibidas na abertura | Texto aprovado pelo município e escopo por serviço |
| 17 | Regularização/normal preservados no caso | Regras/documentos/taxas específicos por modalidade |
| 18 | Campos tipados configuráveis, validação servidor/snapshot | Editar publicações pela UI e testar cada tipo em ponta a ponta |
| 19 | Conclusão parcial/total, sequência própria e saldo Decimal | Percurso com vistorias, datas e áreas reais autorizadas |
| 20 | Template de habite-se versionado com dados da emissão | Composição/layout municipal completo, prévia/impressão e signatários |
| 21 | Decisão automática demonstrativa, memória, PDF/GED e pedidos de assinatura aos gestores reais | Assinatura final ainda humana; automação institucional de assinatura e regras oficiais suficientes pendentes |
| 22 | Vínculo imóvel-zoneamento e snapshots cadastrais | Índices territoriais oficiais, inscrições e pesquisa autorizada |
| 23 | Zoneamento publicado/vigência/flag automatic | Plano diretor validado e critérios completos de elegibilidade |
| 24 | Texto PDF real, adaptadores OCR/IA e comparação rastreável | Provedor IA/OCR configurado e pranchas municipais; DEMO_RULES não é IA |
| 25 | Abertura externa e interna com documentos/checks configurados | Uploads autenticados e cenários de falha/arquivo/obrigatoriedade |
| 26 | Parecer, exigência, revisão externa e retorno ao analista | Percurso profissional–servidor com evidências na UI |
| 27 | Pró-análise e parecer consolidado preservados | Conferir apresentação externa das exigências/pranchas |
| 28 | Emissão no Process original, assinatura GED e publicação | Contas signatárias/certificado, documento e download reais |
| 29 | Analista inicial/substituição e reenvio idempotente testados | Repetir com troca de servidor/lotação e motivo formal |
| 30 | Cópia derivada carimbada, ligada à versão aprovada; assinatura/publicação e negativos de download testados | Percurso visual e formato oficial requerido; assinatura destacada não é PAdES |
| 31 | Gate de versão/hash/todas assinaturas obrigatórias em publicação/download | Negativas autenticadas em portal, API e GED genérico |
| 32 | Pedidos GED gerados durante emissão | Signatários municipais configurados, notificação e conclusão do pedido |
| 33 | Original/versão/hash e backup físico documental | Restauração do backup no ambiente de implantação e política de retenção |
| 34 | Consultas dirigidas, notificações e resposta imutável | Contas de setores distintos, prazo e retorno notificado |
| 35 | Termo imutável, aceite e snapshots nos envios | Termo municipal e conta externa verificada |
| 36 | Pedido documental CORRECTION e emissão relacionada | Análise/assinatura/publicação e recuperação do original |
| 37 | Pedido RENEWAL, vigência e taxa por ciclo próprio | Regra municipal, emissão substitutiva e vencimento |
| 38 | Participação autorizada, encerramento e histórico | Inclusão/substituição com contas reais e aceites necessários |
| 39 | Complementos GED com versão/hash e comunicação | Upload autenticado/estado/arquivo e revisão anotada |
| 40 | Pedidos externos e atendimento vinculado a inspeção/conclusão | Documento/checklist configurável e emissão final no mesmo processo |
| 41 | Prazos de projeto e vistoria, vencimento servidor/portal, reinspeção e regularização motivada com ledger | Notificações e percurso autenticado; política específica das exigências de viabilidade |
| 42 | Plano de vistorias criado atomicamente com deferimento | UI de seleção e conclusão bloqueada em caso de pendência |
| 43 | Catálogo de inspeções, plano e checklist versionado | Tipos específicos de obra/parcelamento homologados |
| 44 | DAM central, guia civil, encargos e FEBRABAN demonstrativo | Layout aprovado, convênio/DVs/retorno bancário homologados |
| 45 | Lote imutável/retificação/recibo `MUNICIPAL_DEMO_JSON_V1` | Leiaute e destino INSS/Receita oficiais e evidência de aceitação |
| 46 | Mensagens/anexos persistidos e notificações ao setor elegível | Conversa autenticada, histórico paginado e negativas de acesso |
| 47 | Scope setorial em serviços/UI/APIs e participação externa | Varredura autenticada de IDs alheios e todas as rotas/downloads |
| 48 | Distribuição, reenvio, assinatura e gates de transição | Trâmites automáticos municipais completos; workflow genérico externo permanece bloqueado |
| 49 | Processo cadastral vinculado, antes/depois e aplicação idempotente | Contas Cadastros/Obras e precisão no cadastro legado Float |
| 50 | Processo próprio sem alvará, notificações e autos | Fundamentos/modelos/autoridade municipais e ciência comprovada |
| 51 | Embargo/notificação preliminar/levantamento motivado | Competência legal, numeração oficial e vigência |
| 52 | Evidências/fotos GED de diligência, escopo e snapshots | Upload/impressão/download autenticados e arquivos reais autorizados |

## Evidências reproduzíveis

- Testes: `tests/construction*.test.ts`, com execução final registrada no plano principal.
- Ambiente/dados: `CONSTRUCAO_CIVIL_AMBIENTE_DEMONSTRATIVO.md`.
- Adaptadores e limites: `construction-integrations.md`.
- Migrations: `prisma/migrations-ibema/`, aplicadas pelo destino configurado em `prisma.config.ts`.
- Planejamento e andamento: `PLANO_CONSTRUCAO_CIVIL_CHECKLIST_POC_126-131.md`.

Execução integrada: **67 testes civis aprovados**, ESLint aprovado e 17 migrations civis aplicadas com checksums iguais aos arquivos locais. O teste de upgrade também confere que todas as tabelas/colunas civis do client gerado existem no histórico SQL. Após as correções finais, os testes de viabilidade foram repetidos e passaram, incluindo o cenário de processo sem setor. **TypeScript de produção e `npm run build` aprovados com código 0**, conforme registro no plano principal. Esses resultados não substituem a homologação visual/autenticada nem das integrações oficiais.

Após executar cada cenário autenticado, registrar conta/papel, processo, versão, arquivo/hash, resultado e evidência de tela/PDF. Somente esses resultados podem promover um item a homologado.
