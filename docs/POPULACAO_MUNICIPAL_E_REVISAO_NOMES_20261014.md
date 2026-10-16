# População municipal e revisão geral de nomes

## Estado da execução

A carga foi aplicada no banco compartilhado, com dados de referência plausíveis autorizados pelo responsável. A conferência inicial abrangia **871 tabelas**, das quais **143** possuíam registros. A conferência posterior passou a **297 tabelas com registros e 574 vazias**.

**A população literal de todas as tabelas ainda não está concluída.** A relação completa, com quantidade de registros e relações obrigatórias, está em [COBERTURA_TABELAS_DADOS_20261014.md](COBERTURA_TABELAS_DADOS_20261014.md). Essa matriz distingue cobertura de registros de completude funcional: ter dados em uma tabela não certifica que todos os seus cenários foram executados.

## Cadastros e cenários aplicados

- 60 novas pessoas físicas, com nomes completos distintos, documentos com dígitos verificadores, datas de nascimento e contatos; filhos vinculados aos responsáveis têm sobrenomes familiares coerentes.
- 20 empresas com nomes comerciais específicos, fornecedores, credores e contribuintes vinculados às mesmas identidades.
- 18 servidores com pessoa canônica, cargo, secretaria e departamento coerentes.
- 80 endereços, bairros e logradouros; 20 imóveis vinculados aos respectivos contribuintes.
- Demandas administrativas, calendário, canais de atendimento, 20 protocolos, 20 chamados e manifestações de Ouvidoria.
- Três escolas, dois professores, 20 estudantes, responsáveis, seis turmas e 20 matrículas, acrescidos de períodos letivos, matrizes, componentes, vínculos docentes, avaliações, atividades, notas e pré-matrículas pelos scripts acadêmicos existentes.
- Acervo bibliográfico, exemplares, cardápios planejados, calendário escolar e solicitações de suporte.
- Unidades de saúde, profissionais, 20 pacientes e 20 agendamentos; áreas, microáreas, domicílios, famílias e membros vinculados às pessoas e endereços.
- CRAS/CREAS, famílias, membros, cadastros sociais, atendimentos, registros, visitas, benefícios cadastrados, organizações da rede e programas com participação das famílias.
- Empreendimentos ambientais, áreas verdes, solicitações, vistorias agendadas, campanhas educativas, manifestações, resíduos e documentos de acompanhamento.
- 20 unidades consumidoras, hidrômetros e leituras de Saneamento; ordens de manutenção, solicitações do portal e relatórios cadastrados.
- Agentes, espaços, projetos, eventos, atividades, patrimônio cultural, conselho, fundo e reservas de espaços.
- Oito obras em planejamento, 20 ordens de serviço, equipes e vínculos de executores/equipamentos com lotação coerente; guardas, ocorrências e programação de mobilidade.
- Legislatura, nove vereadores ligados às pessoas canônicas, comissões e membros, sessões agendadas, indicações, gabinetes, Mesa Diretora e pautas pendentes.
- Programação plurianual em rascunho, oito programas, objetivos, indicadores, ações e metas anuais.
- Catálogo, 20 solicitações de compras, itens, programação de necessidades, processos em planejamento, ETPs, termos de referência, pesquisas e cotações.
- Materiais, almoxarifados, categorias e bens patrimoniais; motivos de atestados, grupos de exposição e categorias do DTE.
- Páginas do portal, menus, notícias em rascunho e pedidos de informações.
- **Frota aplicada:** nove novas unidades, seis condutores, patrimônio, contratos de combustível, estoque próprio, autorizações, consumo, rotas, agenda, guarita, componentes, manutenções, apólices, licenciamento, multas, parcelas, ocorrências, sinistro e anexos privados no GED. O catálogo CTB contém 416 enquadramentos e a referência FIPE contém a amostra documentada de modelos.
- **Tributação/Contabilidade nativas:** 20 lançamentos e respectivas guias, com imóveis do mesmo contribuinte, reconhecimento patrimonial e **40 partidas balanceadas**. Principal total de **R$ 11.325,00**. Nenhum pagamento externo foi confirmado nem cobrança enviada a provedor.

Os eventos `MUNICIPAL_DATASET_POPULATED`, `MUNICIPAL_FLEET_DATASET_POPULATED` e `MUNICIPAL_TAX_CASE_POPULATED` documentam a procedência da carga. Os vínculos de imóveis acrescentados aos casos tributários foram auditados sem alterar valores nem fotografias contábeis originais.

## Nomes e versões

Nesta etapa foram executadas **415 atualizações cadastrais, envolvendo 548 campos**; essa contagem é de operações auditadas, com alguns registros revistos em mais de uma passagem.

Foram substituídos nomes, inscrições e códigos de referência antigos nos cadastros mapeados, incluindo os parâmetros de pessoal/folha, rubricas e o nome institucional que ainda continha o rótulo antigo. A alteração da localização da instância ficou restrita à identidade de referência sem CNPJ, preservando identidades institucionais documentadas.

Os 14 usuários de referência sem `firebaseUid` tiveram seus e-mails atualizados após consulta ao Firebase confirmar que não havia conta com o endereço antigo. Contas autenticáveis existentes, UIDs, permissões e senhas não foram alterados. As novas contas operadoras de Frota permanecem disponíveis para provisionamento pela rotina normal de usuários.

- **Planejamento:** cinco novas versões, com 255 entradas; quatro preservam o estágio de rascunho e uma preserva a publicação da edição de referência. Edições antigas e suas entradas foram conferidas por hash antes/depois.
- **Construção Civil:** 11 novas versões de modelos, checklists, instruções, termo e zoneamento. O imóvel de referência passou à edição equivalente de zoneamento; versões anteriores foram preservadas integralmente.
- Revisões de apresentação de catálogos mantêm permissões de escrituração, alcance de ente/UG, vigência e indicadores de procedência. A seleção contábil trata a revisão sem sobrepor duas edições e preserva a leitura histórica anterior à data de revisão.
- Nomes plausíveis foram incorporados às origens de carga P0, Cemitérios, Frota e RH, mantendo as chaves legadas necessárias ao cálculo, ao replay e aos históricos.

Os domínios de contato `.example` são reservados. A aparência de cadastro operacional não transforma referências em documentos oficiais ou confirmações externas. Identificadores técnicos, referências em históricos, nomes de arquivos arquivados e expressões legítimas de fontes oficiais podem continuar contendo termos encontrados pelo scanner.

## Integridade e verificação

- Carga modular com IDs determinísticos, `createMany` aditivo e transação por conjunto; reexecução dos conjuntos aplicados não duplica registros.
- Atualizações de nomes usam modelos/IDs/campos explicitamente mapeados. Valores personalizados são preservados; correções de nomes repetidos exigem o valor original esperado.
- Fotografias completas dos registros detectam edições concorrentes e alterações fora do escopo.
- Teste PostgreSQL isolado: preservação de cadastro preexistente, reexecução, 60 nomes distintos, identidade compartilhada, matrícula/turma/escola, familiares, leituras e rollback de transação inválida.
- Testes de revisão de catálogo: seleção histórica, edição atual única, preservação de autoridade/alcance e precedência da adoção municipal existente.
- Três testes integrados de Frota aprovados, incluindo carga repetida, 416 enquadramentos, saldos, débitos e dossiê.
- 19 testes de cálculo RH e o teste integrado de RH com preparação/replay/fechamento aprovados.
- Verificador do banco atual aprovado: identidades, lotações, vínculos de Educação/Saúde, leituras, equipamento/setor e os 20 casos tributários com partidas balanceadas.
- ESLint e TypeScript direcionado dos scripts aprovados. `npm run build` aprovado com as quatro partições de verificação de tipos.
- Prévia da atualização geral de nomes após aplicação: zero alterações e zero valores personalizados pendentes no conjunto mapeado.

## Comandos operacionais

```powershell
# Checkup somente leitura e matriz completa
node --import tsx scripts/checkup-system-data.ts --summary --write-report
node --import tsx scripts/checkup-system-data.ts --inspect=ConfiguracaoInstancia,Usuario

# Atualização de nomes: prévia / aplicação
node --import tsx scripts/repopulate-plausible-data.ts --general
node --import tsx scripts/repopulate-plausible-data.ts --general --apply

# Carga aditiva dos conjuntos de módulos
node --import tsx scripts/seed-municipal-system.ts
node --import tsx scripts/seed-municipal-system.ts --apply

# Catálogos: prévia / aplicação versionada
node --import tsx scripts/revise-municipal-catalogs.ts
node --import tsx scripts/revise-municipal-catalogs.ts --apply
node --import tsx scripts/revise-construction-catalogs.ts
node --import tsx scripts/revise-construction-catalogs.ts --apply

# Frota e casos tributários
npm run seed:frotas:poc -- --apply
node --conditions=react-server --import tsx scripts/seed-municipal-tax-cases.ts
node --conditions=react-server --import tsx scripts/seed-municipal-tax-cases.ts --apply

# Conferência de vínculos e valores no banco atual, somente leitura
node --import tsx scripts/verify-municipal-system-data.ts
```

A prévia dos casos tributários executa os serviços em transação e efetua rollback; ela não é uma confirmação de cobrança. As demais prévias de revisão/carga não persistem dados. Relatórios detalhados de repopulação ficam em `.next/cache/data-review/`, e a evidência durável permanece nos eventos de auditoria do banco.

## Próxima etapa

As **574 tabelas vazias** estão enumeradas na matriz de cobertura. Ainda há cenários a construir por fluxo nativo, especialmente execução orçamentária/financeira, recebimentos de compras, fiscalização e arrecadação avançadas, atendimentos clínicos/laboratoriais, SST, emissão documental e integrações. A conclusão deve atualizar a matriz e os testes de cada cenário; a carga atual não deve ser anunciada como preenchimento de todas as 871 tabelas.
