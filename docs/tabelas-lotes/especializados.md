# Lote especializados — cobertura e evidências

Data: 29/10/2026. Referências lidas: `AGENTS.md`, `docs/TABELAS_CONTRATO_EXECUCAO.md`, `docs/Padrão de Tabelas.md`, plano e inventário de tabelas, documentação instalada do Next sobre layouts/páginas e componentes server/client.

## Resultado e limites da evidência

- **32 estruturas operacionais do inventário implementadas**, em **36 rotas concretas** do manifesto `src/components/app-ui/operational/modules/especializados.ts`.
- Câmara 8; Cemitérios 4; Cultura 3; Segurança 1 (nove consumidores); Protocolo 8; Transparência administrativa 8.
- Mais **uma visualização adicional de atas**, antes em cartões, integrada à mesma paginação de sessões. Não somada novamente ao inventário de 32.
- **Um legado convertido para painel operacional** e **dois documentos especiais preservados**, discriminados abaixo.
- **Uma grade de edição adicional convertida:** destinos complementares de Transparência, identificada pelo baseline e pelo JSON do auditor.
- Situação `implementada` significa adaptação de código à API comum. **Nenhuma estrutura recebeu homologação visual nem situação `validada` de geometria.** A base comum está disponível e a verificação TypeScript restrita ao lote passou.
- Não foram alterados `src/components/app-ui/planejamento`, `src/components/cemeteries`, `ClientLayout`, `ModuleShell`, primitives operacionais, actions, repositórios Drizzle ou schemas de banco.

### Revisão de remanescentes e larguras — segunda entrega

Escopo revisado após a disponibilização das APIs comuns e das dependências Next 16.4.3/Drizzle. A política vigente autoriza rolagem em tablet/celular; desktop/notebook continuam sem rolagem de tabela. O alvo horizontal verificado é **1224px úteis em notebook de 1280px**, com a fonte preservada e detalhes condicionais de células **e cabeçalhos** fornecidos pela base.

Foram lidas individualmente as configurações dos 30 arquivos que definem **35 variantes tabulares**: 32 originais operacionais, atas, legado e a grade de destinos. O teste `tests/especializados-table-widths.test.ts` extrai somente as configurações puras via AST, sem importar páginas/actions/ORM, e executa o algoritmo comum. Todas as 35 distribuem exatamente 1224px, respeitam mínimos/máximos e preservam a largura total nos extremos de resize. O teste também confere a quantidade de colunas de cada variante.

| Configuração revisada | Mínimo anterior → atual | Campos |
|---|---:|---:|
| Consulta de Cemitérios | 1165 → **836px** | 11 |
| Processos de Cemitérios | 1080 → **722px** | 10 |
| Regras de taxas | 970 → **640px** | 10 |
| Eventos e DAMs | 1500 → **926px** | **14**, incluindo todos os campos e ações |
| Acompanhamento de Protocolo | 1275 → **806px** | **12**, sem fusão de campos |
| Caixa de protocolos | 885 → **797px** | 9 |
| Catálogo de serviços | 690 → **591px** | 6 |
| Publicações | 775 → **741px** | 8 |
| Atas (ações) | 690 → **617px** | 7 |
| Consulta legada de Cemitérios | sem resize → **720px** | 9 |
| Destinos complementares | grade anterior → **748px** | 9 |

As demais configurações também passaram pela leitura e pelo teste de encaixe; seus mínimos já permitiam o alvo de notebook. Nos conjuntos extensos, textos usam prévias de 50–110px e identificadores a partir de 80px. Uma ação de ícone precisa de 56px; duas ações preservam 72px e três em Segurança mantêm 95px. A fonte, os dados completos, os nomes completos de cabeçalhos e o acesso aos campos continuam preservados. **Encaixe algorítmico não comprova a geometria vertical/CSS no navegador.**

O legado conserva seu contrato `{ data }`, a reexportação de Tributação e os formulários/contextos existentes. Sua consulta abre `OperationalTablePanel` → `OperationalListFrame` → `OperationalTable`, com 20 registros; comprovantes continuam sendo links. A impressão tem uma saída `print-only` com **todo o conjunto filtrado**, independente da página visível. A área de anexos/histórico não foi editada.

A grade adicional de `src/components/transparencia/DiscoveryPresentationEditor.tsx` agora chama `DiscoveryLinksTable.tsx`. O rascunho completo permanece no pai; página, filtro, fechamento de painel, edição e remoção não recortam o array enviado. `discovery-link-drafts.ts` serializa todos os destinos com os nomes esperados pela action original, preservando checkbox desmarcado, versão e atalhos. Leitura/paginação também funcionam sem permissão de atualização; somente mutações ficam desabilitadas. A validação de data futura de revisão é aplicada ao conjunto inteiro, inclusive páginas não visíveis.

## Implementação comum ao lote

Todas as listagens operacionais usam `OperationalTable` e `OperationalListFrame`, com configurações de `OperationalColumn`, valores integrais, limites explícitos e detalhes de texto condicionais ao overflow. Fonte e ajuste de larguras são delegados aos tokens comuns (`--op-font: .8125rem`, equivalente a 13px com raiz de 16px). Colunas anteriormente ocultas por breakpoint passam a permanecer declaradas.

Busca/filtros precedem o recorte; paginação client limita a 20 com `OPERATIONAL_PAGE_SIZE`, retorna a 1 na mudança de filtros e limita páginas inválidas conforme o total. Listagens server preservam o ORM, escopos de acesso e ordenações originais; usam `OperationalLinkPagination` com parâmetros completos. Solicitações de serviços e publicações passaram de 30 para 20. Acessos passaram de um corte inacessível de 100 para paginação real do total, com desempate por ID.

Ações gerais ficam no header via `actions`/`OperationalHeaderActions`. Filtros excedentes ficam em `OperationalFilters`. Seleção de recebimento continua em `cells.selection`, e ações de recebimento individual/lote mantêm suas permissões e tratamento de retorno. A assinatura mantém reautenticação Firebase e a mesma action, agora com diálogo acessível; dados e total são atualizados juntos pela navegação/refresh do servidor.

Atas e pautas são aplainadas **antes** do recorte: a página contém 20 atas ou matérias, em vez de 20 sessões com número ilimitado de subtabelas. Número/tipo/data da sessão permanecem em colunas próprias. Regras e eventos de taxas têm visões alternáveis, paginações e parâmetros independentes, preservando acesso aos dois totais.

## Cobertura por estrutura

Bases abreviadas: `camara`, `cemiterios`, `cultura`, `seguranca`, `protocolos`, `transparencia` estão em `src/app/app-domain/`. A coluna “mínimo” é **soma declarada de mínimos em CSS px com raiz 16px**, não medição de navegador. A base operacional deve diagnosticar a falta de espaço em vez de ocultar colunas ou reduzir fonte.

| ID | Arquivo / rota / variante | Colunas preservadas e campos separados | Dados / paginação | Mínimo | Situação |
|---|---|---|---|---:|---|
| C01 | `camara/legislaturas/LegislaturasClient.tsx` · `/camara/legislaturas` | Número, período, vereadores, status, ações | Lista carregada; filtros client → 20 | 455 | implementada |
| C02 | `camara/leis/LeisClient.tsx` · `/camara/leis` | Número, tipo, ementa, autoria, publicação, situação, ações | DTO original de `listLaws`; client 20 | 640 | implementada |
| C03 | `camara/proposicoes/ProposicoesClient.tsx` · `/camara/proposicoes` | Número, tipo, autoria, assunto, data, situação, ações | DTO original; criação por `NewProposicaoSheet` no header; client 20 | 645 | implementada |
| C04 | `camara/sessoes/SessoesClient.tsx` · `/camara/sessoes`, sessões | Número, tipo, data/hora, local, quórum, status, ações | Lista carregada; client 20 | 655 | implementada |
| C05 | Mesmo arquivo, pautas | Sessão, tipo de sessão, data/hora, matéria, tipo de matéria, ementa, situação | Todas as matérias das sessões filtradas → 20; sem subtabelas simultâneas | 680 | implementada |
| C06 | `camara/vereadores/VereadoresClient.tsx` · `/camara/vereadores`, vereadores | Nome parlamentar, nome completo, partido, legislatura, telefone, e-mail, status, ações | Lista carregada; filtros client → 20 | 705 | implementada |
| C07 | Mesmo arquivo, mesa | Cargo, vereador, partido, ações | Cargos ativos das pessoas filtradas → paginação própria de 20 | 370 | implementada |
| C08 | Mesmo arquivo, gabinetes | Vereador, sala, andar, telefone do gabinete, ramal, ações | Filtros client → 20; troca de visão retorna à página 1 | 535 | implementada |
| CE01 | `cemiterios/consulta/page.tsx` · `/cemiterios/consulta` | Comprovante, falecido, óbito, tipo, situação, cemitério, funerária, causa, agendamento, realização, ações | `listCemeteryProcesses`, server 20; preserva todos os filtros de `cemeteryQuerySchema` e relatório integral | 836 | implementada; encaixe 1224 verificado |
| CE02 | `cemiterios/processos/page.tsx` · `/cemiterios/processos` | Comprovante, pessoa, tipo, sepultamento, situação, agendamento, cemitério, sepultura, capela, ações | `readScheduledProcessPage`, server 20; permissões create/update e `WorkflowAdvance` preservados | 722 | implementada; encaixe 1224 verificado |
| CE03 | `cemiterios/taxas/page.tsx` · `/cemiterios/taxas?view=regras` | Evento, versão, descrição, abrangência, fórmula, valor-base, vigência inicial/final, prazo, fundamento | `listCemeteryFeeRules`, server 20, `rulesPage` | 640 | implementada; encaixe 1224 verificado |
| CE04 | Mesmo arquivo, `view=eventos` (padrão) | Fato, data, tipo de origem, origem, contribuinte, cálculo, quantidade, vencimento, situação, erro, lançamento, DAM, situação do DAM, ações | `listCemeteryFeeEvents`, server 20, `eventsPage`; retry/reimpressão e valores integrais preservados | 926 | implementada; encaixe 1224 verificado |
| CU01 | `cultura/components/AtividadesEsporteLazerClient.tsx` · `/cultura/esporte-lazer` | Identificação, categoria, responsável, data, situação, ações | DTO e busca diferida originais; client 20; público/período/espaço/responsáveis no detalhe | 550 | implementada |
| CU02 | `cultura/components/CulturaProjetosClient.tsx` · `/cultura/fomento-projetos` | Número, identificação, categoria, responsável, data, situação, ações | DTO original; client 20; valor, documentos, vínculos e descrição integral preservados | 620 | implementada |
| CU03 | `cultura/components/GestaoCulturalClient.tsx` · `/cultura/gestao-cultural` | Identificação, categoria, classificação, situação, ações | Registros integrados originais; client 20; referências no detalhe; totais Cadastro/Patrimônio/RH no header | 450 | implementada |
| S01 | `seguranca/components/SegMobCrudClient.tsx` · nove rotas abaixo | Código, título, tipo, local/equipe, bairro/região, status, data, ações | Configuração e lista originais; filtros client → 20; CRUD, ativação, confirmações e forms preservados | 770 | implementada; encaixe 1224 verificado |
| P01 | `protocolos/acompanhamento/page.tsx` · `/protocolos/acompanhamento` | Protocolo, tipo, assunto, interessado, setor, responsável, situação, prazo, origem/destino/data da última tramitação, ação | Drizzle/`listProcessTracking`; server 20; escopo, filtro administrativo de setor, indicadores e `returnTo` preservados | 806 | implementada; encaixe 1224 verificado |
| P02 | `protocolos/arquivados/ArquivadosClient.tsx` · `/protocolos/arquivados` | Protocolo, tipo, assunto, interessado, arquivado em, status, ação | Página server original, 20; busca preservada em todas as páginas | 710 | implementada |
| P03 | `protocolos/assinaturas/AssinaturasClient.tsx` · `/protocolos/assinaturas` | Documento, processo, tipo de documento, solicitado em, situação, ação | Página server original, 20; mantém reautenticação/assinatura e retorna erros na UI | 635 | implementada |
| P04 | `protocolos/busca/BuscaClient.tsx` · `/protocolos/busca` | Protocolo, tipo, assunto, interessado, abertura, status, ação | Página server original, 20; query preservada | 700 | implementada |
| P05 | `protocolos/ouvidoria/page.tsx` · `/protocolos/ouvidoria` | Protocolo, tipo, assunto, manifestante, situação, abertura, ação | Drizzle/escopo e anonimização originais; server 20; identidade restrita não entra em `values` | 700 | implementada |
| P06 | `protocolos/processos/ProcessosClient.tsx` · `/protocolos/processos` | Seleção, protocolo, origem, tipo, assunto, interessado, data, status, ação | Página server original, 20; seleção e recebimento individual/lote preservados | 797 | implementada; encaixe 1224 verificado |
| P07 | `protocolos/servicos/ServiceCatalogEditor.tsx` · `/protocolos/servicos` | Serviço, slug, público, executor, publicação, ação | Lista original; busca client → 20; editor versionado e avisos em variantes de formulário | 591 | implementada |
| P08 | `protocolos/servicos/solicitacoes/page.tsx` · `/protocolos/servicos/solicitacoes` | Protocolo (link), serviço, situação, setor, abertura, ações | Drizzle original; server **20**, total filtrado; formulário de programação separado | 620 | implementada |
| T01 | `transparencia/acessos/page.tsx` · `/transparencia/acessos` | Data, consulta, entidade, exercício, fonte, IP | Drizzle, server 20 de todo o total; mantém controle de acesso e inventário documental | 665 | implementada |
| T02 | `transparencia/banners/BannersClient.tsx` · `/transparencia/banners` | Título, posição, vigência inicial/final, ordem, situação, ações | DTO original; client 20; imagem/destino no preview composto | 635 | implementada |
| T03 | `transparencia/contratos/ContratosClient.tsx` · `/transparencia/contratos` | Número, fornecedor, objeto, início, fim, valor, situação, ações | DTO original; client 20; Compras e preview integral preservados | 770 | implementada; encaixe 1224 verificado |
| T04 | `transparencia/diario-oficial/DiarioTable.tsx` · `/transparencia/diario-oficial` | Edição, data, tipo, situação, publicação, ações | Lista original; client 20; PDF, confirmação de exclusão, pending e ajuste de página preservados | 560 | implementada |
| T05 | `transparencia/licitacoes/LicitacoesClient.tsx` · `/transparencia/licitacoes` | Número, processo, modalidade, objeto, abertura, situação, ações | DTO original; client 20; valor estimado e contexto no preview | 660 | implementada |
| T06 | `transparencia/noticias/NoticiasTable.tsx` · `/transparencia/noticias` | Título, categoria, publicação, responsável, situação, ações | Lista original; client 20; subtítulo/imagem/conteúdo integral e exclusão preservados | 585 | implementada |
| T07 | `transparencia/paginas/PaginasTable.tsx` · `/transparencia/paginas` | Título, rota, seção, atualização, situação, ações | Lista original; client 20; texto integral e exclusão preservados | 585 | implementada |
| T08 | `transparencia/publicacoes/page.tsx` · `/transparencia/publicacoes` | Documento, arquivo, entidade, exercício, assunto, competência, situação, ações | Drizzle original; server **20**, total filtrado e página limitada; status e busca mantidos | 741 | implementada; encaixe 1224 verificado |
| CE-L | `cemiterios/CemiteriosClient.tsx` · sem rota, aba consulta | Tipo, comprovante, falecido, óbito, status, agendamento, funerária, sepultura, capela | Array original filtrado, client 20 em painel local; impressão integral separada | 720 | legado adaptado |
| T-E | `src/components/transparencia/DiscoveryLinksTable.tsx` · `/transparencia/apresentacao` | Título, seção, descrição, destino, responsável, revisão, ordem, publicado, ações | Rascunho no pai, client 20 em painel local; payload integral ao salvar | 748 | grade de edição convertida |

### Consumidores de Segurança

`/seguranca/guardas`, `/seguranca/ocorrencias`, `/seguranca/rondas`, `/seguranca/defesa-civil`, `/seguranca/transito`, `/seguranca/infracoes`, `/seguranca/mobilidade`, `/seguranca/ordens`, `/seguranca/documentos`. As nove páginas e suas configurações foram lidas. É uma implementação compartilhada contada uma vez. A emissão instantânea de infração foi retirada da faixa acima da tabela e permanece acessível pelo header em `view=emitir`.

## Formulários e arquivos auxiliares

Variantes excluídas do workspace operacional no manifesto:

- `/cemiterios/processos?view=novo`: formulário de agendamento completo, com conferência de débitos, confirmações e referência de origem.
- `/cemiterios/taxas?view=nova-regra|adicional`: publicação de regra e fato gerador adicional. Regras/eventos continuam acessíveis nas visões de listagem.
- `/seguranca/infracoes?view=emitir`: emissão instantânea original.
- `/protocolos/servicos?view=novo|editar|avisos`: edição versionada, configuração e publicação de avisos originais. O ID acompanha a edição e o componente é remontado por modo/ID para inicialização correta.
- `/protocolos/servicos/solicitacoes?view=programar`: programação com os pedidos da página/filtro selecionados; a grade de checkboxes original permanece no formulário, sem recortar silenciosamente seleção ainda não salva.
- `/transparencia/publicacoes?view=configuracoes|editar`: configurações, upload, consultas customizadas, declarações, relatórios integrais, links externos, metadados e classificação documental. `PublicationTools.tsx` mantém os campos/nomes de formulário e as mesmas actions.

Wrappers server de Câmara, Cultura e Transparência foram compactados individualmente, mantendo queries/DTOs e ações no header. `cemiterios/layout.tsx` usa `useOptionalOperationalWorkspace` para evitar o wrapper com scroll nas rotas registradas. Os layouts que já compõem apenas `ModuleShell` dependem do reconhecimento de workspace da base comum, conforme o contrato.

Auxiliares novos do domínio: `camara/components/LegislativeRecordMenu.tsx`, `cemiterios/ProcessRowMenu.tsx` e `transparencia/publicacoes/PublicationRowMenu.tsx` usam os diálogos existentes e acionadores de 24px para não aumentar a altura das linhas. `transparencia/ContentPreview.tsx` pagina texto composto por espaço medido, com copiar tudo; preserva imagens com altura limitada. A descrição longa de projetos e o detalhe de Segurança também passaram a leitura medida em trechos, sem scroll de texto desktop. Modais de **edição de formulários** mantêm seus comportamentos próprios.

### Legado e especiais

| Arquivo / rota | Verificação / decisão | Situação |
|---|---|---|
| `cemiterios/CemiteriosClient.tsx` | Consumidores conferidos: reexportação em `tributacao/cemiterios/CemiteriosClient.tsx`, nenhuma página consumidora. Consulta convertida para painel/tabela de 20 e cópia de impressão integral. O auditor agora o reconhece como `mapped-legacy`. | legado adaptado |
| `cemiterios/relatorio/page.tsx` · `/cemiterios/relatorio` | Relatório integral, filtros, PDF, impressão e evidência de emissão preservados. A leitura da rota registra emissão; a rota não foi executada para evitar mutação no banco. | especial |
| `cemiterios/taxas/guias/[id]/page.tsx` · `/cemiterios/taxas/guias/[id]` | Documento de arrecadação, pagamentos, saldo Decimal e impressão preservados, sem corte em páginas de 20. | especial |

Planejamento/Câmara e `src/components/cemeteries/StructurePages.tsx` pertencem a outro lote. As páginas consumidoras não foram contadas novamente. Cartões de comissões, transferências e consultas não tabulares não foram convertidos automaticamente nem registrados como migrações adicionais.

## Conflitos reais / integração

1. **Base disponível:** a dependência registrada na primeira entrega foi resolvida. A checagem TypeScript restrita aos seis domínios, manifesto, componentes de destinos e testes passa. Foram corrigidas duas incompatibilidades próprias encontradas nessa checagem: união de `values` em Vereadores e adaptação de `asset.description` para o `name` esperado pelo formulário de programação; nenhum repositório foi alterado.
2. **Limites horizontais revistos:** nenhuma das 35 configurações excede o alvo de 1224px úteis no algoritmo comum; todas passam também pelos extremos de resize. O maior mínimo agora é 926px. Tablet/celular têm rolagem autorizada pela política vigente; não é necessário eliminar campos para cobrir essas classes. A altura útil e o CSS real continuam pendentes de homologação.
3. **Escopo dinâmico do menu de Cemitérios.** O layout original acrescenta `cemeteryId` aos destinos usando search params; o manifesto é estático. As consultas, paginações, formulários e links do lote preservam o filtro. Para preservar também a propagação automática desse escopo ao clicar no menu do workspace, o executor principal precisa transportar os parâmetros de contexto para a navegação operacional. A API contratada não disponibiliza um setter de navegação no hook opcional; este é um ponto de integração real, não resolvido alterando o shell fora da reserva do lote.
4. **Orçamento vertical/zoom e previews compostos:** ainda precisam de navegador após a integração. A referência da base é corpo de `(20 + 1) × 24 = 504px`, antes da toolbar/rodapé/header, com aumento conforme zoom. Nenhuma medição de viewport deste lote foi executada; os números de mínimos acima não homologam geometria.
5. O inventário documental não tabular de acessos pode ter muitos grupos; está disponível em sobreposição. Se o conjunto real ultrapassar a área do diálogo, a menor adaptação é uma visão própria de inventário ou leitura por grupos. Depende de medir o volume real na homologação.
6. Os controles de criação/edição sem handler já presentes em algumas telas de Câmara e o botão de edital sem URL em Licitações não ganharam implementação de negócio nesta adequação. Os controles e seus acessos foram preservados; não se deve registrar funcionamento de um backend que a origem não fornecia.
7. **Registro da substituição da grade no auditor central:** `--json` confirma `remaining: []` para o baseline `src/components/transparencia/DiscoveryPresentationEditor.tsx:50:28`, mas ainda retorna `status: unresolved`, pois `verify-operational-coverage.mjs:417–428` só tem seletores de substituições para Compras. O destino real aparece em `newCandidates`: `src/components/transparencia/DiscoveryLinksTable.tsx:42:9`, `preferenceId="transparencia.apresentacao.destinos"`, rota `/transparencia/apresentacao`, `provided: true`, `missingProviders: []`. O executor responsável pelo scanner precisa registrar essa associação; o código da grade já está convertido. Nenhum script de auditoria foi alterado pelo lote.

## Checks da primeira entrega

- Leitura individual das estruturas, páginas consumidoras e configurações; busca de consumidores antes de mudanças em props/exportações.
- ESLint restrito a arquivos alterados/novos destes seis domínios e ao manifesto do lote: primeira execução **0 erros, 1 warning** de imagem externa no preview. Após a justificativa local da imagem externa, execução final com `npx eslint --max-warnings 0 <arquivos do lote>`: **PASSOU, 0 erros e 0 warnings**.
- `git diff --check -- src/app/app-domain/{camara,cemiterios,cultura,seguranca,protocolos,transparencia}` (os seis paths passados individualmente no PowerShell): **PASSOU**, sem erros de whitespace. Git emitiu somente avisos de conversão LF/CRLF do ambiente Windows; nenhum arquivo foi normalizado em massa.
- Execução isolada do manifesto por `npx --no-install tsx -e` e `node:assert/strict`: **PASSOU** — seis módulos, 36 rotas únicas, navegações presentes, documentos/relatórios e rotas compartilhadas de Planejamento excluídos. Importações de execução limitadas ao manifesto/configuração pura, sem banco.
- Na primeira entrega, a busca de remanescentes encontrou somente o legado e as duas especiais em Cemitérios. Na revisão posterior o legado foi convertido: sua única tabela HTML restante é a saída `print-only`; paginações de telas em cartões não fazem parte das quatro estruturas operacionais.
- **Sem build completo, execução de rotas, conexão/mutação DB, commit ou push.** Integração, typecheck completo, testes de navegador e build pertencem ao executor principal.
- Matriz de homologação pendente: 1920×1080, 1440×900, 1366×768/650, 1280×720, 1024×768, 768×1024, 800×600, celular retrato/paisagem, zoom 125%/200%; 21 resultados, vazio, erro, última página, exclusão/assinatura, seleção, troca de filtros, overflow condicional, resize/teclado/Home e retorno de foco.

### Checks da revisão posterior

- `node --import tsx --test tests/discovery-link-drafts.test.ts tests/especializados-table-widths.test.ts`: **3 testes passaram** — payload de 21 destinos, edição fora da página, remoção, checkbox desmarcado, versão/atalhos preservados; e **35 configurações** com todas as colunas, distribuição 1224px e resize sem ampliação.
- ESLint com `--max-warnings 0` nos arquivos alterados nesta revisão e nos dois testes: **passou**, sem erros/warnings.
- TypeScript completo foi tentado com `tsc --noEmit --incremental false`: bloqueado por sintaxe externa ao lote em `.next/dev/types/routes.d.ts` e nos componentes `RhSelectionTable.tsx`/`SstSelectionTable.tsx`. Esses arquivos pertencem à integração/outros lotes.
- TypeScript restrito: configuração temporária em `%TEMP%/opencode/especializados-typecheck.json`, estendendo o tsconfig do projeto e incluindo seis domínios, manifesto, componentes de destinos e testes, sem os arquivos gerados de desenvolvimento nem raízes dos outros lotes: **passou**. A resolução verifica também as dependências transitivas usadas pelo lote.
- Auditor `--json`: 32 originais operacionais continuam `mapped-operational`; Cemitérios passou de `legacy-native` para `mapped-legacy`; impressão do legado classificada `print-only`; rota de apresentação tem provider e renderizador identificados. Associação do ID de edição depende do ajuste do auditor descrito acima.
- Sem build, conexão/mutação DB, alteração de shared/ClientLayout, commit ou push. O relatório de cobertura central e seus scripts permanecem sob reserva do integrador.
