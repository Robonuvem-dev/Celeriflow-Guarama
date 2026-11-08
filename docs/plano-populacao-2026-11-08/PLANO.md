# Plano integral de população e demonstração do sistema

**Data:** 08/11/2026. **Situação:** execução parcial em andamento. GED, Educação, fundação contábil/tributária e complemento social já receberam cargas verificadas. O aceite integral permanece pendente. Ver [EXECUCAO.md](EXECUCAO.md).

## 1. Resultado a entregar

Disponibilizar exemplos completos, coerentes e navegáveis em todos os fluxos demonstráveis do CelerFlow, usando **pessoas, empresas, endereços, documentos e movimentações fictícios com aparência de operação municipal real**.

Os cadastros devem aparecer como **João da Silva**, **Praça da Matriz, 100, Centro**, **Horizonte Construções e Serviços Ltda.**, **Empenho 000124/2026** e **Reforma da Escola Municipal Caminhos do Saber**. Não usar “DEMO”, “POC”, “Teste”, “Exemplo”, “Fictício” ou numeração artificial como nome, descrição, matrícula, inscrição ou objeto de negócio.

O aceite exige cadastros, operações, documentos, vínculos, históricos, relatórios e consultas pelos perfis correspondentes. Uma tabela com uma linha ou uma página que apenas abre não comprova um fluxo demonstrável.

### Cobertura inicial efetivamente levantada

| Item | Quantidade | Origem |
| --- | ---: | --- |
| Tabelas físicas | 1.130 | Consulta direta ao Neon |
| Tabelas vazias | 777 | `COUNT(*)` exato |
| Tabelas já com dados | 353 | Também entram na complementação funcional |
| Tabelas em `public` | 1.121 | Aplicação e controle de migrações |
| Tabelas em `neon_auth` | 9 | Autenticação administrada pelo provedor |
| Relações de chave estrangeira | 2.253 | Catálogo instalado |
| Colunas | 11.893 | Catálogo instalado |
| Restrições de PK, unicidade e CHECK | 2.088 | Catálogo instalado |
| Grupos cíclicos de dependência | 38 | Incluem autorreferências e relações entre tabelas |
| Pacotes funcionais/técnicos | 38 | B01–B36 e T01–T02 |
| Roteiros funcionais/técnicos | 56 | F01–F56 |
| Páginas locais inventariadas | 810 | Arquivos `page.*` do checkout |
| Handlers HTTP locais inventariados | 248 | Arquivos `route.*` do checkout |

**Base do código:** `8b4bad3b42708661fd5c8da3ca08650e0fbc6de6`. **Banco consultado:** `neondb`, conexão Neon configurada no projeto. Snapshot das contagens: 08/11/2026, 11h41 de Brasília. As contagens e o catálogo foram obtidos em consultas somente leitura.

O inventário de rotas é estrutural: inclui formulários, detalhes, páginas públicas e endpoints de arquivo, não apenas listagens. As associações iniciais por família funcional são planejamento; o serviço exato, os estados aceitos e as evidências ainda devem ser conferidos tabela a tabela.

## 2. Arquivos de execução do plano

| Arquivo | Utilização |
| --- | --- |
| [MATRIZ-TABELAS.csv](MATRIZ-TABELAS.csv) | Uma linha para cada uma das 1.130 tabelas, com contagem inicial, pacote, onda, fluxos, estratégia, dependências, campos obrigatórios e acompanhamento |
| [matriz-tabelas.json](matriz-tabelas.json) | A mesma matriz em formato estruturado |
| [PACOTES.md](PACOTES.md) / [PACOTES.csv](PACOTES.csv) | Distribuição das tabelas e rotas por pacote |
| [FLUXOS.md](FLUXOS.md) | Casos a construir, estados e critérios de aceite dos 56 roteiros |
| [DICIONARIO-DADOS.md](DICIONARIO-DADOS.md) | Identidades, vínculos, narrativa, datas e padrão de preenchimento |
| [MATRIZ-ROTAS.csv](MATRIZ-ROTAS.csv) | Cobertura das 810 páginas e 248 handlers, com campo para o caso navegável e a evidência |
| [DEPENDENCIAS-FK.csv](DEPENDENCIAS-FK.csv) | Todas as 2.253 relações instaladas |
| [ciclos-dependencias.json](ciclos-dependencias.json) | Grupos que exigem resolução específica da ordem de criação |
| [catalogo-dependencias.json](catalogo-dependencias.json) | Colunas, defaults, constraints e enums do banco; sem conteúdo de registros |
| [VERIFICACAO-PLANO.json](VERIFICACAO-PLANO.json) | Reconciliação da cobertura do planejamento, sem afirmar execução da carga |

Na matriz, o mínimo persistente é um **piso inicial de ocupação**, não a quantidade final de cada tabela. Prevalecem os volumes e a cobertura de estados de `FLUXOS.md`. `incremento_minimo_quantitativo = 0` significa apenas que a contagem já ultrapassa esse piso; não encerra a revisão do conteúdo, dos vínculos e dos fluxos.

## 3. Regras dos dados

1. **Um universo municipal consistente.** Reutilizar a instituição atual e as entidades/unidades existentes. A narrativa principal aproveita Aurora das Veredas/MG já presente na base; não criar outra prefeitura nem misturar referências de Vila das Araucárias, Ibema ou de outro município em um mesmo processo.
2. **Uma identidade, vários papéis.** A mesma pessoa pode ser contribuinte, responsável por aluno, paciente ou servidor, com CPF e endereço únicos. O mesmo fornecedor deve manter CNPJ, razão social e vínculos de credor, contrato, recebimento e pagamento.
3. **CPF e CNPJ com dígitos verificadores válidos**, armazenados no formato exigido pelos serviços. O CPF ilustrado pelo usuário define a aparência desejada; o gerador calculará os dígitos corretos. Nomes de pessoas e empresas serão inventados, não extraídos de cadastros de cidadãos.
4. **Texto de trabalho de verdade.** Descrições específicas de objeto, justificativa, parecer, despacho, atendimento, laudo, encaminhamento e relatório; evitar o mesmo parágrafo repetido em todos os registros.
5. **Códigos operacionais normais.** Matrículas como `003147`, protocolos como `000128/2026`, inscrições como `02.01.00124.001` e documentos numerados pelo serviço existente. Não inserir marcadores de carga em campos exibidos ao usuário.
6. **Rastreabilidade técnica própria.** Identificar o conjunto em manifesto de execução e auditoria, com chaves estáveis e IDs internos. Preservar a origem fictícia nos metadados técnicos, sem prefixar nomes de negócio nem alterar flags de domínio para produzir aparência de confirmação externa.
7. **Cronologia coerente.** Histórico entre janeiro e outubro/2026; novembro/2026 para trabalho em andamento; 2027 para programação. Ações futuras permanecem programadas. Fechamentos de 2026 e transporte para 2027 ficam em cenário de exercício próprio, sem fechar o exercício em uso durante a preparação dos demais fluxos.
8. **Valores e quantidades conciliáveis.** Usar os tipos decimais e os motores do projeto; itens somam o documento; débitos igualam créditos; saldos correspondem aos movimentos; idade, parentesco, lotação e agenda são compatíveis.
9. **Arquivos existentes e legíveis.** PDF/DOCX/ODT/imagem/planilha com conteúdo relacionado ao processo e bytes reais. O vínculo deve apontar para o arquivo efetivo; não usar URL inventada, hash arbitrário ou assinatura externa inexistente.
10. **Estados variados, válidos e explicáveis.** Criar casos abertos, em análise, com exigência, aprovados, concluídos, cancelados e retificados quando o domínio permitir. Para cada ramo que grava tabela própria, incluir ao menos um caso específico.

## 4. Ordem de execução

A onda determina a sequência funcional. Dentro dela, respeitar `pre_requisitos_fk` e `nivel_dependencia`; os 38 grupos cíclicos exigem análise de nulabilidade e dos serviços de criação. Relações de negócio não declaradas por FK também entram na inspeção do serviço. A ordem numérica dos pacotes não substitui essas dependências.

### O0 — Fixar a versão e os pré-requisitos

- Conferir o HEAD, a versão publicada, a conexão de destino e o delta do catálogo contra este snapshot.
- Incorporar ao inventário os fluxos do commit `29e7b1aa` quando integrarem a versão de trabalho. O preview desse commit falhou em `Saude15Client.tsx` por posição de `"use client"`; registrar essa correção no trabalho de código e repetir build antes de considerar essas páginas publicadas.
- Reconciliar a instituição, entes, UGs, usuário executor e permissões atuais. Há **1 instituição, 4 entes, 9 UGs, 285 pessoas, 199 servidores, 20 empresas, 41 contribuintes, 40 bens e 120 materiais** no snapshot: o plano prevê reaproveitamento, não duplicação automática.
- Conferir T02 pelo migrador e estabelecer o manifesto de execução por pacote, com resultados antes/depois e recibos de cada caso.
- Separar divergências de schema, de regra de negócio, de dados e de apresentação. Uma tabela instalada sem serviço ou sem rota deve receber tarefa explícita de investigação/implementação, com seu nome preservado na matriz.

**Saída:** versão/catalogo reconciliados, dependências dos primeiros pacotes resolvidas e todos os fluxos novos registrados.

### O1 — Fundação compartilhada

**Pacotes B01 e B02.** Completar identidades, endereços, contatos, empresas, responsáveis, organização, perfis, vínculos de unidade, calendários e parâmetros. Selecionar/revisar ao menos 100 pessoas verossímeis entre as 285 existentes e ampliar para 30 empresas, aproveitando as 20 atuais compatíveis.

Conferir a pessoa canônica antes de criar vínculo de paciente, aluno, contribuinte ou servidor. Completar 60 cadastros funcionais utilizáveis sem recriar os 199 servidores existentes. Definir os perfis de operador, gestor, contador, comprador, fiscal, profissional de saúde, professor, assistente social, cidadão e servidor.

**Saída:** buscas e seletores encontram cadastros completos, sem duplicação de identidade e com escopo de acesso correto.

### O2 — Estruturas que sustentam os fluxos

**Pacotes B03, B11, B12, B13 e B32.** Preparar PPA/LDO/LOA, dotações e catálogos; tipos/assuntos e tramitações de processo; atendimento e ouvidoria; parâmetros cadastrais/fiscais; GED, modelos e documentos compartilhados.

O GED começa nesta onda e recebe novos documentos conforme os demais pacotes produzirem suas operações. Construir aqui as pontes `processo → documento → assinatura → publicação`, mantendo versão e autoria.

**Saída:** um processo completo pode percorrer setores e documentos; orçamento e cadastros fiscais suportam compras, receitas, despesa e construção civil.

### O3 — Cadeias financeiras, compras e patrimônio

**Pacotes B04–B07 e B14.** Executar primeiro os fluxos integrados abaixo, seguindo os serviços de cada etapa:

1. Planejamento → demanda → pesquisa → processo de compra → licitação/dispensa → instrumento → recebimento.
2. Dotação → reserva → empenho → liquidação → pagamento → extrato → conciliação → contabilidade.
3. Recebimento → estoque → requisição → consumo/devolução → inventário → custo.
4. Aquisição → incorporação patrimonial → responsabilidade → transferência → manutenção → depreciação/baixa.
5. Contribuinte/imóvel → lançamento → guia → pagamento → receita/contabilidade; em casos próprios, cobrança → parcelamento → dívida ativa.
6. Controle interno acompanha os fatos criados: plano, achado, recomendação, providência e custo por unidade.

**Saída:** saldos e totais reconciliados; conjuntos em estágios diferentes permitem continuar a operação pela tela.

### O4 — Completar todos os módulos setoriais

**Pacotes B08–B10, B15–B31 e B33.** Seguir os roteiros de Saúde, Educação, RH/SST, Tributação especializada, Assistência Social, Frotas, Obras, Construção Civil, Cemitérios, Meio Ambiente, Saneamento, Cultura, Segurança, Câmara e textos jurídicos.

Cada pacote produz seus próprios itens, vínculos, revisões, anexos, logs e eventos pelo fluxo correspondente. O mapa de tabelas é o controle para localizar especialidades ainda não atingidas pelos casos centrais.

**Saída:** todas as tabelas persistentes de negócio têm destino de carga e exemplo utilizável; cada ramo demonstrável tem caso identificado e documento/relatório quando aplicável.

### O5 — Portais, integrações, BI e cobertura técnica

**Pacotes B34–B36 e T01**, mais o fechamento de T02. Publicar as fontes nativas de transparência a partir das operações já geradas; demonstrar consultas de cidadão, paciente e servidor; preparar séries mensais e painéis; exercitar importações, rejeições e reprocessamentos.

A identidade da aplicação examinada resolve usuário por **Firebase UID** (`src/lib/platform/identity-service.ts`); não foram encontrados consumidores de `neon_auth` em `src`. T01 permanece explicitamente investigável: verificar configuração e uso do provedor antes de tratar essas nove tabelas como parte do login demonstrável. A ocupação dessas tabelas não substitui os acessos reais da aplicação.

**Saída:** portais usam os mesmos registros dos módulos; painéis e exportações conciliam; a situação de cada tabela técnica está justificada pelo seu ciclo real.

### O6 — Reconciliação e validação navegável

- Repetir o censo completo; comparar tabela por tabela e reconciliar as 777 vazias iniciais.
- Validar os 56 roteiros e todas as entradas da matriz de rotas, inclusive formulários, detalhes, abas, seletores e documentos. Páginas de redirecionamento ou apoio devem registrar seu papel efetivo, não exigir uma tabela própria artificial.
- Para cada listagem principal, manter **ao menos 21 resultados elegíveis no mesmo escopo/filtro**, quando a natureza do cadastro comportar essa quantidade. Isso permite conferir primeira e segunda páginas de 20 linhas sem multiplicar configurações singleton.
- Conferir busca nominal/documental, filtros, paginação, vínculos, salvar e reabrir, ações habilitadas, relatórios, PDFs e exportação integral.
- Reexecutar a carga idempotente: deve reutilizar o caso já aplicado e preservar movimentações feitas depois por operadores.
- Registrar os resultados de banco, regras, API/arquivo e navegador separadamente. Nenhum resultado estrutural é lançado como validação visual.

### O7 — Pastas inteligentes e Modelos: correção solicitada após a carga

**Sequência solicitada pelo usuário:** concluir a população e, em seguida, verificar/corrigir o aviso das telas `/assinatura-digital/pastas-inteligentes` e `/assinatura-digital/modelos`. Roteiro específico: [POS-CARGA-GED.md](POS-CARGA-GED.md).

A inspeção inicial localizou a mensagem **“Esta área ainda não comporta a tabela no padrão.”** no componente compartilhado `OperationalTable.tsx`. Ela é acionada por insuficiência de largura ou altura útil em desktop/notebook. As duas telas passam pelo mesmo `GedWorkspace.tsx` e usam a configuração `listColumns`. A reprodução visual e a causa geométrica específica continuam pendentes.

Medir o espaço com os dados da carga, conferir campos e ações e implementar a composição necessária. Se houver limitação funcional no componente, estender o contrato compartilhado ou criar uma composição adequada usando o shell e os componentes operacionais existentes, preservando a política global de 20 registros. O aceite exige acesso integral aos dados e ações, além do desaparecimento do conflito no espaço suportado.

## 5. Como implementar a carga

### Unidade de execução: um caso completo

Implementar por pacote, em arquivos específicos, reutilizando os serviços e repositórios existentes. A entrada de cada caso inclui pessoa/empresa/unidade, documento de origem, datas, valores, estados desejados e chaves de repetição. A saída é um recibo com IDs reais produzidos, tabelas atingidas, contagens e passos de navegação.

Antes de implementar um caso:

1. Ler a definição da tabela e o serviço que realmente a grava; usar catálogo instalado para obrigatoriedade, default, PK/unique, CHECK e enums.
2. Verificar importadores/chamadores antes de qualquer alteração de assinatura; manter o padrão de erro das Server Actions.
3. Resolver os pais compartilhados e o escopo de ente, UG, setor, escola ou unidade de saúde.
4. Identificar como revisões, auditoria, eventos, documentos e projeções são gerados. Nunca completar apenas a tabela final ignorando esse caminho.
5. Definir casos de estados ainda não cobertos; vincular cada tabela nova alcançada ao ID do roteiro e ao recibo.

### Contrato operacional dos carregadores a construir

- **Planejar:** mostrar as inclusões/complementações e pré-requisitos concretos do pacote.
- **Ensaiar:** executar operações transacionais e conferir resultados com rollback; arquivos e chamadas fora da transação precisam de tratamento próprio, sem afirmar que rollback do banco os desfaz.
- **Aplicar:** transações por caso ou grupo consistente, trava/idempotência e checkpoint persistente para retomada.
- **Verificar:** consultar o caso, conciliar valores, validar documentos e retornar diferenças específicas.
- **Repetir:** não duplicar pais, pagamentos, movimentos, estoque, versões ou eventos já aplicados; preservar alterações posteriores dos operadores.

Os nomes acima são requisitos do carregador; **não são comandos já implementados** por este plano. Os scripts existentes têm contratos diferentes e devem ser adaptados individualmente antes do reuso.

### Reuso localizado

| Fonte existente | Aproveitamento | Adaptação necessária |
| --- | --- | --- |
| `scripts/municipal-system-dataset.ts` e `seed-municipal-system.ts` | Pessoas, empresas, organização e vínculos entre módulos | Complementar estados e roteiros; resolver cadastros existentes e alinhar o catálogo de nomes/contatos |
| `scripts/seed-municipal-tax-cases.ts` | Lançamento e guia pelos serviços tributários | Conferir parâmetros atuais, origem contábil e completar pagamento/cobrança; o censo atual mostra essas tabelas vazias |
| `scripts/seed-municipal-planning.ts` | Exemplo de instrumento, linha e memória com valores decimais | Está restrito a conexão isolada e outra narrativa municipal; não executar como se fosse a carga operacional atual |
| `scripts/seed-education-s1.ts` a `seed-education-s5.ts` | Referência de cenários especializados | Revisar pessoas, textos, datas, IDs e duplicidades por arquivo |
| `scripts/seed-rh.ts`, cargas de direitos/folha e `seed-hr-poc-linked-workflows.ts` | Motores de RH e integração de direitos/folha | Selecionar vínculos compatíveis; cobrir competências e estados; retirar rótulos artificiais dos novos dados |
| `scripts/seed-construction-demo.ts` | Dependências de urbanismo e configurações | Contém “DEMONSTRAÇÃO” em nomes, matrículas, regras e modelos; não usar seus payloads sem adaptação individual |
| `scripts/seed-fleet-poc.ts`, `seed-social-poc.ts`, `seed-cemetery-demo.ts` | Estruturas e serviços dos módulos | Reescrever o conjunto de entrada no padrão verossímil e completar os ramos ausentes |
| `scripts/repopulate-plausible-data.ts` | Referência de revisão pontual, com valores esperados e auditoria | Conferir o alvo de cada alteração; não rodar substituição genérica em todo o banco |
| `scripts/seed-sanitation-city.ts` e `sanitation-city-dataset.ts` | Base extensa de saneamento já existente | Reaproveitar leituras/unidades; completar os fluxos restantes sem recriar 18.500 consumidores |

## 6. Tratamento de todas as tabelas

**Nenhuma tabela fica sem linha no plano.** A forma correta de ocupação depende da sua função:

| Tipo | Como obter dados | Critério de conclusão |
| --- | --- | --- |
| Cadastro/parametrização persistente | Cadastro completo ou catálogo vigente | Registros utilizáveis e opções necessárias aos fluxos |
| Operação | Executar os estados pelo serviço | Caso completo e continuável pela UI |
| Itens e relacionamentos | Criar pais e associações válidas | Cardinalidade, escopo e valores coerentes |
| Histórico/auditoria/ledger/projeção | Produzir pela ação de origem | Reconciliação com a operação e cronologia |
| Fila, lease, bloqueio, recuperação de acesso | Exercitar o ciclo técnico | Evidência de criação/processamento; estado final pode voltar a zero |
| Autenticação do provedor | Usar o provedor quando efetivamente integrado | Situação comprovada e ciclo real, sem inserir credenciais artificiais por SQL |
| Histórico de migrações | Migrador existente | Histórico íntegro e reconciliado com o schema instalado |

Se uma tabela persistente continuar vazia, registrar **qual operação falta, em qual arquivo está o impedimento, qual caso irá produzi-la e qual é a próxima ação**. Não marcar “concluída” por ser especializada. Uma tabela transitória vazia após consumo só é aceita com a evidência do ciclo; não equivale a exclusão do escopo.

## 7. Critérios de aceite mensuráveis

- **1.130/1.130 tabelas** com destino explícito, responsável funcional/pacote, operação ou ciclo gerador e situação final.
- **100% das tabelas persistentes de negócio** com dados coerentes, inclusive as inicialmente preenchidas que ainda não demonstravam o fluxo.
- **777/777 vazias iniciais reconciliadas** como ocupadas pelo fluxo ou, nos casos técnicos, verificadas pelo ciclo documentado. Pendência não conta como conclusão.
- **56/56 roteiros** com casos, IDs, perfis, sequência de passos e resultado; integrações externas registram o limite efetivamente exercitado.
- **810 páginas e 248 handlers iniciais**, acrescidos do delta de versão, com verificação aplicável ou justificativa concreta de rota técnica/alias; zero entrada esquecida.
- Zero divergência nos totais contábeis, financeiros, de folha, estoque, guias, notas, medições e indicadores abrangidos.
- Zero novos rótulos artificiais em campos apresentados; revisão individual de ocorrências herdadas que apareçam nos roteiros.
- PDFs e arquivos abrem, correspondem ao registro e mantêm rastreabilidade; dashboards usam fatos persistidos.
- Reexecução sem duplicação e sem restaurar saldo já movimentado pelo operador.
- Navegação pelos perfis do fluxo; preservar shell, permissões e paginação compartilhada de 20 linhas. Validar notebook/desktop e a política documentada de tablet/celular com dados reais da carga.
- Nos pacotes que alterarem código: verificações específicas de negócio e `npm run build` antes de commit/deploy, seguido da confirmação da versão publicada.

## 8. Acompanhamento e entrega

Cada execução atualiza a matriz com: serviço inspecionado, caso/recibo, quantidades antes/depois, IDs navegáveis, documento, resultado da reconciliação, evidência de tela e próxima ação. Usar estados **PLANEJADA → EM_PREPARACAO → CARREGADA → VALIDADA_BANCO → VALIDADA_FLUXO → VALIDADA_VISUAL**, com **BLOQUEADA** e motivo quando houver impedimento concreto.

As três validações são independentes: banco correto não torna a tela aprovada; uma tela que renderiza não comprova o ledger; arquivo HTTP 200 não prova conteúdo. A entrega final inclui matriz preenchida, censo depois, mapa de casos e um roteiro de apresentação por perfil/módulo.

**Nesta entrega:** inventário reconciliado, dependências levantadas e plano por tabela/fluxo/rota preparado. **Alterações no banco:** somente consultas; zero escrita de dados ou schema. **Tabelas visuais:** sem alteração. A execução da carga é o trabalho descrito por este plano e permanece pendente.
