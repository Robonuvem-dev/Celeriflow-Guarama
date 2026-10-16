# Autoatendimento — entrada e acompanhamento de processos

Entrega de 13/10/2026, correspondente ao pedido de tela de acompanhamento para cidadãos/contribuintes e acesso à solicitação de serviços com e-mail/senha, Google e botão gov.br bloqueado.

## Entrada e navegação

- Menu institucional **Autoatendimento** e grupo próprio em `/portal/servicos`.
- `/portal/entrar`: reutiliza a autenticação Firebase e a criação de sessão municipal existentes, por e-mail/senha ou Google.
- **Entrar com gov.br**: botão cinzento, desabilitado, identificado como **Em configuração**. Não inicia autenticação nem simula integração.
- `/portal/minha-area`: atalhos **Solicitar serviço** e **Acompanhar meus processos**.
- `/portal/minha-area/servicos`: entrada autenticada nos canais já disponíveis de e-SIC, Ouvidoria e Construção Civil, informando o acompanhamento próprio e a habilitação profissional quando aplicável.
- Sem sessão válida, os acessos à área pessoal retornam ao login. Depois do login, preserva-se o destino interno, com validação contra redirecionamentos externos.
- A conta municipal e seu perfil precisam estar ativos. O login não cadastra automaticamente novos usuários nem concede permissões ERP.

## Consulta pelo cidadão/contribuinte

- `/portal/minha-area/processos`: lista paginada (20 por página), busca por protocolo, situação, assunto, setor atual, abertura e prazo previsto.
- `/portal/minha-area/processos/[id]`: detalhe autorizado, datas de atualização/conclusão/arquivamento e histórico de encaminhamentos e recebimentos entre setores.
- A lista, a busca e o detalhe aplicam o mesmo escopo. Conhecer o número ou o ID de outro processo não libera a consulta.
- A projeção externa não carrega descrição inicial, motivos internos de tramitação, despachos, notas, documentos/GED, funcionários, CPF/CNPJ ou dados bancários.
- Ouvidoria, processos funcionais vinculados ao Portal do Servidor e certificados médicos SST permanecem sob as políticas especializadas de seus canais.

## Vínculos e gestão interna

O novo modelo `ProcessCitizenAccess` concede acompanhamento de um **processo específico** a um usuário municipal. Registra concedente, justificativa do vínculo validado, concessão, validade opcional e revogação.

No detalhe interno, acessado por **Processos e Protocolos → processo**, o painel **Acompanhamento pelo cidadão / contribuinte** permite:

1. Informar o e-mail de uma conta ativa já vinculada ao Firebase.
2. Registrar a justificativa do vínculo e, quando necessário, a validade.
3. Liberar ou renovar o acompanhamento.
4. Revogar a autorização.

Somente a administração ou um operador com permissão de atualização e vínculo com o setor atual pode gerenciar essas autorizações. Concessão e revogação registram eventos de auditoria na mesma transação.

A consulta também aproveita `TaxpayerPortalAccess` do tipo `TITULAR`, ativo, não revogado, com escopo `PROCESSOS`, para contribuintes ativos e processos ligados por `TaxServiceRequest` ou `TaxCaseLink`. Representações fiscais genéricas não são presumidas válidas: podem utilizar uma autorização explícita por processo, com o vínculo validado pelo setor e validade definida. Vínculos fiscais independentes são geridos na Tributação; revogar uma concessão explícita não revoga automaticamente esses vínculos.

## Persistência e verificações

- Migração `20261013070000_citizen_process_tracking` aplicada ao banco configurado, preservando o histórico existente.
- `npm run typecheck`: aprovado.
- `npm run build`: aprovado.
- ESLint nos arquivos alterados e novos: aprovado.
- `node --import tsx --test tests/citizen-process-tracking.test.ts`: 2 testes aprovados, incluindo execução real Prisma/PostgreSQL em PGlite com o histórico de migrações.
- Testes cobrem outro titular, acesso revogado, vencido e ainda não vigente, isolamento entre contribuintes, denúncia sigilosa, busca/detalhe autorizados e ausência de narrativa privada na projeção.
- Smoke Playwright sobre o build local: botões e-mail/Google disponíveis, gov.br visível e desabilitado, exibição de senha, layout móvel sem transbordamento horizontal, quatro rotas pessoais exigindo login, cookie inválido redirecionando e links de serviços presentes; nenhum erro de página.
- As verificações de navegador não utilizaram credenciais reais nem autenticação gov.br.

Esta entrega implementa a entrada e a consulta de andamento. O catálogo geral versionado, os novos formulários de solicitação e a abertura externa genérica pedido–Process–executor permanecem nas fases do plano `PLANO_PORTAL_AUTOATENDIMENTO.md`. Os canais existentes mantêm seus fluxos próprios, explicitados na tela.
