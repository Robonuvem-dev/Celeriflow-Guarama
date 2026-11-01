# Roteiro de homologação — CF10

Escopo: somente os 13 requisitos de Gestão de Resíduos atribuídos a Mateus. Este roteiro NÃO registra aprovação; reúne os passos e resultados esperados. Relatórios/gráficos da Sprint 02 continuam pendentes.

## Preparação

- Usar banco e instância isolados de homologação, autorizados para teste. Não aplicar a migração nem executar estes registros em produção nesta tarefa.
- Conferir o commit testado, a branch feat/cf10-cf30-cf33-mateus e a migração 20261101120000_cf10_recycling_stock nesse ambiente.
- Antes da migração, /meio-ambiente/residuos/estoque deve informar indisponibilidade sem afetar /meio-ambiente/residuos nem os cadastros. A página não executa DDL automaticamente.
- Após a migração, usar perfis representativos de consulta e operação, sem expor credenciais em evidências.
- Selecionar os cadastros autorizados para a demonstração. Não confundir dados sintéticos das fixtures automatizadas com dados reais de uma instância operacional.
- Identificar material M, tipo T, unidade U, depósitos A/B e centro C. Usar a unidade já associada a M, se houver movimentação anterior. Não somar unidades diferentes.
- Guardar captura ou vídeo, URL, perfil utilizado, instante, resultado observado e commit de cada cenário. Não marcar checkbox apenas porque existe um caminho de código.

## Cadastros e acesso

| Item | Passos | Resultado esperado / evidência |
|---|---|---|
| 10.4 | Abrir cadastros e estoque com perfil de consulta. Depois repetir com criação/edição permitidas. Conferir a recusa server-side nos testes de autorização. | Consulta disponível; criação/edição/movimentação somente nas operações autorizadas. Capturas dos dois perfis e testes associados. |
| 10.5 | Consultar, incluir e editar tipo no catálogo types; pesquisar por código/nome. | Persistência correta, identidade preservada, sem duplicidade de código normalizado. |
| 10.6 | Repetir para unidade no catálogo units; conferir a unidade usada no estoque. | Cadastro persistido; a unidade de M permanece consistente entre depósitos. |
| 10.7 | Repetir para material no catálogo materials. | Mesmo catálogo usado na entrada e no saldo; nenhum cadastro paralelo. |
| 10.8 | Repetir para depósitos no catálogo depots; conferir endereço e situação. | Depósitos A/B disponíveis para entradas enquanto ativos. |
| 10.9 | Repetir para centro/destinação no catálogo centers; conferir endereço e situação. | Somente centro ativo oferecido/aceito para a saída; endereço registrado no histórico. |

## Entradas e saldo — 10.10

1. Registrar uma coleta de M no depósito A, com origem, data, quantidade qA e observação. Na primeira entrada, informar T/U.
2. Conferir saldo inicial de A, saldo resultante e histórico da coleta, com a unidade correta.
3. Registrar uma coleta de M em B, com quantidade qB. Conferir que T/U continuam iguais.
4. Conferir saldos A/B e total de M em todos os depósitos. Sem saldo anterior, total esperado = qA + qB; se houver saldo anterior no ambiente de teste, incluir esse valor explicitamente na memória de cálculo.
5. Verificar paginação quando houver mais de 20 posições. O total do material deve incluir os depósitos fora da página atual.
6. Testar quantidade inválida e tentativa de unidade divergente; saldo/histórico não devem mudar. As fixtures também cobrem primeira entrada concorrente.

## Saída, valor e histórico — 10.11

1. Selecionar A/M com saldo e registrar saída qS para C, com valor total obtido R e data válida. qS deve ser menor ou igual ao saldo disponível.
2. Conferir redução exata de A em qS, preservação do saldo de B e redução de qS no total de M. O valor R é registro ambiental da destinação, não lançamento automático de caixa/contabilidade.
3. Conferir no histórico quantidade, valor R, centro/endereço, saldo após a operação e coletas anteriores com suas origens.
4. Alterar o nome do cadastro autorizado no ambiente de teste e confirmar que o snapshot de uma movimentação anterior não foi reescrito.
5. Tentar saída maior que o saldo, centro inativo e data anterior à última movimentação do material/depósito. Não deve surgir movimento parcial nem alteração de saldo.
6. Conferir os testes automatizados de repetição da mesma requisição, concorrência entre duas saídas e falha de auditoria. A primeira não duplica; a segunda não ultrapassa saldo; a terceira reverte a transação inteira.
7. Confirmar que o histórico não oferece edição/exclusão. Estorno vinculado ainda é uma lacuna a avaliar antes do uso definitivo; não remover a proteção do histórico nem apagar registros para corrigir dados.

## Itens da Sprint 02 ainda pendentes

| Item | Demonstração necessária antes de marcar atendimento |
|---|---|
| 10.1 | Relatório de estoque geral com tipo, intervalo, depósito e ordenação por código/descrição. |
| 10.2 | Gráfico de resultados de vendas por classe/tipo/material/depósito e período, reconciliado com as saídas. |
| 10.3 | Histórico mensal de vendas com depósito e período, incluindo meses sem vendas quando aplicável. |
| 10.12 | Relatório analítico geral com todos os filtros e ordenações exigidos. |
| 10.13 | Relatório analítico por depósito com todos os filtros e ordenações exigidos. |

A tabela de saldo e o histórico da Sprint 01 não substituem esses relatórios/gráficos. A meta de 95% requer 13/13 no módulo; este roteiro não autoriza concluir o módulo com lacunas.
