# Cemitérios — preparação e roteiro de homologação

## Fonte e escopo

`Termo de Referencia/Checklist real POC MÓDULOS EXECUTIVO e CAMARA.pdf`, páginas 192–194, **26 itens**. Plano: `PLANO_CEMITERIOS_CHECKLIST_POC_192-194.md`. A cobertura do plano foi conferida diretamente contra o PDF; implementação/testes não equivalem a aprovação pela comissão.

## Preparação controlada

- Rota principal `/cemiterios`; preservados `/tributacao/cemiterios` e `/cemiterios/comprovante/[code]`.
- A abertura da página deixou de executar `ensureS9Defaults`: nenhuma pessoa, cemitério ou taxa demonstrativa é criada pelo GET.
- As novas migrations são aditivas. Os registros legados são preservados; constraints `NOT VALID` permitem sua revisão dirigida e protegem novas gravações. Históricos passam a ser append-only.
- Para consultar/aplicar **somente** as migrations novas deste módulo: `npx tsx scripts/deploy-cemetery-migrations.ts` / acrescentar `--apply`. O script confere checksums e usa transação, sem aplicar migrations das outras frentes.
- Estrutura demonstrativa explícita: `npx tsx scripts/seed-cemetery-demo.ts`; acrescentar `--apply` para persistir. Identificadores e nomes são sintéticos, o reenvio preserva registros já existentes. O seed não cria usuários Firebase, permissões, óbitos, cobranças nem baixas.
- Permissões operacionais: `CEMITERIOS` para leitura, operações específicas para criar/editar e `issueReports` para relatórios. Upload próprio da ficha usa GED sem exigir acesso geral a Documentos; selecionar/vincular documento GED externo exige permissão do GED e conserva seus controles de download.

## Dados para demonstrar

1. Dois cemitérios, quadras, dois lotes por cemitério, sepulturas/covas e um lóculo, proprietários vinculados ao Cadastro Único.
2. Coveiro, capela com pessoa e responsável, funerária pública/privada, ossuário e causas.
3. Campo adicional textual e numérico para lote e sepultura; preencher, editar, inativar e reabrir.
4. Pessoa física identificada, declarante distinto, caso não identificado e sepultamento de membro como jornadas distintas.
5. Regra de aquisição de lote e de sepultamento com valores/lei demonstrativos explicitamente identificados, se habilitados para a demonstração. A regra oficial deve ser fornecida/validada pelo município.

## Roteiro da POC, item a item

| Itens | Percurso e evidência esperada |
|---|---|
| 01 | Buscar contribuinte além dos primeiros 500; selecionar PF/declarante/proprietário; conferir vínculo único, reabrir e consultar no cadastro central. |
| 02–05/07 | Criar/editar/reabrir cemitério e coveiro, capela (pessoa + responsável), funerária (pública/privada), ossuário/endereço, causa vinculada ao óbito. |
| 06/14 | Operador configura campos texto/número; cadastrar/editar valores; campos já utilizados preservam significado e histórico. |
| 08/10/13 | Lote exige identificador, cemitério, proprietário e limite; demonstrar livre/ocupado e vagas; tentativa N+1 simultânea é rejeitada. |
| 09/21 | Upload PDF/JPG/PNG na ficha de lote/sepultura e cada um dos três processos; recarregar, abrir anexo, demonstrar acesso negado a operador sem módulo. |
| 11 | Publicar fórmula vigente; aquisição/conclusão gera taxa e guia vinculadas ao fato; repetir operação sem duplicar; regra nova não altera cobrança antiga. |
| 12 | Alterar campos em lote/sepultura; histórico mostra cada campo, antes/depois, data/hora e usuário; tentativa de reescrita é rejeitada no banco. |
| 15/16 | Ativar/inativar com efeitos na disponibilidade; criar lóculo explícito com cemitério e proprietário; rejeitar proprietário ausente. |
| 17/18 | Agendar normal, membro e não identificado separadamente; exibir óbito, capela, funerária e causa; acompanhar início/finalização e imprimir comprovante. |
| 19/20 | Velório e cremação registram falecido, funerária, declarante, datas efetivas/óbito e causa; reabrir e demonstrar conclusão própria sem dupla ocupação. |
| 22 | Demonstrar oito motivos: outro lote, ossuário, exumação, cidade, cemitério, desapropriação, cremação e outros. Antes do sepultamento, operação negada. Conferir destino, ocupação e histórico. |
| 23 | Uma consulta para os três processos; cada status e todos os filtros; comparar totais e segunda/última página com dados reais, sem recorte global de 500. |
| 24 | Relatório completo por sepultamento efetivo e funerária, incluindo registros fora da primeira página; conferir PDF multipágina, limites do período e impressão. |
| 25 | Exibir débitos do declarante antes da confirmação e snapshot após reabertura; pagamento/cancelamento e dívida ativa não geram duplicidade falsa. |
| 26 | Antes da finalização não marcar espólio; finalizar pessoa identificada e conferir nome com ESPÓLIO e data exata no cadastro central. Repetição idempotente. Membro de pessoa viva não declara seu óbito. |

## Verificações automatizadas

```powershell
node --conditions=react-server --import tsx --test tests/cemetery-*.test.ts tests/s9-engine.test.ts
npm run build
```

Os testes de consultas/anexos usam o baseline completo em PostgreSQL/PGlite, Prisma real, **521 sepultamentos**, paginação de 20, filtros de causa/óbito/realização, relatórios completos, GED/idempotência, integridade de ocupação e histórico imutável. O PDF é extraído e conferido em múltiplas páginas, incluindo o último registro.

## Limites e resultados de execução

Validação técnica integrada concluída: **18 testes aprovados**, ESLint aprovado e **`npm run build` aprovado com código 0**, incluindo Prisma, TypeScript e geração das páginas. As duas migrations novas foram aplicadas e seus checksums conferidos; seed estrutural demonstrativo aplicado conforme descrito no plano.

Navegador indisponível nesta sessão: aparência, impressão e percursos autenticados ainda precisam ser demonstrados. Não criar identidade operacional fictícia para suprir isso. Parâmetros e fundamento legal das cobranças precisam da validação municipal. Esses limites impedem declarar homologação integral dos 26 requisitos somente pelos resultados técnicos.
