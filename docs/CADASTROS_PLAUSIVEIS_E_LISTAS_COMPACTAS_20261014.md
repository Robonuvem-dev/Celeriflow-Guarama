# Cadastros plausíveis e listas compactas — 14/10/2026

## Resultado aplicado

- Primeira transação: **210 registros / 273 campos**, em 18 modelos.
- Segunda transação: **1 servidor / 1 campo**, identificado pelo vínculo com a pessoa canônica após uma carga concorrente de Frota.
- Total desta execução: **211 registros / 274 campos**.
- Nova prévia após as duas transações: **zero alterações pendentes** para o conjunto cadastral mapeado.
- Cada atualização possui evento `FinancialAuditLog.action = PLAUSIBLE_CADASTRO_UPDATED`, com `dataset = aurora-cadastros-v1`, valores anteriores/novos e indicação de dados fictícios.

Abrangência: perfis, nomes de usuários, unidades gestoras, centros de custo, pessoas físicas, empresa de engenharia, credores vinculados, servidores, endereços de imóveis, assuntos/tipos de processo, estrutura de cemitérios e nomes de taxas urbanísticas. Foram completados contatos faltantes ou identificados como placeholders, com domínio reservado `.example`.

As identidades continuam fictícias. A alteração de apresentação não é homologação contábil, normativa, cadastral ou bancária.

## Integridade

O script utiliza uma lista explícita de modelos, IDs e campos. Apenas placeholders conhecidos ou contatos vazios entram na atualização. Valores personalizados são preservados e informados na prévia.

A transação compara o registro completo com a fotografia da prévia. Se houver edição concorrente, toda a transação falha. Após o UPDATE, também confere que os campos fora do escopo permaneceram iguais. IDs, CPF/CNPJ, inscrições, permissões, vínculos, situação operacional, e-mails de login, Firebase UID e credenciais não fazem parte dos campos alterados.

Não há DELETE, merge de pessoas, alteração de triggers ou atualização de históricos. O evento de auditoria é gravado na mesma transação da alteração.

Os seeds P0, P1, Construção Civil e Cemitérios foram revisados individualmente para usar os nomes cadastrais plausíveis em novas inclusões. A capela usa o ID estável no upsert, evitando colisão após a mudança do nome. Os seeds preservam a procedência de suas configurações e documentos.

## Listas

`ErpCompactListFrame` é usado em Perfis, Usuários, Pessoas Físicas e Pessoas Jurídicas. A altura normal da linha é 22 px; cabeçalho, badges, ações e inscrições foram compactados. O quadro tem altura natural: edições com mais campos aumentam a linha em vez de esconder as últimas linhas. Em telas baixas a página pode rolar; a tabela não ganha rolagem vertical interna. A rolagem horizontal continua disponível em telas estreitas.

Validação Chromium com CSS de produção:

- Quadro: 20 linhas, sem corte e sem rolagem vertical interna em 1366×768, 1280×720 e 390×844.
- Expansão de uma linha de edição: sem corte vertical.
- Quatro componentes reais com 42 registros isolados: paginação **20 / 20 / 2**, busca reiniciando a página e altura máxima normal de **22 px**.
- As server actions são substituídas no ensaio isolado para impedir gravações. O ensaio não representa teste de uma sessão autenticada no ambiente implantado.

## Verificações

- ESLint dos arquivos alterados: aprovado.
- TypeScript dos novos scripts: aprovado.
- `npm run build`: aprovado após as alterações de código e seeds.
- Prévia idempotente após a aplicação: zero registros/campos pendentes no conjunto mapeado.

## Inventário global e trabalho restante

A leitura inicial encontrou **848 ocorrências por campo**. A leitura posterior encontrou **633**. O banco é compartilhado e houve inclusões concorrentes, portanto essa diferença não é uma contagem de registros atualizados.

Não está concluída a remoção global de rótulos. As 633 ocorrências incluem:

| Grupo | Ocorrências |
| --- | ---: |
| Entradas versionadas de catálogos de planejamento | 255 |
| Referências em itens de folha | 85 |
| Contas, fontes e naturezas de receita/despesa | 84 |
| Inscrições cadastrais: contribuintes, imóveis, atividades e empresa | 67 |
| E-mails usados no cadastro de login | 14 |
| Demais parâmetros, instrumentos, versões, notas e procedência | 128 |

Parte desses registros é imutável ou documenta parâmetros não oficiais; outra parte depende de revisão semântica por domínio. Eles não devem receber substituições genéricas. A próxima etapa deve definir nomes e códigos de referência coerentes, usar versionamento quando exigido e tratar eventual mudança de e-mail junto ao provedor Firebase. Documentos já emitidos e trilhas históricas preservam a edição de origem.

## Comandos

```powershell
# Inventário somente leitura
node --import tsx scripts/audit-plausible-data.ts --counts
node --import tsx scripts/audit-plausible-data.ts --details=ConfiguracaoPerfil,Usuario,Person,Company,Employee

# Prévia / aplicação transacional do conjunto cadastral
node --import tsx scripts/repopulate-plausible-data.ts
node --import tsx scripts/repopulate-plausible-data.ts --apply

# Chromium local previamente instalado; informe seu caminho
$env:PLAYWRIGHT_MODULE_PATH='C:\caminho\node_modules\playwright'
node --import tsx scripts/verify-compact-list.tsx
```

Relatórios locais ficam em `.next/cache/data-review/`. As novas execuções de repopulação usam nomes com timestamp para preservar cada relatório. A evidência durável das atualizações aplicadas é a auditoria no banco.
