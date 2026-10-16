# Planejamento — S8 publicação e preparação S9

Data: **11/10/2026**. Referência: [plano S1–S9](PLANEJAMENTO_ORCAMENTO_DIAGNOSTICO_ATUAL_E_PLANO_EXECUCAO.md).

**S8: código e testes técnicos de publicação/transição concluídos nos cenários descritos. Implantação operacional ainda pendente. S9: controles/roteiros preparados e smoke público executado; aceite autenticado dos 198 IDs não executado.**

## 1. Publicação rastreável

- `publication.ts` preserva artefato PDF/CSV por snapshot/formato e publica apenas após upload e leitura de confirmação do **SHA-256 dos bytes**.
- Arquivo público e download interno passam a usar os mesmos bytes arquivados. Hash do arquivo e hash do dataset são campos distintos.
- Regras: autoridade de Planejamento, autorização Transparência, escopo de todas as peças/unidades do snapshot, situação legal PUBLISHED, arquivo verificado. Rascunho/escopo parcial não é publicado.
- Estado PENDING/ARCHIVING/FAILED/PUBLISHED/WITHDRAWN, tentativas, lease/token/expiração, arquivo, data, solicitante/fundamento e eventos imutáveis. Falha não anuncia publicação concluída; retry mantém identidade e reaproveita arquivo já arquivado.
- Retirada remove disponibilidade pública, preservando evidências e artefato. Documento retirado não volta a ser publicado silenciosamente; emitir nova versão.
- Emissão possui opção de publicação simultânea; falha preserva o snapshot interno e informa estado FAILED, com caminho de retry na seção **Publicações** das duas jornadas.
- Publicação é explicitamente **REVIEW_COPY**, mantendo NOT_STATUTORY e referência de conferência. O sistema não promove a homologação de layout pelo simples fato de expor uma URL.
- Nova consulta pública `/portal/planejamento`; APIs `/api/transparencia/planejamento` e `/api/transparencia/planejamento/[publicKey]`; link no Portal da Transparência. Listagem paginada 20 e projeção sem URL privada/ID interno do snapshot.
- Migration `20261011220000_planning_publication`, aplicada somente nas bases isoladas: identidade/arquivo preservados, eventos imutáveis e constraints de publicação completa.

## 2. Transição do legado

- Tela antiga Financeiro/Planejamento exclui peças adotadas das árvores PPA/LDO/LOA. Usuário não administrador é orientado às jornadas por entidade; legado sem vínculo de ente não é exposto como consulta indiscriminada.
- Mutadores de programa/ação/objetivo/indicador/meta, criação de LDO/LOA sob pai adotado, dotação/CMD/MBA antigos recebem guarda de ownership. Retornos/assinaturas dos consumidores existentes foram preservados.
- Comparativo legado recusa LOA ambígua no exercício e peça já adotada. Para fluxo legado único, créditos usam efeito líquido dos itens (acréscimos menos anulações), não soma bruta do lote.
- Não houve reset/desfazimento de dados ou reescrita de migrations existentes.

## 3. Verificações técnicas

- **23 testes/cenários em PostgreSQL local real aprovados**, zero falhas/skips: S1=5, S2=9, S3–S7=5, S8=4.
- **43 regressões aprovadas**, zero falhas. Total nas duas suítes: **66**.
- S8 comprova PDF idêntico privado/HTTP público, hash, projeção pública, replay, retirada, falha de sondagem/retry, lease de upload, recusa de permissão/escopo/situação e editor legado em peça adotada.
- Storage dos cenários é adaptador controlado. Teste HTTP usa o handler público real com DB local; não comprova comunicação com o storage operacional nem publicação de arquivo oficial homologado.
- Prisma validate/generate, TypeScript, lint direcionado e build seguro aprovados; **59 páginas estáticas**.
- Smoke GET-only da aplicação **Next compilada** (`scripts/verify-planning-public-next.mjs`) aprovado:
  - API pública responde sem sessão;
  - página pública responde sem sessão;
  - `/planejamento` no host administrativo sem sessão redireciona ao login;
  - zero registros públicos na instância configurada, coerente com ausência de tabelas/peças.
- Aviso de depreciação `pg` não impediu conclusão dos testes.

```powershell
node scripts/verify-planning-postgres.mjs tests/planning-publication.test.ts tests/planning-completion.test.ts tests/planning-accounting.test.ts tests/planning-execution.test.ts
node scripts/verify-planning-public-next.mjs
node --conditions=react-server --import tsx scripts/verify-planning-readiness.ts
```

O primeiro comando usa o backend local temporário documentado em S2. Os dois últimos são GET/SELECT-only; não fabricam sessão nem carregam base fictícia operacional.

## 4. Diagnóstico operacional concreto

`npx prisma migrate status`: **68 migrations locais**, três pendentes:

1. `20261011200000_planning_accounting_command_integrity`.
2. `20261011210000_planning_catalog_maintenance`.
3. `20261011220000_planning_publication`.

Readiness read-only: módulos PLANEJAMENTO/CAMARA/FINANCEIRO/DOCUMENTOS/TRANSPARENCIA ativos; storage configurado; **0 instrumentos, 0 implantados, 0 catálogos publicados**. Tabelas do catálogo e publicação ainda ausentes. Nenhuma migration foi aplicada à instância configurada nesta execução.

## 5. S9 — evidências individuais e bloqueio

Preparados:

- [Controle/roteiros de ensaio](EVIDENCIAS_PLANEJAMENTO_ORCAMENTO.md).
- [Prefeitura: 99 IDs](EVIDENCIAS_PLANEJAMENTO_PREFEITURA.md).
- [Câmara: 99 IDs](EVIDENCIAS_PLANEJAMENTO_CAMARA.md).

Sequências 1–99 conferidas, com resultado independente por ente. **Todos permanecem NÃO_EXECUTADO no ensaio autenticado**, sem promoção automática por código, testes ou smoke público.

Para executar S9 integralmente: instância isolada de aplicação com migrations e dataset/ciclo configurados; tabela/layouts oficiais aplicáveis; regras contábeis/perfis e autenticação normal para proponente/aprovador/sancionador/consulta/financeiro; storage/provedor do ensaio. O banco configurado não possui o ciclo e não foi fornecida sessão/instância autenticada de ensaio.

**Próximo trabalho:** preparar essa instância isolada e executar cada roteiro/subcritério em ambas as jornadas, registrando evidência, commit/data/executor e resultado. O diagnóstico atual impede declarar 99/99 ou o módulo integralmente homologado.
