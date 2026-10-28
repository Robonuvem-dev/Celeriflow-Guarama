# Planejamento integral — migração de Prisma para Drizzle

**Projeto:** CeleriFlow Guarama  
**Data:** 27/10/2026  
**Referência inicial de código:** `e72213b` — atualizar esse SHA ao iniciar a execução  
**Estado deste documento:** planejamento aprovado quanto ao escopo integral; implementação e resultados ainda precisam ser registrados pelo executor.

## 1. Objetivo e forma de execução

Migrar **todo o acesso a dados, tipos dependentes, scripts, testes e fluxo de migrações** do Prisma para Drizzle, aproveitando o banco PostgreSQL/Neon existente e preservando o comportamento funcional do sistema.

O proprietário trabalhará nas telas em um computador. Outro computador executará a migração de backend e a redução do custo das verificações TypeScript.

**Diretriz do proprietário:** executar a migração completa, organizada em etapas com **vários módulos ao mesmo tempo**. As etapas são lotes de implementação e validação, não decisões sucessivas sobre fazer ou não a migração. Depois de concluir um lote, avançar para o seguinte até encerrar o plano. Interromper somente diante de um bloqueio real que impeça preservar os contratos, a integridade dos dados ou o trabalho concorrente.

### Resultados obrigatórios

- [ ] Aplicação, tarefas agendadas, integrações, relatórios, scripts e testes operando com Drizzle ou SQL parametrizado pelo novo driver.
- [ ] Nenhum import ativo de Prisma, cliente gerado, metadados DMMF ou adaptadores Prisma.
- [ ] Banco, dados, identificadores, relações, constraints, funções e triggers preservados e conferidos.
- [ ] Contratos das telas e Server Actions preservados durante a mudança.
- [ ] Geração do cliente Prisma retirada de instalação, desenvolvimento, typecheck e build.
- [ ] Verificação TypeScript completa, estrita e com consumo de memória medido e reduzido.
- [ ] Build local e build na Vercel concluídos.
- [ ] Rastreabilidade por módulo, critérios de aceite, evidências e procedimento de recuperação disponíveis no repositório.

## 2. Diagnóstico de partida

Levantamento realizado em 27/10/2026; refazer o inventário no computador executor, pois o outro computador continuará alterando o projeto.

| Indicador | Valor observado | Interpretação |
|---|---:|---|
| Modelos Prisma | 973 | Escopo amplo e interdependente |
| Linhas de `prisma/schema.prisma` | 19.712 | Esquema central grande |
| Arquivo gerado `.prisma/client/index.d.ts` | 96,35 MiB / 2,19 milhões de linhas | Custo importante de leitura e inferência de tipos |
| Arquivos com referências Prisma ou consultas via `prisma` | 1.557 | Contagem textual em `src`, `scripts` e `tests` |
| Ocorrências de `$transaction(...)` | 1.330 | Inclui produção, scripts e testes; não é contagem certificada de jornadas |
| Campos `Decimal` | 416 | Preservar precisão e arredondamento |
| Defaults `cuid()` | 934 | Comportamento de geração de IDs a substituir explicitamente |
| Campos `@updatedAt` | 507 | Atualização automática a reproduzir |
| Migrações na trilha ativa | 156 | `prisma/migrations-ibema`, conforme `prisma.config.ts` |

O histórico SQL contém centenas de definições de funções e triggers. O número de declarações nos arquivos não equivale ao número de objetos atuais; conferir o catálogo do PostgreSQL.

### Evidências do gargalo de build

- A etapa inicial `prisma generate`, incluindo inicialização do comando, levou aproximadamente 64–149 segundos nas execuções observadas.
- A checagem TypeScript chegou perto de 6 GB de heap; uma execução terminou com erro de falta de memória.
- Há geração Prisma no `postinstall` e em `scripts/build.mjs`.
- `scripts/typecheck-build.mjs` divide fontes e validações de rotas em processos separados. Existe uma alteração local de quatro para oito partições que **ainda não foi validada em um build completo** na inspeção inicial.
- `scripts/build.mjs` normaliza o heap para 6.144 MB; alterar apenas `NODE_OPTIONS` externamente não muda esse limite nesse fluxo.
- `next.config.ts` pula somente a checagem duplicada do Next quando a checagem independente já passou. Esse mecanismo não autoriza omitir a verificação de tipos.

**Consequência:** retirar `prisma generate` ajuda, mas a redução do grafo de tipos e da inferência entre módulos é parte central da entrega. Enquanto o cliente Prisma completo continuar sendo importado pelo restante do sistema, a migração de alguns módulos não elimina o custo global.

## 3. Organização dos dois computadores

### 3.1 Responsabilidades e arquivos

| Área | Computador das telas | Computador da migração |
|---|---|---|
| Layout, cores, responsividade, componentes visuais, CSS | Responsável principal | Preservar; propor integração pontual quando necessária |
| `page.tsx`, `layout.tsx` e componentes `.tsx` | Responsável principal | Evitar edição concorrente; preparar extrações de consultas em arquivos `.ts` |
| Repositórios, consultas, transações e mapeadores DTO | Consumir contratos acordados | Responsável principal |
| Server Actions e route handlers | Informar alterações de contrato | Migrar preservando assinatura, retorno, autorização e revalidação |
| Esquemas Drizzle e SQL de migração | Coordenar pedidos de novos campos | Responsável principal; uma única autoridade de DDL |
| `package.json`, lockfile, configuração TS/build e conexão | Coordenar necessidades | Responsável principal durante a migração |
| Testes de domínio e de banco | Informar mudanças nas jornadas | Responsável principal |

**Página com Prisma embutido:** a divisão não é resolvida apenas pela extensão do arquivo. O executor cria, por exemplo, `unidades/page-data.ts` ou um repositório com a consulta migrada, mantendo o formato dos dados. A substituição do trecho de consulta em `page.tsx` é um handoff pontual: registrar o arquivo, combinar sua edição e aplicar sobre a versão mais recente da tela. Não reescrever JSX, filtros, ordenação de colunas ou formulários para acomodar o ORM.

Se a tela ainda usa um tipo Prisma, preparar um DTO equivalente em arquivo `.ts` independente. Trocar o import da tela em integração coordenada. Imports somente de tipo também contam como dependência a eliminar.

### 3.2 Branches e integração

- Branch principal de migração sugerida: `feat/migracao-integral-drizzle`.
- Trabalho visual: branch própria do proprietário ou o fluxo que ele já utiliza; combinar qual branch é a referência de integração.
- Criar a branch de migração a partir de um commit compartilhado. Alterações locais não commitadas de outro computador não fazem parte dessa base.
- Manter um executor responsável por cada arquivo compartilhado e por cada transação que atravesse módulos.
- Integrar mudanças das telas no início de cada lote e antes de sua validação final. Manter também o documento de situação atualizado.
- Usar merges normais e revisados. Sem force-push, reescrita de histórico ou sobrescrita de alterações do proprietário.
- Conflito em arquivo de tela: preservar a versão visual mais recente e reaplicar somente a adaptação de dados necessária.
- Publicar lotes coerentes somente quando houver autorização de commit/push e o build obrigatório tiver passado. Seguir `AGENTS.md`.
- O executor da migração não deve promover automaticamente uma branch de migração para produção.

Preparação, com árvore de trabalho limpa e autorização para criar a branch:

```powershell
git status --short --branch
git fetch origin
git switch main
git pull --ff-only origin main
git switch -c feat/migracao-integral-drizzle
```

Para incorporar uma atualização da `main` em uma branch já divergente, não usar `pull --ff-only origin main` esperando que ele faça a integração. Fazer um merge revisado; se for necessário adiar o commit de merge até validar, usar `git merge --no-commit --no-ff origin/main` com árvore limpa, resolver conflitos, validar e então concluir o commit autorizado.

Publicações autorizadas devem usar **Robonuvem-dev**, com a identidade exigida em `AGENTS.md`, e o remoto `https://github.com/Robonuvem-dev/Celeriflow-Guarama.git`.

### 3.3 Banco e ambientes

- Criar uma branch/cópia Neon para desenvolvimento da migração e configurar as variáveis locais e de Preview para ela.
- Prisma e Drizzle, durante a transição dentro de um ambiente, devem apontar para **a mesma cópia de banco desse ambiente**.
- Os dois computadores não devem executar cargas, DDL ou migrações de desenvolvimento no mesmo banco compartilhado de produção.
- Mudanças necessárias para telas novas entram no registro de coordenação de esquema e são aplicadas pelo responsável de DDL.
- Conferir explicitamente o ambiente e o destino de conexão antes de qualquer comando que altere o banco; não registrar URLs com senha ou tokens nos relatórios.
- Preparar recuperação Neon/backup e registrar seu identificador, horário e escopo antes do corte de produção.

## 4. Arquitetura de destino

Estrutura proposta, ajustável aos padrões existentes após inspeção:

```text
src/
  db/
    client.ts                    # conexão server-only; pool e configuração
    transaction.ts               # transações e tipos pequenos de contexto
    errors.ts                    # tradução de erros PostgreSQL para erros de domínio
    schema/
      identity.ts
      administration.ts
      sanitation.ts
      environment.ts
      ...                        # arquivos por domínio; não um esquema global gigante
    repositories/
      sanitation/
      administration/
      ...
  lib/
    contracts/                   # DTOs sem dependência de ORM
    platform/                    # autorização e escopos preservados
db/
  migrations/                    # trilha futura, após definição do baseline
docs/
  MIGRACAO_DRIZZLE_STATUS.md      # criar na execução; progresso e evidências
  MIGRACAO_DRIZZLE_CONTRATOS.md   # criar na execução; contratos e handoffs
  MIGRACAO_DRIZZLE_METRICAS.md    # criar na execução; tempos, memória e ambiente
```

### Decisões técnicas

1. Selecionar versões compatíveis e fixas de `drizzle-orm` e `drizzle-kit`. Consultar documentação e notas dessas versões; não instalar automaticamente uma versão beta/RC apenas porque aparece em um exemplo.
2. Usar conexão Neon por WebSocket/pool compatível com transações interativas, ou driver PostgreSQL equivalente validado. O driver HTTP não substitui indiscriminadamente os callbacks transacionais existentes.
3. Dimensionar limites de pool e ciclo de vida para Vercel/Node e desenvolvimento local; reutilizar a configuração por processo e não abrir um pool por consulta.
4. Repositórios retornam DTOs explícitos. A inferência Drizzle permanece no interior da camada de persistência.
5. Importar tabelas e relações necessárias ao domínio. Evitar registrar todas as tabelas em todos os clientes ou construir um objeto global de relações usado por todas as consultas.
6. Não construir um tradutor genérico que imite toda a API Prisma sobre Drizzle. Migrar consultas e regras de forma explícita, arquivo por arquivo.
7. Preservar nomes físicos, caixa, schemas, nomes de colunas, tipos PostgreSQL e constraints. Introspecção é ponto de partida, não prova de equivalência.
8. Separar migração do ORM de redesenho funcional e de alterações de tipos no banco. Uma coluna `Float` existente não vira `numeric` automaticamente nesta troca.

## 5. Equivalência funcional obrigatória

| Comportamento atual | Tratamento exigido na migração |
|---|---|
| `findMany`, `select`, `include`, relações e contagens | Reproduzir filtros, relações, projeção, nulabilidade e ordenação; evitar multiplicação de linhas em joins |
| Paginação e buscas | Mesma contagem total, limites, ordenação determinística e pesquisa por período/escopo |
| `createMany` / `skipDuplicates` | Conflitos tratados nas constraints corretas, sem ocultar registros ausentes ou falhas de integridade |
| `upsert` e incrementos | Operações atômicas com a mesma chave de conflito; não substituir por leitura seguida de gravação desprotegida |
| Escritas relacionadas | Mesma atomicidade; explicitar ordem das operações e referências |
| `$transaction` | Preservar isolamento, locks, sequência, timeout, rollback e condições de repetição |
| `Prisma.Decimal` | Biblioteca decimal independente ou representação exata; mesmos arredondamentos e serialização; não converter tudo para `number` |
| `cuid()` | Geração explícita compatível com contratos de ID existentes; preservar os IDs já gravados |
| `@updatedAt` | Atualização equivalente em todos os caminhos de gravação, incluindo operações em lote |
| JSON / JSON nulo / SQL NULL | Distinguir os casos usados pelo sistema e testar a leitura/escrita |
| `findUniqueOrThrow` e erros `P20xx` | Preservar os resultados de domínio esperados pelo consumidor; adaptar códigos PostgreSQL na borda |
| SQL bruto | Parametrização, tipos, retorno e transação equivalentes; analisar cada trecho individualmente |
| DMMF e ferramentas genéricas | Substituir metadados Prisma por catálogo explícito ou introspecção controlada do PostgreSQL |
| Autorização | Mesmos perfis, módulos, operações e recortes de entidade, UG, secretaria, unidade e titularidade |
| Auditoria e integrações | Mesmos eventos, autores, vínculos, idempotência e limites de acesso |

Uma transação que une estoque e financeiro, por exemplo, tem **um responsável e uma conexão transacional**. Não é possível preservar sua atomicidade abrindo uma transação Prisma e outra Drizzle independentes. Migrar a unidade transacional inteira, mesmo que envolva mais de um módulo do lote.

### Contratos com as telas

- Verificar todos os consumidores antes de alterar parâmetros ou retorno de função exportada.
- Actions chamadas por `await` em componentes client continuam retornando os objetos de sucesso/erro que a UI já trata.
- Actions ligadas diretamente a `<form action={...}>` seguem o contrato `void`/`Promise<void>` e o tratamento correspondente definido no projeto.
- Preservar revalidação de caminhos, redirecionamentos, mensagens relevantes, datas e formatos monetários.
- Não transferir clientes de banco, objetos de consulta ou tipos internos do ORM para componentes client.
- Não mudar contagens, propriedades ou estrutura de dados recebida pela tela sem handoff registrado.

## 6. Plano de execução integral em lotes multimódulo

Os módulos de um lote podem avançar em paralelo quando seus arquivos e transações forem independentes. A conclusão exige integração do lote inteiro. **Não executar múltiplas checagens TypeScript pesadas ao mesmo tempo** sem orçamento de memória medido.

### Lote 0 — inventário, base de trabalho e medição

**Abrangência:** todos os módulos; infraestrutura de desenvolvimento, testes e build.

- [ ] Ler `AGENTS.md` e os guias relevantes de Next.js em `node_modules/next/dist/docs/`.
- [ ] Registrar SHA de base, estado do Git, alterações locais existentes e branch de cada computador.
- [ ] Criar os três documentos de situação, contratos e métricas propostos na seção 4.
- [ ] Inventariar todas as tabelas físicas, modelos, enums, FKs, índices, defaults, sequences, views, funções, triggers e constraints.
- [ ] Mapear cada tabela, consulta, action, API, tarefa agendada, script e teste ao seu domínio e ao responsável.
- [ ] Encontrar também clientes criados fora de `src/lib/prisma.ts`, aliases de transação, imports apenas de tipos, SQL bruto, DMMF e arquivos sem a variável `prisma`.
- [ ] Medir geração Prisma, typegen, checagem TS e compilação Next separadamente; registrar pico de heap e RSS por processo.
- [ ] Registrar baseline frio e com cache. Se houver OOM, registrar a falha sem declará-la build aprovado e priorizar a correção de infraestrutura no lote 1.
- [ ] Preparar a cópia Neon e o ambiente Preview da migração.

**Saída:** mapa completo de cobertura e dependências, arquivos reservados e baseline reproduzível. Tabelas vazias continuam no escopo quando têm consumidores ou funcionalidades previstas no código.

### Lote 1 — infraestrutura Drizzle + plataforma compartilhada + TypeScript

**Abrangência simultânea:** conexão, transações, autorização, perfis, configuração de módulos, auditoria técnica e contratos compartilhados.

- [ ] Instalar versões fixas de Drizzle/Kit e driver validado; atualizar o lockfile pelo gerenciador do projeto.
- [ ] Criar o cliente server-only, pool, contexto transacional, tradução de erros, geração de IDs e utilitários decimais.
- [ ] Introspectar a cópia do banco e iniciar a organização dos esquemas por domínio.
- [ ] Extrair DTOs e interfaces pequenos para identidade, sessão, permissões e escopos.
- [ ] Adaptar os serviços compartilhados sem quebrar `AppContext` e as funções exportadas que ainda tenham consumidores Prisma.
- [ ] Definir a autoridade única de migrações SQL durante a coexistência.
- [ ] Implementar a reorganização de TypeScript descrita na seção 7 e corrigir o bloqueio de memória da linha de base.
- [ ] Testar isolamento transacional, rollback, erro de unicidade, FKs, autorização e serialização dos DTOs.

**Saída:** infraestrutura utilizável pelos vários módulos; contratos estáveis e checagem completa executável. A presença temporária de Prisma é transitória e deve aparecer no inventário de pendências.

### Lote 2 — Saneamento + Meio Ambiente + Administração + Cadastros

**Abrangência simultânea:** quatro módulos, além dos cadastros canônicos que compartilham.

- [ ] Migrar consultas, CRUDs, relatórios, ações e testes desses domínios.
- [ ] Extrair consultas embutidas nas páginas para repositórios/arquivos `.ts`, coordenando somente a ligação final com o computador das telas.
- [ ] Preservar relações de pessoas, empresas, endereços, secretarias, responsáveis, cargos e servidores.
- [ ] Em Saneamento, cobrir as oito tabelas `San...` e localizar também os caminhos legados de água/faturamento fora desse prefixo.
- [ ] Preservar Identificador `AAAAMMXXXXX`, sequência mensal com concorrência, Rua e número/Bairro/CEP, paginação de 20 itens e filtros de competência.
- [ ] Preservar busca de unidade e competência no formulário e o período atual predefinido na listagem.
- [ ] Validar a base existente de 18.500 unidades/hidrômetros e 55.500 leituras/faturas; as contagens são referência da carga, não autorização para reexecutá-la em produção.
- [ ] Validar agosto, setembro e outubro de 2026; 2024/2025 permanecem sem dados quando essa for a base usada.
- [ ] Cobrir o BI de Administração, exportações, vínculo do responsável da secretaria e restrições de lotação/cargo.

**Saída:** primeiro lote funcional com vários módulos completos. Usar suas métricas para ajustar a técnica dos lotes seguintes, sem transformar isso em uma nova decisão de escopo.

### Lote 3 — Atendimento + Processos/Protocolo + GED + Portais + Transparência

**Abrangência simultânea:** atendimento/ouvidoria; tramitação e workflow; documentos/assinaturas; portal institucional/cidadão; transparência/LAI.

- [ ] Migrar consultas públicas e internas, solicitações, movimentações, anexos, publicação e filtros.
- [ ] Preservar sigilo, titularidade, permissões, prazos, histórico e idempotência de ações.
- [ ] Manter contratos de upload/download e vínculos com Blob e assinaturas.
- [ ] Conferir APIs, exportações, jobs e publicações que consultam dados de módulos ainda em migração.
- [ ] Reservar os DTOs compartilhados para que mudanças visuais nos portais não exijam novas dependências de ORM.

### Lote 4 — Patrimônio/Almoxarifado + Frotas + Obras/Construção Civil + Iluminação

**Abrangência simultânea:** aquisição, estoque, inventário, bens, uso de frota, manutenção, obras e serviços urbanos.

- [ ] Migrar entradas, saídas, reservas, movimentos, posições, inventários, manutenção e anexos.
- [ ] Preservar saldos, rastreabilidade, estados, vínculos com bens, responsáveis e lotação.
- [ ] Tratar transações entre compras/estoque/financeiro como unidades completas; coordenar com o lote 8 quando houver dependência.
- [ ] Cobrir construção civil, extrações, documentos, vistorias, licenças, notificações e tarefas agendadas.
- [ ] Validar que a reutilização de serviços por Iluminação mantém o escopo e a autorização corretos.

### Lote 5 — Cultura/Esporte + Cemitérios + Câmara + Segurança/Mobilidade + Controle Interno

**Abrangência simultânea:** cinco grupos de módulos especializados e seus relatórios.

- [ ] Migrar operações, cadastros, consultas e relatórios de todos esses grupos.
- [ ] Conferir taxas e vínculos tributários de cemitérios, reservas e fomento cultural, processos legislativos e registros operacionais.
- [ ] Preservar dependências de planejamento da Câmara e recortes das consultas do controle interno.
- [ ] Migrar notificações e consultas de auditoria associadas aos fluxos desses módulos.

### Lote 6 — RH/Folha + SST + Portal do Servidor + Educação

**Abrangência simultânea:** quatro domínios com identidade funcional, lotação e documentos compartilhados.

- [ ] Migrar contratos, regimes, eventos, rubricas, cálculos, férias, benefícios, frequência e históricos.
- [ ] Preservar precisão, arredondamento, totais da folha, direitos e regras temporais.
- [ ] Cobrir SST, escopos clínicos, ASO, riscos, restrições, documentos e integração funcional.
- [ ] Preservar titularidade e filtros do Portal do Servidor e seus jobs.
- [ ] Migrar unidades escolares, professores, matrículas, vínculos, responsáveis, frequência e portais educacionais.
- [ ] Validar vínculos e transações compartilhadas com financeiro e estoque, com um responsável por unidade transacional.

### Lote 7 — Saúde + Portal do Paciente + Assistência Social

**Abrangência simultânea:** assistência clínica, regulação, logística, produção, atendimento e proteção social.

- [ ] Migrar identidade canônica, prontuário, agendas, atendimentos, exames, regulação, TFD, vacinas, farmácia e produção.
- [ ] Preservar recortes por unidade/profissional, sigilo, titularidade e autorização de documentos.
- [ ] Conferir saldos por material/lote, movimentações, dispensações e referências compartilhadas.
- [ ] Migrar famílias, prontuários SUAS, rede, benefícios e entregas mantendo seus escopos de acesso.
- [ ] Validar importações/exportações e tarefas de processamento; reproduzir os contratos existentes sem presumir integração oficial além do que já é implementado.

### Lote 8 — Financeiro/Contabilidade + Tributação + Planejamento + Compras/Contratos

**Abrangência simultânea:** quatro domínios de maior interdependência financeira e orçamentária.

- [ ] Migrar execução de receita/despesa, empenho, liquidação, pagamento, tesouraria, conciliação, custos, retenções e fechamento.
- [ ] Migrar cadastros e motores tributários, guias, baixas, estornos, parcelamentos, dívida ativa e intercâmbios fiscais.
- [ ] Migrar instrumentos de planejamento, versões, créditos, dotações e publicação, preservando UG, entidade e exercício.
- [ ] Migrar compra, pesquisa, licitação, contratos, recebimento e integrações existentes.
- [ ] Manter uma matriz de transações intermodulares com responsável explícito; não repartir uma mesma operação atômica entre ORMs.
- [ ] Reconciliar valores e saldos antes/depois; testar concorrência, repetição, estorno e rollback de operações parciais.
- [ ] Conferir relatórios legais, exportações, arquivos de banco e dependências de folha, estoque, patrimônio e transparência.

### Lote 9 — cobertura residual + scripts/testes + remoção integral do Prisma

**Abrangência simultânea:** Configurações restantes, Suporte Técnico conforme implementação existente, indicadores transversais, marketing/leads, APIs, jobs, utilitários e ferramentas operacionais.

- [ ] Comparar o inventário completo com os módulos entregues; incluir qualquer rota, tabela, biblioteca ou ferramenta que não tenha sido capturada pelos nomes acima.
- [ ] Migrar todos os seeds, backfills, reconciliações, diagnósticos, bootstrap e testes que ainda criem clientes Prisma.
- [ ] Substituir DMMF e metadados dinâmicos por catálogos explícitos/introspecção com escopo e testes.
- [ ] Adaptar os testes de banco para o novo cliente; aproveitar PGlite onde adequado e validar particularidades de concorrência no PostgreSQL/Neon de teste.
- [ ] Remover imports de tipos Prisma de componentes, contratos e fixtures.
- [ ] Retirar dependências `prisma`, `@prisma/client`, `@prisma/adapter-neon`, `@prisma/adapter-pg` e outros pacotes Prisma encontrados no inventário ativo.
- [ ] Retirar geração Prisma do `postinstall`, build, typecheck, CI e comandos auxiliares.
- [ ] Encerrar o fluxo de migração Prisma somente após estabelecer e validar o baseline SQL/Drizzle da seção 8.
- [ ] Conferir instalação limpa, build frio, build com cache, testes e Preview sem artefatos Prisma preexistentes.

### Lote 10 — homologação integrada, desempenho e publicação

**Abrangência simultânea:** jornadas entre todos os módulos, telas atualizadas pelo proprietário e ambiente de produção.

- [ ] Integrar a versão mais recente das telas e resolver os handoffs restantes.
- [ ] Executar jornadas de leitura e escrita com perfis e escopos diferentes, relatórios e jobs representativos.
- [ ] Confirmar a redução de memória TypeScript e a ausência de dependência oculta de cache Prisma.
- [ ] Validar o banco copiado, histórico de migrações e objetos SQL; ensaiar o procedimento de recuperação.
- [ ] Rodar `npm run build` completo e confirmar sucesso na configuração real da Vercel.
- [ ] Revisar diff, histórico, identidade GitHub e destinos de deploy antes de qualquer publicação autorizada.
- [ ] Publicar pelo fluxo GitHub → Vercel, acompanhar o resultado e verificar a aplicação publicada.
- [ ] Atualizar documentação de instalação, desenvolvimento, migração, testes e operação.

## 7. Frente obrigatória — TypeScript abaixo do consumo atual de 6 GB

### 7.1 Metas mensuráveis

| Medição | Meta inicial de aceite |
|---|---|
| Pico de heap V8 por processo de checagem | **Até 4 GiB**, validado em execução fria e com cache após retirada do Prisma |
| Limite operacional inicial proposto | Testar `--max-old-space-size=4096`; só adotar como padrão depois que o fluxo completo passar |
| RSS por processo e memória total da máquina | Registrar separadamente; 4 GiB de heap não significa 4 GiB de RSS |
| Estabilidade | Sem OOM e sem depender de um cache gerado em outra máquina |
| Cobertura | Todas as fontes de produção e todas as validações de rota, sem enfraquecer `strict` |
| Tempo | Comparar duração por etapa com o baseline, na mesma máquina e condição de cache |

**A meta de 4 GiB é um objetivo de engenharia a comprovar, não um resultado já obtido.** Se algum domínio ultrapassar o alvo, localizar e corrigir seu custo de tipos; registrar a medição e o bloqueio. Não declarar concluída a frente de memória apenas porque o build passou com heap maior.

### 7.2 Redução do grafo de tipos

- [ ] Separar esquemas por domínio, com referências e relações necessárias, evitando um registro global usado indiscriminadamente por todas as consultas.
- [ ] Importar tabelas específicas nos repositórios e evitar barrels que reexportem todos os esquemas/serviços.
- [ ] Definir DTOs e assinaturas de retorno pequenas nas bordas dos repositórios, actions e serviços.
- [ ] Conter `$inferSelect`, `$inferInsert` e tipos de query na camada de banco. A UI recebe interfaces de domínio independentes.
- [ ] Evitar tipos condicionais/recursivos gigantes, clientes genéricos que carregam todo o esquema e unions de todos os modelos.
- [ ] Projetar somente campos necessários. Dividir consultas e mapeamentos muito complexos em operações legíveis que preservem a transação.
- [ ] Evitar inferência excessiva em grandes arrays, spreads e objetos de consultas; usar tipos explícitos e validar o resultado.
- [ ] Remover dependências ORM do frontend sem substituir tipagem por `any`, `@ts-ignore` ou casts genéricos para esconder incompatibilidades.

### 7.3 Organização das verificações

- [ ] Revisar `tsconfig.json`, `tsconfig.build.json`, `scripts/typecheck-build.mjs`, `scripts/build.mjs` e `next.config.ts` em conjunto.
- [ ] Manter a exclusão de testes/scripts do conjunto de produção, mas fornecer comandos de checagem próprios para essas fontes. Exclusão de um alvo exige cobertura em outro.
- [ ] Organizar grupos por domínio/dependência real e tamanho observado; não confiar somente em hash com quantidade fixa de partições.
- [ ] Registrar quais fontes e quais validações de rota pertencem a cada grupo; a união precisa cobrir o inventário completo. Dependências importadas são verificadas normalmente.
- [ ] Manter execução sequencial de grupos pesados e limitar a concorrência pelo consumo total medido da máquina.
- [ ] Usar cache incremental próprio por grupo, invalidado por mudanças de configuração/dependências/esquema. Confirmar equivalência em execução fria.
- [ ] Usar referências de projetos/declarations por domínio quando o grafo permitir e houver medição de benefício. Não criar referências circulares apenas para fragmentar o projeto.
- [ ] Preservar geração e validação das rotas Next. Seguir os guias da versão instalada antes de alterar o tratamento de `.next/types`.
- [ ] Manter uma única checagem completa válida antes da compilação Next; o Next só pode pular a checagem duplicada depois desse sucesso.
- [ ] Retirar o override fixo de 6.144 MB somente ao adotar um limite menor comprovado. Tornar a configuração explícita e documentada.
- [ ] Reavaliar a necessidade das partições depois de remover o Prisma; reduzir trabalho repetido se a checagem inteira passar dentro da meta.

### 7.4 Ciclo de feedback e evidências

1. Durante a edição: lint nos arquivos alterados e testes/checagens do domínio.
2. Antes de integrar um lote: testar contratos e operações de banco do lote.
3. Antes de commit/push autorizado: `npm run build` completo, como exige o projeto.
4. Nos marcos de infraestrutura e remoção Prisma: comparar cenário frio e com cache.
5. Não executar geração de cliente e testes que o importam ao mesmo tempo durante a coexistência; isso já produziu uma leitura do cliente antigo na análise inicial.

Registrar por execução: SHA, versões Node/TypeScript/ORM, sistema operacional, RAM, condição do cache, comando, duração, pico de heap/RSS, grupos executados e resultado. `tsc --extendedDiagnostics` fornece dados úteis, mas complementar com observação de pico do processo; a memória ao final não é necessariamente o pico.

`npm run typecheck` atualmente também executa geração Prisma e typegen. Evitar repeti-lo imediatamente antes de `npm run build` como se fossem verificações independentes sem custo repetido. Os novos comandos devem diferenciar checagem rápida de domínio, checagem integral e compilação, mantendo o gate integral obrigatório.

## 8. Banco e histórico de migrações

### 8.1 Introspecção e baseline

- [ ] Confirmar a trilha ativa em `prisma.config.ts`; atualmente é `prisma/migrations-ibema`, não a outra pasta histórica `prisma/migrations`.
- [ ] Inventariar o banco físico, incluindo tabelas/objetos não representados pelos modelos Prisma.
- [ ] Usar `drizzle-kit pull` da versão selecionada sobre a cópia de desenvolvimento para obter um ponto de partida de esquema.
- [ ] Revisar o mapeamento gerado: caixa/nome, precisão/escala, timestamps/fusos, enums, arrays, defaults, collation, nulabilidade, constraints e relações.
- [ ] Conferir separadamente funções, triggers, views, índices especiais e SQL customizado; a introspecção não é comprovação de reprodução integral.
- [ ] Preservar os arquivos históricos, seus conteúdos, checksums e o histórico aplicado. Não reaplicar os 156 arquivos em um banco já instalado como se ele estivesse vazio.
- [ ] Se a versão escolhida oferecer inicialização de baseline como `pull --init`, estudar exatamente o que o comando escreve e ensaiá-lo primeiro na cópia.
- [ ] Validar tanto a adoção do banco existente quanto a criação de um banco vazio a partir do histórico preservado mais as migrações novas.

### 8.2 Durante a transição

- Uma única trilha é autoridade para DDL em cada momento. Não deixar Prisma Migrate e Drizzle Kit gerarem mudanças concorrentes para as mesmas tabelas.
- O baseline Drizzle não autoriza recriar tabelas, apagar dados ou remover objetos não reconhecidos pela ferramenta.
- Não usar sincronização automática de esquema, como `drizzle-kit push`, como atalho no banco de produção.
- Migrações adicionais devem ser pequenas, explícitas, versionadas e compatíveis com as versões da aplicação que coexistirão no corte.
- O fluxo de produção atual executa `prisma migrate deploy` dentro do build. Projetar o substituto de forma que rode uma vez no estágio de deploy apropriado e sem apontar builds Preview ao banco de produção.
- A mudança de ferramenta de migrações deve preservar a possibilidade de reconstruir e auditar o histórico. Se os arquivos SQL forem realocados, fazer isso explicitamente no encerramento e adaptar os consumidores/testes antes de removê-los do caminho antigo.

## 9. Validações por lote e regressões importantes

### Para todo lote

- [ ] Busca de consumidores antes de cada mudança de assinatura exportada.
- [ ] Consultas e DTOs com mesmos campos, datas, nulos, erros e escopos.
- [ ] Leitura, criação, atualização, inativação/cancelamento e relatórios aplicáveis.
- [ ] Rollback real quando uma etapa intermediária falha.
- [ ] Concorrência e idempotência nas operações que dependem dessas garantias.
- [ ] Constraints e restrições de acesso continuam efetivas.
- [ ] Testes por comportamento de negócio, não apenas mocks que repetem a implementação do novo ORM.
- [ ] Testes com banco de verdade/cópia de teste para SQL específico e concorrência.
- [ ] Comparação Prisma/Drizzle em leituras determinísticas na mesma cópia, quando útil. Escritas comparativas devem usar bancos isolados, nunca duplicar operações de negócio em produção.
- [ ] Nenhuma alteração visual acidental nos arquivos integrados.
- [ ] Lint dos arquivos, checagem de tipos e build obrigatório aprovados antes da publicação autorizada.
- [ ] Registro do que foi migrado e do que ainda possui consumidores Prisma.

### Pontos de partida existentes

Verificar os comandos e arquivos na revisão de base. Exemplos já disponíveis:

```powershell
node --import tsx --test tests/sanitation-unit-identifier.test.ts tests/municipal-system-dataset.test.ts
node --import tsx --test tests/administration-bi.test.ts tests/secretariat-manager.test.ts
npm run test:frotas
npm run test:education-s1
npm run test:unit
npm run build
```

Esses comandos não representam cobertura total do ERP. Ampliar por domínio com testes de transações, regras, relatórios e fluxos usados por ele. Scripts que exigem `--conditions=react-server` devem manter essa condição quando aplicável. Conferir os destinos de banco antes da execução.

Na validação visual de Saneamento, manter como referência notebook 1366×768, desktop 1920×1080, tablet 768×1024 e 1024×600, além de celular. Conferir 20 linhas e paginação sem rolagem em telas maiores, mantendo a rolagem permitida no celular. Coordenar mudanças de seletor/layout com o proprietário.

## 10. Critério de encerramento integral

O executor só poderá marcar o plano como concluído quando todos os itens abaixo tiverem evidência:

- [ ] Todos os lotes concluídos e todos os domínios do inventário classificados, incluindo código residual fora das pastas principais.
- [ ] Nenhum import ativo de `@prisma/client`, adaptadores Prisma, tipos gerados ou DMMF em aplicação, scripts e testes.
- [ ] Nenhum caminho de runtime/instalação/build/typecheck depende de `prisma generate` ou de um cliente gerado em cache.
- [ ] Dependências Prisma removidas do manifesto e lockfile; documentação/SQL histórico podem manter referências identificadas como legado.
- [ ] Nenhuma API/assinatura exportada ficou incompatível com seus consumidores.
- [ ] Banco existente preservado e fluxo de instalação de banco novo validado.
- [ ] Jobs, relatórios, integrações e ferramentas operacionais cobertos.
- [ ] Build frio e com cache passaram dentro da meta de memória, com heap e RSS registrados.
- [ ] `npm run build` passou integralmente; o resultado não foi inferido de partes isoladas ou de uma execução interrompida.
- [ ] Deploy Preview e deploy final autorizado passaram na Vercel e foram conferidos após publicação.
- [ ] Métricas e procedimentos de operação/recuperação entregues.

## 11. Recuperação e continuidade

- Manter o commit-base e os lotes integrados identificados. Reverter código por commits normais, preservando o histórico.
- Antes do corte, confirmar compatibilidade entre código anterior e esquema do banco. Voltar o código não desfaz automaticamente DDL ou dados gravados depois.
- Preservar dados produzidos durante o período de transição; recuperação de banco deve considerar o intervalo de gravações e os efeitos externos de integrações.
- Um seletor temporário de implementação por domínio pode ser usado somente se estiver testado e mantiver o contrato. Não oferecer uma troca de ORM no meio de uma transação.
- Remover seletores/adaptadores temporários quando o domínio estiver estabilizado e retirar todo o runtime Prisma no lote final.
- Ao pausar ou trocar de sessão, atualizar o documento de situação com branch, último SHA, arquivos reservados, testes executados, falhas reais e próximo passo exato.

Modelo para registrar cada lote em `MIGRACAO_DRIZZLE_STATUS.md`:

```text
Lote / módulos:
Branch / SHA de base / último SHA integrado:
Responsável e arquivos reservados:
Tabelas, consultas, actions e transações migradas:
Contratos/handoffs com o computador das telas:
Consumidores Prisma restantes:
Testes e comandos executados / resultados:
Build frio e com cache / duração / pico de heap e RSS:
Destino de banco, apenas identificador sem credenciais:
Migrações SQL e evidência de equivalência:
Bloqueios reais e próximo passo:
```

## 12. Instrução pronta para o computador executor

> Execute integralmente o planejamento em `docs/PLANEJAMENTO_MIGRACAO_PRISMA_PARA_DRIZZLE.md`. O objetivo é concluir a migração de todo o CeleriFlow para Drizzle, incluindo scripts, testes, migrações e verificações TypeScript, com redução do consumo atual próximo de 6 GB e meta inicial de heap de até 4 GiB por processo, comprovada em build frio e com cache. Trabalhe em branch própria e em uma cópia Neon de desenvolvimento. Organize a execução pelos lotes multimódulo do documento, avançando de um lote concluído para o próximo sem encerrar no primeiro piloto. Leia `AGENTS.md` e os guias da versão instalada do Next.js. Preserve os dados, objetos SQL, transações, autorização e contratos de Server Actions. Analise cada arquivo e seus consumidores; não faça substituições genéricas em massa. O proprietário está editando as telas em outro computador: mantenha o JSX/CSS/layout sob responsabilidade dele e use handoffs pontuais para ligar os repositórios às páginas. Registre progresso, contratos e métricas nos documentos indicados, de forma que outra sessão consiga continuar do último ponto. Não oculte erros de tipos nem use apenas testes com mocks para declarar equivalência. Commit, push, PR e promoção a produção seguem a autorização do proprietário e exigem as validações do projeto. Só declare a migração concluída quando todos os critérios integrais da seção 10 tiverem sido atendidos.

## 13. Referências

- Regras do repositório: `AGENTS.md`.
- Build: `scripts/build.mjs`, `scripts/typecheck-build.mjs`, `tsconfig.json`, `tsconfig.build.json`, `next.config.ts`.
- Conexão e contexto atuais: `src/lib/prisma.ts`, `src/lib/platform/tenant-context.ts`.
- Esquema e trilha ativa: `prisma/schema.prisma`, `prisma.config.ts`, `prisma/migrations-ibema/`.
- Drizzle + Neon: <https://orm.drizzle.team/docs/connect-neon>.
- Introspecção: <https://orm.drizzle.team/docs/drizzle-kit-pull>.
- Transações: <https://orm.drizzle.team/docs/transactions>.
- Estratégias de migração: <https://orm.drizzle.team/docs/migrations>.
- Os comandos e APIs Drizzle devem ser conferidos na documentação das versões fixadas no início da execução.
