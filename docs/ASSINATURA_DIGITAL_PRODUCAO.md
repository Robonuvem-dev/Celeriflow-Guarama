# Central de Assinaturas — provisionamento de produção

## Resultado

Provisionamento executado após solicitação explícita do proprietário. Conferência concluída em 30/10/2026 UTC (29/10 no horário de Brasília).

- Projeto: `celeriflow-dev/celeriflow-guarama` (`prj_SZ36xA9VaF54JVf27tr4OwWrbKLJ`).
- Conta Vercel: `robonuvem-dev`; GitHub: `Robonuvem-dev`.
- SHA publicado: `1e1e44e24bc18165dc8daa4d22e4d8c292ef89ca`.
- Deploy final: `dpl_AMVQWqQMvXXzCSfpahq7nC1TSqui`, **READY**, target **production**.
- Domínio `https://guarama.celeriflow.com.br` confirmado pela API Vercel como associado ao deploy final.
- Foi republicado o mesmo SHA já enviado pelo fluxo GitHub/Vercel, para carregar as novas variáveis. Nenhuma alteração de código funcional, commit ou push foi necessária nesta etapa.

## Banco

Logs do deploy de produção confirmaram execução do runner SQL explícito com `result: PASS` e aplicação das três migrações:

1. `20261029173000_digital_signature_module`
2. `20261029190000_signature_central`
3. `20261029190100_signature_central_a1`

A confirmação veio do ambiente de produção configurado na Vercel. Não foi usado o banco local como substituto nem repetida a inicialização da baseline.

## Blob privado

- Reutilizado o store existente `celeriflow-guarama`, `store_aBJZyHR9sdKPMzk1`, região `gru1`, acesso **Private**.
- `BLOB_READ_WRITE_TOKEN` de produção configurado como segredo para esse store verificado.
- Teste real de escrita/leitura autenticada aprovado; acesso anônimo negado; arquivo técnico de teste excluído ao final.
- A regra de 90 dias continua aplicada pelo código: bloqueio do download na expiração e exclusão física na execução da rotina diária. Metadados e evidências permanecem.

## Chave interna e cron

- `SIGNATURE_CENTRAL_PRIVATE_KEY_PEM` provisionada como segredo de produção, com chave Ed25519 estável gerada para a central.
- Fingerprint SHA-256 da chave pública: `4a595105bb9cb0fa5883cfe8c23b943560a2564811c12477aacb35926909e8e6`.
- `CRON_SECRET` provisionado como segredo de produção.
- A API Vercel confirmou o agendamento `/api/assinatura-digital/retencao`, expressão `30 10 * * *` (10:30 UTC), com cron habilitado e sem registro de desativação.
- Chamada real autorizada da rotina no domínio de produção: HTTP200, `examined: 0`, `deleted: 0`, zero falhas. Não havia arquivos vencidos no momento.
- Nenhum valor de segredo foi impresso ou versionado. Material temporário usado para a conferência do cron foi removido após a verificação.

## Verificação da aplicação ativa

Autenticação normal com a conta administrativa existente, sem criação de usuário ou alteração de permissões. Sessão mantida apenas em memória e encerrada ao final.

Páginas autenticadas com HTTP200, sem redirect ou erro de renderização:

- `/assinatura-digital/usuarios`
- `/assinatura-digital/documentos`
- `/assinatura-digital/assine-agora`
- `/assinatura-digital/registros`
- `/assinatura-digital/integracoes`

O status renderizado pelo servidor em produção confirmou:

```json
{"internalKeyPresent":true,"internalKeyValid":true,"blobConfigured":true}
```

A página `/validar-assinatura` respondeu HTTP200 sem sessão. O teste não emitiu uma assinatura em nome de pessoa real nem criou documentos de negócio.

## A1

O proprietário informou **“Ainda não tenho os certificados”**. Inventário de produção confirmado: zero integrações A1 cadastradas/ativas. O suporte e-CPF/e-CNPJ permanece disponível na página Integrações, aguardando o certificado real e a credencial do titular. Não foram criados certificados fictícios para simular essa configuração.

A mensagem sobre o Portal do Servidor foi retirada do escopo pelo proprietário; nenhuma investigação/correção adicional desse portal foi realizada nesta etapa.
