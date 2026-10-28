# TypeScript — correção do bloqueio de heap na integração main

## Escopo e referência

- Data: 28/10/2026.
- Base informada pelo integrador: `5cfa75d`, com ajustes locais de cliente lazy/teste e documentação.
- Worktree de validação: `C:/Users/trici/AppData/Local/Temp/opencode/celeriflow-main-sync`.
- Responsabilidade desta frente: `scripts/typecheck-build.mjs`, em ambas as árvores, e este registro. Em autorização posterior ao ensaio de Saúde, a reserva passou a incluir também as duas cópias de `src/lib/prisma.ts`, condicionada a evidência isolada antes da edição na árvore principal. A publicação e o build integral pertencem ao integrador.
- Regras consultadas: `AGENTS.md`, planejamento integral da migração e documentação TypeScript da instalação local do Next 16.2.12 (`02-typescript.md` e `next-config-js/typescript.md`).

## Falha reproduzida antes da correção

O build integral registrado em `.agent/main-integration-build.log` e `.agent/main-integration-build.json` terminou com exit 134. O inventário permaneceu imutável: 3.050 arquivos, SHA-256 `e9b11190195195021547a6497d3a31c3f4462ead3bc316ef78c24cea75d803eb` antes e depois.

- Partições antigas 1–5: sucesso com heap limitado a 6.144 MiB.
- Partição antiga 6: 602 fontes e 269 validações; OOM próximo do limite de 6.144 MiB.
- Tempo total do build que falhou: aproximadamente 73 minutos.
- Os cinco processos aprovados carregaram aproximadamente 2,4 milhões de linhas de declarações e 19 milhões de instanciações, com `Memory used` entre 5.335.884 e 5.757.485 KiB.
- Embora `noEmit` estivesse habilitado, `transformTime` consumiu aproximadamente 267–344 segundos por partição. O builder incremental calcula assinaturas de declarações para acompanhar mudanças de formato. Na instalação TypeScript 5.9.3, isso passa por `BuilderState.computeDtsSignature` / `updateShapeSignature` em `node_modules/typescript/lib/typescript.js`, inclusive forçando emissão de declarações para a assinatura.
- A antiga chave `src/app/api` juntava todas as APIs, e o hash módulo oito combinava domínios grandes sem qualquer limite de tamanho.
- O ensaio adicional do integrador com `--incremental false` e heap de 4.096 MiB também apresentou OOM. Portanto, a simples retirada do incremental não comprova o alvo de 4 GiB.

## Correção implementada

1. Substituição do número fixo/hash por agrupamento determinístico de diretórios e empacotamento limitado por fontes, bytes e validações. APIs usam também o segmento do domínio. Grupos grandes são fragmentados mantendo a ordem dos subdiretórios.
2. Orçamentos iniciais por partição: 240 fontes-raiz, 1.400.000 bytes de implementação e 110 validações. Uma fonte indivisível que exceda um orçamento continua sendo verificada integralmente.
3. Execução sequencial do `tsc` com `incremental: false`, inclusive na configuração gerada. Cada execução verifica a partição inteira sem reutilizar `.tsbuildinfo` nem gerar o grafo de assinaturas incrementais. `--cold` continua aceito e tem a mesma cobertura.
4. As opções originais de tipagem são herdadas de `tsconfig.build.json`. Imports continuam resolvidos e verificados normalmente; declarações de contexto são compartilhadas entre os programas.
5. Validações Next são copiadas integralmente, com preâmbulo original. A execução falha se um bloco não contiver exatamente um módulo de rota, se a rota não resolver ou se estiver fora do inventário de produção.
6. Manifesto gerado em `.next/cache/typecheck-partitions/manifest.json`: fontes por partição, IDs de todos os blocos de validação, bytes e declarações compartilhadas. Contagens e unicidade são verificadas antes de chamar o compilador.

### Comandos de diagnóstico

```powershell
# Somente prepara configurações e manifesto; não é aprovação do typecheck.
node scripts/typecheck-build.mjs --plan

# Verifica uma partição específica, numerada a partir de 1.
node --max-old-space-size=6144 scripts/typecheck-build.mjs --partition 1

# Gate integral: todas as partições, em sequência, sem cache de assinaturas.
node --max-old-space-size=6144 scripts/typecheck-build.mjs --cold
```

`scripts/build.mjs` chama o gate integral sem argumentos de seleção. A compilação Next continua dependente do sucesso desse gate.

## Validações desta frente

- `node --check scripts/typecheck-build.mjs`: aprovado.
- `node --max-old-space-size=512 node_modules/eslint/bin/eslint.js scripts/typecheck-build.mjs`: aprovado.
- As duas cópias foram analisadas e alteradas individualmente; seus conteúdos foram comparados por SHA-256.
- Fixture isolada do planejador: 526 fontes, 125 validações, três partições. Cobertura exata e unicidade aprovadas, repetição com validadores antigos determinística, limites respeitados e bloco Next de formato desconhecido rejeitado. Helper temporário: `C:/Users/trici/AppData/Local/Temp/opencode/typecheck-fixture-verify.mjs`.
- A mesma fixture passou pela compilação completa com heap de 512 MiB. Erro em dependência importada de fora das raízes (`support/dependency.ts`) foi rejeitado com `TS2322`; contrato de rota inválido foi rejeitado no validador copiado com `TS2344`. Nenhum `.tsbuildinfo` foi gerado.
- Um plano exploratório da árvore principal produziu 13 partições para 2.811 fontes e 937 validações. A criação concorrente de `src/db/repositories/finance/cost-origins.ts` alterou o inventário durante a conferência; esse ensaio não é evidência de snapshot imutável. O worktree isolado é a referência para a validação pesada.
- Ensaio da antiga partição 6, preservando suas 602 fontes e 269 validações, com `--max-old-space-size=6144 --incremental false --extendedDiagnostics`: interrompido deliberadamente, sem resultado de aprovação nem classificação como novo OOM. Shell `sh_18306b7a2001MZ470ssjW7AvGc`, PID 12368. Aos 18 minutos, a amostra do SO mostrou 6.941.769.728 bytes de memória privada e pico residente de 2.506.326.016 bytes; memória privada não equivale a heap. A execução foi encerrada para priorizar a validação do particionamento corrigido.
- Inventário isolado novo: **2.602 fontes-raiz, 937 validações únicas, quatro declarações compartilhadas, 12 partições**. Uma conferência independente comparou a união das raízes com o `tsconfig.build.json` e confirmou ausência de fontes/validações omitidas ou duplicadas. Evidência: `.agent/typecheck-bounded-coverage.json` na árvore principal.
- Snapshot de entradas capturado no início do ensaio de Saúde: 2.659 arquivos, SHA-256 `6120c76847db9f2a989eda84c29a31f766b1028cca9077c33df6201f3144e6c5`. Inclui `src`, script, configurações, lockfile, tipos Next originais e declaração gerada do cliente Prisma compartilhado.
- **Saúde aprovado com exit 0:** partição nova 2, 234 fontes-raiz, 110 validações, 1.399.995 bytes; `--max-old-space-size=6144 --incremental false --extendedDiagnostics --trace-gc-nvp`. Shell `sh_1831d669c001DKB2WvPZ6mP7a2`. Execução de `15:25:05.505Z` a `15:42:38.963Z`, 1.053,458 s. A geração dos outros validadores foi concluída antes do início desse processo.
  - Programa completo, incluindo imports: 2.360 arquivos, 2.440.946 linhas de declarações e 20.339.829 instanciações.
  - TypeScript: `Memory used` 5.884.339 KiB; `Check time` 986,95 s; `Total time` 1.048,45 s; nenhum `transformTime` registrado e emissão de 0,02 s.
  - Maior quantidade de objetos antes de GC observada no trace V8: 6.182.925.592 bytes (aproximadamente 5,76 GiB). Maior espaço de memória V8 informado antes de GC: 6.284.627.968 bytes. São observações nos eventos de GC, não instrumentação de cada alocação.
  - Heap usado na saída: 5.905.695.232 bytes; maxRSS do processo: 2.470.056 KiB. O RSS menor que o heap é compatível com paginação no Windows e não comprova redução equivalente do heap.
  - Conferência posterior: os 2.659 arquivos do snapshot mantiveram o SHA-256 `6120c76847db9f2a989eda84c29a31f766b1028cca9077c33df6201f3144e6c5`.
  - Artefatos na árvore principal: `.agent/typecheck-bounded-health.log`, `.metrics.json` e `.summary.json`.
- Ensaio complementar **inconclusivo, cancelado pelo reinício do servidor**: partição nova 4, bibliotecas Saúde + SST e APIs relacionadas; 230 fontes-raiz, 95 validações, 1.399.728 bytes, mesmo limite e instrumentação. Shell `sh_1832f0145001SRwzq7xEuISLSH`; prefixo dos artefatos `.agent/typecheck-bounded-health-libraries`. Não é aprovação nem novo OOM. A ausência de processo compilador remanescente foi conferida antes do ensaio seguinte.

## Causa global confirmada — especializações do cliente Prisma

O cliente gerado declara `PrismaClient<ClientOptions>` e propaga esse parâmetro pelos delegates dos modelos. A fábrica inferia opções específicas do construtor, enquanto o singleton global e `AppContext.prisma` usavam `PrismaClient` com parâmetros padrão. O comparativo controlado abaixo confirmou que uniformizar a especialização do construtor e o retorno da fábrica elimina a explosão de instanciações nessa fronteira. O cliente gerado e suas 2,36 milhões de linhas de declarações continuam presentes no mesmo alvo estrito; a redução não depende de retirar fontes, modelos ou checagens.

### Ensaio causal antes/depois, autorizado posteriormente

- A busca e a leitura dos consumidores foram refeitas antes de qualquer edição da fábrica: 11 scripts `drizzle-verify-*` no worktree isolado, quatro ainda ativos na árvore principal durante a migração concorrente, além do singleton interno e de sua atribuição a `AppContext.prisma`. Os usos são fábrica com URL/opcional, delegates CRUD, transação, SQL parametrizado e `$disconnect`; um oráculo também passa o cliente a um parâmetro `PrismaClient` explícito.
- O alvo estreito gerado está em `.next/cache/typecheck-prisma-client-inference/tsconfig.json` e `entry.ts`. Ele herda o `tsconfig.build.json`, mantém `strict`/`skipLibCheck`, verifica os imports normalmente e não emite/cacheia assinaturas. A entrada importa a fábrica e o singleton, importa `AppContext`/`getCurrentTenantContext`, confere atribuição a `PrismaClient`/`AppContext.prisma`, consulta projetada e transação.
- **Baseline estreito aprovado, exit 0, imutável:** shell `sh_1835291310015gBDjWgOtYkCG4`, limite de 6.144 MiB e instrumentação idêntica. De `16:23:09.751Z` a `16:29:35.077Z`, 385,326 s. Foram 1.018 arquivos, 2.361.870 linhas de declarações, 17.754.247 instanciações e `Memory used` 5.204.988 KiB. Máximo observado de objetos antes de GC: 5.283.946.080 bytes; maxRSS 2.352.040 KiB. Prefixo dos artefatos: `.agent/typecheck-bounded-inference-baseline`.
- Snapshot antes do baseline: 2.661 entradas, SHA-256 `8b8d667b85818d0475cf8661bcfba9a31eee5c32d8227ba7e0177bd687def5e6`; todos os arquivos do snapshot de Saúde anterior continuam iguais. Fonte original Prisma: SHA-256 `27e194cff1deb0ea9470021fa441e6172ff16339b1c2a796fdbb3c58d82e02fc`. JavaScript emitido do módulo: SHA-256 `922fb95ec1c9800e1cb52c3e6eb30f46d43c727df29a3a072cddec9cfcdea7f5`.
- A anotação foi aplicada primeiro somente no worktree isolado após o término e a conferência desse baseline: import de tipo `Prisma`, retorno explícito `PrismaClient` e construtor `new PrismaClient<Prisma.PrismaClientOptions>`.
- **Versão anotada aprovada, exit 0, imutável:** mesmo alvo, dependências, opções e limite; shell `sh_18359610c00104a21kuIu3IeF4`, de `16:30:35.917Z` a `16:31:11.981Z`, 36,064 s. Prefixo dos artefatos: `.agent/typecheck-bounded-inference-annotated`.
- A captura posterior confirmou exatamente uma fonte alterada, `src/lib/prisma.ts`; os outros 2.660 arquivos são idênticos, inclusive entrada/configuração estreita e declaração gerada Prisma. Snapshot anotado: `30871e6b8685702c44c4f90d57edc14a87c9bf45f6077cdb8084fd6b1cf8907b`. O JavaScript emitido permanece idêntico, SHA-256 `922fb95ec1c9800e1cb52c3e6eb30f46d43c727df29a3a072cddec9cfcdea7f5`.

| Métrica do mesmo alvo estreito | Antes | Depois |
|---|---:|---:|
| Arquivos verificados, incluindo imports | 1.018 | 1.018 |
| Linhas de declarações | 2.361.870 | 2.361.870 |
| Tipos | 3.356.277 | 13.005 |
| Instanciações | 17.754.247 | 60.416 |
| `Memory used` TypeScript | 5.204.988 KiB | 2.145.592 KiB |
| Maior quantidade de objetos antes de GC observada | 5.283.946.080 bytes | 2.197.707.544 bytes |
| Heap usado na saída | 5.195.447.344 bytes | 2.142.959.848 bytes |
| `Check time` | 335,89 s | 2,74 s |
| Tempo total do compilador | 381,73 s | 34,23 s |
| maxRSS do processo | 2.352.040 KiB | 2.241.312 KiB |

A queda de `Memory used` é de **3.059.396 KiB, aproximadamente 2,92 GiB**; as instanciações caíram aproximadamente 99,66%. O RSS é registrado separadamente, pois a paginação da máquina torna sua redução incomparável à do heap. Os tempos são observações da mesma máquina, e o comparativo de instanciações demonstra a redução efetiva do trabalho de tipos independentemente do cache de arquivos do SO.

Depois da aprovação isolada, a mesma alteração de três pontos foi aplicada à árvore principal. As duas fontes têm SHA-256 `519bf86dd618575a8ac63dd3c61883c10ca5d6a59173bc4d96de2a9b5467f721`. O JavaScript equivalente preserva adapter, singleton, URL opcional, `maxWait: 10_000` e `timeout: 30_000`. ESLint de `src/lib/prisma.ts` e `scripts/typecheck-build.mjs` passou. Os compiladores desta frente terminaram; o slot pesado está liberado para o build integral do integrador.

## Situação de aceite

A correção foi validada no alvo estreito estrito com o limite legado de 6.144 MiB e aplicada às duas árvores. O gate integral continua cobrindo todas as fontes/validações, e o build completo da integração é o próximo passo do parent. A meta global de até 4 GiB após retirada do Prisma permanece em aberto: os cerca de 2,05 GiB observados aqui pertencem ao alvo estreito e não aprovam o build integral nem um novo limite operacional. `Memory used` é uma observação ao final; os máximos do trace são amostras em eventos de GC. Build integral e deploy exigem suas execuções completas.
