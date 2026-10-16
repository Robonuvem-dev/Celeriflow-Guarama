# Auditoria de arquivos do GitHub e da Vercel — 12/10/2026

## Medição do clone local

Valores aproximados em MiB (1 MiB = 1.048.576 bytes), antes das alterações desta auditoria:

| Pasta | Tamanho local | Papel |
| --- | ---: | --- |
| `node_modules/` | 1.231 MiB | Dependências instaladas localmente; não versionadas. A Vercel instala suas próprias dependências. |
| `docs/` | 842 MiB | Documentos de referência, anexos, matrizes e evidências de desenvolvimento, versionados. |
| `.git/` | 763 MiB | Histórico e metadados do Git, incluindo versões anteriores dos binários. |
| `.next/` | 275 MiB | Build e cache local, não versionados. |
| `src/` | 11 MiB | Código da aplicação. |
| `public/` | 4 MiB | Arquivos estáticos da aplicação; devem continuar no deploy. |
| `image/` | 3 MiB | Originais de identidade visual para desenvolvimento. |
| `prisma/` | 2 MiB | Schema, migrations e seeds. Schema e migrations são necessários ao build. |
| `tests/` | 1 MiB | Testes locais e do GitHub Actions. |

O conteúdo versionado em `HEAD` soma aproximadamente 864 MiB, sem o histórico Git.
Dentro de `docs/`, os maiores grupos são:

- `Novos docs/`: 788 MiB.
- `Docs de Rh e FOlha/`: 41 MiB.
- Documentos na raiz, incluindo o ZIP do termo de referência: 6 MiB.
- `Termo de Referencia/`: 6 MiB.

## Decisão aplicada

1. Excluir da entrada do deploy na Vercel a pasta **raiz** `docs/`, `image/`, instruções dos agentes, README, configuração do GitHub Actions, testes e artefatos locais.
2. Manter esses documentos, imagens originais e testes no GitHub para que os dois notebooks continuem recebendo-os pelo Git.
3. Preservar `public/`, inclusive `public/docs/`, código, scripts, configuração do build, lockfile, schema e migrations.
4. Retirar a regra global `*.json` do `.gitignore`: ela podia esconder novas configurações e dados compartilhados. Na auditoria não havia JSON local ignorado fora das pastas de dependências, build e ferramentas locais.
5. Retirar a segunda regra `.env*`, que anulava a exceção anterior de `.env.example`. Arquivos de ambiente reais continuam ignorados; o exemplo pode ser sincronizado.
6. Aplicar exclusões equivalentes no `outputFileTracingExcludes` do Next.js. A validação do build anterior encontrou documentos de `docs/` nos traces de funções de Construção Civil, mesmo sem imports ou leituras desses anexos no código. A exclusão explícita evita empacotar essas referências também nos builds locais.

Redução estimada da entrada de arquivos versionados no deploy: **846,04 MiB** (418 arquivos), **97,94%** dos 863,86 MiB versionados. Restam aproximadamente **17,82 MiB**, antes de instalar dependências e gerar o build. Isso não é uma medição do bundle final nem da RAM utilizada pelo build.

## Verificação de consumidores

- Não foram encontradas leituras ou imports dos arquivos da pasta raiz `docs/` ou `image/` no código da aplicação ou no script de build.
- `prisma/seed-mod4.ts` cria URLs `/docs/...`: essas URLs apontam para **`public/docs/`**, que permanece no deploy.
- A aplicação de construção civil usa `.agent/construction-document-backup` como armazenamento local e pode usar Blob para documentos operacionais. Esses arquivos são produzidos em execução e não são os anexos de referência da pasta `docs/`.
- O rastreamento estático de caminhos dinâmicos do filesystem pode incluir arquivos que não são necessários. Os `.nft.json` do build são conferidos para verificar que nenhuma pasta excluída foi empacotada após o ajuste.
- GitHub Actions continua com os testes e documentos disponíveis, pois `.vercelignore` não interfere no checkout do GitHub.

## Limites e efeito esperado

- O tamanho do clone em disco não equivale à RAM usada pelo TypeScript. PDFs e ZIPs não são analisados como código pelo compilador.
- O ajuste reduz os arquivos de entrada disponíveis para o build/deploy. A checagem TypeScript separada continua necessária para reduzir a sobreposição de memória dos processos.
- No deploy integrado ao Git, os logs mostram a clonagem **antes** da aplicação do `.vercelignore`. Logo, esse ajuste não elimina o custo inicial de clonar o repositório com seus documentos.
- `node_modules/`, `.next/` e `.git/` locais não são conteúdo versionado. A CLI da Vercel também os exclui por padrão. Eles explicam parte do tamanho local, mas não representam 3 GB enviados pelo GitHub.
- `.vercelignore` não apaga arquivos do notebook, não modifica o histórico Git e não reduz o tamanho do checkout do outro notebook.

## Blob e eventual redução do GitHub

Não é necessário contratar Blob para excluir referências de desenvolvimento do deploy. Ele só é necessário para esses anexos caso a aplicação precise servi-los em produção ou se for escolhido como armazenamento compartilhado.

Para diminuir também o GitHub, a equipe precisa primeiro definir onde ambos os notebooks obterão os documentos. Opções: pasta compartilhada sincronizada, repositório documental separado ou Git LFS. Manter catálogos, análises e instruções em Markdown no repositório da aplicação facilita a retomada do desenvolvimento.

Não remover os anexos com `git rm` antes dessa definição: ao atualizar o outro notebook, o Git pode remover as cópias versionadas. Apenas adicionar arquivos já versionados ao `.gitignore` não os retira do GitHub.

Retirar documentos de commits futuros também não apaga os binários dos commits antigos. Reduzir o histórico exigiria uma migração coordenada dos dois notebooks e uma reescrita de histórico. Nenhuma remoção de documentos, migração para Blob/LFS ou reescrita de histórico foi feita nesta auditoria.

## Comandos úteis

```bash
git count-objects -vH
git -c core.quotePath=false ls-tree -rl HEAD
git status --short
npm run build
```

A Vercel deve continuar usando `npm run build`. Não há nova variável de ambiente para a filtragem.
