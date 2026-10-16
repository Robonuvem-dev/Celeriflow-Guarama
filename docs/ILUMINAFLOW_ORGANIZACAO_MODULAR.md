# Organização modular — Iluminaflow, Obras e GED

## Alterações

- Documentos/GED foi retirado do dashboard, da listagem de módulos de Configurações, da contagem de módulos ativos e da matriz editável de Perfis de Acesso.
- Os serviços/tabelas/arquivos e rotas internos de GED foram preservados: RH, Cemitérios, Tributação, upload/download e assinaturas possuem consumidores reais. A configuração interna `DOCUMENTOS` permanece ativa no banco, com seus vínculos e controles de acesso.
- Ao editar perfis granulares, a action conserva a permissão interna de GED já gravada no servidor. A matriz pública não aceita novos grants para `DOCUMENTOS`. Ocultação não constitui liberação de acesso a arquivos.
- Criado `ILUMINACAO_PUBLICA`, com nome **Iluminação Pública (Iluminaflow)** e acesso modular próprio. Está no dashboard, na listagem de módulos e na matriz de Perfis de Acesso.
- `OBRAS` passou a se chamar **Obras e Construção Civil**, no dashboard, menus, Configurações/Perfis e banco. Seu código e vínculos existentes permanecem estáveis.

## Rotas

| Tela | Endereço |
|---|---|
| Entrada Iluminaflow | `/iluminacao-publica` |
| Iluminação Pública | `/iluminacao-publica/iluminacao-energia` |
| Ordens de Serviço | `/iluminacao-publica/ordens-servico` |

O menu do Iluminaflow tem somente os dois itens solicitados. Eles foram removidos do menu e dos cards de Obras. Os endereços antigos `/obras/iluminacao-energia` e `/obras/ordens-servico` redirecionam para o módulo novo, cujas páginas/layout exigem acesso a `ILUMINACAO_PUBLICA`.

As telas continuam consultando os dados reais e vínculos existentes de `ObrasServico`, sem duplicação ou transferência de registros. A consulta de iluminação mantém o filtro `tipo = Iluminação`; Ordens de Serviço mantém o conjunto de ordens que a tela anterior apresentava. O vínculo opcional “Gerenciar ordem base” só aparece para quem também pode acessar Obras; o cadastro base continua na rotina compartilhada de Serviços Urbanos. A integração com o projeto externo Iluminaflow será uma etapa futura.

Atualizações de serviços/materiais e empenhos invalidam também as novas páginas, para manter as consultas atualizadas.

## Sincronização do catálogo

Executado no banco configurado neste ambiente:

```powershell
npx tsx scripts/sync-iluminaflow-module.ts --apply
```

O script é transacional e idempotente: cria o módulo ativo se ausente, atualiza seu nome se existente sem sobrescrever a ativação escolhida e renomeia Obras. Não altera permissões de usuários/perfis nem registros GED. Sem `--apply`, executa prévia com rollback. Use-o em outro banco quando necessário; não é uma migration de schema.

## Verificação

- ESLint dos arquivos alterados: aprovado.
- Testes existentes de Administração e acesso às páginas administrativas: **11/11 aprovados**.
- `npm run build`: aprovado, incluindo TypeScript e as três novas rotas.
- Validação visual autenticada: pendente, pois o navegador da sessão está desconectado.
