# Migração Drizzle — medições

## Ambiente inicial

- Base: `4476c3e`.
- Node: 24.21.0; TypeScript: 5.9.3; Prisma: 7.9.1; Next: 16.2.12.
- Windows 10.0.26200, 8 processadores lógicos, aproximadamente 7,7 GiB de RAM.
- RAM livre na inspeção inicial: aproximadamente 1,6 GiB; não executar verificações pesadas simultaneamente.
- `scripts/typecheck-build.mjs` está em **oito partições** na base atual.
- O build anterior foi interrompido por reinício do servidor; duração e resultado incompletos não serão tratados como sucesso.

## Critérios

Registrar condição fria/com cache, comando, início/fim, duração, resultado, pico de heap e pico de RSS por processo, além da cobertura de fontes/rotas. A meta final é heap de até 4 GiB por processo, estritamente tipado, em execução fria e com cache. Ainda não foi comprovada.

## Resultados desta execução

Instalação de dependências isolada da geração Prisma e dos testes consumidores do cliente.

| Escopo | Tempo | Memória / resultado |
|---|---:|---|
| Geração Prisma da execução instrumentada | 70 s no processo; geração informou 45,13 s | Concluída, cliente 7.9.1 |
| `next typegen` da mesma execução | 2 s | Concluído |
| Partição 1/8 da checagem original | 557,89 s via tsc; 559,83 s de processo | 231 fontes e 79 validações; 5.559.726 KiB informados pelo tsc; maxRSS do processo 3.229.644 KiB; sucesso |
| `tsconfig.database.json`, infraestrutura inicial | 7,22 s via tsc | 247.679 KiB informados pelo tsc; processo limitado a 768 MiB; sucesso |
| `tsconfig.database.json`, após schemas/contratos/Saneamento inicial | 14,98 s via tsc | 234.415 KiB informados pelo tsc; mesmo limite de 768 MiB; sucesso |
| `tsconfig.database.json`, após Administração/Meio Ambiente e primeiro núcleo de Cadastros, sem incremental | 12,39 s via tsc | 724 arquivos; 406.232 KiB informados pelo tsc; limite de 768 MiB; sucesso |
| `tsconfig.database.json`, após auditoria/notificações, sem incremental | 24,99 s via tsc | 780 arquivos; 631.604 KiB informados pelo tsc; limite de 768 MiB; sucesso |
| Segundo `npm run build`, com cache | 70 s Prisma, 2 s typegen, 2.559 s typecheck, 205 s Next | Oito partições estritas e 95 páginas estáticas; exit 0; maior `Memory used` 6.274.088 KiB (partição 6) |

Os valores `Memory used` do tsc não são picos certificados de heap; o primeiro processo de produção terminou com heap usado de 5.550.905.312 bytes e ainda depende do grafo Prisma. O novo alvo isolado cobre somente a infraestrutura migrada, não a aplicação inteira. Portanto **a meta global de 4 GiB ainda não foi atingida/comprovada**.

Execução instrumentada iniciada em `2026-10-28T01:28:10.180Z`, com cache existente, HEAD documental atualizado para `3f05dcd`; artefatos em `.agent/drizzle/metrics/2026-10-28T01-28-10.180Z/`. **Concluída com exit 0 em 4.536.203 ms (75 min 36 s)**: oito partições estritas aprovadas, Next compilado e 95 páginas estáticas geradas. Typecheck levou 4.196 s e etapa Next 268 s. A primeira partição foi medida antes das ligações dos serviços novos. O código foi alterado durante as etapas posteriores, por isso a execução inteira não representa baseline imutável nem aprovação das últimas edições de Cadastros.

| Partição | Pico de heap amostrado (bytes) | maxRSS do processo (KiB) |
|---|---:|---:|
| 1/8 | 6.024.750.152 | 3.229.644 |
| 2/8 | 5.759.400.448 | 2.637.256 |
| 3/8 | 5.718.554.616 | 2.882.568 |
| 4/8 | 5.772.660.984 | 2.927.532 |
| 5/8 | 5.791.664.592 | 2.626.896 |
| 6/8 | 6.325.892.888 | 3.176.508 |
| 7/8 | 5.747.833.232 | 3.032.492 |
| 8/8 | 6.285.296.064 | 2.948.588 |

Pico amostrado global de heap TypeScript: aproximadamente **5,89 GiB**, acima da meta. No Windows, RSS reporta páginas residentes e não equivale ao heap comprometido/virtual; não usar o RSS menor para declarar a meta atendida. Dados individuais em `*-exit.json` e amostras consolidadas em `summary.json`.

O remoto `3f05dcd` registra um build local anterior aprovado com oito partições e cache; é evidência histórica independente e não aprovação do código desta migração.

O segundo build é o shell `sh_1807786da001d4AR74EnfjrDAv`, concluído com exit 0. Não houve instrumentação V8 nessa execução; os números são diagnósticos do compilador. Mesclagem, auditoria, notificações e cargas mudaram durante a execução; gestão de acesso foi adaptada depois. O resultado não aprova essas últimas edições nem comprova a meta de 4 GiB. A checagem isolada ampliada também passou após cargas e administração de acesso, sem diagnósticos estendidos nessa rodada.

`tsconfig.migration.json` acrescenta às fontes isoladas todas as páginas/actions dos quatro primeiros domínios, arquivos de plataforma adaptados, oráculos TypeScript e testes relacionados. Ele preserva `strict`, verifica dependências importadas normalmente e ainda pode carregar Prisma durante a coexistência. Não substitui o gate integral das fontes/rotas de produção.
