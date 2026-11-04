# Operação municipal — Assistência Social

Atualização: 01/11/2026. Complementa e substitui, quanto ao fechamento dos itens 16, 23, 33 e 35, as pendências técnicas descritas em `ENTREGA_ACAO_SOCIAL_POC.md`.

## Rotinas disponíveis

| Rotina | Acesso | Funcionamento |
|---|---|---|
| Parâmetros municipais | `/social/gestao/parametros` | Administração configura referências de renda, limites e modalidades de requisição, prazos, versão/títulos dos modelos e canal SMS. Revisões concorrentes são rejeitadas. |
| Prontuários | `/social/gestao/prontuarios` | Identificação individual/familiar, ingresso, condições de vida, rede, proteção, diagnóstico, plano, revisão e encerramento. Sigilo por unidade, profissional e nível do registro. Emissão pelo detalhe do prontuário. |
| Documentos | `/social/gestao/documentos` | Modelos próprios CelerFlow: prontuário, PAF, PIA, requerimento, parecer, comprovantes, encaminhamento e contrarreferência. Rascunhos editáveis; conteúdo e versão preservados após emissão. |
| Registro mensal | `/social/gestao/mensal` | CRAS/CREAS por competência. Indicadores calculados, informados ou não informados são distinguidos. Sem preenchimento automático de zero para ocorrências desconhecidas. Fechamento exige todos os indicadores e valida totais. Revisões preservam a apuração anterior. |
| Layouts cadastrais | `/social/gestao/layouts` | Administração define separador, codificação, datas e associação de colunas/constantes. Alteração cria nova versão e preserva o identificador dos lotes anteriores. |
| Importação | `/social/importacoes` | CSV/TXT tabular, até 5 MB/5.000 pessoas, com prévia e erros por linha/família. CPF obrigatório, NIS opcional. Aplicação atômica, conciliação cadastral e repetição idempotente. |
| SMS | `/social/gestao/comunicacoes` | Preparação por programa, processamento limitado e consulta ao canal. Não considera aceitação como entrega e não repete automaticamente envio de resultado incerto. |

Prontuário e relatórios mensais são modelos municipais próprios, orientados pelas referências públicas abaixo. A operação não transmite RMA nem importa automaticamente qualquer formato federal: arquivos tabulares exigem layout compatível/configurado.

## SMS

O padrão inicial é `QUEUE`: prepara a demanda e não transmite mensagens. Para ativar:

1. Selecionar `SMSGATE` ou `TEXTBELT` nos parâmetros municipais e configurar os limites.
2. Definir no servidor a variável indicada por `smsCredentialReference`, por padrão `SOCIAL_SMS_CREDENTIALS`.
3. Para SMSGate, fornecer JSON com `username`/`password` ou `token`; para Textbelt, JSON com `apiKey`.
4. Processar a fila e consultar a situação. `UNKNOWN` exige conciliação antes de qualquer decisão sobre reenvio.

SMSGate oferece software/API Android gratuitos, mas exige aparelho ligado, conectividade e chip/plano SMS. A operadora pode cobrar ou limitar o volume. Textbelt possui cobrança e sua chave gratuita limitada não equivale a serviço municipal ilimitado. Nenhum envio externo foi realizado nesta atualização por falta de configuração do canal.

## Banco e inicialização

Migração aplicada pela autoridade SQL do repositório: `20261101200000_social_municipal_operation`. As migrações históricas foram preservadas.

```powershell
node scripts/normalize-municipal-presentation.mjs
node scripts/normalize-municipal-presentation.mjs --apply
node --conditions=react-server --import tsx scripts/initialize-social-municipal-models.ts --apply
```

A normalização usa valores exatos revisados por campo. Foram aplicadas **1.174 correções de campos**, incluindo o arquivamento de quatro documentos de verificação. Valores anteriores permanecem na tabela privada `MunicipalPresentationRevision`; arquivos, hashes, assinaturas e trilhas anteriores foram preservados. Números civis/profissionais sem documentação foram removidos, sem inventar substitutos.

A inicialização criou **25 prontuários** a partir dos acompanhamentos existentes e **dois registros mensais em elaboração**, além dos parâmetros e do layout municipal. Seções sem fonte permanecem não informadas. A inicialização não recria registros já existentes.

Identificações e conteúdo de evidências históricas de verificação continuam nos originais preservados. Essa atualização não converte a origem dos dados previamente carregados em documentação oficial municipal.

## Verificação

- Build integral de produção aprovado, incluindo a verificação TypeScript em 16 partições.
- 28 testes Social aprovados: acesso/sigilo, benefícios/estoque, cadastros, modelos, importação, mensal, SCFV, relatórios e SMS.
- ESLint aprovado no escopo Social revisado.
- Navegador autenticado: nove telas com HTTP 200, sem erros de aplicação, transbordamento horizontal ou rótulos de apresentação da carga; abertura dos cinco novos formulários aprovada.
- Exportações de prontuário e mensal em CSV, PDF e XLSX: seis respostas HTTP 200 com arquivos gerados.
- Reexecução da inicialização: zero prontuários/relatórios duplicados; prévia posterior da normalização: zero alterações pendentes das regras revisadas.
- Plano de migrações confirmado: 187 registradas e nenhuma pendente no banco configurado.
- Os adaptadores SMS foram exercitados com respostas controladas; não houve envio por operadora.

## Referências públicas

- Prontuário SUAS / catálogo MDS: https://redesuas.mds.gov.br/prontuario-suas/documents
- Manual do Prontuário SUAS (2014): https://psicologianosuas.com/wp-content/uploads/2015/03/manual_prontuario_suas_versao_preliminar.pdf
- Prontuário eletrônico SUAS: https://social.rs.gov.br/upload/arquivos/202205/03120419-prontuario-eletronico-do-suas.pdf
- Encaminhamento CRAS: https://www.campinadalagoa.pr.gov.br/documentos/arquivos/FICHA%20ENCAMINHAMENTO%20CRAS.pdf
- Orientações RMA: https://www.sigas.pe.gov.br/files/02052024120223-boletim.01.2024.duvidas.rma.final.pdf
- Painel CREAS: https://paineis.mds.gov.br/public/extensions/Painel_RMA/CREAS.html
- SMSGate: https://docs.sms-gate.app/features/sending-messages/ e https://docs.sms-gate.app/features/status-tracking/
- Textbelt: https://docs.textbelt.com/
