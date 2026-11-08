# GED: formulário de cadastro de usuário com páginas quase iguais

## Diagnóstico confirmado em produção

Rota: `/assinatura-digital/usuarios` (Cadastros → Assinadores → Cadastrar usuário).

A inspeção encontrou um único formulário, um único conjunto de campos e uma única action de gravação, `saveSignerAction`. A aparência de duplicação vinha das janelas de leitura sobrepostas de `OperationalPagedContent`: o formulário excedia pouco a área disponível, e a segunda parte deslocava o mesmo conteúdo apenas o suficiente para revelar os últimos campos.

| Janela | Altura útil do formulário | Conteúdo anterior | Deslocamento até a segunda parte |
| --- | ---: | ---: | ---: |
| 1366 × 768 | 600 px | 648 px | 48 px |
| 1920 × 1080 | 608 px | 648 px | 40 px |
| 1280 × 720 | 552 px | 648 px | 96 px |

## Ajuste visual

Arquivo: `src/app/app-domain/assinatura-digital/usuarios/UsuariosClient.tsx`.

- Organizados em duas colunas os controles de origem, modo de cadastro e consulta da origem, usando o breakpoint já empregado nos demais campos.
- Compactados os espaços entre os blocos, mantendo a altura dos controles e a fonte existentes.
- Integrada ao cabeçalho de edição a orientação de senha vazia para preservar a senha atual.
- Mantido inteiro o texto explicativo do vínculo à conta e evitada a quebra da palavra no botão Desvincular.

O formulário permanece com o componente operacional de conteúdo paginado, o mesmo estado de rascunhos, campos, permissões e payload de gravação. Não há alteração de banco/schema nem mudança no contrato da action.

## Verificação funcional e visual local

Verificação autenticada no navegador, em `http://localhost:3311`, comparada à reprodução anterior em produção:

| Janela | Novo cadastro manual | Cadastro com vínculo RH selecionado | Edição com vínculo RH |
| --- | --- | --- | --- |
| 1366 × 768 | Uma parte; todos os campos visíveis | Uma parte; todos os campos visíveis | Uma parte; todos os campos visíveis |
| 1920 × 1080 | Uma parte; todos os campos visíveis | Uma parte; todos os campos visíveis | Uma parte; todos os campos visíveis |
| 1280 × 720 | Uma parte; todos os campos visíveis | Uma parte; todos os campos visíveis | Uma parte; todos os campos visíveis |

Também conferidos: busca real de servidor no RH, seleção e preenchimento dos dados de origem, fechamento/reabertura preservando o rascunho e senha de edição inicialmente vazia. Nenhum erro JavaScript de página foi registrado. A verificação não gravou nem alterou assinadores.

Os screenshots e as medições foram produzidos na pasta local de evidências `C:/Users/trici/AppData/Local/Temp/opencode/ged-user-form-after-2026-11-08/`. As medições anteriores estão em `ged-user-form-before-2026-11-08/`, no mesmo diretório-base.

O aceite visual acima cobre os três estados e janelas medidos. A paginação adaptativa continua atendendo conteúdo adicional e áreas úteis menores.
