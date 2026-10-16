# Análise das telas de POC e aplicações no CeleriFlow

Fonte: `telas POC.zip`, 92 capturas de 01/10/2026. Análise visual organizada pela ordem dos horários nos nomes dos arquivos. Sistema identificado nas telas como MegaAdmWEB/Megasoft, em ambiente com identificação municipal fictícia “Megacity”.

## 1. Conclusão principal

O maior aprendizado é a organização das funcionalidades em um catálogo navegável e a concentração das ações de negócio dentro dos próprios registros. A aplicação apresenta os módulos, suas subdivisões, consultas, formulários, relatórios e operações em lote com padrões bastante repetidos. Isso facilita encontrar rapidamente uma funcionalidade durante uma POC.

Para o CeleriFlow, recomendo aproveitar essa estrutura funcional, mantendo sua interface atual mais enxuta: cabeçalho compacto, filtros recolhíveis, tabelas com rolagem interna e cabeçalho fixo, paginação padrão de 20 itens, abas para dados extensos e menu de ações contextual.

Não houve inspeção do repositório do CeleriFlow nesta análise. As sugestões abaixo são uma referência de implementação e demonstração; não afirmam que funcionalidades estejam ausentes do seu sistema.

### Limites da evidência

- **Tela detalhada:** campos, tabela, estado ou mensagem estão visíveis. Demonstra a interface daquele recurso, não todo seu funcionamento.
- **Menu:** existe um acesso com determinado nome. Não comprova cálculo, emissão, transmissão ou integração efetiva.
- **Saída:** há documento apresentado no navegador, como o relatório de folha. Comprova uma saída visível, sem validar sua correção contábil ou jurídica.
- **Proposta:** adaptação sugerida para o CeleriFlow, sem atribuí-la ao sistema observado.

As imagens são registros isolados, não um vídeo. A sequência de horários sugere o percurso da apresentação, mas não permite reconstituir todos os cliques ou afirmar que uma operação foi concluída entre duas capturas. Alguns nomes estão truncados; não foram completados como se estivessem legíveis. Dados pessoais dos exemplos não precisam ser copiados: use registros fictícios próprios.

## 2. Organização e navegação

| Elemento observado | Evidência | Aplicação no CeleriFlow |
|---|---|---|
| Módulos identificados por cores | Contabilidade laranja; Compras roxo; Arrecadação verde; RH azul claro | Usar cor discreta em ícone e título para reconhecer o módulo |
| Caminho de navegação no topo | Início → módulo → grupo → funcionalidade | Breadcrumb clicável com retorno sem perder contexto |
| Pesquisa global de funcionalidade | Campo no cabeçalho | Buscar telas por nome, sinônimo e código, respeitando permissões |
| Código numérico da tela | Exemplos 1442, 712, 219 e 34204 | Criar identificador estável para suporte e checklist de POC |
| Favoritos, histórico e mais usados | Atalhos no cabeçalho e lateral | Favoritos por usuário e atalhos persistentes |
| Categorias repetidas | Principais, Auxiliares, Movimentos, Relatórios, Outros | Usar categorias claras: Cadastros, Operações, Consultas, Relatórios, Integrações |
| Barra contextual à direita | Novo, Abrir, Modificar, Deletar, Imprimir e ações específicas | Menu de ações por registro e situação; priorizar ações mais usadas |
| Preferências do usuário | Seleção de módulo principal e opções pessoais | Escolher tela inicial e guardar preferências de consulta |
| Ajuda e descrição funcional | Botão Ajuda e bloco “O que faz?” | Explicação curta da finalidade e dos pré-requisitos |
| Botão Voz | Presente no cabeçalho | Apenas presença observada; comando de voz é prioridade menor |
| Identificação de órgão e competência | Cabeçalho mostra órgão, usuário e mês/ano | Contexto global explícito, evitando lançar no órgão ou exercício errado |

### Estrutura sugerida de tela

1. Cabeçalho compacto com título, código, caminho e órgão/exercício.
2. Busca rápida e botão “Filtros avançados”.
3. Tabela com ordenação, situação textual, ações por linha e paginação.
4. Detalhe em página ou painel, com abas e resumo fixo do registro.
5. Ações específicas próximas ao registro: aprovar, cancelar, gerar documento, lançar movimento, anexar.
6. Relatórios com filtros reutilizáveis, prévia e exportação.

Não reproduzir a grande área vazia nem depender de cores para informar situação. Mostrar também “Aberto”, “Concluído”, “Pago”, “A pagar” etc. Nenhum botão deve simular conclusão de operação que não foi executada.

## 3. Contabilidade, orçamento e tesouraria

Grande parte desta seção está documentada por menus. Ela é valiosa como inventário de escopo, mas não como comprovação de execução.

### 3.1 Planejamento PPA/LDO/LOA

Observados: grupos de relatórios de LOA, importações e outras funções de planejamento. A tela de importações apresenta opções de recuperação de dados; não há confirmação do processamento.

Nos relatórios aparecem resumo da receita, resumo da despesa, detalhamentos, legislação da receita, tabela explicativa, projeção da receita, diversos anexos, demonstrativos e quadro de dotações por órgão. Há rótulos parcialmente truncados.

**Aplicação proposta:** catálogo de relatórios com período, exercício, órgão, unidade, programa, ação, fonte e classificação. Cada saída deve usar dados do sistema e permitir conferir o total com a consulta correspondente. Não preencher anexos legais apenas com valores ilustrativos quando a POC exigir cálculo real.

### 3.2 Balancete e execução

Os menus apresentam divisões Principais, Auxiliares, Movimentos, Impressos, relatórios LRF, relatórios contábeis e remessas.

- Auxiliares: fornecedor, histórico padrão, tipo de retenção, eventos contábeis, tabela de diárias e fechamento de mês, entre outros acessos.
- Movimentos: empenho, liquidação, ordem de pagamento, consignação bancária, anulações, lançamentos de receitas e despesas, transferências e outras operações com alguns nomes truncados.
- Impressos: nota de empenho, anulação de empenho, liquidação, anulação de liquidação, ordem de pagamento, estorno, arrecadação de saldo, recibo e cancelamento de restos, conforme rótulos visíveis.
- Relatórios contábeis: livro diário, livro razão e balancete de verificação.
- LRF: grupos separados de execução orçamentária e gestão fiscal.

**Aplicação proposta:** encadear empenho → liquidação → pagamento com vínculos consultáveis, saldos e histórico. A emissão da nota deve partir do movimento correspondente. Anulação deve exigir motivo, manter o movimento original e registrar usuário e horário.

### 3.3 Saúde e educação na contabilidade

Os menus mostram SIOPS despesas, SIOPS receitas, SIOPS por subfunção, balancete da saúde, despesa/restos a pagar e relatório gerencial para conselho. Em SIOPE, aparecem receita, pessoal e despesas.

**Aprendizado:** estes acessos são relatórios fiscais/financeiros de saúde e educação. Não são evidência de prontuário, farmácia, matrícula ou diário escolar.

### 3.4 Tesouraria

| Grupo | Opções observadas em menu | Adaptação proposta |
|---|---|---|
| Principais | Contas bancárias, extras orçamentárias, receitas, fornecedor e diárias | Cadastros compartilhados e saldos por conta/fonte |
| Movimentos | Liquidações, pagamentos, múltiplos pagamentos, receitas, transferências, extras, conciliações, créditos por competência | Fluxos individuais e em lote com seleção e confirmação |
| Relatórios | Restos a pagar, liquidações, saldo e extrato de contas, cheques, conciliação, ordem de pagamento, recibo, despesa a pagar, retenções, resumo financeiro, movimento financeiro, ordem cronológica e fluxo de caixa | Central de relatórios com filtros e totais conferíveis |
| Outros | Pesquisa de fornecedores, remessa bancária e geração de saldos | Consulta transversal e remessa com histórico de processamento |

A presença de “Conciliações” não comprova importação de extrato ou conciliação automática. Para demonstrar no CeleriFlow, usar um extrato de teste, mostrar movimentos correspondentes e divergentes e registrar a conciliação efetiva.

### 3.5 Remessas e balanço

Os menus exibem gerações para tribunais, MANAD, DIRF, matriz de saldos contábeis, SEFIP, EFD-Reinf, TCM/Colare e eventos relacionados ao eSocial. Também há Balanço Geral com relatórios PCASP, auxiliares e tribunais.

**Aplicação proposta:** manter uma central por obrigação, competência, leiaute, órgão, data de geração, responsável, arquivo, situação e retorno. Os nomes encontrados são referência histórica da interface fotografada; aplicabilidade e leiautes vigentes precisam ser verificados antes da implementação. Estas telas não provam homologação com nenhum órgão externo.

## 4. Compras, licitações e contratos

### 4.1 Catálogo de licitações

O menu mostra Cadastro de Cotações, Dispensa/Inexigibilidade, Licitações/Pregão, Contrato, Pesquisa de Ata de Registro de Preço, situação do procedimento, ETP e TR.

A integração conceitual é útil: estudos e termos, procedimento, cotação, contratação e compra ficam próximos. A presença dos menus não demonstra editor completo de ETP/TR nem integração com PNCP.

### 4.2 Cadastro de cotações — tela detalhada

**Filtros visíveis:** código, data inicial/final, número e ano do processo/protocolo, situação, departamento, órgão, fornecedor, CPF/CNPJ, solicitação, produto, descrição, ordenação e “Somente órgão logado”. Há campos por código e descrição e seletores de entidades.

**Tabela:** código, data, número do processo, código do órgão, departamento, descrição, situação e ação “Visualizar”. Há situações “Aberto” e “Valores Atualizados - Concluído”.

**Aplicação proposta:**

- Listagem filtrável com estados de cotação e vínculo ao processo.
- Cotação com itens, unidades, quantidades, fornecedores e preços.
- Mapa comparativo e memória do critério adotado, como proposta de evolução, não como operação comprovada nas capturas.
- Acesso do resultado ao procedimento/compra sem redigitar fornecedor ou produto.

### 4.3 Cadastro de compra — tela detalhada

| Área | Campos/elementos visíveis |
|---|---|
| Identificação | Código, data, documento, processo/protocolo, licitação e modalidade |
| Situação | Situação, status e indicação “Empenhada?” |
| Natureza | Material, serviço ou obra |
| Descrição | Histórico extenso |
| Fornecedor | Código, documento e nome |
| Estrutura | Departamento de compra e órgão |
| Abas | Produtos, Solicitações Associadas, Dotação e Recebimento de Material |
| Valores na parte inferior | Cancelado, bruto, desconto unitário, desconto geral e líquido |

**Ações visíveis:** Novo, Abrir, Modificar, Deletar, Aprovação, Imprimir, Lançar Almoxarifado, Anulação de Compra, Lançar Compra Veículo, Lançar Empenho, Anexos, Cadastrar Processo e Voltar.

Este é um dos melhores exemplos para o CeleriFlow: a compra funciona como ponto de conexão entre processo, fornecedor, dotação, empenho e recebimento. As ações estão visíveis, mas as capturas não mostram os resultados de todos esses lançamentos.

**Critérios de implementação propostos:** uma compra aprovada deve gerar o movimento pertinente com referência à origem; impedir geração duplicada; respeitar saldo/quantidade; mostrar o vínculo criado; manter histórico em caso de cancelamento.

### 4.4 Relatórios de compras

Observados em menu: compras por fornecedor, compras acumuladas, relação de compras, acompanhamento de entrega, acompanhamento de solicitação, relatório de saldo por licitação e outros relatórios.

A tela de Compras Acumuladas apresenta filtros por período, fornecedor, categoria de produto, produto, departamento, dotação e modalidade. O resultado desse relatório não está exibido.

### 4.5 Ata de registro de preços

A tela apresenta identificação do procedimento, número/ano, modalidade, datas, objeto, vínculo contratual e uma lista expansível de fornecedores. Há ações de impressão e participantes.

**Aplicação proposta:** ata → fornecedor → item → quantidade registrada/utilizada/saldo → vigência → documentos. Saldo por item e controle de utilização são recomendações; não foram confirmados nesta tela.

## 5. Tributação, arrecadação e fiscalização

É uma das áreas mais ricas em telas detalhadas. O catálogo divide Arrecadação em Econômico, Imóvel, Dívida Ativa, Gestão, Bancos e Fiscalização.

### 5.1 Contribuintes

Há listagem com código, situação, documento, nome/razão social e localização. Estados como ativo e baixado aparecem textualmente e por cor.

**Aplicação proposta:** cadastro compartilhado entre contribuinte, proprietário, prestador e tomador, com papéis separados e prevenção de duplicidade por documento.

### 5.2 Conta corrente fiscal — DUAM

**Filtros visíveis:** número atual/anterior da guia, emissão, vencimento, mês/ano, código do contribuinte, CPF/CNPJ, nome, inscrição municipal, imóvel, inscrição cadastral segmentada, tipo de tributo, situação, parcelamento, parcela, tributo, valor original/corrigido, tipo de emissão e ordenação.

**Ações visíveis:** Consultar, Novo, Voltar e Limpar Filtros. Os filtros podem ser recolhidos.

**Aplicação proposta:** consulta central de débitos que leve ao contribuinte, imóvel, lançamento e parcelamento. Demonstrar um débito específico e sua composição; a captura não mostra o cálculo nem uma baixa bancária.

### 5.3 Nota fiscal avulsa

**Campos:** processo/protocolo, número/ano, data, guia associada, situação, prestador, tomador, inscrição estadual e item de serviço.

**Tabela de itens:** quantidade, unidade, discriminação dos serviços, valor unitário, valor total e ações de edição/exclusão/inclusão.

**Aplicação proposta:** seleção de prestador e tomador por cadastro, itens editáveis, totalização e ligação ao lançamento fiscal. Demonstrar recalcular ao alterar a quantidade e conferir o valor do documento gerado.

### 5.4 Alvará

A consulta mostra código, guia, código do imóvel, inscrição cadastral, contribuinte/documento, inscrição municipal, data inicial/final, processo, número/ano, tipo, validade, situação, geração e ordenação.

Uma outra tela de alvará imobiliário exibe um diálogo “Certificado Digital” com arquivo, senha, Cancelar e Enviar. Isso comprova a existência de uma interface para certificado, sem comprovar assinatura final, cadeia de confiança ou transmissão.

**Aplicação proposta:** geração a partir do cadastro, validade explícita, vínculo ao processo, documento e histórico. Se implementar certificado, tratar credenciais com proteção e nunca registrá-las em logs.

### 5.5 Certidões

A consulta CND apresenta código, número, nome/razão social, CPF/CNPJ, tipo, emissão, validade, tipo de emissão e ordenação. Os tipos de emissão visíveis incluem contribuinte, imóvel e econômico.

No cadastro de imóvel, o seletor de certidão mostra opções como lançamento, decadência, número oficial, nada consta, laudo de avaliação e regularidade fiscal do ITBI; outros rótulos estão parcialmente obstruídos.

**Aplicação proposta:** documentos parametrizados por tipo e vínculo, com número, emissão, validade, situação, autenticação e histórico. Se a POC exigir validação pública, demonstrar o documento e a consulta de autenticidade com o mesmo código.

### 5.6 Imóvel / BIC

| Bloco | Informações visíveis |
|---|---|
| Identificação | Código, código anterior, CIB, matrícula, data do cadastro e situação cadastral |
| Propriedade | Quantidade de proprietários, englobado, gleba, proprietário, cota percentual, compromissário e data |
| Inscrição | Segmentos de inscrição cadastral, distrito, setor fiscal, quadra, lote e unidade |
| Navegação | Seleção de unidade e setas de navegação |
| Ações | Novo, Abrir, Modificar, Deletar, Imprimir, Gerar Certidão, Gerar Desmembramento, Pesquisar DUAMs e ação de transmissão parcialmente visível |

**Aplicação proposta:** BIC com abas para identificação, proprietários, terreno, edificação, avaliação, tributos, documentos e histórico. As últimas áreas são propostas; não estão todas visíveis na captura.

Relacionar imóvel → proprietário → lançamento → guia → pagamento → certidão. Desmembramento deve preservar o histórico do imóvel de origem e criar vínculos com os novos registros.

### 5.7 Dívida ativa, protesto e execução

Menu observado: Dívida Ativa Tributária, Dívida Ativa Simples Nacional, Certidão de Dívida Ativa e Protesto/Execução Fiscal.

Tela detalhada de Protesto, Negativação e Execução Fiscal: abas para etapas distintas, orientação “O que faz?”, filtros por intervalos da dívida ativa, termo, inscrição, vencimento da guia, ano, valor e processo/protocolo. Não há comprovante de remessa ou retorno de cartório.

**Aplicação proposta:** histórico de inscrição, CDA, seleção para cobrança, arquivo/remessa, protocolo, retorno e cancelamento. Diferenciar preparação de arquivo de integração efetivamente homologada.

### 5.8 Denúncia fiscal

A tela mostra abas Denúncia Fiscal e Ordem de Fiscalização. Há origem, data, setor, situação, motivo, dados do solicitante, descrição e anexos. A ação “Gerar Ordem de Fiscalização” aparece na lateral.

**Aplicação proposta:** denúncia registrada → triagem → ordem → responsável → diligências → conclusão. Mostrar histórico e documentos de cada etapa.

### 5.9 DES-IF, COSIF e índices

- DES-IF: abas de informações comuns aos municípios, apuração mensal ISS, demonstrativo contábil e partidas; filtros por referência, inscrição municipal, documento, banco, entrega, guia, protocolo, tipo de arquivo e ordenação.
- COSIF: conta, abertura, encerramento, conta superior, nome e função.
- Cadastro de moedas/índices: tabela com código, mês, ano, IPCA, UFM e Visualizar. O texto de ajuda descreve atualização/conversão, mas a captura não comprova cálculo automático.

**Aplicação proposta:** separar plano de contas, declaração, importação e validação; índices versionados por competência, com origem e histórico. Uma alteração não deve mudar débitos históricos silenciosamente.

## 6. NFS-e e portal de serviços

### 6.1 Separação municipal/nacional

O menu distingue NFS-e Municipal e NFS-e Nacional. Isso é útil para organizar fontes e estados, sem pressupor que ambos os fluxos estejam homologados.

### 6.2 Painel administrativo municipal

**Indicadores visíveis:** ISS para outros municípios, ISS de NFS-e/declarações e quantidade de empresas com fechamento mensal. Há filtros mensais por indicador.

**Abas:** ranking dos maiores contribuintes de ISS, DMST-e, DES-IF e D-e ISS.

**Tabela:** NFS-e, CPF/CNPJ, nome/razão social, regime tributário, inscrição municipal, referência, guia, situação, valor do ISS e ação. Situações Pago/A pagar são textuais e coloridas. Há busca, filtros de situação, mês/ano e cabeçalhos ordenáveis.

**Aplicação proposta:** clicar no indicador deve abrir a consulta que explica o total; mostrar a nota, seu débito e sua situação. Cards sem correspondência com os dados da tabela enfraquecem a demonstração.

### 6.3 NFS-e Nacional

A consulta apresenta mês/ano, chave de acesso, número municipal, DPS, número da nota no portal nacional, competência inicial/final, status local, valor, ISS, guia, situação no portal nacional, item de serviço, prestador/econômico, tomador e intermediário, local de tributação, ISS retido, regime e ordenação. Há abas para diferentes operações, incluindo sincronização.

**Aplicação proposta:** distinguir status local e status externo; guardar última sincronização, protocolo e mensagem de erro; demonstrar uma chamada real ou identificar claramente o ambiente de testes. O menu de sincronização sozinho não comprova integração.

### 6.4 Portal externo

Entrada por três perfis: Servidor Público, Cidadão e Fornecedor.

No portal do cidadão aparecem consulta de débitos, processo, certidão, nota fiscal avulsa, extrato fiscal, emissão de certidão, abertura/autenticação de documentos, protocolo, cadastro e serviços de imóvel, como guia IPTU e ficha cadastral.

**Aplicação proposta:** portais por perfil com jornada curta. Exemplo: cidadão consulta imóvel → localiza débito → emite guia → consulta autenticidade. O portal não deve expor dados de terceiros apenas pela facilidade de busca.

## 7. RH e folha de pagamento

### 7.1 Cadastro de funcionário

**Estrutura principal observada:** matrícula, funcionário e chave; abas Dados Pessoais, Dados do Funcionário, Dados de Função, Dados Demissionais, eSocial e Colare.

Dentro dos dados pessoais há documentação, dados familiares, ficha médica, endereço/telefones e formação profissional. Há foto, estado civil, escolaridade, raça/cor, nacionalidade/naturalidade e documentação. A ficha médica apresenta grupo sanguíneo, indicadores de saúde e tabela de plano de saúde.

Nos dados governamentais aparecem opções de vínculo e previdência, categoria, tipo de admissão e outros atributos funcionais.

**Dados de função:** lotação, unidade, local de trabalho, cargo, nome do cargo, nível, classe, natureza, tipo de cargo e outras informações da estrutura salarial.

**Dados demissionais:** datas, motivo, informações de acerto e desligamento para eSocial.

**Ações visíveis em diferentes capturas:** Salvar, Abrir, Deletar, Exportar, Financeiro, Cadastro de Férias, Cadastro de Licença, Cadastro de Faltas, Acerto de Verbas, Concessão de Verbas, Anexos e Voltar.

**Aplicação proposta:** ficha do servidor como centro do módulo. Um resumo de vínculo, órgão, cargo, situação e competência permanece visível enquanto as abas organizam o restante. Dados médicos devem ter acesso restrito.

### 7.2 eSocial, SST e consignado

Subabas: Trabalho Temporário, Estrangeiro, Admissão/Estatutário, Estagiário, SST, eConsignado e Situação do Envio.

- Trabalho temporário: hipótese legal, tipo de inclusão e justificativa.
- SST: tabela de Comunicação de Acidente de Trabalho, com código, matrícula, nome, data e tipo de acidente; botões Incluir Novo e Imprimir Todos.
- eConsignado: instituição financeira, contrato, evento, número de parcelas, valor da parcela, início/fim do contrato.
- Validação visível: alerta solicita movimento RPPS para uma determinada situação de beneficiário.

**Aplicação proposta:** regras de consistência antes de salvar/enviar, com mensagem que explique o campo e como corrigir. Separar cadastro, validação, envio e retorno dos eventos. A presença de abas eSocial não comprova transmissão.

### 7.3 Movimento financeiro

**Campos:** matrícula, servidor, mês/ano, tipo de movimento, tipo de pagamento, data e indicação de pago. Há seções de dados bancários e competências.

**Tipos visíveis:** vencimentos, 13º salário, férias, complementar, sessões extraordinárias e rescisão.

**Tabela:** código do evento, nome, quantidade, quantidade total, valor, valor de referência e ações. Proventos e descontos aparecem com cores distintas.

**Ações:** Salvar, Abrir, Recibo e Voltar; abas de situação de envio e Colare.

**Aplicação proposta:** composição transparente da folha, distinguindo evento, base, referência, fórmula, resultado e natureza. Fórmula/base são propostas adicionais. Demonstrar alteração controlada de evento e recalcular valores; apenas editar uma tabela não comprova motor de folha.

### 7.4 Rescisão

A tela mostra média dos últimos meses, tipo de remuneração e itens financeiros, como 13º proporcional, férias proporcionais, terço de férias, INSS e IRRF.

A saída permite escolher acerto de verbas, termo de rescisão e termo de rescisão detalhado; há Imprimir e Exportar.

**Aplicação proposta:** memória de cálculo e documento correspondente, usando regras compatíveis com o vínculo do servidor. Não assumir que regras CLT se aplicam a todos os vínculos municipais.

### 7.5 Férias

Campos: código, funcionário, aquisição inicial/final, início/fim do gozo, período em dias, venda de dias e observação. Há aba eSocial.

Ações: Novo, Abrir, Modificar, Deletar, Imprimir Aviso de Férias, Imprimir Recibo de Férias, Anexos e Voltar.

**Aplicação proposta:** ligar período aquisitivo, concessão, folha e documentos. Validar sobreposição e saldo de dias; demonstrar aviso e recibo a partir do mesmo registro.

### 7.6 GED vinculado ao funcionário

Este recurso tem forte evidência visual: lista de documentos com estados de assinatura e identificação de signatários.

**Botões:** Incluir Novo, Incluir Novo Documento Compartilhado e Assinar Digitalmente.

**Colunas:** seleção, download, tipo de documento, título, descrição, assinado, tamanho, assinatura digital do documento e ações. Há linhas sem assinatura e linhas com um ou vários nomes de signatários. A tabela apresenta paginação e seleção de quantidade de linhas.

**Aplicação proposta:** componente GED reutilizado em servidor, compra, contrato, imóvel e processo. Guardar documento original, versões, vínculo, estado de assinatura e evidência verificável. Nome exibido em coluna não basta para validar criptograficamente a assinatura.

### 7.7 Relatórios financeiros e administrativos

Menus financeiros: movimentos, proventos/descontos, recibo de pagamento, folha sintética, folha analítica, bancos, sumários, resumo da folha, retenções, informe de rendimentos e outros acessos.

A parametrização da folha analítica mostra seleção por órgãos, tipo de movimento, tipo de admissão, previdência, categoria do trabalhador, situação do pagamento e ordem do relatório, com caixas de seleção e opção Todos.

As capturas seguintes mostram um PDF de sumário geral de folha, com proventos, descontos, códigos, eventos, valores, quantidades e detalhamento de cálculo previdenciário. É uma saída visível; as imagens não demonstram que o PDF resultou exatamente dos filtros da folha analítica imediatamente anteriores.

Menus administrativos: protocolo RH, tipo de cargo, cargos preenchidos, funcionários por cargo, frequência, envios Colare/eSocial, departamentos, quadro salarial, relação nominal e dashboard RH, entre outros.

**Aplicação proposta:** gerador com filtros agrupados, seleção múltipla, contagem de registros, totalizadores e prévia. Conferir relatório analítico e sintético contra a mesma competência da folha.

### 7.8 Operações em lote e remessas

Movimentação Geral inclui inicializar mês, 13º adiantamento/segunda parcela, cálculo da folha, inserir/remover eventos, reajuste salarial, alteração de datas de pagamento, concessões, mudança de lotação, diferença de data-base e prorrogação de contrato, com alguns rótulos truncados.

Remessas bancárias: geração bancária, informações por banco, crítica de remessa e processamento de retorno. Remessas governamentais: tribunais, cadastro, RAIS, DIRF, arquivo de sindicato, MTE e outras opções. O inventário reflete os rótulos fotografados, não determina obrigações atualmente aplicáveis.

**Aplicação proposta:** seleção de servidores → prévia do impacto → validação → confirmação → processamento → resultado por registro → histórico. Em lote, mostrar tanto sucessos como erros e impedir reaplicação involuntária.

Dossiê aparece como uma área com grupos de relatórios de férias/licenças, dados auxiliares e operações como crítica de CPF/CNPJ, período aquisitivo, férias coletivas e aviso prévio.

## 8. Protocolo, transparência, patrimônio e assistência social

| Área | Evidência observada | Uso proposto no CeleriFlow |
|---|---|---|
| Protocolo | Menu Processo, Cadastro de Processo, Auxiliares e Relatórios | Processos vinculados a compras, fiscalização, imóveis e RH |
| Transparência | Portal com categorias; configuração de vídeos, estrutura administrativa, publicação de documentos, resultados e perguntas frequentes | Publicar dados e documentos a partir dos módulos de origem com controle de publicação |
| Patrimônio | Menu Principais, Movimentos, Relatórios, Pesquisas e Outros; relatórios sintético/analítico, patrimônio, termos de responsabilidade e transferência | Ficha do bem, localização, responsável, movimentos e termos ligados ao histórico |
| Assistência social | Menus Beneficiário, Programa Social; relatórios de benefícios por período, beneficiários, famílias e programas | Famílias, benefícios e programas; nesta amostra não há formulário detalhado que comprove o modelo de dados |
| Balanço Geral | Grupos de relatórios e PCASP | Catálogo de saídas contábeis vinculado aos dados e ao exercício |

Não há evidência suficiente neste arquivo para detalhar funcionalidades de prontuário, farmácia, gestão escolar ou toda a operação de frotas. Saúde e educação aparecem principalmente em relatórios contábeis; frota aparece em menus e em uma ação da compra.

## 9. O que a forma de apresentação ensina

O percurso sugere uma apresentação começando pela amplitude do catálogo, passando a telas específicas de compras e tributação e terminando em RH, documentos e relatórios. Menus amplos tornam o escopo visível; formulários, tabelas preenchidas, mensagens e saídas tornam a demonstração concreta.

Para uma POC do CeleriFlow, preparar uma matriz por requisito do edital:

| Campo da matriz | Finalidade |
|---|---|
| Número e texto do requisito | Relacionar demonstração ao checklist real |
| Módulo, rota e código de tela | Encontrar rapidamente o recurso |
| Registro de teste | Evitar improvisar dados durante a sessão |
| Pré-condição | Permissão, competência, saldo e vínculo necessários |
| Passos | Operações curtas e reproduzíveis |
| Resultado esperado | O que a comissão poderá verificar |
| Evidência | Registro salvo, histórico, documento, arquivo ou retorno |
| Situação | Pronto, parcial, precisa implementar ou não verificado |

Não usar estes menus como substitutos do checklist do edital. A POC deve comprovar a exigência concreta: abrir um menu “Cálculo da Folha” não equivale a demonstrar cálculo.

### Cinco roteiros propostos

1. **Compra integrada:** localizar cotação → abrir compra vinculada → conferir fornecedor/itens/dotação → aprovar → gerar empenho → registrar recebimento → consultar movimento de estoque → emitir documento. Estas conexões são propostas de demonstração; nem todas foram executadas nas capturas.
2. **Tributação do imóvel:** abrir BIC → conferir proprietário e inscrição → consultar lançamento → mostrar composição do débito → emitir guia → registrar retorno de teste → consultar nova situação → gerar certidão quando cabível.
3. **Vida funcional:** localizar servidor → conferir vínculo/cargo → registrar férias → calcular movimento pertinente → emitir aviso/recibo → anexar ao GED → verificar documento e histórico.
4. **Folha:** selecionar competência/órgão → conferir eventos → calcular → mostrar inconsistência e correção → emitir analítico/sintético/recibo → conferir totais → gerar remessa com crítica.
5. **Portal:** entrar no perfil cidadão/servidor/fornecedor → localizar serviço → realizar solicitação/consulta → mostrar registro correspondente na área interna → apresentar documento e autenticação.

Usar base fictícia coerente: os mesmos fornecedores, servidores, imóveis, processos e competências reaparecem nas etapas. Isso permite comprovar relações entre módulos.

## 10. Prioridades recomendadas

Prioridades são sugestões e devem ser ajustadas ao edital e ao código existente.

| Prioridade | Entrega | Motivo |
|---|---|---|
| P0 | Mapear checklist real para rotas e registros de teste | Garante que a demonstração cobre o que será avaliado |
| P0 | Validar persistência, permissões, cálculos e documentos dos fluxos exigidos | Transforma interface em operação comprovável |
| P1 | Busca global, favoritos, histórico e código de tela | Reduz tempo para localizar requisitos |
| P1 | Padrão de filtros/tabelas/ações contextual | Melhora vários módulos com a mesma estrutura |
| P1 | GED reutilizável e vinculado às entidades | Comprova documentos sem sair do contexto |
| P1 | Ações de integração interna em compras, RH e tributação | Mostra fluxo completo e evita redigitação |
| P1 | Central de relatórios com filtros e totais consistentes | Facilita evidenciar dados e resultados |
| P2 | Lotes com prévia, crítica e resultado por registro | Dá transparência a operações amplas |
| P2 | Portais por perfil e validação pública de documentos | Permite demonstrar a jornada externa |
| Conforme edital | Integrações externas homologadas e obrigações fiscais | Exigem implementação específica e evidência própria |
| P3 | Comando de voz e indicadores de novidade | Menor contribuição para os fluxos centrais |

## 11. Orientação para o Codex implementar no CeleriFlow

Antes de alterar o projeto:

1. Inventariar rotas, componentes, tabelas, serviços e permissões já existentes.
2. Para cada proposta deste documento, informar: existente e funcional, existente parcial, somente visual, ausente ou não verificado.
3. Apontar o arquivo/rota e a evidência usada para a classificação.
4. Comparar com o checklist específico do edital, quando fornecido. Este documento não contém o checklist oficial.
5. Reutilizar a estrutura visual e os componentes do CeleriFlow. Evitar telas paralelas para uma função já existente.
6. Implementar por fluxo, incluindo persistência, validação, histórico e saída.
7. Em integrações externas, distinguir ambiente de teste, simulação e produção. Mostrar protocolo e retorno quando disponíveis.
8. Não marcar atendimento com base apenas em botão, nome de rota ou dado estático.

### Componentes compartilhados sugeridos

- Catálogo de funcionalidades com identificador, título, módulo, categoria, rota, palavras-chave e permissão.
- Busca de entidades por código/documento/nome, com seleção vinculada ao cadastro.
- Filtros avançados recolhíveis com limpeza e manutenção do estado ao voltar.
- Tabela com ordenação, paginação, seleção, totalizadores e ações por linha.
- Ficha com abas e menu contextual condicionado à situação e permissão.
- GED com metadados, versões, download e verificação de assinatura quando aplicável.
- Gerador de relatórios com filtros, prévia, exportação e competência explícita.
- Executor de lotes com prévia, validações, progresso e resultado por item.
- Histórico de ações com origem, usuário, data, motivo e referência ao registro.

### Verificação funcional mínima

- Salvar e recarregar mantém os dados.
- Consulta e relatório respondem aos filtros e não misturam órgãos.
- Botões respeitam permissão e situação do registro.
- Ação que gera movimento não duplica na repetição.
- Cancelamento mantém histórico e trata vínculos dependentes.
- Total da tabela corresponde à saída impressa na mesma seleção.
- Documento gerado refere-se ao registro aberto.
- Erro de validação explica como corrigir e não perde os campos preenchidos.
- Operação em lote informa o resultado por item.
- A integração registra resposta; falha externa não é exibida como sucesso.

## 12. Índice das 92 capturas

Os números abaixo correspondem à ordenação cronológica pelos nomes. Para encontrar a imagem original, buscar `Captura de tela 2026-10-01 HHMMSS.png`. O horário é parte do nome, sem inferir fuso da captura.

| Nº | Horário no nome | Conteúdo |
|---|---|---|
| 01 | 10:13:15 | Preferências do usuário |
| 02 | 10:13:28 | Menu Contabilidade |
| 03 | 10:14:40 | Menu PPA/LDO/LOA |
| 04 | 10:16:02 | Importações de planejamento |
| 05 | 10:17:08 | Relatórios LOA |
| 06 | 10:17:26 | Menu Balancete |
| 07 | 10:17:35 | Cadastros principais do Balancete |
| 08 | 10:18:40 | Auxiliares do Balancete |
| 09 | 10:19:09 | Movimentos do Balancete |
| 10 | 10:20:22 | Impressos contábeis |
| 11 | 10:21:44 | Relatórios LRF execução orçamentária |
| 12 | 10:22:20 | Relatórios LRF gestão fiscal |
| 13 | 10:22:52 | Relatórios contábeis |
| 14 | 10:23:19 | Relatórios Saúde/SIOPS |
| 15 | 10:23:43 | Relatórios SIOPE |
| 16 | 10:24:07 | Remessas governamentais contábeis |
| 17 | 10:24:57 | Menu Tesouraria |
| 18 | 10:25:01 | Cadastros principais da Tesouraria |
| 19 | 10:25:15 | Movimentos de Tesouraria |
| 20 | 10:25:23 | Movimentos de Tesouraria, detalhe de atalho |
| 21 | 10:26:08 | Relatórios da Tesouraria |
| 22 | 10:27:05 | Outros da Tesouraria, recorte |
| 23 | 10:27:08 | Outros da Tesouraria |
| 24 | 10:27:37 | Rodapé/interface, sem evidência funcional adicional |
| 25 | 10:27:59 | Menu Balanço Geral |
| 26 | 10:28:32 | Menu Patrimônio |
| 27 | 10:29:54 | Cabeçalho/contexto de órgão e competência |
| 28 | 10:30:07 | Relatórios de Patrimônio |
| 29 | 10:32:39 | Portal da Transparência |
| 30 | 10:34:24 | Configurações de publicação/transparência |
| 31 | 10:39:07 | Menu Licitação |
| 32 | 10:39:48 | Consulta de cotações |
| 33 | 10:45:55 | Cadastro de compra |
| 34 | 10:47:00 | Filtros do relatório de compras acumuladas |
| 35 | 10:47:10 | Relatórios de compras |
| 36 | 10:50:07 | Assistência Social, cadastros |
| 37 | 10:50:24 | Assistência Social, fiscalização/relatórios |
| 38 | 10:51:48 | Ata de registro de preços |
| 39 | 10:52:02 | Menu Gestão de Compras |
| 40 | 10:52:09 | Menu Protocolo |
| 41 | 10:57:38 | Menu Arrecadação |
| 42 | 10:58:00 | Listagem de contribuintes |
| 43 | 10:59:43 | Filtros Conta Corrente Fiscal/DUAM |
| 44 | 11:00:04 | Lançamentos do Econômico |
| 45 | 11:00:24 | Nota Fiscal Avulsa |
| 46 | 11:00:49 | Consulta de alvará |
| 47 | 11:01:46 | Consulta CND e tipo de emissão |
| 48 | 11:02:30 | Cadastro Imóvel/BIC |
| 49 | 11:02:35 | Tipos de certidão, recorte |
| 50 | 11:04:29 | Alvará e diálogo de certificado digital |
| 51 | 11:05:14 | Dívida Ativa, cadastros principais |
| 52 | 11:06:28 | Protesto/Negativação/Execução Fiscal |
| 53 | 11:09:23 | Denúncia fiscal |
| 54 | 11:09:39 | Bancos, principais |
| 55 | 11:10:06 | DES-IF |
| 56 | 11:10:21 | Cadastro COSIF |
| 57 | 11:10:31 | Menu Arrecadação |
| 58 | 11:12:27 | Cadastro de moedas/índices |
| 59 | 11:12:44 | Menu NFS-e municipal/nacional |
| 60 | 11:13:05 | Painel administrativo NFS-e |
| 61 | 11:14:22 | Consulta NFS-e Nacional |
| 62 | 11:14:55 | Entrada do Portal por perfil |
| 63 | 11:15:34 | Portal de serviços do cidadão |
| 64 | 11:19:26 | Funcionário, ficha médica/plano de saúde |
| 65 | 11:20:10 | Funcionário, dados governamentais |
| 66 | 11:20:25 | Funcionário, seleção de vínculo/situação |
| 67 | 11:21:42 | Funcionário, dados de função |
| 68 | 11:22:17 | Funcionário, dados demissionais |
| 69 | 11:22:29 | Funcionário, eSocial/trabalho temporário |
| 70 | 11:22:57 | Funcionário, SST/CAT |
| 71 | 11:23:29 | Funcionário, consignado e alerta RPPS |
| 72 | 11:24:00 | Movimento financeiro e tipos de movimento |
| 73 | 11:25:24 | Funcionário, documentação e ações relacionadas |
| 74 | 11:25:52 | Acerto de verbas/rescisão, itens financeiros |
| 75 | 11:26:10 | Rescisão, opções de impressão |
| 76 | 11:26:26 | Cadastro de férias |
| 77 | 11:26:44 | GED do funcionário e assinaturas |
| 78 | 11:27:07 | Menu Folha de Pagamento |
| 79 | 11:27:14 | Relatórios financeiros da folha |
| 80 | 11:27:43 | Filtros de folha analítica, órgão/movimento |
| 81 | 11:28:03 | Filtros de folha analítica, admissão/previdência |
| 82 | 11:28:20 | Filtros de folha analítica, categoria e ordenação |
| 83 | 11:28:45 | PDF de sumário da folha, proventos/descontos |
| 84 | 11:28:52 | PDF de sumário da folha, cálculo previdenciário |
| 85 | 11:29:47 | Relatórios administrativos do RH |
| 86 | 11:30:25 | Remessas governamentais do RH |
| 87 | 11:30:57 | Remessas bancárias do RH |
| 88 | 11:31:32 | Movimentação Geral da folha |
| 89 | 11:32:45 | Menu Dossiê |
| 90 | 11:33:27 | Dossiê, outros/férias coletivas |
| 91 | 12:45:21 | Portal do pregão, registro de revogação |
| 92 | 12:49:50 | Portal do pregão, lote e melhor lance |

As capturas 91–92 pertencem ao portal do pregão, não à aplicação municipal. O registro de revogação não permite atribuir causa à POC nem concluir reprovação técnica.
