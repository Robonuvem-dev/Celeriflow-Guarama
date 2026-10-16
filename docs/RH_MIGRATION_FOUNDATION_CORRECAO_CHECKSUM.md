# RH — correção do checksum da migration foundation entre notebooks

## Diagnóstico confirmado em 11/10/2026

Migration: `20261011030000_hr_workforce_foundation`.

Arquivo: `prisma/migrations-ibema/20261011030000_hr_workforce_foundation/migration.sql`.

A migration foi aplicada com finais de linha **misturados, LF e CRLF**. A normalização do arquivo pelo Git mudou os bytes e o SHA-256, sem alterar o conteúdo SQL. O script `scripts/deploy-hr-migrations.ts` compara o checksum exato e, por isso, retorna `Checksum RH divergente.`.

Foi possível reconstruir em memória os finais de linha originais e obter exatamente o checksum registrado no banco. O SQL reconstruído, após normalização de CRLF para LF, é idêntico ao arquivo versionado.

| Representação da foundation | SHA-256 |
| --- | --- |
| Original aplicado / registrado no banco | `b0da3ace2e59d743cd4584c983729dbc87d0b0ba26156e86b8f0226d99ffd1f2` |
| Arquivo totalmente LF, conteúdo do Git no diagnóstico | `eb830c0f4fe72f9b0bee6269c5ab141089d0a12db3af52596db7fe970e72f402` |
| Arquivo totalmente CRLF, checkout deste notebook no diagnóstico | `88a33989eead92400544302622e312c1ca34a971ef591e61399cec11cdf2edcd` |

No banco consultado, a foundation consta como concluída em `2026-10-11T04:07:26.351Z`, com `applied_steps_count = 1` e `rolled_back_at = NULL`.

As outras duas migrations RH coincidem com seus arquivos neste notebook:

| Migration | Checksum registrado e conferido |
| --- | --- |
| `20261011130000_hr_contract_temporal_revisions` | `3f5d8a57c8ba0c693da4868bb6088e6474defe2392bfa52b6f22130583a70d6c` |
| `20261011160000_hr_consignment_schedule` | `71ac51cab3db791b284de006763091011147581b94d4dda253d8cd77e73697fe` |

## Correção a executar no outro notebook

Objetivo: restaurar **os bytes originais da foundation**, preservar o checksum histórico e impedir que o Git volte a converter esse arquivo.

Esta correção é de arquivo/versionamento. Não requer executar novamente o SQL nem alterar `_prisma_migrations`. Não usar reset do banco, remover a migration aplicada, substituir o checksum no banco ou desativar a conferência do deploy.

### 1. Conferir a árvore e o banco utilizado

Execute na raiz do projeto:

```powershell
git status --short
```

Preserve alterações locais existentes. Confirme que a conexão carregada de `.env.local` / `.env` aponta para o banco que apresentou o erro, sem imprimir credenciais.

Consulta somente de leitura para conferir o registro:

```sql
SELECT migration_name, checksum, started_at, finished_at,
       rolled_back_at, applied_steps_count
FROM "_prisma_migrations"
WHERE migration_name = '20261011030000_hr_workforce_foundation'
ORDER BY started_at;
```

O registro concluído deve ter o checksum original informado acima. Caso o outro banco tenha checksum diferente, migration incompleta ou outro estado, investigue essa diferença antes de usar este procedimento.

### 2. Proteger somente este arquivo no Git

Crie `.gitattributes` na raiz, se não existir, ou acrescente a regra abaixo preservando as demais regras. Coloque-a depois de regras genéricas que possam afetar SQL/migrations:

```gitattributes
/prisma/migrations-ibema/20261011030000_hr_workforce_foundation/migration.sql -text
```

Use `-text` porque o arquivo histórico precisa manter finais de linha misturados. Configurar `eol=lf` ou `eol=crlf` para este arquivo não reproduz o checksum aplicado.

Confira o atributo efetivo:

```powershell
git check-attr text eol -- prisma/migrations-ibema/20261011030000_hr_workforce_foundation/migration.sql
```

O atributo `text` precisa aparecer como `unset`.

### 3. Restaurar os finais de linha originais com conferência antes da gravação

O trecho abaixo modifica **somente a foundation**. Ele exige que o conteúdo LF corresponda ao hash conhecido, reconstrói os bytes e verifica o hash original **antes** de gravar. Se o arquivo tiver mudança de SQL, BOM ou outra diferença, abortará a operação.

As linhas com terminador LF, numeradas a partir de 1, são:

```text
67, 68, 69, 70, 71, 72, 73, 74, 80, 81, 82, 83, 84, 85, 86, 87
```

Todas as demais linhas usam CRLF. O arquivo tem 113 linhas e um terminador ao final da última linha.

Execute este comando PowerShell na raiz do projeto:

```powershell
@'
const { readFileSync, writeFileSync } = require("node:fs");
const { createHash } = require("node:crypto");

const path = "prisma/migrations-ibema/20261011030000_hr_workforce_foundation/migration.sql";
const expectedLF = "eb830c0f4fe72f9b0bee6269c5ab141089d0a12db3af52596db7fe970e72f402";
const expectedOriginal = "b0da3ace2e59d743cd4584c983729dbc87d0b0ba26156e86b8f0226d99ffd1f2";
const hash = value => createHash("sha256").update(value).digest("hex");

const current = readFileSync(path);
const lf = current.toString("utf8").replace(/\r\n/g, "\n");
if (hash(lf) !== expectedLF) {
  throw new Error("Conteúdo SQL diferente do diagnóstico; não foi gravado nenhum arquivo.");
}

const lfLines = new Set([67, 68, 69, 70, 71, 72, 73, 74, 80, 81, 82, 83, 84, 85, 86, 87]);
const lines = lf.split("\n");
if (lines.length !== 114 || lines[113] !== "") {
  throw new Error("Quantidade de linhas ou terminador final inesperado.");
}
const original = lines.map((line, index) =>
  line + (index === lines.length - 1 ? "" : lfLines.has(index + 1) ? "\n" : "\r\n")
).join("");

if (hash(original) !== expectedOriginal || original.replace(/\r\n/g, "\n") !== lf) {
  throw new Error("Reconstrução não corresponde ao arquivo aplicado; operação abortada.");
}

if (hash(current) !== expectedOriginal) {
  writeFileSync(path, original, "utf8");
}
if (hash(readFileSync(path)) !== expectedOriginal) {
  throw new Error("Falha na conferência dos bytes gravados.");
}
console.log("Foundation restaurada e conferida: " + expectedOriginal);
'@ | node
```

Este comando é específico para este arquivo e para os hashes comprovados. Não aplicar a outras migrations nem usar substituição em massa.

### 4. Validar sem reaplicar a migration

Execute o preview, sem `--apply`:

```powershell
npx tsx scripts/deploy-hr-migrations.ts
```

Resultado esperado para o mesmo banco diagnosticado:

```json
{
  "mode": "PREVIEW",
  "migration": "20261011030000_hr_workforce_foundation",
  "state": "APPLIED_CHECKSUM_VERIFIED",
  "missingRuntimeDependencies": []
}
```

As migrations seguintes podem ser reconferidas pelos previews específicos:

```powershell
npx tsx scripts/deploy-hr-migrations.ts --temporal
npx tsx scripts/deploy-hr-migrations.ts --consignments
```

### 5. Versionar a restauração para os dois notebooks

Após conferir o diff, inclua a regra de atributos e a foundation restaurada no mesmo commit. Se este MD ainda estiver local, inclua-o também. Evite adicionar alterações de outras frentes sem revisão.

```powershell
git diff --ignore-space-at-eol -- prisma/migrations-ibema/20261011030000_hr_workforce_foundation/migration.sql
git add -- .gitattributes prisma/migrations-ibema/20261011030000_hr_workforce_foundation/migration.sql docs/RH_MIGRATION_FOUNDATION_CORRECAO_CHECKSUM.md
```

O diff ignorando finais de linha deve estar vazio. Confira que o blob preparado para commit contém os bytes originais:

```powershell
@'
const { execFileSync } = require("node:child_process");
const { createHash } = require("node:crypto");
const path = "prisma/migrations-ibema/20261011030000_hr_workforce_foundation/migration.sql";
const bytes = execFileSync("git", ["show", ":" + path]);
const checksum = createHash("sha256").update(bytes).digest("hex");
if (checksum !== "b0da3ace2e59d743cd4584c983729dbc87d0b0ba26156e86b8f0226d99ffd1f2") {
  throw new Error("O índice do Git não preservou os bytes originais: " + checksum);
}
console.log("Índice Git conferido: " + checksum);
'@ | node
```

Conforme `AGENTS.md`, execute `npm run build` e confirme a aprovação antes de commit/push.

Depois de sincronizar o commit no outro notebook, repita a conferência de atributos e o preview da foundation. O checksum deve continuar coincidindo com o banco, independentemente da configuração local `core.autocrlf`.

## Limite desta entrega

Este documento registra o diagnóstico e o procedimento de correção. Na investigação que o originou, foram feitas somente consultas ao banco e reconstrução em memória: nenhum registro de migration ou arquivo SQL foi alterado.

## Execução da correção no notebook de Planejamento — 11/10/2026

- Recebido este documento com `git pull --ff-only origin main`, até `17ff495`. O schema local de Planejamento foi preservado em stash específico e reaplicado sem conflitos; demais alterações locais foram mantidas.
- Criada `.gitattributes`: foundation com `-text` e reconhecimento de CR como terminador (`whitespace=cr-at-eol`); revisões temporais e consignações com `text eol=lf`.
- `scripts/restore-hr-foundation-bytes.mjs` verifica conteúdo/hash conhecido e o registro concluído do banco antes de restaurar **um único arquivo por execução**. Não executa SQL de migração nem escreve em `_prisma_migrations`.
- Foundation restaurada ao hash original `b0da3ace2e59d743cd4584c983729dbc87d0b0ba26156e86b8f0226d99ffd1f2`, preservando os finais mistos.
- As duas migrations posteriores estavam em CRLF no checkout. Seus bytes LF reproduziram exatamente os hashes registrados nesta investigação; foram restauradas individualmente e protegidas por atributos.
- Os três previews de `deploy-hr-migrations.ts` retornaram `APPLIED_CHECKSUM_VERIFIED`, com `missingRuntimeDependencies: []`.
- Conferência completa: `{"checked":59,"mismatches":[],"missing":[]}`. `git diff --ignore-space-at-eol` dos três arquivos ficou vazio. Isso confirma conteúdo SQL preservado, sem certificar ausência de drift.
- `prisma migrate status`: hardening clínico SST e duas novas migrations de Planejamento ainda pendentes. A restauração não aplicou esses incrementos.

Comandos reproduzíveis do restaurador (sem `--apply`, somente prévia):

```powershell
node scripts/restore-hr-foundation-bytes.mjs
node scripts/restore-hr-foundation-bytes.mjs --temporal
node scripts/restore-hr-foundation-bytes.mjs --consignments
```

O restaurador é restrito aos hashes comprovados acima. Qualquer mudança de SQL, BOM, conteúdo truncado ou registro divergente no banco aborta a gravação. Versionar a foundation restaurada junto com `.gitattributes`; não executar renormalização genérica dessa migration.
