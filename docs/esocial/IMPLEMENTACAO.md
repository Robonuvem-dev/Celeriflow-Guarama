# CF06 — implantação da demonstração funcional

## Escopo confirmado pelo kit de 08/11/2026

Modo DEMO persistente, com respostas locais explicitamente simuladas. Transporte oficial continua desativado. Não reutilizar o contrato `EsocialTransport.mode=REAL` do SST para representar simulação.

Prioridade: comando completo e consulta guiada de lotes, seis tipos/nove registros de totalizadores, conciliação CP -R$ 5,00, origem e XML consultáveis. Em seguida cenários de erro/correção, advertência, duplicidade, exclusão, reabertura, 13º, importação, RBAC e automação/outbox.

## Constatações da análise

- RH possui origens internas e exportação preparatória, sem transporte.
- SST possui validação de proveniência e tentativas reais segregadas; preservar esse contrato.
- O kit usa XML privado conceitual, não validado pelo XSD oficial.
- Referência oficial consultada em 08/11/2026: S-1.3 NT07 rev. 20/10/2026, pacote com entrada em produção em 26/10/2026. Há outros pacotes com vigência futura em 23/11, 14/12 e 18/01/2027. Não trocar indiscriminadamente o leiaute das origens históricas SST.
- S-5xxx são recebidos por consulta; não compõem a fila de transmissão.
- A versão principal local contém modificações posteriores ao hotfix do Paulo. Validar o build antes de decidir a publicação; preservar os trabalhos existentes.

## Sequência e evidências

1. Inventariar e preservar kit (JSON/XML/ZIP).
2. Motor de domínio: estados distintos de recepção/processamento, regras RGPS/RPPS, valores em centavos, versões e importação.
3. Persistência transacional e escopo pela instância autenticada, unidade declarante e usuário; arquivos privados e auditoria imutável.
4. Telas operacionais RH/eSocial, comandos autorizados, downloads, filtros e paginação de 20.
5. Seed idempotente, testes de domínio/persistência/RBAC, validação por clique, build e implantação.
6. Matriz 6.1–6.26 com evidências reais; nunca confundir demonstração com homologação oficial.

## Consolidação das duas implementações

Solicitação: analisar as versões sobrepostas, fazer o merge e commitar após build aprovado.

### Motor e contratos

- `src/lib/rh/esocial/contract.ts`: contrato único de domínio persistido, escopo de instância/unidade/competência, tentativas, artefatos e comandos.
- `engine.ts`, `demo-transport.ts` e `xml.ts`: única máquina de estados e transporte local. Recepção 201 não significa aceite; a consulta 101 não produz recibos; processamento posterior registra os resultados individuais.
- `contracts.ts` e `presenter.ts`: modelo serializável de apresentação do console, derivado do domínio. Não constituem uma segunda persistência ou motor. A projeção não entrega URLs privadas do Blob e preserva tentativas históricas.
- `input.ts`: traduz os nomes dos comandos do console para o contrato de domínio na camada de serviço.
- `personnel-esocial-demo.ts`: repositório transacional único, com trava por escopo, chave idempotente, hashes de estado e artefatos privados.

### Recursos reunidos

1. Console operacional com paginação de 20, filtros, detalhe paginado, menu RH e visualização/download dos XMLs.
2. Persistência por unidade declarante, permissões explícitas e restrição de escrita pelo perfil RH. Permissões podem ser concedidas/revogadas no painel administrativo.
3. Importação XML/ZIP limitada, prévia persistida, confirmação e manutenção do registro existente em conflitos; originais preservados.
4. Cenários de rubrica ausente, advertência, falha de comunicação e erro estrutural; correção mantém a tentativa rejeitada e permite arquivar erros resolvidos.
5. Recibos e nove totalizadores dos seis tipos no cenário mensal; conciliação CP −R$ 5,00; reabertura, exclusão, duplicidade e cenário anual/13º.
6. Assinaturas de notificações/outbox e programação autorizada para pré-validar ou executar o fluxo completo pelo operador. Não há worker periódico nem entrega SMTP neste incremento.
7. Exportação CSV/HTML e downloads por identificador de execução, preservando os arquivos de gerações anteriores ao reset.

### Banco — separado das telas

- Migração canônica: `db/migrations/20261108235000_cf06_esocial_demo/migration.sql`.
- A consulta somente leitura ao banco configurado retornou **zero tabelas `HrEsocialDemo%`** antes da consolidação. A migração concorrente `20261108193000_rh_esocial_demo` era inédita e foi incorporada à canônica; não foi alterada uma migração aplicada.
- Tabelas: ambiente, concessões, execuções por geração, comandos e metadados de artefatos. Comandos/artefatos têm triggers de imutabilidade.
- Validação da migração realizada em PostgreSQL local isolado via PGlite/driver Neon. O banco municipal não foi migrado durante esta consolidação.
- A migração deve seguir o runner SQL do projeto (`npm run db:migrate:deploy`, com destino explícito). O build de produção Vercel já chama esse runner; não executar SQL fora dessa autoridade.
- Depois da migração, `node --conditions=react-server --import tsx scripts/configure-esocial-demo.ts` apresenta a configuração; `--apply` habilita a unidade demonstrativa existente e concede permissões ao administrador de população. Exige configuração local autorizada e Blob privado para os documentos.

### Interface — separado do banco

- Rota principal: `/rh/esocial`; `/rh/esocial/demonstracao` redireciona para o mesmo console, preservando declarante/competência.
- Preparação/exportações anteriores permanecem acessíveis por `?view=origins` e `?view=manage`.
- O console reutiliza `OperationalListFrame`, `OperationalTable`, `OperationalPagination`, `OperationalFilters` e preferências estáveis. Não cria outro layout de tabela.
- Inspeção de código realizada conforme `Padrão de Tabelas.md` e `ENTREGA_PADRAO_TABELAS.md`. Validação visual por navegador em janela normal/100% **não realizada neste merge**; não confundir os testes de domínio com evidência visual.

### Verificação

```powershell
node --conditions=react-server --import tsx --test tests/esocial-demo.test.ts tests/rh-esocial-demo.test.ts tests/esocial-demo-access.test.ts tests/esocial-demo-persistence.test.ts
npm run build
```

- **16 testes aprovados**: ciclo completo, protocolo/consulta, rejeição/correção, advertência/duplicidade, reabertura/exclusão, 13º, parser/XML, agendamento, projeção do console, importação/conflitos, RBAC, isolamento de notificações e persistência.
- Persistência: migração executável, replay sem duplicação, rollback após falha de armazenamento, separação de unidades, reset preservando geração anterior e bloqueio de alteração/exclusão de evidências.
- O build inicial expôs o contrato incompatível das duas versões. Após consolidação, o primeiro retry identificou apenas o diretório vazio da migração incorporada; esse diretório foi removido.
- O build seguinte avançou até a partição 7/18 e revelou bloqueios preexistentes em Protocolos. Foram ajustados quatro arquivos: acesso a `globalThis.process.env` e seleção do nome do setor em `actions.ts`; CPF anulável no formulário de novo protocolo; metadados obrigatórios de colunas, contagem textual e paginação operacional de 20 nos relatórios/remessas. As exportações CSV continuam usando o conjunto filtrado completo. Nenhuma assinatura de action ou padrão `{ error }` foi alterado.
- **5 testes compartilhados de tabelas/rotas operacionais aprovados**, além dos 16 testes eSocial. A inspeção encontrou layouts amplos e tabelas documentais já existentes nas demais visões de relatórios/remessas; esses achados não constituem validação visual integral dessas telas.
- O avanço até a partição 9/18 revelou bloqueios anteriores nas telas de Ponto: `databaseConnection.select` foi corrigido para o cliente `.db`, os eventos de geração/importação receberam `payloadHash`, o agrupamento de horários foi tipado e as listagens ganharam paginação de 20 com estado dos formulários preservado. O formulário de importação não possui tabela; os quatro outros clients controlam sua própria paginação. Em relatórios, a paginação é por URL e as exportações recebem todos os registros. A partição que inclui essas correções passou na verificação dirigida.
- Durante a inspeção da importação de ponto, foi removido o fallback que atribuía identificadores não reconhecidos ao primeiro servidor ativo. Eles agora entram na contagem de não identificados, sem gerar marcações para outra pessoa. Contratos de retorno das actions foram preservados.
- Os últimos bloqueios de tipagem estavam em `PortalDeclaracoesClient.tsx` (import sem export correspondente e metadados antigos de colunas) e `SolicitacoesClient.tsx` (metadados de colunas e variantes de badge inexistentes). A importação não usada foi removida; colunas foram adaptadas ao contrato compartilhado, com ações preservadas; indicadores de alerta/sucesso usam a variante existente com suas cores sem mudar o tipo do dado recebido.
- **Build completo final aprovado em 09/11/2026, exit code 0**: cobertura de persistência PASS, verificação dos arquivos de migração, geração de tipos, 18 partições TypeScript e build de produção Next.js 16.4.3, com 116 páginas estáticas geradas. Typecheck levou 781 s; etapa Next levou 916 s. O aviso de divergência histórica de migração já documentado pelo projeto não impediu o gate autorizado; o banco municipal não foi migrado por este build local.
- Evidência local do build: `C:/Users/trici/.local/share/opencode/shell/969fc413fd5d7b689a08b7e442ae2897ef72c357/sh_1be27e991001bqK5laQzuPeQwp.out`.

### Limites de cobertura

Esta entrega consolida a demonstração funcional, não homologação oficial. Fontes do kit continuam sintéticas, sem vínculo confirmado aos cadastros de servidores existentes; a consulta às matrículas `VA-0001` a `VA-0004` não encontrou correspondências. Não marcar os 26 requisitos como integralmente atendidos por essas evidências. Transporte oficial, validação XSD/assinatura, automação por worker, migração real e vinculação completa de origens continuam exigindo implementação/validação própria.
