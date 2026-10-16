# Portal da Transparência — mapa de atualização

Data: 12/10/2026. Código de referência: `c778b7b` (`portal 4`).

**Estado:** levantamento e planejamento. Esta rodada não implementa o novo portal nem carrega dados de apresentação no banco.

Documentos complementares:

- [Matriz requisito a requisito — Prefeitura e Câmara](MATRIZ_PORTAL_TRANSPARENCIA_CHECKLIST.md).
- [Backlog de execução, telas e critérios de aceite](PORTAL_TRANSPARENCIA_BACKLOG_EXECUCAO.md).

## 1. Decisões confirmadas com o usuário

1. Contemplar **Prefeitura e Câmara**, com consultas bem funcionais e as pesquisas/filtros do edital.
2. Utilizar a **API pública de Ibema** e os exemplos disponíveis. Completar cenários ausentes com **dados fictícios**, quando necessário para apresentação.
3. Priorizar o **básico funcional para demonstrar**; isso não reduz o levantamento dos requisitos nem comprova conformidade legal/PNTP integral.
4. Usar organização e aparência semelhantes às de Ibema: menu temático, entidade/exercício visíveis, filtros claros, tabelas, detalhes, publicações e exportações.
5. Esta etapa é **planejamento**, conforme esclarecimento expresso do usuário.

Dados reais de exemplo e complementos fictícios devem conservar identificação de origem. Não atribuir salário, CPF, vínculo, benefício ou dívida fictícia a pessoa real, nem apresentar totais combinados como contas oficiais de Ibema. A identidade visual/municipal deriva da instância; a origem dos exemplos permanece identificada.

## 2. Referências examinadas

### 2.1 Edital/checklists

| Fonte | Localização | Uso |
|---|---|---|
| `docs/Termo de Referencia/Checklist real POC MÓDULOS EXECUTIVO e CAMARA.pdf` | Executivo p. 163–169; Legislativo p. 291–297 | **58 itens numerados em cada checklist**. O item 13 contém nove detalhes de pessoal. As duas listas examinadas têm o mesmo conteúdo funcional. |
| `docs/Termo de Referencia/ESPECIFICAÇÕES FUNCIONAIS DOS MÓDULOS EXECUTIVO.pdf` | p. 107–110, itens **1.1375–1.1441** | Correspondência com o descritivo. PNTP está no final (1.1441), enquanto aparece como item 4 no checklist. Não mapear apenas por deslocamento numérico. |
| Publicação simultânea de relatórios/atos nos módulos de origem | Planejamento, Contabilidade, Compras e Controle Interno | Dependências transversais de publicação; não duplicar os livros ou cadastros internos. |

A matriz mantém os 58 itens como unidades do checklist e detalha os nove componentes de pessoal separadamente. Isso não autoriza recalcular percentuais do edital com outro denominador.

### 2.2 Novos Docs

Base: `docs/Novos docs/Novos docs/`. IDs documentais são os de `CATALOGO_NOVOS_DOCUMENTOS_IBEMA.md`.

| ID/fonte | Evidência e aplicação ao portal |
|---|---|
| **127 — Relatório Anual de Monitoramento do Portal Transparência 2025.pdf**, p. 1–3 | Nota histórica ITP **96,74**, classificação Diamante, do Executivo de Ibema. P. 2 aponta obras com preços unitários/totais, acessibilidade por redimensionamento, beneficiários de renúncia e PAS. **P. 3 declara já implementadas** as correções de obras, beneficiários e PAS; a alteração de texto do site não aparece entre essas três conclusões. A nota não pertence ao Celeriflow. |
| **014/022 — capturas de publicações e servidores** | Barra de entidade/exercício, A+/A-/contraste/ajuda, pesquisa e limpeza, filtros de pessoal, abas de servidores/estagiários/autônomos/quantidades, remuneração, última atualização, ordenação e exportações. Publicações em árvore com competência, tamanho/data e download. |
| **110 — pt ibema 2025.pdf**, p. 1–3 | A imagem mostra **2026**, apesar do nome. Painéis de arrecadado/pago/previsto atualizado/empenhado/orçado, séries mensais, repasses, pessoal, Saúde e Educação, links RGF/RREO. Usar estrutura/metodologia; não extrair séries financeiras completas de pixels. |
| **087 — Links de Transparencias e APIS.txt** | Base pública Elotech e publicações Social/CMDCA. Informa não adoção de adiantamento de despesas e verbas de gabinete na fonte: preservar declaração, período e entidade. Isso não elimina a funcionalidade genérica. |
| **008–011, 031–042, 091–096, 123–126, 131** | Balancetes, balanços, RREO/RGF/DCASP por período. Publicação deve identificar anexo, competência, edição, entidade, fonte e formato. Relatórios zerados não comprovam inexistência permanente de operações. |
| **046–053, 061–074, 079, 081–085, 100–101** | Orçamento por órgão/unidade/função/subfunção/programa/ação/natureza/fonte; PPA/LDO/LOA e alterações. Distinguir orçamento inicial, atualizado, movimento do período e acumulado. |
| **075, 113–115, 140–141** | Receitas previstas/realizadas, tributos, deduções e CSV. Não somar pais e folhas da hierarquia ou acumulados de meses diferentes. |
| **015–018, 021, 054–056, 076, 132–134** | Compras, itens/quantidades/preço unitário/total, documentos fiscais, contratos, notas e relações de emitidos/liquidados/pagos. **O exemplo 054 é nota de empenho, não comprovante de pagamento**, apesar do nome do arquivo. |
| **019–020, 023, 135, 138–139** | Transferências, termos, repasses e convênios. Separar recebido/concedido, vigência, saldo, íntegra, prestação e estágio; repasse não comprova entrega ou aprovação das contas. |
| **013, 058–059, 088–090, 104, 111, 137** | Diárias, estagiários, concursos/PSS, quantidade de pessoal, ativos e quadro de vagas. Referências temporais diferentes; matrícula não é pessoa distinta; carga semanal não é automaticamente jornada mensal. As relações não fornecem toda a remuneração analítica. |
| **006, 025–026, 077–078, 098–099, 102, 109, 128–129, 136** | Audiências, governo digital, estrutura, responsáveis, contas, controle e monitoramento. Tramitação/análise técnica não equivalem a julgamento definitivo; organograma histórico exige versão/vigência. |
| **001/003/012/107/112; 029/103/106/116/118** | Saúde: PMS, carteira, RDQA/RAG; Social: PMAS, CMAS, planos/regimento/gestão. Publicar documentos/indicadores agregados e conselhos, sem transformar prontuários ou dados de beneficiários protegidos em transparência nominal geral. |

Os documentos da pasta são predominantemente do Executivo. A Câmara precisa de correspondência de fontes própria ou de cenário fictício explicitamente identificado; não herda contas, servidores, contatos ou a nota do Executivo.

### 2.3 PNTP/ATRICON

Fontes oficiais consultadas:

- `https://pntp.atricon.org.br/dados-abertos/`
- Cartilha PNTP 2026: `https://cdn.atricon.org.br/2026/08/Cartilha-PNTP-2026.pdf`
- Matriz 2026: `https://cdn.atricon.org.br/2026/08/criterios_pntp_2026.zip`

O requisito TP-004 exige a cartilha completa. Foram localizadas as fontes oficiais; **a cartilha/matriz 2026 ainda não foi transcrita e auditada critério a critério nesta rodada**. O backlog inclui esse desdobramento por Poder, com versões e aplicabilidade. Quatro pontos do relatório municipal não substituem toda a matriz PNTP.

## 3. O que já temos no Celeriflow

| Base | Funcionalidade encontrada | Limite atual |
|---|---|---|
| **B01 — `/portal-transparencia`** | Página pública sem cadastro; abas despesas/receitas; filtros, tabelas, paginação; contratos, licitações, relatórios, avisos e contato | Página única, sem navegação temática/entidade global/painel de Ibema e sem área pública de pessoal |
| **B02 — `portal-fiscal.ts`** | Empenhos e somas de liquidações/pagamentos; arrecadação; filtros por ano, busca, unidade, fonte, natureza/classificação e tamanho de página; DTO público | Sem intervalo de datas, seleção de entidade, ordenação solicitada pelo cidadão, eventos individuais e totais integrais de consulta |
| **B03 — APIs públicas** | `/api/transparencia/despesas`, `/receitas`, `/contratos`, `/licitacoes`: JSON/CSV; CSV neutraliza fórmulas | Exportação despesas/receitas é **da página**; contratos/licitações limitam a 100 sem paginação/total completo. TXT existe como utilitário, não como formato exposto dessas APIs |
| **B04 — relatórios públicos** | Consulta de snapshots RREO/RGF/balancete/balanços/PCA por exercício/entidade/versão; download de CSV publicado | Biblioteca fiscal completa e todos os anexos/leiautes oficiais não demonstrados. Metadados internos indicam `NOT_STATUTORY` |
| **B05 — planejamento público** | `/portal/planejamento`, APIs `/api/transparencia/planejamento[/publicKey]`: PDF/CSV, entidade/ano, paginação, SHA-256, arquivo preservado, retry/retirada | Ainda identifica cópia para conferência/leiaute não homologado; filtro de entidade é por nome e não seletor unificado. Não é a biblioteca de todas as publicações |
| **B06 — gestão `/transparencia`** | Notícias, páginas, diário, banners e listagens administrativas de contratos/licitações; RBAC nas ações encontradas | Não configura o catálogo de consultas, grupos, entidades, ano inicial, hints, templates/anexos e telemetria de transparência. Botão de novo banner aponta a uma rota não encontrada no inventário |
| **B07 — institucional** | `PortalShell`: acessibilidade por fonte/contraste, menu e links; páginas de dados abertos, mapa, contatos, ouvidoria/e-SIC e legislação | `/portal-transparencia` é rota irmã de `/portal`: **não herda PortalShell**. Leis e canais e-SIC/ouvidoria são, em parte, páginas informativas; Fale Conosco atual não é fluxo completo de protocolo/acompanhamento |
| **B08 — avisos** | `PublicNotice`: publicação redigida e validação pública de título/categoria/data, sem narrativa/anexos | Não é pop-up com imagem nem publicação de um processo integral; limite 100 |
| **B09 — módulos de origem** | RH/Folha/Portal do Servidor, Compras, Financeiro, Planejamento, Obras, Patrimônio/Almoxarifado, Frotas, Tributação, Saúde/Social e GED | Existência de cadastro/relatório interno ou documento pessoal autenticado não comprova sua projeção pública |

### Evidências de código importantes

- Página pública: `src/app/portal-transparencia/page.tsx`.
- Projeções/APIs: `src/lib/transparencia/{portal-fiscal,portal-public,public-notices}.ts`, `src/app/api/transparencia/`.
- Publicação robusta reaproveitável: `src/lib/planejamento/publication.ts` — bytes/sha, confirmação de storage, autorização, lease/retry e retirada.
- Conteúdo institucional: `src/lib/portal-institucional/public-content.ts`, `src/components/portal-institucional/PortalShell.tsx` e `src/app/portal/`.
- Administração: `src/app/app-domain/transparencia/`.

## 4. Correções prioritárias identificadas no código

1. **Classificação sem dados inventados:** `portal-fiscal.ts` devolve função/subfunção com nomes fixos de Administração, corta posições do código e insere programa/ação/histórico padrão quando faltam dados. Substituir por dimensões reais ou indicação de ausência; não usar esses campos como caso ouro de conferência.
2. **Entidade e consolidação:** filtros principais não recebem entidade; ano na despesa vem da emissão do empenho, enquanto pagamento/liquidação podem ser de outro período. Separar exercício de origem e período de movimentação, inclusive restos a pagar.
3. **Precisão e movimentos:** somas públicas usam conversão `Number`; faltam anulações/estornos/saldos e diferenciação de bruto, retenção e líquido. Planejar Decimal/centavos e reconciliação por escopo/período.
4. **Integridade/publicação:** helper legado `publishApprovedSnapshot` calcula hash da **URL**, não dos bytes, e não foi encontrado como fluxo efetivo de chamada. Download fiscal público não verifica hash. Preferir o padrão de publicação preservada já existente em Planejamento.
5. **Fechamento anual:** `annualReportTypes` contém balanços orçamentário/patrimonial, mas não PCA, apesar da mensagem do helper mencionar PCA. Especificar regra real por relatório, sem extrapolar comportamento.
6. **Declarações de funcionalidade sem prova:** FAQ utilitário fala em dados em tempo real, fornecedor pesquisável, publicação automática e reconciliação centavo a centavo. O utilitário não foi localizado na página pública, e o motor `reconcilePublicAndInternalData` não tem consumidor encontrado; suas comparações são agregações de fatos, não evidência completa contra o razão.
7. **Publicidade por campo/categoria:** hoje credor PF vira `PESSOA FÍSICA`, e CNPJ também é parcialmente mascarado. Isso impede parte dos requisitos nominais. Planejar projeções específicas básicas para apresentação, CPF protegido e sem dados bancários, endereço residencial, contracheque privado, CID ou dívida individual exposta indiscriminadamente.
8. **Exportação completa:** botão atual declara “Exportar página”. Implementar exportação integral dos filtros, paginação estável e totalizadores; não chamar CSV limitado de base completa.
9. **Atualização:** `updatedAt` das APIs é o máximo dos registros da página de empenhos/receitas, não de todas as fontes/etapas. Definir corte da base e atualização do conjunto/consulta por entidade/fonte.

## 5. Desenho proposto — parecido com Ibema, com consulta mais direta

```text
Brasão/identidade da entidade | Menu | Pesquisar consultas | Radar | e-SIC/Ouvidoria
Entidade [Prefeitura / Câmara / Consolidado] | Exercício [ano] | Fonte/corte da base
Acessibilidade: A+ A- Aa | contraste | atalhos | Libras | ajuda

Início → Painéis e atalhos temáticos
Receitas / Despesas / Pessoal / Compras e Contratos / Obras / Publicações

Consulta escolhida
  Filtros específicos + pesquisa + aplicar + limpar
  Atualização do conjunto + totalizadores do filtro
  Tabela ordenável, compacta, responsiva e paginada
  Detalhe do registro → origem + eventos + itens + anexos autorizados
  Exportar consulta completa / imprimir / formatos / dicionário
```

- Verde de destaque, fundos claros, cartões discretos e tabelas semelhantes às referências; identidade parametrizada por entidade.
- Menu pode ser lateral/recolhível, mantendo entidade/ano e a busca sempre identificáveis. Menus e atalhos devem apontar à mesma consulta, sem faixas/cards repetitivos.
- Árvore de publicações por grupo → assunto → exercício → período → arquivo, com data, versão, tamanho, formato e ordem dos anexos.
- Painéis: arrecadado, previsão inicial/atualizada, empenhado, liquidado, pago bruto/líquido conforme metodologia, repasses e séries mensais. Mostrar fórmula dos percentuais; consolidado elimina fluxos internos quando aplicável.
- Pessoal: abas de servidores/estagiários/autônomos/quantidades/quadro remuneratório/vagas/cessões/inativos, com os campos do edital. Inatividade no Portal do Servidor privado não elimina o histórico legalmente publicável da área pública.

## 6. Base de apresentação e exemplos

### API pública confirmada

Base: `http://transparencia.pibema.pr.gov.br:8087/portaltransparencia-api`.

- OpenAPI 3.0.1 consultado: `/v3/api-docs`; servidor declarado omite a porta **8087**.
- Sete rotas GET documentadas: `/empenhos/lista`, `/api/servidores`, `/api/receitas`, `/api/liquidacoes/pagas`, `/api/liquidacoes/pagar`, `/api/licitacoes`, `/api/dividas-ativas`.
- Páginas começam em **0** nos endpoints paginados. Headers `entidade`/`exercicio` variam por endpoint; receitas retornam array, não o mesmo envelope paginado.
- Empenhos exigem `search` RSQL na consulta examinada; adapter deve montar/escapar filtros permitidos e fixar entidade/exercício, sem aceitar RSQL arbitrário do navegador.
- Amostras efetivas consultadas: empenhos da entidade 1/exercício 2026, `page=0&size=1`, retornaram envelope com **8.850** registros declarados; licitações retornaram envelope com **70**. São contagens da resposta observada, não nova carga ou validação aritmética de toda a base.
- **Entidade 1 foi confirmada como Prefeitura de Ibema. Código/API da Câmara não confirmado**; não assumir que seja 2.

### Estratégia dos exemplos

| Origem | Uso planejado | Identificação obrigatória |
|---|---|---|
| API pública | Casos reais de consultas/filtros e coleta controlada para apresentação | Provedor/base, entidade externa, exercício, corte/coleta, chave e hash da resposta |
| PDFs/CSVs Novos Docs | Biblioteca de publicações, modelos e casos de comparação | ID documental, nome/página, competência e edição; distinguir documento de movimento estruturado |
| Dados nativos Celeriflow | Integração com módulos e conferência de cadeia/consulta | Entidade interna, registro/evento, período e versão |
| Dados fictícios complementares | Câmara sem fonte confirmada; filtros vazios; casos de cessão/inativos/vagas/obras etc. | Origem “dados de exemplo”, entidade/identidade fictícia e chave própria; jamais sobrepor dado real |

Planejar dois percursos: **consultar exemplos da API/publicações** e **consultar registros nativos do Celeriflow**. O primeiro não encerra sozinho TP-028, que exige integração automática com módulos instalados. URLs, fontes e datasets ficam configurados, não espalhados em componentes nem misturados ao livro financeiro real.

## 7. Critério do básico funcional para apresentação

O primeiro conjunto deve demonstrar: mudança Prefeitura/Câmara/consolidado; ano e período; pesquisa combinada; ordenação código/data/valor/nome; limpar sem perder contexto; paginação/totalizadores; detalhe emitido→liquidado→pago; filtros de pessoal; publicações por categoria/competência; CSV integral e PDF; navegação de e-SIC/ouvidoria; acessibilidade e mensagem correta de origem/ausência de dados.

Uma apresentação com esses percursos é entrega funcional inicial. O checklist completo, PNTP, homologação documental/legal, conectores e migração conciliada têm os próprios critérios de fechamento no backlog.

## 8. Verificação desta rodada

- Inventário por leitura de código, comparação das duas listas do edital e das referências documentais/visuais.
- Site de Ibema e OpenAPI acessíveis; duas chamadas GET de dados verificadas. A aplicação de Ibema é SPA; o HTML inicial não revela todos os menus, e a observação visual é apoiada nas capturas fornecidas.
- **27 testes existentes aprovados:** `public-finance.test.ts`, `planning-publication.test.ts`, `c4-public-notice-policy.test.ts`.
- Os testes demonstram os cenários cobertos, inclusive projeção/CSV, publicação preservada/retry/retirada e avisos redigidos; não comprovam todos os 58 requisitos, PNTP integral ou navegação em produção.
- Não foram alterados código de aplicação, schema ou migrations nesta análise. Nenhuma importação/carga de dados foi realizada.
