# Avisos automáticos de término da restrição

Agendamento Vercel em `vercel.json`: **temporariamente diário para o plano Hobby**, `0 9 * * *`, `GET /api/sst/restricoes/expiracao`. Isso corresponde a 09:00 UTC (06:00 de Brasília); no Hobby, a execução pode ocorrer entre 09:00 e 09:59 UTC. Há um único job configurado no projeto.

O agendamento anterior, `0 * * * *` (horário), foi incluído no commit `76728e5 — sst5` e é incompatível com o Hobby: expressões com frequência superior a uma vez por dia são rejeitadas no deploy. Referência: https://vercel.com/docs/cron-jobs/usage-and-pricing.

Quando houver plano/agendador adequado para produção, restaurar a frequência horária e homologar os avisos/retries. Enquanto a execução for diária, avisos terão até cerca de um dia de atraso e falhas transitórias poderão ultrapassar a janela automática de retry de 23h; itens com reconciliação pendente devem ser conferidos pela operação. O limite de 20 itens por execução permanece. Outro agendador pode chamar GET ou POST com o mesmo Bearer; a rotina não depende de sessão de navegador.

Configuração exigida, exclusivamente no ambiente do servidor:

- `CRON_SECRET`: chave de pelo menos 32 caracteres. O cron Vercel envia `Authorization: Bearer <CRON_SECRET>`. Para agendador externo pode-se usar `SST_RESTRICTION_CRON_SECRET`; se definida, ela tem precedência e o agendador deve enviá-la.
- `SST_RESTRICTION_EMAIL_PROVIDER=RESEND`.
- `RESEND_API_KEY`: credencial real do provedor.
- `SST_RESTRICTION_EMAIL_FROM`: endereço de envio em domínio verificado no provedor.
- `SST_RESTRICTION_EMAIL_ACTOR_USER_ID`: ID de usuário canônico ativo, com perfil ativo, vínculo Firebase existente, SST ativo e operação SST/create autorizada. Esse usuário precisa de vínculo à UG, autorização ocupacional `canReadClinical/canAssess` e concessão Medicina `canRead/canWrite`, todas ativas. O serviço não fabrica usuário/perfil e não usa o atalho administrativo de acesso a todas as UGs.

Também é necessária a migração aditiva `20261011100000_complete_sst_cat_layout`.

Não existia remetente SMTP implementado no repositório. O adaptador HTTP real usa `POST https://api.resend.com/emails`, conforme https://resend.com/docs/api-reference/emails/send-email, e `Idempotency-Key` estável por item da fila. Não exige instalação de SDK. A interface `RestrictionEmailSender` permite integrar outro provedor real posteriormente.

Ausência de chave/provedor/ator/escopo retorna 503 `BLOCKED` e log operacional sem credenciais nem conteúdo clínico. Nenhum item é marcado enviado nessa situação. Processamento usa lote de 20 e locks `SKIP LOCKED`; restrições liberadas não entram no lote.

`SENT` significa **aceite do provedor**, comprovado pelo ID real retornado, não confirmação de leitura/entrega na caixa postal. Falhas são `FAILED`, com até três tentativas, intervalo mínimo de 15 minutos e janela de 23 horas, inferior às 24 horas de idempotência do provedor. Envio `SENDING` interrompido, tentativas esgotadas ou ambiguidade fora da janela exigem reconciliação: não se repete automaticamente um envio que possa já ter sido aceito. `reconciliationRequired` aparece no retorno e no log do cron.
