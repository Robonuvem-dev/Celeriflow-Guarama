# Abertura de chamado — diagnóstico de produção

## Evidência

- Tela informada: `https://guarama.celeriflow.com.br/atendimento/novo`.
- Em `2026-11-04T01:08:27.400Z`, o POST registrou a exceção `Seu usuario precisa estar vinculado a um servidor para realizar esta operacao.`; referência `3410201448`.
- A exceção ocorreu em `getAttendanceOperationalContextForOperation("create")`, antes da transação de criação. Essa tentativa não gravou chamado, interação, movimentação ou número de protocolo.
- O erro React 441 é a mensagem de erro de Server Component ocultada em produção. A rota de destino `/atendimento/chamados/[id]` existe; o log observado comprova uma falha de pré-condição cadastral, com resposta 500.

## Correção

A tela verifica o mesmo vínculo exigido pela action antes de oferecer o formulário. Ausência de servidor, servidor inativo ou departamento ausente/inativo geram uma orientação explícita na própria página. Para administradores, há acesso ao cadastro de usuários. Falhas de infraestrutura continuam sendo propagadas, sem serem confundidas com pendência cadastral.

Para habilitar a abertura, um administrador deve editar o usuário operacional em **Configurações → Usuários → Servidor vinculado** e selecionar o servidor efetivamente responsável, ativo e lotado em departamento ativo. A identidade funcional não é atribuída automaticamente. A conta técnica do administrador é gerenciada automaticamente e protegida contra edição nessa tela; nessa conta, a orientação é utilizar um usuário operacional com permissão de criação em Atendimento e o vínculo válido.

## Escopo da validação

O diagnóstico foi confirmado pelo log de produção e pela inspeção do caminho de execução. A correção de interface antecipa a pré-condição; o registro efetivo pelo usuário depende da regularização do vínculo cadastral. A criação de chamado não foi executada em produção durante o diagnóstico.

Verificação isolada da guarda real e da renderização da página: **PASS em oito cenários** (sem vínculo, servidor inexistente, servidor inativo, sem departamento, departamento inativo, vínculo válido, falha de infraestrutura e orientação específica para usuário operacional). Os cinco bloqueios cadastrais exibem a orientação e não oferecem o formulário; o vínculo válido mantém o formulário e o contexto operacional. A conta técnica recebe a orientação própria; usuários operacionais não recebem link para a administração. Erros de banco não são convertidos em pendência cadastral. Evidência local: `C:\Users\trici\AppData\Local\Temp\opencode\atendimento-vinculo-verificacao.json`. ESLint dos dois arquivos alterados: PASS.

**Build final completo PASS:** `npm run build` encerrou com código zero. A presença da orientação específica para a conta técnica foi confirmada no JavaScript de produção da rota. Log local: `C:\Users\trici\AppData\Local\Temp\opencode\atendimento-vinculo-final-build.log`. `git pull --ff-only origin main` confirmou a base atualizada antes do commit.
