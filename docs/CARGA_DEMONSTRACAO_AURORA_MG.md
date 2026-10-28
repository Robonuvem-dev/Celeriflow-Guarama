# Base de demonstração — Aurora das Veredas/MG

## Execução de 27/10/2026

Carga aplicada ao Neon configurado em `.env.local`, banco `neondb`. Município fictício de referência com aproximadamente 50 mil habitantes. Os registros são uma **amostra para demonstração**, não uma reprodução quantitativa de toda a população, quadro de pessoal ou rede de serviços desse porte.

A prefeitura cadastrada pelo responsável foi preservada, sem criar outra `Institution`. Pessoas, endereços, documentos, identificadores de frota, preços e quantidades são fictícios. Nomes de medicamentos, categorias de materiais e modelos de veículos correspondem a produtos e modelos reais. E-mails usam domínio reservado `.example`.

## Inventário antes e depois

| Indicador | Antes | Depois |
|---|---:|---:|
| Tabelas | 995 | 997 |
| Tabelas com registros | 15 | 173 |
| Tabelas vazias | 980 | 824 |

Foram acrescentados **3.009 registros**, incluindo a migração e os registros de auditoria. As duas novas tabelas são `FleetDebtPayment` e `FleetDebtSettings`, implantadas pela migração `20261021160000_complete_fleet_debt_control`, já existente na outra trilha de migrações do projeto e agora incluída em `migrations-ibema`.

## Principais cadastros disponíveis

| Cadastro | Quantidade |
|---|---:|
| Prefeitura (`Institution`) | 1 |
| Secretarias e diretoria administrativa da Câmara | 13 |
| Departamentos | 33 |
| Unidades administrativas | 16 |
| Centros de custo | 16 |
| Pessoas físicas | 240 |
| Endereços de pessoas e empresas | 260 |
| Servidores | 198 |
| Cargos | 29 |
| Empresas / fornecedores / credores | 20 de cada |
| Contribuintes | 40 |
| Imóveis | 20 |
| Materiais, incluindo medicamentos | 120 |
| Almoxarifados e depósitos | 8 |
| Posições de estoque e movimentos iniciais | 154 de cada |
| Apresentações de medicamentos | 44 |
| Lotes de medicamentos | 88 |
| Unidades de frota | 30 |
| Bens patrimoniais | 40 |
| Planos de manutenção de frota | 30 |
| Obrigações de licenciamento de veículos | 23 |
| Escolas / turmas / alunos matriculados | 3 / 6 / 20 |
| Unidades de saúde / pacientes / agendamentos | 3 / 20 / 20 |
| Unidades de assistência / famílias sociais | 2 / 10 |
| Processos administrativos / chamados | 20 de cada |
| Solicitações / processos de compra | 20 / 10 |
| Dotações orçamentárias ilustrativas | 45 |

Também foram incluídos registros de cultura, obras, saneamento, meio ambiente, segurança, Câmara, planejamento plurianual, atendimento e portal.

### Exemplos

- Pessoa: Bruna Almeida, vinculada a cadastro e servidor.
- Endereço: Rua Amarelo, 120, usado no almoxarifado central.
- Almoxarifado: papel A4, canetas, produtos de limpeza, arroz, feijão, cimento, tubos PVC, EPIs, pneus, baterias e combustíveis.
- Farmácia: paracetamol, dipirona, amoxicilina, losartana, metformina e outras apresentações; saldos divididos entre estoque central e dispensação em UBS, com lotes e validade.
- Frota: Fiat Argo, Chevrolet Spin, Fiat Ducato Ambulância, Renault Master, Mercedes-Benz Sprinter, ônibus escolares, caminhões, retroescavadeira JCB 3CX, motoniveladora Caterpillar 120K e tratores. Há 23 veículos, seis máquinas e uma roçadeira.

## Conferências executadas no Neon

As nove verificações abaixo passaram:

1. Prefeitura original preservada e única em `Institution`.
2. Estoques sem saldos negativos.
3. Saldo de cada medicamento igual à soma dos lotes e das posições do material correspondente.
4. Saldos de materiais conciliados com os movimentos de abertura.
5. Todas as unidades de frota vinculadas a patrimônio existente.
6. Secretarias e departamentos dos novos servidores coerentes entre si.
7. Total da folha de demonstração igual à soma dos itens.
8. Lotes de medicamentos com validade futura.
9. Dotações ilustrativas totalizando R$ 240 milhões.

A reexecução da carga complementar manteve as quantidades. O teste `tests/municipal-system-dataset.test.ts` também passou, incluindo preservação da instituição cadastrada e repetição sem duplicação da carga geral.

## Abrangência e pendências

**Não foram preenchidas todas as tabelas do sistema.** As 824 tabelas vazias incluem operações especializadas e fluxos ainda não demonstrados. Exemplos: arrecadação e execução contábil, liquidações e pagamentos, dispensações, vacinação, exames, folha calculada pelo motor RH, cemitérios e processos de construção civil. O inventário não representa aceite de todos os módulos.

A folha criada está aberta e contém somente salários-base fictícios de 180 servidores; não é uma folha fiscal completa. As contas bancárias são ilustrativas, sem saldo ou conexão bancária. O orçamento é uma referência sintética; não representa LOA aprovada nem foi integralmente vinculado aos instrumentos formais de planejamento.

As referências históricas de Ibema/PR em `GovernmentEntity`, `State` e `City` foram preservadas. As novas unidades de planejamento usam as entidades de Aurora. O município fictício usa `DEMO-AV-MG` no campo obrigatório de código, sem atribuir-lhe código IBGE oficial.

## Scripts e reprodução

```powershell
npx prisma migrate deploy
node --conditions=react-server --import tsx scripts/seed-municipal-system.ts --apply
node --conditions=react-server --import tsx scripts/seed-municipal-demo.ts --apply
```

Sem `--apply`, os scripts exibem a prévia. A carga complementar usa IDs determinísticos, transação por etapa, trava e marcador de auditoria; etapas concluídas são recuperadas sem inserir novamente nem restaurar saldos posteriormente movimentados.

Os inventários detalhados e os resultados locais foram salvos em `.next/cache/data-review/`: `neon-inventory-before.json`, `neon-inventory-after.json` e `municipal-demo-result.json`. Esse diretório é cache local, não um backup permanente do banco.

## Complemento: responsáveis das secretarias e BI

A migração `20261027200000_secretariat_employee_manager` foi aplicada no Neon. O responsável passou a ser uma relação com `Employee`, com seleção de servidor ativo, cargo ativo e lotação na secretaria. O nome legado permanece disponível para compatibilidade. Inativação do responsável, transferência para outra secretaria ou inativação de seu cargo exigem a substituição do vínculo.

A carga `scripts/seed-secretariat-leadership.ts` designou servidores fictícios já existentes para as 12 secretarias e a diretoria administrativa da Câmara, com cargos de secretário municipal ou diretor administrativo. Cada designação tem marcador de auditoria; a reexecução preserva designações concluídas e responsáveis já definidos. Os nomes atuais das secretarias foram preservados.

Após o complemento, foram conferidos **13 responsáveis válidos, 198 servidores ativos, 34 departamentos e 16 unidades**. Foi criado um departamento de gabinete para completar a lotação de Governo e Planejamento. As seis demandas internas existentes estavam abertas na conferência; os indicadores refletem esses registros, sem simular movimentações adicionais.

```powershell
node --conditions=react-server --import tsx scripts/seed-secretariat-leadership.ts
node --conditions=react-server --import tsx scripts/seed-secretariat-leadership.ts --apply
```

O painel está disponível em `/administracao` e `/administracao/indicadores`, com seleção de prefeitura inteira ou secretaria, indicadores de pessoal e estrutura, distribuição de equipes, situação e evolução mensal de demandas internas e comparativo paginado. A estrutura usa o cadastro atual; as demandas consideram o histórico total, e a evolução mostra as entradas dos últimos seis meses. Demandas canceladas são incluídas nas finalizadas, conforme legenda.

Exportações da seleção: Excel com cinco planilhas, CSV do comparativo, pacote ZIP de CSVs e consulta Power Query para importar no Power BI e impressão da tela em uma página A4 paisagem com opção de salvar em PDF. As exportações tabulares incluem todas as páginas do comparativo selecionado.

Foram verificados os 14 escopos de consulta (consolidado e 13 unidades), 39 exportações no Neon e 24 combinações de resolução e seleção no navegador com os componentes renderizados e interativos, sem estouro da área disponível. Os testes de vínculo e de exportação também passaram. O PDF foi gerado e conferido em uma página.
