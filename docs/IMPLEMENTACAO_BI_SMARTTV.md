# BI — primeira entrega e Smart TV pública

Data: 31/10/2026. Referência: [plano de implantação](PLANO_IMPLANTACAO_BI_SMARTTV.md).

**Situação da primeira entrega: concluída e conferida em produção.** Player público: <https://guarama.celeriflow.com.br/Smarttv>. Editor autenticado: <https://guarama.celeriflow.com.br/administracao/bi/smarttv>.

## Funcionalidades implementadas

- Administração → Smart TV: configuração da programação municipal, até 40 páginas, escolha de indicadores e gráficos existentes, imagens institucionais e páginas mistas.
- Ordem, duplicação, remoção, duração de 10–120 segundos, títulos, legendas, fonte, período e seleção de secretaria por página.
- Vigência opcional com início/fim; períodos de ano atual, mês atual e histórico. Limites do calendário de demandas calculados em `America/Sao_Paulo`; vigência editorial é armazenada como instante UTC a partir da data/hora local escolhida pelo editor.
- Prévia com dados reais antes de salvar/publicar.
- Rascunho separado da publicação; histórico das últimas 20 publicações, recuperação como rascunho e retirada da programação.
- Controle de revisão: uma gravação concorrente impede sobrescrever silenciosamente o trabalho de outro servidor.
- Permissões do módulo Administração: visualização para leitura, `update` para edição e `issueReports` para publicação/retirada. Publicar uma composição também exige edição. Administrador do sistema mantém suas capacidades existentes.
- `/Smarttv` público, fora do shell administrativo, com alias `/smarttv` e sem formulário de login.
- Nome municipal e logo do cadastro institucional, título da programação, rodapé, legendas, fonte, período, atualização e posição na rotação.
- Player em tela inteira de conteúdo, comando de fullscreen, rotação automática, pausa/retomada, setas e páginas adicionais para comparativos extensos. Páginas mistas e áreas menores distribuem indicadores/categorias em mais telas para manter a leitura; ordem dos indicadores e escala dos gráficos são preservadas.
- Publicação verificada a cada 60 segundos; dados com cache persistido e intervalo configurável de 1–60 minutos. O intervalo da rotação é independente da consulta de dados.
- Reconexão e retenção temporária em memória; vencimento local do manifesto em 30 minutos sem validação, com sinalização de conexão e desatualização. Dados têm validade máxima de 30 minutos ou dois intervalos configurados, o que for maior; a operação offline continua limitada pela validade do manifesto. Sem service worker/cache offline persistente.
- Snapshot compartilhado no PostgreSQL, com trava transacional para evitar recomputações simultâneas da mesma publicação.
- Auditoria de gravação, publicação, retirada e envio de imagens.

## Indicadores e fontes iniciais

Fontes: estrutura administrativa, equipe agregada e demandas internas, consultadas por Drizzle/PostgreSQL.

Indicadores disponíveis: servidores ativos, secretarias ativas, departamentos ativos, unidades ativas, demandas no período, abertas, resolvidas, canceladas e vencidas. Gráficos: demandas por secretaria, servidores por secretaria e demandas por mês.

Demandas resolvidas e canceladas são contadas separadamente. A lotação na secretaria usa vínculo direto ou secretaria do departamento. Itens sem secretaria são incluídos nos totais municipais e identificados no comparativo. Estrutura/equipe refletem posição atual, e não uma reconstrução histórica.

A API pública retorna somente medidas/agrupamentos escolhidos na versão publicada. Não retorna nomes/CPF de servidores, títulos/descrições de demandas, responsáveis, configuração do rascunho ou identidade dos autores.

## Imagens editoriais

Entrada: PNG/JPG/WebP estático, até 8 MiB e 16 megapixels. O servidor decodifica, aplica orientação, limita a 2560×1440 sem ampliar e gera WebP de até 2 MiB, removendo metadados.

Nesta primeira entrega, as imagens normalizadas são persistidas no PostgreSQL, sem depender de novas credenciais de storage. A listagem de seleção oferece as 100 imagens mais recentes. Os arquivos de rascunho usam endpoint autenticado; o endpoint público verifica se a imagem faz parte da programação publicada e vigente. Retirar a programação impede novos downloads públicos, sujeito às cópias já recebidas pelo navegador.

Esta decisão substitui, nesta etapa, a sugestão inicial de armazenamento editorial no Blob. Para acervos maiores, migrar os binários para Blob privado mantendo os identificadores e a verificação de publicação dos endpoints.

## Operação

1. Acessar Administração → Smart TV.
2. Conferir nome/logo em Dados da Prefeitura e, se necessário, ajustar o nome de exibição em Identidade e publicação.
3. Configurar páginas, indicadores, imagens e legendas; usar Prévia.
4. Salvar rascunho e publicar.
5. Abrir `/Smarttv` no navegador da TV e acionar tela cheia quando necessário.
6. Para alterar, editar o rascunho e publicar uma nova versão. Para corrigir, recuperar uma publicação anterior como rascunho e publicar novamente.

Tela cheia nativa depende da interação/suporte do navegador. Para funcionamento contínuo, configurar o equipamento para não suspender e usar quiosque quando disponível. O conteúdo já ocupa a janela sem depender da Fullscreen API.

## Banco e código

Migração: `db/migrations/20261031140000_bi_smarttv/migration.sql`.

Tabelas: `BiDisplayChannel`, `BiDisplayChannelVersion`, `BiMediaAsset`, `BiDisplaySnapshot`. A referência à publicação usa FK composta para garantir que a versão pertença ao canal. A programação padrão tem chave explícita `municipal-public`.

Principais arquivos:

- `src/lib/bi/display-model.ts`: contratos e validação.
- `src/lib/bi/display-service.ts`: permissões, publicação e snapshots.
- `src/db/repositories/administration/bi-display.ts`: consultas agregadas.
- `src/app/app-domain/administracao/bi/smarttv/`: editor e actions.
- `src/components/bi/DisplayPlayer.tsx`: player reutilizado na prévia e página pública.
- `src/app/Smarttv/page.tsx` e `src/app/api/public/bi/smarttv/`: visualização/dados/imagens públicos.

O proxy libera somente a entrada exata e o alias. O consentimento de cookies global não cria overlay na rota pública de exibição, que não usa rastreamento opcional.

## Verificações

- Executor oficial `plan`: PASS, com apenas a migração Smart TV pendente.
- Executor oficial `deploy`: PASS, migração Smart TV aplicada à conexão direta configurada.
- `tests/bi-smarttv.test.ts` e `tests/administration-bi.test.ts`: **12 testes aprovados**, incluindo privacidade do rascunho, recorte setorial, registros sem lotação, snapshots, permissões, vigência, imagens, retirada com referência removida, virada de mês no fuso municipal/intervalos longos e regressão CSV/XLSX/Power Query.
- Partição auxiliar 4: 65 raízes, zero diagnósticos TypeScript.
- ESLint dirigido: aprovado.
- Evidência de navegador conectado: `docs/BI_SMARTTV_HOMOLOGACAO_RESULTADO.json`, run `7d7c52e1-b257-401f-9632-ca377e4be552`: **PASS em 14 verificações**. Editor autenticado, publicação/retirada, isolamento do rascunho, upload, HD/Full HD/4K/celular sem overflow, rotação/pausa, reconexão, composição mista com seis indicadores e categorias longas, atualização de versão com página única, expiração e tabela com paginação 20/1. Ensaios de composição/expiração usam respostas públicas controladas no navegador; os demais fluxos usam Firebase/Neon reais.
- Primeira programação municipal com três páginas publicada e disponível no domínio; a repetição da homologação local restaura essa programação ao terminar.
- `npm run build`: **PASS**, com as 15 partições TypeScript aprovadas, compilação de produção e geração de 104 páginas estáticas. Rotas `/Smarttv`, editor administrativo e endpoints públicos/privados reconhecidos no resultado do Next.js. A checagem TypeScript levou 704 segundos e a etapa Next.js, 365 segundos.
- Smoke test do build otimizado com `next start`: **PASS**, `/Smarttv` HTTP 200, programação publicada com três páginas, logo carregada e zero erros JavaScript em 1920×1080.

### Ajuste de ordem por atualização concorrente do repositório

Durante a implementação, entrou o merge `cded3f8` com duas migrações da Ouvidoria numeradas antes da Smart TV já instalada. O executor corretamente bloqueou o prefixo divergente. Foram conferidos recibos e catálogo: nenhuma das duas tinha sido aplicada no banco configurado.

As duas migrações ainda não aplicadas foram renomeadas para `20261031140100_ombudsman_configuration` e `20261031140200_ombudsman_classification`, mantendo o SQL integral e atualizando a referência em `REQUISITOS_POC_300.md`. Nenhum recibo instalado foi alterado. Conferência final `plan`: **PASS, 181 recibos**, com somente essas duas migrações da Ouvidoria pendentes para o fluxo de deploy. A migração Smart TV permanece reconhecida e não será reaplicada.

Conferência após o início do deploy de produção: `plan` **PASS, 183 recibos e nenhuma migração pendente**. As duas migrações seguintes foram aplicadas pelo fluxo de produção e o prefixo instalado permanece íntegro.

Ensaio conectado: `node --conditions=react-server --import tsx scripts/bi-smarttv-homologation.mjs`, com aplicação local na porta 3312, Firebase e banco configurados. Usa a conta administrativa existente e restaura a programação anterior ao final. A opção `--publish-initial` deixa uma programação inicial publicada quando ainda não há publicação ativa; não usar sobre uma programação publicada existente. Imagens/publicações do ensaio são mantidas no histórico de auditoria.

### Conferência da publicação no domínio

Comando: `node scripts/bi-smarttv-production-verify.mjs`. Aguarda o resultado do deploy GitHub → Vercel do commit atual e confere o domínio `https://guarama.celeriflow.com.br`.

O ensaio verifica a entrada `/Smarttv` sem login, o redirecionamento `/smarttv`, o manifesto e a imagem publicados, a identidade institucional, quatro resoluções, a rotação e os comandos do player. Também verifica a proteção do editor e sua abertura com a identidade administrativa existente, sem salvar ou publicar alterações de conteúdo. A sessão do ensaio é encerrada ao final.

Resultado: `docs/BI_SMARTTV_PRODUCAO_RESULTADO.json`. As capturas ficam no diretório local de evidências indicado nesse arquivo. Um resultado PASS do ensaio local não substitui essa conferência do domínio publicado.

Resultado final no domínio: **PASS em 10 verificações**, run `ca201730-4c97-4aab-b2fc-62e8e2456d85`, finalizado em `2026-10-31T21:26:36.599Z`. Deploy do commit `7c0c80682c19bfd83261e7da2afa7b7d5a5825a5` confirmado como sucesso pela integração Vercel. Player, alias, dados, imagens, logo, quatro resoluções, rotação, atalhos de teclado/pausa, proteção do editor e acesso administrativo aprovados; zero erros JavaScript e logout confirmado.

A identificação exibida é a do cadastro institucional: **Prefeitura Municipal de Aurora das Veredas**, conforme a base atual. Nome e logo podem ser conferidos em Dados da Prefeitura; o nome de exibição também pode ser ajustado em Identidade e publicação do editor.

## Próximas etapas do plano

A entrega estabelece a fundação de publicação/consulta agregada e a primeira Smart TV operacional (E2). A fundação mais ampla de projetos/grupos e os editores livres de indicadores/análises/painéis (E1/E3), editor de relatórios/formatos adicionais (E4), biblioteca/embed e instalação móvel (E5) seguem previstos no plano. Os indicadores desta primeira tela são selecionáveis entre fontes predefinidas.

A homologação em navegador com resolução de TV não substitui o ensaio contínuo de duas horas em equipamento real previsto na E6. O player não exige cadastro de dispositivo ou pareamento para abrir o link público.
