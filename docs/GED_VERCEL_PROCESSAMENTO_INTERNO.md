# GED — processamento próprio na Vercel

## Decisão de hospedagem

O ambiente é o projeto Vercel da aplicação **https://guarama.celeriflow.com.br**. A solução usa **Vercel Functions + Vercel Sandbox**, com banco e Blob existentes. Não requer VPS, servidor permanente, Docker local nem domínio adicional.

Esta decisão substitui a instalação permanente descrita em `GED_SERVICOS_INTERNOS_FASE_10.md`. Os motores continuam próprios: Tesseract, LibreOffice, veraPDF e SentenceTransformers. Não há API comercial de OCR ou embeddings. O processamento e o armazenamento de snapshots seguem as franquias/cobranças da Vercel; software gratuito não significa infraestrutura sem custo.

## Arquitetura implementada

1. A aplicação autoriza o documento antes de solicitar processamento. Uploads continuam no Blob; o cliente não envia originais de 20 MiB por um endpoint de processamento da Vercel Functions.
2. A fila no PostgreSQL permanece como fonte de estado, tentativas e reservas.
3. Depois da confirmação de upload, `after()` apenas dispara um worker sob demanda. Ele não tenta manter processamento pesado dentro do tempo da resposta HTTP.
4. O worker executa em um Sandbox privado, a partir de snapshot previamente instalado. Reutiliza as permissões, filas e processadores da aplicação. O comando manual usa a identidade atual de quem o solicitou; o processamento automático usa a identidade atual do proprietário.
5. Chamadas pontuais, como busca semântica e OCR por zona, executam uma tarefa isolada com transferência de arquivos pelo SDK. O Sandbox não abre portas públicas. Essas tarefas não recebem banco nem token Blob e executam sem acesso de saída à rede, usando modelos já baixados.
6. O worker recebe apenas as variáveis necessárias de banco, Blob, instância e autenticação Vercel para consultar/gravar resultados e encerrar a execução. Não há envio de conteúdo documental a APIs comerciais.
7. O worker encerra o pool e solicita parada de sua VM ao concluir. O Sandbox tem limite total de 30 minutos como proteção adicional. Tarefas pontuais param no `finally`, com limite de três minutos.
8. Um cron autenticado em `/api/assinatura-digital/ged/worker` faz retomada diária às 10:45 UTC. O disparo após upload e o comando manual não dependem de aguardar esse horário. Retentativas que não forem consumidas por outra execução ficam na fila para a próxima retomada.

## Por que não executar os motores diretamente em uma Function

LibreOffice, Java e o modelo Python são instalados no snapshot do Sandbox. Eles não integram o bundle da Function Next.js. Isso evita tratar a Function como um servidor Linux permanente ou tentar instalar pacotes do sistema a cada requisição. As Functions apenas autorizam, despacham e recebem tarefas pequenas; a VM da própria Vercel executa o trabalho pesado.

As rotas GED de controle e despacho têm limite de 300 segundos. Trabalhos completos são destacados da requisição; chamadas pontuais ainda precisam concluir dentro do limite da Function. PDFs de até 200 páginas não têm aprovação de desempenho presumida: tempo real, memória e documentos difíceis serão medidos na homologação.

## Preparar o snapshot

É necessário autenticar o SDK no **mesmo projeto Vercel da aplicação**. Em desenvolvimento, vincular o repositório ao projeto correto e obter o token OIDC pelas ferramentas da Vercel. Na hospedagem, habilitar a autenticação OIDC do projeto; não publicar tokens no cliente.

```sh
npx vercel link
npx vercel env pull .env.local
```

Carregar o token OIDC no ambiente do comando de preparação. O script usa `dotenv/config`, cujo arquivo padrão é `.env`; para carregar `.env.local`, definir `DOTENV_CONFIG_PATH=.env.local` antes do comando.

```sh
npm run ged:vercel:prepare
```

Esse comando cria um ambiente temporário na Vercel, envia fontes selecionadas e o lockfile, instala dependências, LibreOffice/Math, Java e veraPDF 1.28.2, verifica o hash do instalador, instala Python 3.11 em venv, baixa Tesseract português e o modelo semântico com revisão fixa. **Não consulta nem aplica migrações ao banco e não envia arquivos `.env` ou documentos do acervo.**

Ao terminar, imprime `GED_SANDBOX_SNAPSHOT_ID=...`. O snapshot contém ferramentas, modelos e código da versão preparada. Sua expiração é desabilitada para evitar falha após um período sem uso; há armazenamento faturável e a limpeza de versões antigas deve fazer parte da manutenção. Recriar o snapshot após alterar o worker, seus módulos, dependências ou modelos. Se a instalação falhar, o ambiente temporário é encerrado e removido.

## Configurar o projeto

No ambiente Vercel correspondente a `guarama.celeriflow.com.br`:

```dotenv
GED_PROCESSING_RUNTIME=vercel-sandbox
GED_SANDBOX_SNAPSHOT_ID=<snapshot do mesmo projeto>
```

Manter `DATABASE_URL`, `BLOB_READ_WRITE_TOKEN`, `CELERIFLOW_INSTANCE_ID` e `CRON_SECRET` do ambiente existente. Não inferir ou trocar a identidade da instância pelo nome do domínio.

Deixar vazios os endpoints `GED_OCR_ENDPOINT`, `GED_CONVERSION_ENDPOINT`, `GED_PDFA_ENDPOINT` e `GED_SEMANTIC_ENDPOINT`, inclusive valores explícitos salvos na administração, para usar os processadores internos. Endpoints explicitamente configurados continuam tendo precedência por compatibilidade.

Aplicar e verificar o schema GED antes de ativar o consumo. Habilitar processamento automático, semântica e validação PDF/A nas configurações operacionais conforme o aceite. O cron usa o `CRON_SECRET` já adotado pelo projeto.

## Estado e validação

**Autenticação e preparação verificadas em 01/11/2026:** CLI autenticada como `robonuvem-dev`, equipe `celeriflow-dev`, projeto `celeriflow-guarama`, domínio `guarama.celeriflow.com.br` confirmado. O snapshot `snap_vfPS9AOvYZ54OZ8yKfncZhhUjvnr` foi criado e os valores `GED_PROCESSING_RUNTIME=vercel-sandbox` e `GED_SANDBOX_SNAPSHOT_ID` foram configurados em Production. As variáveis passam a valer em uma próxima publicação; isso não comprova o deploy desta implementação.

**Verificação real dos motores:** `scripts/ged-verify-vercel.mjs` restaurou o snapshot com `networkPolicy=deny-all` e verificou 12 conversões para PDF (DOC, DOCX, XLS, XLSX, PPTX, PPS público genuíno, ODT, ODS, ODP, ODF/Math, RTF e HTML), OCR português, quatro referências PDF/A com resultados conforme/não conforme, vetores finitos/normalizados de 384 dimensões e ordenação semântica portuguesa. Evidência em `GED_VERCEL_RUNTIME_RESULTADO.json`, com 18 verificações aprovadas. O perfil reportado é o detectado pelo veraPDF; a referência negativa rotulada 2b sem declaração reconhecida foi validada pelo perfil padrão 1b e reprovou. Esses testes revelaram e corrigiram o formato XML/código de saída do veraPDF e a construção de segmentos do tokenizer. Não cobrem ainda o worker completo com banco/Blob, OCR de 200 páginas ou a matriz inteira dos 52 requisitos.

**Bloqueio de fontes SQL resolvido em 02/11/2026:** o pull de `origin/main` trouxe os arquivos originais de Ação Social/Frotas e a sequência posterior de Ação Social e CF10. O planejamento somente leitura do migrador retornou `PASS`, reconhecendo os 188 recibos instalados e apontando apenas `20261102130000_ged_poc_internal` como pendente. Nenhuma migração foi aplicada nesta integração, e nenhum recibo foi removido ou reescrito.

**Integração Git em 02/11/2026:** pull em fast-forward de `d505910` até `7f406b4`, com quatro commits incorporados e reaplicação das alterações locais sem conflitos. As correções de auditoria locais já chegaram pelo remoto. O checkpoint permanece em stash como cópia de recuperação, incluindo o trabalho BI preexistente. A migração GED nova, ainda não aplicada, foi posicionada em `20261102130000_ged_poc_internal`, após a sequência integrada até `20261102120000`. Os nove testes de gestão GED passaram após a integração. O último build completo aprovado corresponde à base anterior; a nova composição deve passar pelo build antes de commit/push e publicação. O snapshot do worker também deve ser atualizado para a versão que será publicada.

A matriz dos 52 requisitos só deve receber atendimento comprovado depois de evidência observada.

Na fase 11, verificar: criação/restauração do snapshot; autenticação OIDC e cron; tarefa sem rede; conversão por formato; referências PDF/A pass/fail; OCR por página/zona; semântica portuguesa incluindo o fim de textos longos; fila manual/automática; encerramento e custo das VMs; concorrência, falhas e retentativas; isolamento por usuário/setor/grupo; regressão, build e deploy.

E-mail segue pendente para o final. FTP/WebDAV e conclusão LDAP/AD estão fora do escopo. As adequações visuais inventariadas no documento de revisão continuam pendentes e não são homologadas por esta mudança de infraestrutura.

## Referências oficiais consultadas

- https://vercel.com/docs/sandbox
- https://vercel.com/docs/sandbox/sdk-reference
- https://vercel.com/docs/sandbox/concepts/images
- https://vercel.com/docs/sandbox/pricing
- https://vercel.com/docs/functions/limitations
