# Retornos recebidos por comando — Aurora das Veredas

Execute em **RH/Folha > eSocial > Retornos** o botão `Simular recebimento do eSocial`.

- `00-configuracao-comando.json`: configuração, lotes, permissões esperadas e valores de referência.
- `01-recepcao.xml`: protocolo de recepção. Não é recibo de aceite.
- `02-consulta-pendente.xml`: resposta `101` de consulta ainda não processada.
- `03-retorno-remuneracoes.xml`: S-1200 -> S-5001 + S-5003; S-1202 sem retorno S-5001 fora da condição informada.
- `04-retorno-pagamentos.xml`: S-1210 -> S-5002.
- `05-retorno-fechamento.xml`: S-1299 -> S-5011 + S-5012 + S-5013.
- `06-retorno-rejeicao.xml`: rubrica inválida `401` e SEM recibo/totalizador.
- `07-payloads-normalizados.json`: mesmo cenário em modelo de dados para as telas e testes.

**IMPORTANTE**: arquivos ilustrativos em namespace `urn:celeriflow:esocial:demo`. Usar como fixtures e converter para formato interno; não validar contra o XSD oficial nem apresentá-los como documentos oficiais. A interface de produção real usará schemas e certificados efetivos após a migração.

A consulta oficial é iniciada pelo sistema do empregador (pull, com protocolo). Não existe envio push espontâneo desses seis totalizadores para uma API do município. O botão simula uma consulta e a recepção da sua resposta.
