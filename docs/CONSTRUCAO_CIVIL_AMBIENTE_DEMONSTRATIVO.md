# Construção Civil — ambiente demonstrativo e roteiro de aceite

## Natureza dos dados

O usuário autorizou parâmetros demonstrativos identificados e execução das frentes em paralelo. O conjunto `construction-demo-*` é sintético e não representa legislação, lotação, registro profissional ou licença municipal. Os documentos demonstrativos devem exibir **DEMONSTRAÇÃO / SEM VALIDADE OFICIAL**.

O seed não cria contas Firebase, não concede permissões a usuários reais e não substitui configuração publicada por outro responsável. As identidades externas precisam ser vinculadas pelo master a contas de teste verificadas. Não inserir credenciais em documentos ou versionar certificados/senhas.

## Preparação reproduzível

1. Executar `npx prisma migrate status` e `npx prisma migrate deploy` com a configuração do destino em `prisma.config.ts`.
2. Executar `npx prisma generate` após integrar todas as alterações de schema.
3. Conferir prévia com `npx tsx scripts/seed-construction-demo.ts`.
4. Persistir o conjunto autorizado com `npx tsx scripts/seed-construction-demo.ts --apply`.
5. Master vincula usuários de teste aos servidores sintéticos e concede as permissões necessárias de Obras/Processos. Habilitar identidades profissionais pela tela de participação, com UID e e-mail verificado da conta de teste.
6. Vincular cada identidade somente às solicitações e representações autorizadas. Manter uma segunda conta sem vínculo para executar as negativas de acesso.

O seed preserva os registros existentes e pode ser repetido sem criar novas versões automaticamente. A vigência de exemplo começa em 01/01/2026. A regra territorial de exemplo tem terreno mínimo de 100 m² e coeficiente 1,5; esses valores **não são parâmetros legais do município**.

## Roteiro de execução integrado

| Cenário | Percurso | Evidência necessária |
|---|---|---|
| Configuração | Catálogos → formulário/checklist/termo/template → publicação → nova solicitação | Versão publicada, campos obrigatórios, snapshot anterior preservado |
| Identidade/representação | Conta externa verificada → habilitação → autorização de atuação | Conta sem vínculo recebe negativa; alteração de UID não assume outro cadastro |
| Abertura | Imóvel autorizado → requerente → profissionais → termo → arquivos obrigatórios → protocolo | Processo real, documentos GED/hashes, repetição sem duplicação |
| Distribuição | Usuário/setor/gestor/menor demanda | Elegibilidade, desempate, responsável central e histórico |
| Viabilidade | Imóvel → zoneamento vigente → áreas → regras → resultado | Memória decimal, casos incompatíveis e sem regra suficiente |
| Projeto | Pró-análise → PDF anotado → exigência → complemento → readequação | Original preservado, página/coordenadas corretas, retorno ao analista inicial/substituto |
| Taxas | Fato gerador → guia → pagamento/isenção documentada → gate | Relação real com Arrecadação, idempotência e franquia de reanálise |
| Alvará | Parecer favorável → vistorias obrigatórias → emissão → assinatura → publicação | Mesmo processo, numeração própria, backup, download não libera artefato pendente |
| Atos posteriores | Correção/renovação → decisão → emissão relacionada | Versões anteriores recuperáveis e vigências verificadas |
| Início/conclusão | Início → vistoria → conclusão parcial → saldo → conclusão total | Soma de áreas, documentos/checklists, numeração e prazo |
| Habite-se/cadastro | Conclusão → débitos conforme parâmetro → habite-se → assinatura → processo cadastral | Antes/depois do imóvel, vínculo real e execução não duplicada |
| Consulta setorial | Analista solicita parecer → notificação → setor consultado responde | Setor acessa somente consulta dirigida; resposta imutável e retorno notificado |
| Fiscalização | Obra sem alvará → processo → fiscal → diligência/fotos → notificação/auto/embargo | Fundamento, numeração, ciência/prazo e levantamento motivado |
| Informação federal | Dados reais do alvará/início → lote → validação → correção/retificação | Hash e origem; leiaute demonstrativo distinguido do oficial |
| Pranchas | PDF original → extração → página/evidência/unidade → comparação | Não identificável explícito; provedor/versão registrados; não apresentar heurística como IA homologada |

## Verificação técnica

- `npm run build`: compilação, TypeScript e geração de páginas; rodar após integração final das frentes.
- ESLint dos arquivos civis, portal, APIs e scripts alterados.
- Testes civis de políticas, serviços, precisão, concorrência/idempotência, permissões e migrations.
- `tests/construction-migration-upgrade.test.ts`: aplica o histórico completo do baseline municipal em PostgreSQL embarcado, verifica tabelas civis, seed mínimo e constraints validadas.
- Navegador: percorrer o roteiro com contas operacional e externa distintas, incluindo negativa de acesso direto a API/download. Enquanto a ferramenta estiver desconectada, não registrar essa validação como concluída.

## Limites de homologação

As fases técnicas podem ser verificadas com dados sintéticos. A comprovação oficial dos itens que exigem legislação municipal, convênio bancário, assinatura/formato/certificado, Receita Federal/INSS ou extração por IA depende do contrato e da evidência correspondentes. O aceite de ambiente demonstrativo não altera os requisitos do checklist.

## Preparação executada em 10/10/2026

- As 17 migrations civis até `20261010340000_construction_project_stamp` estão aplicadas ao destino configurado por `prisma.config.ts`, incluindo portal, pedidos, taxas, documentos, ciclo, fiscalização, exportação/extração, construtoras, consultas, viabilidade automática, prazo de reinspeção e carimbo de projetos. Os 17 checksums foram conferidos contra os arquivos locais e coincidem.
- O seed foi aplicado e repetido: ambas as execuções retornaram a mesma configuração, sem nova versão ou duplicação de registros.
- Foram provisionados o setor/servidores sintéticos, assunto, pessoa/empresa/imóvel, perfil profissional e habilitação da construtora, cinco definições de formulário/checklist, termo, zoneamento, distribuição, sete regras de taxas demonstrativas e três templates documentais.
- Identidades profissionais externas e usuários operacionais reais não foram criados/vinculados. Essa habilitação precisa ser feita com contas verificadas nas telas próprias antes do percurso autenticado.
- Armazenamento privado configurado no ambiente; provedor IA externo não configurado. Não foram expostos tokens, senhas ou dados da conexão.
- O banco recebeu migrations de SST em outro computador, conforme confirmado pelo usuário. A sincronização desse histórico pertence à frente SST; registros/arquivos/dados SST foram preservados. `prisma migrate status` pode apontar as quatro migrations SST ausentes neste checkout mesmo com todas as migrations civis conferidas. Não reconstruir nem resolver esse histórico pela frente civil.

O status de cada item e as pendências devem permanecer no plano `PLANO_CONSTRUCAO_CIVIL_CHECKLIST_POC_126-131.md`. Não promover os 52 itens a atendidos com base apenas em migrations, telas, testes unitários ou emissão simulada.
