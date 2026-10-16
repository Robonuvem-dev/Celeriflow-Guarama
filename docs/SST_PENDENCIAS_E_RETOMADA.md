# SST — encerramento da etapa e pacote de retomada

Data: 11/10/2026. Código recebido: `76728e5 — sst5` e `f78c851 — rh1`. A pedido do usuário, esta etapa fica encerrada com validações e pendências registradas, permitindo trabalhar em outro módulo. O aceite dos 74 requisitos permanece aberto; não declarar SST integralmente homologado.

## 1. O que foi concluído nesta conferência

- Confirmado recebimento do arquivo RH anteriormente ausente e sincronismo HEAD/origin/main.
- Ampliado `scripts/verify-sst-migration-history.ts` com `--all`, somente leitura, preservando o modo SST padrão. Agora a reconciliação também identifica divergências em migrações de outros módulos.
- Conferidas 57 migrações aplicadas: nenhuma ausente; 56 checksums compatíveis; uma divergência RH. As 18 SST aplicadas conferem.
- Prisma validate/generate, 142 testes integrados SST/RH/Perfis/migrações, lint direcionado e build completo passaram, após integrar o trabalho do outro notebook.
- Preservado o processamento de planos SST em `rh/folha/actions.ts`; o novo motor RH documenta consumo das origens SST já lançadas sem presumir alocação de multivínculo.
- Atualizadas a execução e a matriz dos 74 itens. Não foram criadas pessoas, permissões, regras financeiras ou dados clínicos fictícios no banco operacional.

## 2. Migração: histórico reconciliado, hardening pendente

**Arquivo:** `prisma/migrations-ibema/20261011030000_hr_workforce_foundation/migration.sql`.

Na conferência inicial, o arquivo recebido não reproduzia o checksum nem nas variantes uniformes LF/CRLF. O documento `RH_MIGRATION_FOUNDATION_CORRECAO_CHECKSUM.md`, recebido até `17ff495`, comprovou que os bytes originais tinham finais mistos. A restauração exata foi executada, sem alteração do conteúdo SQL ou do histórico do banco.

Os previews de foundation, revisões temporais e consignações agora retornam `APPLIED_CHECKSUM_VERIFIED`, sem dependências faltantes. O checker completo verificou 59 migrations, sem divergências/ausências. Os hashes e regras de preservação estão no documento RH e em `.gitattributes`. Não sobrescrever checksum nem reaplicar as fundações.

O hardening SST continua **publicado e testado, mas não aplicado** nesta etapa. O status atual lista também as duas migrations novas de Planejamento; conferir o conjunto inteiro antes de deploy:

```powershell
npx tsx scripts/verify-sst-migration-history.ts --all
npx prisma migrate status
# Confirmar que só há os incrementos desejados pendentes antes de executar:
npx prisma migrate deploy
npx prisma migrate status
npx tsx scripts/verify-sst-migration-history.ts --all
```

`scripts/build.mjs` executa deploy de migrações quando `VERCEL_ENV=production`. Reconciliar o histórico antes da próxima implantação de produção. O build local desta conferência não executou deploy.

## 3. Integrações externas a providenciar

| Frente | Material/acesso a disponibilizar | Trabalho técnico restante / evidência final |
|---|---|---|
| Biometria EPI (27) | Fabricante/modelo do leitor, SDK/API e documentação, sistema operacional suportado, licença, equipamento para testes e método de identificação do recebedor. | Implementar adaptador e evidência real de confirmação, testar falha/cancelamento/retry e homologar no leitor. Aceite por botão não equivale a biometria. |
| eSocial ASO/CAT/exposição (41/52 e correlatos) | A1 e referência segura de senha, identificação do empregador por entidade, autorização/procuração, ambiente de Produção Restrita, cadastro/vínculo/matrícula/categoria dos trabalhadores e pacote técnico oficial aplicável. | Implementar/instalar mapeamento completo, XSD, XMLDSig, cadeia/revogação, mTLS/SOAP, consulta de lotes/eventos e reconciliação. Gerar recibos oficiais ligados à versão exata e ambiente. Certificado isolado não torna o contrato de transporte uma implementação real. |
| Avisos de restrições (58) | Conta Resend, chave servidor, domínio/remetente verificado, destinatários reais, usuário canônico executor autorizado e ambiente com cron horário. | Configurar a rotina existente, demonstrar aceite do provedor, falhas/retries e reconciliação. Referência: `src/app/app-domain/sst/restricoes/EMAIL-CRON.md`. |
| Fiscal de planos (67) | Ano-calendário/exercício e regime aplicável, parecer do responsável fiscal, pagamentos datados, fonte pagadora, alocação por beneficiário, dados/layout do sistema fiscal e exemplos esperados. | Implementar exportador/adaptador e conciliação; validar obrigação vigente. DIRF PGD foi substituída desde 2025; não reutilizar layout histórico para exercício diferente. |
| Laboratórios/vacinação, se exigida integração | Prestador/sistema de origem, contrato/API/layout, autorização de compartilhamento e exemplos sem dados pessoais reais. Confirmar se o aceite exige somente documento apresentado ou também aplicação/importação. | Importação com origem/documento, escopo e deduplicação. Hoje exames podem ser apresentados e vacina registra comprovante externo; não há acesso automático ao histórico SUS nem aplicação/baixa de vacina. |
| GED/assinatura documental | Storage privado operacional, emissor/signatários, método de assinatura exigido e certificado quando aplicável. | Homologar upload/download/PDF e evidência de assinatura. PDF impresso ou assinatura documental destacada não é assinatura XMLDSig eSocial. |

### Variáveis dos avisos

Configurar no servidor, sem colocar valores de segredo em documentos ou no Git:

```text
CRON_SECRET
SST_RESTRICTION_EMAIL_PROVIDER=RESEND
RESEND_API_KEY
SST_RESTRICTION_EMAIL_FROM
SST_RESTRICTION_EMAIL_ACTOR_USER_ID
```

`CRON_SECRET` tem mínimo de 32 caracteres. Se usado agendador externo, `SST_RESTRICTION_CRON_SECRET` pode substituir o segredo e tem precedência. O ator exige usuário/perfil ativos, módulo/operação SST e grants explícitos da UG/Medicina. Sem configuração, a rota retorna `503 BLOCKED`. `SENT` indica aceite do provedor, não entrega/leitura na caixa postal.

## 4. Modelos e dados a solicitar aos responsáveis

Solicitar modelos aprovados, preferencialmente versões em branco e exemplos anonimizados. Nenhum modelo abaixo foi criado como documento clínico/legal aprovado pelo software.

| Pacote | Conteúdo a providenciar |
|---|---|
| Institucional e identidade | Nome/razão social, município/UF/CNPJ, cabeçalho/rodapé/logomarca e dados de Prefeitura/Câmara; mapa explícito entidade → UG e unidades/locais/centros de custo. |
| Histórico RH | Matrículas, períodos/vigências, cargo e função separados, regime, lotação, local e centro de custo, fontes documentais; atribuições do cargo para restrições e alocação de origens quando houver multivínculo. |
| Profissionais/perfis | Pessoas e usuários canônicos, atuação, conselho, vigência, UG e responsáveis pela aprovação de habilitações/grants; matriz de quem lê/escreve cada disciplina. |
| Atestado/perícia/agenda | Motivos e dependente/regime/cargo permitidos, emissão de comprovante, confirmação de afastamento, composição de juntas, profissionais/unidades/horários e regras de bloqueio. |
| Programas/ambientes | GHE e critérios/vigências, LTCAT/PGR/PCMSO/PCA vigentes, riscos/controles, protocolos de exames, responsáveis técnicos e necessidade EPI. Conteúdo estruturado deve acompanhar o PDF. |
| ASO/anamnese | Layout aprovado em branco/preenchido, perguntas/obrigatoriedade por versão, protocolos para os sete tipos, critérios das cinco conclusões, agenda sugerida e prazo de aviso de férias. |
| Prontuários/laudos | Questionários e modelos Medicina/Enfermagem/Psicologia/Assistência Social, laudos, solicitações, encaminhamentos e regras de compartilhamento. |
| EPI/EPC | Material canônico, CA/validade/revisão, depósitos/lotes/saldos, política de baixa integrada, recibo aprovado e procedimento de devolução física. |
| CAT/restrições | Dados necessários ao formulário INSS, modelos de investigação/parecer/relatório, graus e atribuições liberadas/impedidas, responsáveis por avisos e prazos. O formulário INSS utilizado já está referenciado no código. |
| Prevenção | CIPA/mandatos/funções, inspeções, atas/presenças, regras eleitorais, SIPAT, brigada/pavimentos/treinamentos, extintores, visitas, ergonomia e audiometria. |
| Planos/folha/fiscal | Operadora/ANS/contratos, titulares/dependentes/carteiras/vigências, mensalidades/despesas/devoluções, rubricas/eventos, política de competência e prorrateio, pagamentos e demonstrativos esperados. |
| PPP/consolidado | Modelo/forma de emissão aplicável, história laboral e fontes, riscos LTCAT por período, responsáveis e regras de liberação do próprio servidor no portal. |

### Ficha mínima para aprovação de uma regra RH/Folha

Preencher e aprovar antes de configurar produção:

```text
Entidade / UG:
Regime e tipo de licença:
Vigência e competência:
Conjunto de regras aprovado e fundamento legal:
Fonte documental e responsável pela aprovação:
Rubrica e evento original (IDs canônicos, tipo e sentido):
Método de cálculo e tarifa documentada:
Política de líquido negativo:
Rubrica/evento compensatório e fundamento:
Alocação por período funcional/contrato, inclusive multivínculo:
Caso de conferência e resultado esperado:
```

O contrato implementado para afastamento é `RATE_PER_ATTESTED_MINUTE` v1, BRL, HALF_UP, duas casas; não usa tarifa padrão nem salário atual implícito. Se a política aprovada exigir outro cálculo, será necessário implementar esse método. Estrutura JSON e validações: `SST_AFASTAMENTO_FOLHA_CONFIGURACAO.md`. Férias exigem fonte RH do período e vencimento, não prazo inventado pelo SST.

## 5. Desenvolvimento ainda aberto na retomada

Além de obter acessos/dados/modelos, continuam necessárias implementações de **adaptador eSocial real**, **biometria** e **saída fiscal oficial**. Eventual integração de aplicação vacinal/laboratório e métodos monetários diferentes do suportado dependem do escopo aprovado. PPP preparatório precisa de validação da forma final aplicável. Estas entregas não estão prontas apenas aguardando uma chave de configuração.

## 6. Homologação e ordem de retomada

1. Reconferir o histórico RH já corrigido e o conjunto de migrations pendentes antes de aplicar hardening SST/Planejamento.
2. Conferir instituição/entidade/UG/histórico/profissionais e grants com fontes aprovadas.
3. Validar os modelos e executar casos operacionais de atestado/perícia/folha, programas/ASO, estoque, CAT/restrições, prevenção, planos e prontuários.
4. Implementar e homologar adaptadores externos por ambiente, com erros/retries/recibos e versões rastreáveis.
5. Executar `EVIDENCIAS_SST.md` por requisito, incluindo layouts e PDFs, GED privado, portal próprio, segregação Prefeitura/Câmara e por disciplina.
6. Testar bases >40 registros (20 por página), zoom/viewports, nomes longos, impressão multipágina e concorrência real de agenda/estoque/voto/folha. Registrar perfil, entidade, versão, passos, resultado e arquivo/hash em local autorizado.

Os 142 testes e o build aprovado são evidência técnica desta etapa, não demonstração em navegador autenticado nem aceite dos 74 itens. Essa parte fica anotada para retomada quando o ambiente e o pacote acima estiverem disponíveis.
