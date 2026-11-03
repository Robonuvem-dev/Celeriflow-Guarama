# Agendamentos Vercel — execução diária

Referência: 03/11/2026. Fonte operacional: `vercel.json`.

O plano Hobby permite **uma execução diária por cron job**. Não se trata de um único job para todo o projeto. A configuração mantém nove jobs, todos com minuto/hora fixos e frequência diária. Referência: https://vercel.com/docs/cron-jobs/usage-and-pricing.

Os horários do arquivo são UTC. A coluna municipal considera `America/Sao_Paulo` (UTC−3). No Hobby a execução pode ocorrer dentro da hora configurada, sem garantia do minuto exato; os horários abaixo são nominais.

| Rotina | Endpoint | Cron (UTC) | Horário municipal nominal |
| --- | --- | --- | --- |
| Direitos funcionais de RH | `/api/rh/processamentos-funcionais/agendamento` | `45 8 * * *` | 05h45, diariamente |
| Expiração de restrições SST | `/api/sst/restricoes/expiracao` | `0 9 * * *` | 06h00, diariamente |
| Manutenção de anexos do Portal | `/api/portal-servidor/manutencao/anexos` | `15 9 * * *` | 06h15, diariamente |
| Alertas periódicos do Controle Interno | `/api/controle-interno/agenda/alertas-periodicos` | `30 9 * * *` | 06h30, diariamente |
| Processamento de lotes tributários anuais | `/api/tributacao/lotes-anuais/processamento` | `45 9 * * *` | 06h45, diariamente |
| Expiração do cadastro econômico | `/api/tributacao/economico/expiracao` | `0 10 * * *` | 07h00, diariamente |
| Manutenção da Transparência | `/api/transparencia/manutencao` | `15 10 * * *` | 07h15, diariamente |
| Retenção de assinatura digital | `/api/assinatura-digital/retencao` | `30 10 * * *` | 07h30, diariamente |
| Worker GED/assinatura digital | `/api/assinatura-digital/ged/worker` | `45 10 * * *` | 07h45, diariamente |

## Correção aplicada no RH

- A expressão anterior `*/15 * * * *` executava a cada quinze minutos e era incompatível com o Hobby. Foi substituída por `45 8 * * *`.
- A chamada diária percorre sucessivos lotes de até vinte contratos. Não fica limitada aos primeiros vinte vínculos.
- Cada contrato é tentado uma vez por chamada diária. Falha individual não impede os demais lotes; novas tentativas conservam a idempotência dos direitos.
- O início de novos contratos é interrompido após 150 segundos, reservando até 120 segundos para a última transação e margem para concluir a resposta dentro dos 300 segundos da função.
- O retorno identifica `PROCESSED`, `ATTENTION` ou `PARTIAL`. Falhas e execução parcial retornam HTTP 503; não se presume repetição automática pela Vercel. Contratos sem sucesso são priorizados pela ausência/antiguidade do último processamento nas próximas chamadas, evitando que os mesmos primeiros vinte monopolizem os dias seguintes.
- Autenticação por `RH_RIGHTS_CRON_SECRET` ou `CRON_SECRET`, ator explícito `RH_RIGHTS_ACTOR_USER_ID` e escopos de RH/unidade continuam obrigatórios. O cron usa a referência civil municipal e não cria concessões futuras.

## Verificação

`tests/rh-daily-schedule.test.ts` confere as nove expressões diárias, percorre 198 vínculos em lotes com uma falha individual sem repetir tentativas e verifica o retorno parcial ao atingir o orçamento de tempo. A simulação de 198 vínculos verifica a orquestração, não executa concessões na base municipal.

Os nove endpoints foram inspecionados: todos possuem `GET` e autenticação técnica. Consulta à API da Vercel confirmou que o deployment Production do commit `345d8028a1141f6bb642a5b9d96f75d3a777564b` falhou especificamente pela expressão de quinze minutos do RH.

### Configuração de ambiente observada

Na inspeção de Production em 03/11/2026, `CRON_SECRET` e `RH_RIGHTS_ACTOR_USER_ID` estavam cadastrados. Não foram encontrados `SST_RESTRICTION_EMAIL_ACTOR_USER_ID`, `NOTIFICATION_SYSTEM_ACTOR_USER_ID`, `CONTROL_AGENDA_ACTOR_USER_ID`, `TAX_ANNUAL_ACTOR_USER_ID` ou `TAX_ECONOMIC_ACTOR_USER_ID`. As rotas correspondentes exigem ator configurado e podem responder com bloqueio de configuração, mesmo com a frequência diária válida. O cadastro econômico aceita o ator de lotes anuais como alternativa, mas ambos estavam ausentes.

Esta correção trata a frequência e a orquestração diária do RH; os outros agendamentos mantêm suas dependências operacionais. Não foram disparados e-mails, limpezas ou processamentos tributários para verificar as rotas. O e-mail de SST segue a configuração externa adiada.

Não há migração/schema ou alteração de tabelas visuais nesta correção. A ativação do novo agendamento ocorre no deployment Production originado do commit no GitHub.
