# RH/Folha — medição de armazenamento e cenários 2025–2026

Medição: **02/11/2026**. Unidades decimais: KB = 1.000 bytes; MB = 1.000.000 bytes; GB = 1.000.000.000 bytes.

## Conclusão para decisão

**O espaço comporta com folga a expansão demonstrativa dos 198 servidores.** Recomenda-se completar primeiro 2026; 2025 é justificável quando houver necessidade de comparação anual. O trabalho de consistência histórica e de parametrização pesa mais que o armazenamento.

- Modelo atual: banco inteiro de aproximadamente **208 MB** com 12 meses e **258 MB** com 24 meses.
- Planejamento: aproximadamente **235 MB** e **315 MB**, respectivamente, arredondando para cima a reserva de 50% do crescimento e 2 KB por recibo emitido no Portal.
- Todos os contracheques acessados uma vez no Portal: aproximadamente **12,7 MB** no Blob para 2026 ou **25,4 MB** para 2025–2026.
- Espelhos mensais de ponto: **não são arquivados automaticamente**. Se houvesse arquivamento explícito de um por servidor/mês, acrescentariam **11,1 MB** ou **22,3 MB**, respectivamente.

São projeções de uma folha mensal por competência, com a densidade de rubricas atual; não constituem execução da população.

## 1. Método e evidência

Executor: `scripts/measure-rh-storage-2026.ts`.

```powershell
node --conditions=react-server --import tsx scripts/measure-rh-storage-2026.ts
```

Resultado agregado: `docs/RH_ARMAZENAMENTO_MEDICAO_2026.json`.

- Transação PostgreSQL `REPEATABLE READ, READ ONLY`, confirmada por `transaction_read_only = on`.
- Medição física por `pg_database_size`, `pg_table_size`, `pg_indexes_size` e `pg_total_relation_size`; inclui TOAST e índices.
- Contagens exatas das tabelas selecionadas e contagens por competência do pacote `RH_PORTAL_2026_V1`.
- Uma chamada de listagem ao Blob, sem upload ou exclusão; somente metadados de tamanho são agregados.
- Dezoito contracheques e dezoito espelhos mensais gerados em memória, com amostra determinística estratificada pelo tamanho do snapshot, incluindo extremos de cada mês.
- Quatro relatórios coletivos emitidos em memória em CSV, PDF e XLSX.
- Nenhum novo dado funcional, folha, pagamento, conta de acesso ou PDF foi persistido no banco/Blob pela medição.

Os tamanhos de tabelas inteiras são medidos; a atribuição física a um subconjunto é uma estimativa proporcional ao `pg_column_size`. Não se deve confundir soma de JSON ou tamanho de exportação com tamanho físico do banco.

## 2. Ocupação observada

| Componente | Quantidade / tamanho |
|---|---:|
| Banco atual inteiro, todos os módulos | **170,516 MB** |
| Núcleo RH/Folha selecionado, incluindo tabelas vazias e índices | **16,703 MB** |
| Dados/TOAST/espaço auxiliar desse núcleo | 12,468 MB |
| Índices desse núcleo | 4,235 MB |
| Tabelas SST adjacentes, separadas do núcleo | 2,105 MB |
| Servidores ativos | 198 |
| Demonstrativos agosto–outubro | 594 |
| Ponto agosto–outubro | 12.474 registros, 4.158 por mês |
| Blob acessível pelo token, todos os caminhos/módulos | **78 objetos / 0,324 MB** |
| Blob sob o prefixo documental desta instância | 35 objetos / 0,213 MB |
| Eventos de recibo verificável do Portal | **0** |

Principais tabelas físicas de RH:

| Tabela | Registros | MB, com índices |
|---|---:|---:|
| `HrPayrollStatement` | 594 | 4,899 |
| `AttendanceRecord` | 12.474 | 4,202 |
| `HrIntegrationEvent` | 682 | 1,499 |
| `HrReferenceRecord` | 954 | 0,893 |
| `HrEmploymentRevision` | 396 | 0,860 |
| `HrPayrollItemOrigin` | 1.302 | 0,844 |
| `HrMovement` | 654 | 0,524 |
| `PayrollItem` | 1.482 | 0,475 |
| `HrEmploymentContract` | 198 | 0,401 |

As tabelas canônicas compartilhadas `Person` e `Document` não são atribuídas integralmente ao RH; já integram os 170,516 MB do banco completo. Os cadastros existentes não precisam ser duplicados para cada ano. SST não deve ser somado novamente ao projetar a partir do banco inteiro.

Não foi localizado Blob de RH nas referências consultadas, nem pasta `financeiro` no prefixo documental desta instância. Isso e a ausência de eventos de recibo confirmam que os 594 demonstrativos publicados ainda não equivalem a 594 PDFs de recibo arquivados. A busca de referências não pretende ser inventário universal de todos os possíveis anexos de RH.

## 3. O que fica no Neon e no Blob

| Conteúdo | Persistência atual |
|---|---|
| Cadastro, contrato e revisões, rubricas, cálculo e memória do demonstrativo, projeção da folha, ponto, referências | Neon |
| PDF do demonstrativo emitido pela rota interna de RH | Gerado no download; sem upload nessa rota |
| Recibo verificável emitido pela rota autenticada do Portal | Primeiro acesso grava PDF privado no Blob e evento/hash no Neon; acessos posteriores reutilizam o artefato |
| Espelho de ponto pessoal e relatórios comuns de RH/Portal | Gerados na solicitação; sem arquivo persistente nessas rotas; emissão pode gerar auditoria |
| Documento funcional autenticável emitido no Portal | Arquivo no Blob e metadados/evento no Neon, quando emitido |
| Cópia documental ingressada no GED | Persistência própria, acrescida conforme ingresso, versões e derivados |

Referências de implementação: `src/lib/portal-servidor/receipt-verification.ts`, `src/lib/portal-servidor/generated-documents.ts`, `src/app/api/rh/demonstrativos/[id]/route.ts`, `src/app/api/portal-servidor/relatorios/route.ts`, `src/app/api/rh/relatorios/route.ts` e `src/lib/platform/blob.ts`.

Os 74 modelos de emissão reutilizam as fontes existentes. **Não são 74 cópias completas do cadastro/folha**, nem 74 arquivos automáticos por servidor/mês.

## 4. Projeção do Neon

Base: 198 servidores, uma folha mensal, média de 21 registros diários de ponto por servidor/mês. O calendário efetivo altera a quantidade de dias; exclusões por jornada e dispensas também.

Decomposição aproximada dos três meses:

- Folhas, cálculos, demonstrativos, projeções, origens e ponto: **10,574 MB**.
- Eventos de integração associados, excluindo instalação de parâmetros: **1,469 MB**.
- Movimentos, amortizados conservadoramente como recorrentes: **0,524 MB**.
- Total recorrente de três meses: **12,568 MB**, cerca de **4,189 MB/mês**.
- Parte residual do núcleo, contada uma vez: **4,136 MB**.

Fórmulas do modelo:

```text
RH(meses) = 4,136 MB + meses × 4,189 MB
incremento = (meses - 3) × 4,189 MB
banco completo = 170,516 MB + incremento
reserva de planejamento = 170,516 MB + incremento × 1,5
                         + demonstrativos totais × 2 KB
```

Os 2 KB são uma provisão por evento de recibo com hashes/URL/índices, não uma medição de recibos existentes. Não incluem auditoria ilimitada por acessos repetidos.

| Cenário | Demonstrativos | Ponto estimado | Núcleo RH | Acréscimo sobre hoje | Banco inteiro, modelo base | Banco inteiro, planejamento arredondado |
|---|---:|---:|---:|---:|---:|---:|
| Agosto–outubro/2026 atual | 594 | 12.474 | 16,7 MB | — | **170,5 MB medidos** | — |
| 2026 inteiro, 12 meses | 2.376 | 49.896 | 54,4 MB | 37,7 MB | **208,2 MB** | **235 MB** |
| 2025 e 2026, 24 meses | 4.752 | 99.792 | 104,7 MB | 88,0 MB | **258,5 MB** | **315 MB** |

O modelo base considera dados de folha disponíveis, ainda sem eventos de recibo em massa. Se todos acessarem tudo, a provisão desses eventos é 4,752 MB para 12 meses ou 9,504 MB para 24 meses e já está no planejamento.

O cenário medido tem apenas 434 itens projetados por competência, aproximadamente 2,2 por servidor. Mais rubricas, dependentes, pensões, consignações, faltas, afastamentos e revisões podem ampliar o volume. A reserva é para planejamento, não limite máximo. 13º, férias em folhas separadas, suplementares e recálculos preservados acrescentam rodadas próprias; não estão incluídos na contagem de uma folha por mês. Cada rodada comparável a uma mensal acrescenta aproximadamente 2–3 MB no Neon, sem repetir o ponto, e cerca de 1,06 MB no Blob se todos os seus recibos forem emitidos.

## 5. PDFs e projeção do Blob

| Documento individual mensal | Mínimo | Média | Máximo |
|---|---:|---:|---:|
| Contracheque com código de autenticidade | 5,328 KB | **5,345 KB** | 5,366 KB |
| Espelho pessoal de ponto | 4,659 KB | **4,691 KB** | 4,725 KB |

São PDFs textuais do layout atual, sem imagens digitalizadas ou anexos volumosos. O tamanho pode mudar com layout, logotipo, fontes e quantidade de rubricas.

| Cenário | Contracheques: todos acessados no Portal | Ponto: somente se arquivado explicitamente | Soma hipotética dos dois |
|---|---:|---:|---:|
| 3 meses | 3,18 MB | 2,79 MB | 5,96 MB |
| 2026 inteiro | **12,70 MB** | 11,14 MB | 23,85 MB |
| 2025–2026 | **25,40 MB** | 22,29 MB | 47,69 MB |

Na implementação atual, o Blob de ponto desses cenários permanece zero. O consumo dos recibos cresce conforme o primeiro acesso de cada demonstrativo; baixar o mesmo recibo várias vezes aumenta tráfego/operações e auditoria, não cria várias cópias normais do PDF. Ingressos no GED e novas versões documentais podem acrescentar cópias próprias.

## 6. Outras tabelas e modelos de relatório

Amostras coletivas realmente geradas na medição:

| Relatório / recorte | Linhas | CSV | PDF | XLSX |
|---|---:|---:|---:|---:|
| Folha de outubro | 198 | 34,2 KB | 26,5 KB | 18,7 KB |
| Cadastro geral em novembro | 198 | 56,8 KB | 38,0 KB | 23,3 KB |
| Cartão de ponto 132, outubro | 198 | 25,2 KB | 47,3 KB | 14,2 KB |
| Histórico funcional em novembro | 1.062 | 312,9 KB | 193,6 KB | 65,6 KB |

O conjunto das **74 emissões CSV da verificação anterior soma 12,953 MB**, com os filtros e fontes registrados em `docs/RH_POC_RELATORIOS_VERIFICACAO_2026.json`. Inclui visões diferentes dos mesmos dados e resultados vazios; não representa 74 cenários positivos homologados. Esses bytes foram emitidos, não arquivados no Blob.

Se for decidido guardar relatórios, somar somente as emissões efetivamente preservadas, com seus filtros e formatos. Não multiplicar automaticamente 74 × 198 × meses. Relatórios anuais e contabilizações diferentes têm tamanhos próprios.

O fator que pode superar facilmente essas estimativas é anexo digitalizado: **dez anexos de 1 MB para cada um dos 198 servidores consomem 1.980 MB no Blob**, antes de versões e derivados. Isso é uma hipótese ilustrativa, separada dos PDFs textuais medidos.

## 7. Planos, limites e custo marginal

Fontes oficiais consultadas em 02/11/2026:

- Neon: <https://neon.com/pricing> — página atualizada em 31/10/2026: Free com 1 GB PostgreSQL por projeto; Launch/Scale com armazenamento a US$ 0,35/GB-mês; computação, histórico, snapshots e outros itens separados.
- Vercel Blob: <https://vercel.com/docs/vercel-blob/usage-and-pricing> — Hobby com 1 GB-mês, primeiras 2.000 operações avançadas e 10.000 simples; preço regional em planos pagos. Exemplo oficial de armazenamento: US$ 0,023/GB-mês.

Não foi consultado faturamento autenticado; o plano efetivo, outras branches/projetos e consumo acumulado de operações devem ser conferidos no painel. `pg_database_size` não mede sozinho o armazenamento faturável de todo o projeto Neon, WAL/histórico ou outras branches. A listagem mede o estado atual do store acessível ao token, não a média mensal faturada.

- O acréscimo de dados estimado equivale a aproximadamente **US$ 0,01–0,05/mês** de armazenamento PostgreSQL em plano pago, conforme cenário/reserva. Não é uma previsão da fatura completa.
- 25,4 MB de contracheques equivalem a menos de **US$ 0,001/mês** de armazenamento Blob usando a tarifa ilustrativa; operações, transferência privada e Functions são cobradas separadamente.
- Um mês normal gera aproximadamente **198 uploads iniciais de recibo** se todos acessarem. A emissão em lote de 12 meses gera pelo menos **2.376 uploads**, e de 24 meses **4.752**; ultrapassaria a franquia mensal publicada de 2.000 operações avançadas do Hobby caso ocorresse integralmente no mesmo período, mesmo com poucos MB. A medição consumiu uma listagem.

## 8. Recomendação de execução

1. **Completar 2026 primeiro**, para demonstrar consulta mensal, evolução e ficha anual. Manter rastreabilidade e os três meses fechados já existentes.
2. **Acrescentar 2025 se o comparativo entre exercícios for útil para a demonstração.** Seu custo marginal de espaço é pequeno: cerca de 50,3 MB no Neon e 12,7 MB de recibos no Blob, relativamente ao modelo de 2026 completo.
3. Usar a emissão sob demanda já existente; o simples povoamento da folha não exige upload prévio de todos os PDFs.
4. Preparar executor histórico próprio: o atual aceita apenas agosto–outubro/2026. O cadastro contratual demonstrativo começa em 01/01/2026, e parâmetros de 2025 precisam de versão própria. Não retroceder artificialmente esses contratos nem reutilizar silenciosamente regras tributárias de 2026.
5. Em 02/11/2026, novembro/dezembro completos ainda são projeção: manter marcação explícita de simulação e não fabricar presença futura como frequência realizada.

**Decisão sugerida:** aprovar 2026 completo como pacote demonstrativo, com futuro identificado como projeção, e deixar 2025 condicionado ao valor do comparativo anual. O armazenamento não é impedimento para nenhum dos dois cenários.
