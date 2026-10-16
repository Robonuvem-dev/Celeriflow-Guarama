# Planejamento — execução contínua S3 a S7

Data: **11/10/2026**. Pedido: executar S3–S7 em sequência. Referência: [plano de retomada](PLANEJAMENTO_ORCAMENTO_DIAGNOSTICO_ATUAL_E_PLANO_EXECUCAO.md).

**Estado: implementações e verificação técnica dos blocos abaixo executadas.** Esse estado não homologa tabelas/layouts oficiais nem conclui os 99 aceites por ente. As configurações institucionais, materiais normativos e ensaio autenticado permanecem explicitados na seção 7. Dados de fixture não são dados oficiais.

## 1. S3 — classificação, graus e códigos

- `classification.ts`: importação de CSV com cabeçalho definido, aspas/escape, limite, árvore, pai/grau, duplicidade, fonte TCE/STN e versão por exercício/referência/hash. Importação em batches preserva IDs canônicos; não renomeia silenciosamente classificações antigas.
- Publicação interna da edição exige autoridade e preserva versão/entradas no SQL. Não equivale à homologação da tabela pelo TCE/STN.
- Grau independente da despesa (`expenseDegree`), versão normativa selecionável e orçamento PPA/LDO só por fonte; LOA continua exigindo elemento para executar dotações.
- Cada linha preserva a classificação e caminho da árvore selecionados. Fonte vinculada por instrumento; emissão por grau usa a árvore preservada quando disponível.
- Código reduzido composto de unidade (órgão/unidade), função/subfunção, programa/ação, ano e sufixo único, sem trocar os IDs de consumo financeiro. Gestão/reordenação existente permanece antes da execução.
- Nova área `/planejamento/cadastros/versions` e equivalente da Câmara, com tabela de edições/árvore e paginação 20. Classificações carregadas neste teste são da base isolada; as tabelas oficiais do ente ainda devem ser fornecidas/importadas.

## 2. S4 — elaboração e manutenção

- Novo serviço `maintenance.ts` e seção **Manutenção** nos detalhes das duas jornadas.
- Configuração da peça; programas; ações; múltiplos objetivos/indicadores; previsões em elaboração; memórias; renúncias; prioridades/riscos LDO; programas anuais; obras/conservação.
- Alteração/exclusão de original com histórico/execução é recusada. Alterações compartilhadas da estrutura de programa verificam todas as peças afetadas, locks ordenados, autoridade/dados legais e snapshots antes/depois. Código de programa/ação fechados permanece preservado.
- Delete de elaboração confere vínculos/dependências. Revisão numérica/esperada previne edição desatualizada.
- Obras recebem início, valor anual, conservação e novos projetos. Valores antigos sem campos completos permanecem identificados como legado; não se inventa data de início.
- Seletores de entidades/UG/fontes/naturezas/programas/ações/objetivos/previsões/documentos/assinantes passam a pesquisar no servidor, com página 20 e seleção preservada. Editores são abertos por registro; não se substituem escolhas por IDs técnicos/JSON.
- `lookups.ts` aplica escopo antes de count/consulta e verifica permissões especiais para assinantes e Câmara.

## 3. S5 — importações e virada

- Ano da origem separado do destino; PPA não é comprimido automaticamente de quatro anos em um. Valores originais ou atualizados são escolhas explícitas.
- Modo REALIZED exige LOA imediatamente anterior, com estágio EMPENHADA ou PAGA_BRUTA. O bruto é distinguido da tesouraria líquida e inclui estornos vinculados.
- Prévia apresenta quantidade/totais/conflitos e até 20 registros de resumo; seleção de previsões é pesquisável. Execução compara revisões e hash dos valores apresentados. Mudança do realizado desfaz o lote inteiro.
- Lote mantém ano, estágio, posição, revisões, seleção, hash e mapa de origem. Replays não duplicam; definições divergentes de programas/ações não são sobrescritas; reutilização do destino é escolha explícita.
- Importação independente de programas/objetivos/indicadores/ações e vínculos de fontes, sem exigir redigitar previsões.
- Virada copia vínculos e programas anuais além de regras/programação. Reclassificação usa a edição de destino. Resumo identifica o que não é copiado: atos, assinaturas, eventos/realizados, bloqueios/fechamentos, credenciais/permissões e dados próprios de outro exercício.
- Histórico ausente/ambíguo não vira previsão zero. Reconciliação de bases anteriores e particularidades de códigos continuam requisitos de implantação/ensaio com dados reais.

## 4. S6 — GED e Câmara

- POST de arquivo nas duas jornadas: `/planejamento/documentos/enviar` e `/camara/planejamento/documentos/enviar`, com autorização prévia e limite de arquivo.
- Reutiliza upload privado e `ingestGedDocument`; Documento, versão/hash e vínculo são criados na mesma transação. Falha no DB tenta remover o blob recém-enviado, sem remover arquivos anteriores.
- Classes de Planejamento e ownership por entidade; documentos clínicos/pessoais não são reutilizados. Documento de peça inteira exige acesso às unidades do ente.
- Versão vinculada fica preservada, assinatura exige essa versão e os seletores não se limitam aos primeiros 20/100 registros. Endpoint genérico `/api/download` também verifica os proprietários de Planejamento e encaminha ao download com hash, evitando bypass por URL.
- Novo `legislative-bridge.ts`: vínculo a `CamProposicao`/`CamLei`; análise/pauta/aprovação/rejeição/sanção/publicação com os registros canônicos, referências, auditoria, datas e segregação de responsáveis.
- Workflow orçamentário confere a aprovação/lei/publicação quando houver vínculo legislativo. Snapshots preservam o estado legislativo do vínculo.
- Teste do ingresso usa adaptador de storage controlado, com bytes/hash reais e transação GED real. **Não comprova comunicação com o storage operacional/provedor de assinatura nem upload autenticado em navegador**; isso exige configuração/ensaio S8/S9.

## 5. S7 — relatórios, memórias e renúncia

- Catálogo passa de 37 para **38 entradas**, com RCL executada de doze competências separada da projeção.
- RCL executada: composição/exclusões configuradas, escopo do ente, origem única de tesouraria, receitas redutoras/estornos, memória por competência e confirmação de fechamento/histórico dos doze meses. Sem confirmação, retorna INCOMPLETE/não apurado.
- Renúncia liga tributo/ano/ente à concessão tributária de origem conhecida; soma `renunciationDecimal`, sem confundir crédito/redução do contribuinte com renúncia. Origem não reconciliada/sem autorização não é somada como zero.
- Realizado tributário sincronizado preserva corte/hash das origens e histórico de peça fechada. Saída de versão antiga utiliza valor preservado, não consulta atual silenciosamente.
- Projeções anuais mantêm base, taxas por exercício, fórmula, arredondamento, origem/hash e resultados cumulativos. Histórico anual incompleto exige base informada com premissas ou exercício finalizado.
- Relatório de obras contém os campos completados em S4; memórias são anualizadas; confronto/consolidação e metas físicas agregam corretamente o recorte solicitado; natureza da despesa explicita categoria/grupo/modalidade/elemento.
- Configuração de modelo normativo referencia **versão GED/hash** e preserva título/notas/referência por relatório. Isso documenta o modelo recebido; não valida automaticamente sua geometria/cálculo oficial.
- Saídas mantêm **INTERNAL_REVIEW/NOT_STATUTORY** até conferência normativa e aceite específico. Não foi removido o aviso como substituto de homologação.

## 6. Verificação

- **19 cenários/testes aprovados em PostgreSQL local real**: cinco S1, nove S2 e cinco agregados S3–S7. Zero falhas/skips na rodada indicada.
- **43 regressões aprovadas**, zero falhas: Planejamento, GED, Compras, Financeiro e indicadores. Total de **62** nas duas suítes/rodadas, não percentual de aceite contratual.
- Prisma validate/generate, ESLint direcionado e TypeScript aprovados.
- Build completo aprovado, **59 páginas estáticas**, com `VERCEL_ENV=development`.
- `git diff --check` aprovado; avisos de conversão LF→CRLF são de formatação Git.
- Migration aditiva **`20261011210000_planning_catalog_maintenance`** aplicada somente às bases isoladas. Schema/migrations RH preservados por este bloco.
- Aviso de depreciação do adaptador `pg` não impediu os testes.

```powershell
node scripts/verify-planning-postgres.mjs tests/planning-completion.test.ts tests/planning-accounting.test.ts tests/planning-execution.test.ts
node --conditions=react-server --import tsx --test --test-concurrency=1 --test-reporter=spec tests/fleet-indicators.test.ts tests/planning-domain.test.ts tests/planning-operations.test.ts tests/planning-postgres.test.ts tests/public-finance.test.ts tests/procurement-finance-bridge.test.ts tests/document-flow.test.ts tests/construction-documents-service.test.ts
```

O primeiro comando requer o PostgreSQL local temporário descrito no registro S2. As suítes não usam o banco operacional.

## 7. Dependências e aceite ainda necessários

| Requisitos afetados (ambos os entes) | Dependência concreta | Evidência de encerramento |
|---|---|---|
| 4/5/8/32–34/56–58/66/76/97 | Edições aplicáveis das tabelas TCE/STN/MCASP, vínculos e códigos de consignação do ente | Importação oficial e conferência por exercício/classificação |
| 27/31/47/51–54/85/98 | Modelos aplicáveis STN/TCE e anexos 4.320, composições fiscais e particularidades Câmara | Validação de cada saída/variante e memória conforme modelo recebido |
| 13/29/31/60/90 | Histórico reconciliado, fechamentos dos doze meses RCL e realizados anuais anteriores | Valores e origem conciliados; base faltante não é inferida |
| 2/55/77/82 e emendas | Classes/documentos finais, storage e política/provedor de assinatura do ato | Upload/download/assinatura autenticados com arquivo preservado |
| 99 | Atos de benefício, origens tributárias reconciliadas e compensação/metodologia aprovada | Previsão/realizado e compensação conferidos sem dupla contagem |
| Todos | Migrations/perfis/configuração e ensaio por ente | S8 operacional e S9 com evidência individual EXE/LEG |

**Próxima frente:** S8 (publicação/transição/configuração) e S9 (ensaio/aceite). Permanecem separados dos blocos de código: aplicação operacional das migrations, carga de materiais oficiais, certificação de leiautes e ensaio de 99/99 Prefeitura e 99/99 Câmara. Sem esses resultados, não anunciar o módulo integralmente homologado.
