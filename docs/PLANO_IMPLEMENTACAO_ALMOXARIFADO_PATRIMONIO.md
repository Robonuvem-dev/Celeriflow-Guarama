# Plano de Implementação de Almoxarifado e Patrimônio

## 1. Objetivo, escopo e fonte

Este documento define a implantação dos módulos de Almoxarifado e Patrimônio para uso real pelo município, abrangendo Executivo e Câmara e os 71 requisitos do Termo de Referência, requisitos de Almoxarifado e Patrimônio das páginas 58 a 65.

O resultado deve operar com dados municipais permanentes, segregação por órgão ou entidade, controles de acesso, documentos oficiais, integrações conciliáveis e rastreabilidade operacional. A numeração das matrizes deste documento serve somente à organização interna do plano e não constitui código, identificador ou nomenclatura do sistema.

## 2. Restrições de execução

- Não excluir colunas existentes.
- Realizar alterações aditivas no banco de dados, com preenchimento, conciliação e adoção gradual das novas estruturas.
- Não alterar o layout de tabelas, menus ou formulários sem autorização prévia do usuário.
- Não tocar no domínio de Cadastro enquanto o usuário estiver ajustando-o.
- Após a liberação do Cadastro, reutilizar `Person`, `Employee`, `Usuario`, `ConfiguracaoPerfil`, `Department`, `AdministrativeUnit` e `Supplier` do Cadastro Único, em vez de duplicar pessoas, servidores, usuários, perfis, departamentos, unidades administrativas ou fornecedores.
- Preservar os comportamentos existentes durante a implantação e compatibilizar mudanças de dados com os fluxos já ativos.
- Submeter mudanças visuais, novos campos visíveis e reorganizações de navegação à autorização prévia.

## 3. Diretrizes de implantação

- **Entidade no centro:** saldos, tombamentos, sequências, configurações, documentos e permissões devem respeitar o órgão ou entidade corrente e impedir acesso cruzado.
- **Eventos sem destruição:** movimentações e alterações patrimoniais devem ser registradas por eventos permanentes; correções devem usar eventos compensatórios autorizados.
- **Transação e idempotência:** comando, razão, saldo ou estado projetado, auditoria e integração pendente devem ser persistidos de forma atômica.
- **Documentos oficiais:** documentos devem ser versionados, vinculados ao evento de origem e armazenados com hash e metadados.
- **Relatórios reproduzíveis:** filtros, competência, entidade, versão, emissor e hash devem permitir a reprodução e a conciliação dos resultados.
- **Integrações desacopladas:** compras, orçamento, contabilidade, financeiro, frota e TCE devem usar eventos reprocessáveis, com controle de falhas e duplicidade.
- **Alterações aditivas:** novos modelos, campos, índices e vínculos devem ser introduzidos sem remoção de colunas existentes.

## 4. Matriz de implantação - Almoxarifado

| Nº interno | Requisito | Implementação e aceite em produção |
|---:|---|---|
| 1 | Permitir um ou mais almoxarifados | Disponibilizar múltiplos almoxarifados por entidade, com cadastros, estoques, permissões e movimentações independentes. |
| 2 | Permitir almoxarifado central | Configurar almoxarifado central conforme regra municipal e validar sua relação com os almoxarifados setoriais. |
| 3 | Cadastrar grupo e material com unidade e fração | Disponibilizar catálogo de grupos, materiais, unidades e frações homologadas, com precisão adequada às movimentações. |
| 4 | Controlar dotação, elemento e subelemento | Propagar a classificação orçamentária desde a origem e preservá-la no razão, nos documentos e nos relatórios. |
| 5 | Calcular custo médio | Calcular custo médio ponderado com valores anterior e posterior, precisão decimal, arredondamento e eventos compensatórios. |
| 6 | Disponibilizar solicitação online | Permitir criação e acompanhamento autenticados no escopo da entidade, unidade e solicitante. |
| 7 | Controlar limites mínimo e máximo | Manter política por material e almoxarifado e emitir alertas operacionais de reposição. |
| 8 | Bloquear saída sem saldo | Garantir atomicamente que nenhuma saída, inclusive concorrente, produza saldo negativo. |
| 9 | Realizar inventário | Operar abertura, congelamento da posição, contagem, divergência, aprovação segregada, ajuste e conciliação. |
| 10 | Registrar entrada por compra | Registrar somente recebimento aprovado, de forma idempotente e rastreável até a aquisição e o documento de origem. |
| 11 | Registrar entrada por devolução | Permitir devolução total ou parcial vinculada à saída original, com limite, custo, motivo e documento. |
| 12 | Registrar saída por requisição | Efetuar saída apenas após aprovação e manter vínculo com item, usuário, departamento e recebedor. |
| 13 | Registrar saída por transferência | Operar despacho, trânsito, aceite no destino, movimentos correspondentes e cancelamento controlado entre almoxarifados. |
| 14 | Registrar saída por perda | Registrar ocorrência, análise, autorização, saída, anexos e efeito contábil aplicável. |
| 15 | Estornar entrada e saída | Gerar evento compensatório autorizado e idempotente, preservando movimento original, motivo e competência. |
| 16 | Requisitar por usuário, unidade e departamento | Validar usuário, unidade e departamento no escopo permitido, sem referências cruzadas entre entidades. |
| 17 | Autorizar requisição | Aplicar permissão específica, alçada e segregação que impeça a autoaprovação. |
| 18 | Atender requisição parcialmente | Permitir entregas sucessivas sem exceder o aprovado e sem duplicar movimentos. |
| 19 | Baixar estoque automaticamente no atendimento | Garantir atomicidade entre atendimento, movimento, saldo e estado da requisição. |
| 20 | Emitir comprovante da requisição | Gerar documento oficial numerado e versionado com itens, participantes, datas, aceite e hash. |
| 21 | Relatório de movimentação | Disponibilizar razão filtrável em PDF, CSV e XLSX, conciliado por período, material, entidade e almoxarifado. |
| 22 | Relatório de consumo por centro de custo | Definir a imputação do centro de custo e consolidar consumo por período e entidade. |
| 23 | Relatório de posição física e financeira | Gerar posição por data-base com quantidades, custo médio e totais financeiros conciliados. |
| 24 | Relatório de sugestão de compras | Calcular reposição por limites, consumo, pedidos em aberto e estoque disponível. |
| 25 | Relatório de materiais sem movimentação | Listar materiais por período de inatividade, almoxarifado, grupo e valor imobilizado. |

## 5. Matriz de implantação - Patrimônio

| Nº interno | Requisito | Implementação e aceite em produção |
|---:|---|---|
| 1 | Controlar unidade gestora, órgão, unidade orçamentária e localização | Modelar a hierarquia por entidade, validar vínculos e impedir acesso cruzado entre Executivo e Câmara. |
| 2 | Cadastrar responsáveis | Reutilizar pessoas e servidores do Cadastro Único e permitir atribuição, troca e consulta por responsável dentro da entidade. |
| 3 | Cadastrar tipo, natureza, grupo, subgrupo, espécie e situação | Implantar taxonomia versionada e sanear categorias e estados existentes. |
| 4 | Controlar bens móveis e imóveis | Definir natureza do bem e aplicar campos e fluxos obrigatórios próprios para móveis e imóveis. |
| 5 | Incorporar por compra, doação, permuta, produção própria e outros | Disponibilizar incorporação tipada, com documentos, avaliação, autorização e contabilização por origem. |
| 6 | Classificar contabilmente pelo PCASP | Associar classes patrimoniais a contas PCASP por entidade e vigência e validar a associação na incorporação. |
| 7 | Tombar por numeração sequencial, automática ou manual | Manter sequência transacional por ente e exercício e opção manual autorizada, sem duplicidade. |
| 8 | Gerar mais de um bem por incorporação | Criar lote atômico com números individuais, resultado por item e idempotência. |
| 9 | Identificar por etiqueta com código de barras ou QR Code | Gerar identificador seguro e modelo de etiqueta por entidade, mantendo o tombamento legível. |
| 10 | Imprimir e reimprimir etiquetas | Permitir impressão em lote e reimpressão justificada e auditada nos formatos homologados. |
| 11 | Transferir bens individualmente e em lote | Validar transferências individuais e coletivas, com resultado por bem e tratamento transacional definido. |
| 12 | Transferir entre locais e responsáveis | Registrar mudança de local, responsável ou ambos e preservar histórico cronológico. |
| 13 | Emitir termo de transferência | Gerar termo oficial numerado e versionado com partes, bens, motivo, assinaturas e hash. |
| 14 | Controlar cessão, concessão, arrendamento e comodato | Controlar instrumento, custodiante, condições, documentos, vigência e situação dos bens por modalidade. |
| 15 | Controlar prazo das concessões | Disponibilizar agenda, alertas, prorrogação, vencimento e bloqueios configuráveis. |
| 16 | Registrar retorno de concessões | Operar devolução total ou parcial, vistoria, conservação, divergências e termo correspondente. |
| 17 | Baixar por alienação, doação, perda, furto, inutilização e outros | Tipificar motivos, documentos e efeitos contábeis e exigir ocorrência ou laudo quando aplicável. |
| 18 | Autorizar baixa | Separar solicitação, parecer, autorização e execução, com alçadas e impedimento de autoaprovação. |
| 19 | Emitir termo de baixa | Gerar termo numerado e versionado com autorização, motivo, valores, bens, anexos, assinaturas e hash. |
| 20 | Registrar reavaliação | Vincular laudo e registrar valores de abertura, ajuste e fechamento. |
| 21 | Registrar redução ao valor recuperável | Vincular análise ou laudo, validar a redução e recalcular prospectivamente o valor depreciável. |
| 22 | Calcular depreciação, amortização e exaustão | Aplicar tratamento por natureza e classe, com método, vida útil, taxa, valor residual e vigência. |
| 23 | Parametrizar cálculo por classe e conta | Versionar parâmetros por classe, PCASP, entidade e vigência, preservando o histórico. |
| 24 | Executar cálculo mensal | Processar competência única por bem, de forma idempotente, com fechamento e conciliação mensal. |
| 25 | Contabilizar depreciação | Publicar evento contábil idempotente, mapear débito e crédito e permitir conciliação e reprocessamento. |
| 26 | Realizar inventário patrimonial por local e responsável | Criar campanha com escopo, posição congelada, coleta por bem e conciliação por local e responsável. |
| 27 | Cadastrar comissão de inventário | Registrar membros, papéis, portaria, vigência, impedimentos e assinaturas por campanha. |
| 28 | Bloquear movimentação durante inventário | Bloquear comandos sobre bens no escopo da campanha, salvo exceções autorizadas e auditadas. |
| 29 | Coletar por leitor, código de barras ou QR Code | Disponibilizar leitura móvel, operação offline controlada e prevenção de contagem duplicada. |
| 30 | Tratar sobras, faltas, localização e estado divergentes | Classificar divergências, registrar anexos e encaminhar cada tipo para decisão autorizada. |
| 31 | Efetuar ajustes após inventário | Gerar eventos compensatórios aprovados, com antes e depois e vínculo à campanha. |
| 32 | Controlar manutenção preventiva e corretiva | Implantar plano preventivo e ordem corretiva com tipo, autorização, documentos e indisponibilidade. |
| 33 | Controlar custos de manutenção | Consolidar custos por período e bem e conciliar a integração financeira e contábil. |
| 34 | Controlar seguros e apólices | Cadastrar apólices, coberturas, documentos, prêmios, rateios, vigências, bens e alertas. |
| 35 | Controlar sinistros e indenizações | Operar ocorrência, aviso, regulação e indenização vinculados ao bem, à apólice, ao financeiro e à eventual baixa. |
| 36 | Controlar garantia | Herdar dados do recebimento, registrar condições e alertar antes de manutenção onerosa. |
| 37 | Anexar documentos e imagens | Vincular arquivos versionados ao bem e a cada evento de incorporação, avaliação, manutenção, inventário e baixa. |
| 38 | Emitir termo de responsabilidade | Gerar termo individual ou em lote, colher aceite e substituí-lo por novo evento de custódia quando necessário. |
| 39 | Emitir termo de carga e descarga | Gerar documento numerado com bens, origem, destino, participantes, assinaturas e armazenamento no GED. |
| 40 | Emitir relatório de ficha cadastral | Gerar ficha oficial com cadastro, valores, documentos, custódia e histórico integral. |
| 41 | Emitir relatório por local e responsável | Gerar posição por data-base, local e responsável, com totais e termo opcional. |
| 42 | Emitir relatório de movimentações | Disponibilizar razão patrimonial por período, tipo, bem, local e responsável. |
| 43 | Emitir relatório de incorporações e baixas | Consolidar eventos por período, origem e motivo, com valores e documentos correlatos. |
| 44 | Emitir relatório de depreciação e reavaliação | Gerar memória mensal por classe e conta e relatório de ajustes com saldos inicial e final. |
| 45 | Integrar com a contabilidade | Publicar eventos idempotentes de todo o ciclo patrimonial e disponibilizar conciliação e reprocessamento. |
| 46 | Remeter dados ao TCE | Gerar arquivo no leiaute vigente, validar, protocolar, guardar recibo e permitir reenvio controlado. |

## 6. Arquitetura alvo

### 6.1 Componentes de domínio

- Almoxarifados, políticas de material, posições, razão de estoque, reservas, requisições, transferências, devoluções, perdas e inventários.
- Bens, classificação, custódia, incorporação, inventário patrimonial, divergências, baixa, seguro, sinistro, garantia e documentos.
- Documentos oficiais, execuções de relatórios, remessas externas, fila de integração e tentativas de processamento.

### 6.2 Serviços e superfícies

- Manter regras transacionais em serviços de domínio, não em componentes ou manipuladores de transporte.
- Aplicar autenticação, entidade, autorização por comando, limites, idempotência e auditoria nas APIs e ações.
- Usar projeções conciliáveis com os razões para painéis, relatórios e exportações.
- Preservar contratos consumidos pelas interfaces existentes e avaliar todos os consumidores antes de qualquer alteração de assinatura.

## 7. Ordem de implantação

| Fase | Entregas principais | Grupos funcionais | Critério de aceite |
|---|---|---|---|
| 0. Governança | Glossário, decisões institucionais, entidades, PCASP, eventos contábeis, papéis e leiautes | Todos os requisitos | Decisões registradas e aprovadas por Executivo, Câmara, contabilidade, patrimônio e almoxarifado. |
| 1. Fundação e segurança | Escopo de entidade, sequências, RBAC por comando, segregação, auditoria, fila de integração e GED | Hierarquia organizacional, numeração e controles transversais | Nenhum comando crítico opera sem entidade e permissão; acessos cruzados são bloqueados e auditados. |
| 2. Operação de estoque | Classificação orçamentária, custo médio, políticas, transferência, devolução, perda, reversão e documentos | Custos, entradas, saídas, requisições, inventário e documentos de almoxarifado | Quantidade e valor conciliam antes e depois de cada operação, inclusive correções. |
| 3. Ciclo patrimonial | Taxonomia, PCASP, incorporações, custódia temporária, baixa, cálculos, termos, garantias e manutenção | Cadastro, incorporação, custódia, valor, manutenção e baixa | Cada evento mantém histórico, documento e integração; autoaprovação é recusada. |
| 4. Identificação e inventário | Etiquetas, comissão, campanha, posição congelada, coleta, divergências e saneamento | Identificação e inventário patrimonial | A campanha encerra somente após contagem, aprovação segregada e tratamento das divergências. |
| 5. Integrações | Compras, orçamento, contabilidade, financeiro, frota, GED e filas de reprocessamento | Integrações financeiras, contábeis e documentais | Eventos são idempotentes, conciliados e mantêm pendências explícitas quando o destino está indisponível. |
| 6. Relatórios e controle externo | Relatórios oficiais, PDF, CSV, XLSX e adaptador TCE versionado | Relatórios de almoxarifado e patrimônio e remessa ao TCE | Totais conciliam com os razões e arquivos atendem aos leiautes homologados. |
| 7. Entrada em operação | Saneamento final, migração, capacitação, segurança, acessibilidade, restauração, monitoramento e suporte inicial | Todos os requisitos | Operação autorizada, dados conciliados, usuários habilitados, contingência definida e ausência de impedimento crítico. |

### 7.1 Sequência prática

1. Fechar decisões de negócio, papéis e leiautes institucionais.
2. Implantar entidade, autorização por comando e auditoria antes de ampliar fluxos.
3. Criar estruturas aditivas e preencher os novos vínculos sem excluir colunas existentes.
4. Estabilizar razão, custo e correções do estoque.
5. Estabilizar taxonomia, custódia e valores patrimoniais.
6. Implantar identificação e inventário patrimonial sobre cadastros saneados.
7. Ativar integrações com conciliação e reprocessamento.
8. Disponibilizar relatórios a partir de projeções conciliadas.
9. Executar migração final, capacitação, autorização e acompanhamento da entrada em operação.

## 8. Migração, dados iniciais e saneamento

### 8.1 Migração aditiva

- Adicionar campos, tabelas, índices e relações sem excluir colunas existentes.
- Preencher os novos campos, conciliar os resultados e somente adotar restrições adicionais após saneamento formal.
- Vincular almoxarifados, materiais, posições, movimentos, requisições, inventários, bens e eventos à entidade correta.
- Adequar unicidades de materiais, tombamentos, requisições e documentos ao escopo homologado.
- Converter valores monetários para decimal com escala homologada e conciliar arredondamentos antes da entrada em operação.
- Construir saldos de abertura a partir das posições atuais e preservar movimentos anteriores como histórico identificado.
- Mapear categorias para taxonomia e PCASP mediante correspondência aprovada; manter itens não classificados em fila de saneamento.
- Gerar custódia inicial a partir de localização e responsável atuais, sem criar datas históricas inexistentes.
- Associar documentos identificáveis e registrar ausências como pendências de qualidade.

### 8.2 Dados iniciais e saneamento

- Dados permanentes e dados usados na validação devem ter descrições realistas e adequadas ao município.
- Materiais devem usar nomes como `Lâmpada fluorescente 40 W`, `Papel sulfite A4 75 g/m²` e `Cimento Portland CP II 50 kg`, nunca nomes artificiais como `Material genérico 1`.
- Equipamentos, locais, estruturas, fornecedores e responsáveis devem seguir nomenclaturas municipais plausíveis e padronizadas.
- Não usar dados pessoais reais em atividades de validação ou capacitação.
- Cadastrar entidades, almoxarifados, materiais, políticas, saldos de abertura, taxonomia, contas, responsáveis e bens após saneamento e aprovação dos responsáveis funcionais.
- Separar claramente dados permanentes dos registros temporários usados para validação, com descarte controlado destes antes da entrada em operação quando aplicável.

### 8.3 Critérios de corte

- Posições devem corresponder ao razão por material, lote, almoxarifado e entidade.
- O valor do estoque deve estar conciliado conforme a política de custo homologada.
- Cada bem ativo deve possuir um único estado atual de custódia.
- Tombamentos devem ser únicos no escopo definido.
- Quantidades e valores por categoria e entidade devem corresponder antes e depois da migração, ressalvadas correções formalmente aprovadas.
- Órfãos, duplicidades, saldos negativos, vínculos cruzados e documentos ausentes devem estar zerados ou formalmente aceitos com plano de saneamento.

## 9. RBAC e segregação de funções

| Papel | Operações permitidas | Restrições mínimas |
|---|---|---|
| Consulta e auditoria | Consultar, exportar quando autorizado e verificar rastreabilidade | Sem mutação; acesso apenas às entidades permitidas. |
| Solicitante | Criar, cancelar antes da aprovação e acompanhar requisição | Não aprova nem atende a própria requisição. |
| Aprovador de requisição | Aprovar ou recusar quantidades | Não aprova pedido próprio nem movimenta estoque pela aprovação. |
| Almoxarife | Receber, separar, entregar, devolver e transferir | Ajustes extraordinários exigem autorização. |
| Inventariante de estoque | Abrir, contar e submeter inventário | Não aprova nem encerra campanha iniciada ou contada por si. |
| Gestor de almoxarifado | Autorizar inventário, perdas e ajustes | Não altera diretamente o razão. |
| Responsável patrimonial | Incorporar, etiquetar, transferir e manter cadastro | Não autoriza baixa que solicitou nem lança diretamente na contabilidade. |
| Comissão patrimonial | Contar, registrar divergências e assinar relatório | Não decide isoladamente sobre as próprias divergências. |
| Avaliador | Registrar laudo, reavaliação e redução ao valor recuperável | Exige documento e autorização independente para baixa decorrente. |
| Autoridade de baixa | Aprovar ou recusar processo de baixa | Deve ser diferente do solicitante e do executor; alçada por valor e tipo. |
| Contabilidade | Homologar parâmetros, conciliar e reprocessar integração | Não altera o evento operacional de origem. |
| Administrador de entidade | Configurar usuários, papéis e parâmetros do ente | Sem acesso automático a outra entidade; ações administrativas auditadas. |
| Administrador de sistema | Manutenção técnica excepcional | Acesso temporário, justificado e com trilha reforçada, sem aprovação de negócio. |

As permissões devem representar comandos explícitos, incluindo solicitar, aprovar, atender, contar, autorizar inventário, incorporar, transferir, solicitar baixa e autorizar baixa. Permissões genéricas devem ser reduzidas à medida que a matriz específica entrar em operação.

## 10. Auditoria e rastreabilidade operacional

Para cada operação relevante, registrar:

- versão da aplicação, ambiente, entidade, usuário e data e hora;
- comando, dados anteriores e posteriores, motivo e autorização;
- identificadores correlacionados de evento, movimento, documento e integração;
- arquivos gerados com versão e hash;
- conciliação aplicável e situação de processamento externo;
- falhas, novas tentativas, cancelamentos e eventos compensatórios, sem apagar o registro original.

Os registros devem permitir apuração administrativa, contábil e de segurança, respeitando retenção, privacidade e acesso por entidade.

## 11. Riscos, premissas e decisões pendentes

### 11.1 Riscos

| Risco | Impacto | Mitigação |
|---|---|---|
| Divergência entre a interpretação funcional e a redação contratual | Retrabalho ou recusa de aceite | Manter rastreabilidade aprovada entre o Termo de Referência, decisões e critérios funcionais. |
| Ausência de entidade nas raízes atuais | Acesso indevido entre Executivo e Câmara | Priorizar escopo de entidade, restrições compostas e negações de acesso cruzado. |
| Uso de ponto flutuante para valores | Divergência monetária | Adicionar representação decimal e conciliar antes da adoção. |
| Estados livres | Transições inválidas | Adotar catálogos controlados, restrições e máquinas de estado no domínio. |
| Relatórios antes da estabilização dos razões | Totais inconsistentes | Disponibilizar relatórios oficiais somente após conciliação operacional. |
| Leiaute TCE ou PCASP não homologado | Arquivo rejeitado ou lançamento incorreto | Usar adaptadores versionados e validação oficial. |
| GED ou assinatura sem definição institucional | Fragilidade documental | Homologar provedor, retenção, hash e valor jurídico antes da emissão oficial. |
| Classificação histórica inferida | Informação contábil incorreta | Encaminhar para saneamento humano e proibir preenchimento silencioso por heurística. |

### 11.2 Premissas

- O município fornecerá taxonomia, PCASP, regras de cálculo, alçadas e leiautes oficiais.
- Compras, orçamento, financeiro, contabilidade, frota e GED fornecerão identificadores estáveis e contratos de integração.
- Funcionalidades de outros domínios somente serão generalizadas quando a regra for comum e homologada.
- O Cadastro Único será a fonte de identidades e estruturas após a conclusão dos ajustes conduzidos pelo usuário.

### 11.3 Decisões pendentes

- Confirmar a rastreabilidade dos 71 requisitos com a redação contratual.
- Definir repetição de materiais e códigos entre Executivo e Câmara.
- Definir método de custo, precisão, frete, desconto, imposto e regra de correção.
- Definir momento e expiração da reserva.
- Definir numeração de tombamento e documentos por entidade e exercício.
- Aprovar taxonomia, PCASP, valor residual, métodos e início dos cálculos patrimoniais.
- Definir alçadas e participantes para perda, inventário, ajustes, reavaliação e baixa.
- Informar tribunal, versão do leiaute, periodicidade, certificado e protocolo.
- Definir formatos oficiais, identidade visual, assinatura e retenção no GED.

## 12. Definição de pronto

Um requisito estará pronto para operação quando:

- regra e critério de aceite estiverem homologados e rastreados ao requisito oficial;
- modelo, serviço, interface ou API e autorização operarem no escopo da entidade;
- cenários normais, erros, concorrência, idempotência e negações de acesso estiverem validados;
- auditoria e documentos exigidos forem persistidos sem edição destrutiva;
- integrações forem idempotentes, conciliáveis e tiverem fila de pendência e reprocessamento;
- relatórios e exportações reproduzirem filtros e conciliarem com os razões;
- migração, saneamento, contingência e restauração estiverem aprovados;
- capacitação, perfis, suporte e monitoramento estiverem disponíveis;
- Executivo e Câmara operarem sem acesso cruzado;
- não houver impedimento crítico de segurança, saldo, valor, segregação ou integração.

## 13. Encerramento da implantação

A implantação estará concluída quando os 71 requisitos estiverem disponíveis e aceitos para operação, ou quando eventual exceção estiver formalmente autorizada pelo município com prazo, responsável e controle compensatório; os dados estiverem saneados e conciliados; não houver pendência crítica; os usuários estiverem habilitados; e a entrada em operação estiver formalmente autorizada.

## 14. Registro de execução

- **Devolução e estorno de estoque:** estrutura aditiva e serviços transacionais implantados. As operações preservam o movimento original, usam eventos compensatórios, exigem motivo, são idempotentes e serializam alterações concorrentes por movimento de origem.
- **Disponibilização operacional:** pendente autorização para incluir os comandos nas interfaces existentes. Nenhum menu, formulário ou layout de tabela foi alterado nesta etapa.
- **Cadastro Único:** nenhuma alteração realizada enquanto o domínio está sendo ajustado pelo usuário.
