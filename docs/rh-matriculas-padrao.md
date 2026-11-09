# Matrículas de servidores — 09/11/2026

## Regra

`AAAAMMDDXXXXX`: data de cadastro do servidor + sequência diária de cinco dígitos, iniciada em `00001`.

- Data de origem: `Employee.createdAt`, armazenada em UTC e convertida para `America/Sao_Paulo` para determinar o dia civil. Não é a data da admissão, competência da folha ou liberação do demonstrativo.
- Sequência única dentro do banco municipal, compartilhada entre secretarias e unidades. Máximo de 99.999 cadastros no mesmo dia; exceder o limite falha transacionalmente.
- A geração ocorre no banco, cobrindo cadastro RH/Administração, inclusão rápida, importações, scripts e seeds. Uma matrícula já emitida é mantida em alterações e reexecuções de seed. Números não são reaproveitados após exclusão.
- Cadastros existentes são ordenados por `createdAt` e `id` dentro de cada dia. A ordenação por ID desempata horários idênticos de importações anteriores.

## Banco

Migração: `db/migrations/20261109160000_employee_registration_standard/migration.sql`.

Cria contador diário e registro imutável de alocação (`EmployeeRegistrationCounter` / `EmployeeRegistrationAllocation`), conserva matrícula anterior e data original, atualiza `Employee.registration`, adiciona unicidade/formato/não nulidade e trigger para novos registros e manutenção da numeração existente. O registro de alocação não tem FK para permitir a exclusão autorizada de um cadastro sem liberar a matrícula já emitida.

Aplicada pelo runner oficial `scripts/database-migrate.mjs deploy`, usando explicitamente o banco municipal configurado. O plano anterior não tinha pendências; o plano após a inclusão continha somente esta migração. Resultado: **PASS**.

Verificação no banco Guaramá:

- 200 servidores, 200 matrículas válidas, 200 números distintos, zero divergências entre cadastro e alocação/data local.
- 398 contratos pertencentes a 200 servidores; 198 servidores com mais de um contrato.
- Consulta de publicação funcional validada em 20 linhas de um total de 3.418 demonstrativos publicados.

| Servidor | Matrícula anterior do cadastro | Nova matrícula | Dia de cadastro |
| --- | --- | --- | --- |
| Paulo Silva | 004218 | 2026110800001 | 08/11/2026 |
| Thiago Morcatty | DEMO-TI-2026-001 | 2026110600001 | 06/11/2026 |
| Bruna Almeida | AV5000 | 2026102700019 | 27/10/2026 |

Os códigos de vínculo (`HrEmploymentContract.registration`) são identificadores contratuais independentes. Os relacionamentos continuam por `employeeId`/`contractId`. Documentos, XMLs, revisões e cálculos históricos mantêm o identificador que tinham na emissão, sem reescrita de snapshots ou hashes.

## Telas e integração

- Cadastro RH/Administração: matrícula somente leitura, com orientação de geração automática. O servidor ignora valores de matrícula enviados pelos formulários.
- Publicação funcional (tela informada pelo usuário), lista de demonstrativos do cálculo e operações de contratos/movimentos/direitos: exibem a matrícula atual do servidor. Operações conserva uma coluna separada para o código do vínculo.
- Busca de contratos aceita a matrícula do servidor e o código contratual; seletor explicita os dois.
- Importação de ponto aceita a matrícula anterior registrada na alocação, além da nova, CPF e identificador interno. Identificadores ambíguos ou desconhecidos ficam sem correspondência; códigos alfanuméricos não são transformados em números de outra pessoa.
- Paginação de 20, preferências estáveis, ações e controles de acesso mantidos. Não foi criado um componente de tabela paralelo.

## Correção do dashboard relatada durante a validação

Erro de produção `1212616578`, confirmado nos logs Vercel do deployment `dpl_6VpK8gc3Fucpsyp5XkxnNNhv6Lsi` e reproduzido por navegação autenticada: HTTP 500 em `/dashboard`.

Causa: a página server passava componentes Lucide (objetos com função `render`) dentro dos dados de cartões para `DashboardClient`. O contrato agora envia apenas dados serializáveis. Ícones de cartões e painel de hover são resolvidos no client por código do módulo. A seleção de módulos e as permissões continuam calculadas no servidor.

## Validação

```powershell
node --import tsx --test tests/dashboard-card-data.test.ts tests/employee-registration.test.ts tests/operational-table.test.ts tests/operational-routes.test.ts
node --conditions=react-server --import tsx scripts/inspect-employee-registrations.ts --verify
npm run build
```

- **8 testes aprovados**: backfill, virada do dia no fuso municipal, sequência, inserts concorrentes pelo driver, reserva após exclusão, rollback, limite diário, preservação dos vínculos/snapshots, aliases/ambiguidade, serialização dos cartões e padrões operacionais.
- **Verificação de dados aplicada: PASS.**
- Build e navegação pós-correção: em andamento.
- Reprodução visual inicial: navegador Chromium/Playwright, 1366×768, escala padrão (100%); evidências locais em `C:/Users/trici/AppData/Local/Temp/opencode/dashboard-registration-before/`. O navegador integrado estava desconectado; a verificação foi feita pelo navegador automatizado local.
