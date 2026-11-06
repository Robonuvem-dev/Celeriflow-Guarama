# Reconciliação individual dos resultados publicados

Reconciliation of the 65 originally non-open published destinations. Local evidence is not a published deploy or full CRUD validation. Patient identity gates were inspected individually in code.

A conta interna não possui paciente vinculado. Nas quatro páginas pessoais, o código chama `getPatientPortalAccess` antes das consultas e redireciona para o login quando esse vínculo está indisponível; isso não aprova as consultas de um paciente autenticado.

| Destino | Resultado publicado | Classificação atual | Evidência local mais recente |
| --- | --- | --- | --- |
| `/rh/parametrizacoes` | RENDER_ERROR | OPENED_LOCALLY | [OPENED](../../checkup/all-screens-fifth-build/report.json) |
| `/tributacao/pessoas` | LAYOUT_BLOCKED | OPENED_LOCALLY | [OPENED](../../checkup/all-screens-fifth-build/report.json) |
| `/tributacao/economico` | LAYOUT_BLOCKED | OPENED_LOCALLY | [OPENED](../../checkup/all-screens-fifth-build/report.json) |
| `/tributacao/imoveis` | LAYOUT_BLOCKED | OPENED_LOCALLY | [OPENED](../../checkup/all-screens-fifth-build/report.json) |
| `/tributacao/base-territorial` | LAYOUT_BLOCKED | OPENED_LOCALLY | [OPENED](../../checkup/all-screens-fifth-build/report.json) |
| `/tributacao/avaliacoes` | LAYOUT_BLOCKED | OPENED_LOCALLY | [OPENED](../../checkup/all-screens-fifth-build/report.json) |
| `/tributacao/motor-fiscal` | LAYOUT_BLOCKED | OPENED_LOCALLY | [OPENED](../../checkup/all-screens-fifth-build/report.json) |
| `/tributacao/nfse` | SERVER_ERROR | OPENED_LOCALLY | [OPENED](../../checkup/all-screens-fifth-build/report.json) |
| `/tributacao/itbi` | LAYOUT_BLOCKED | OPENED_LOCALLY | [OPENED](../../checkup/all-screens-fifth-build/report.json) |
| `/tributacao/guias` | LAYOUT_BLOCKED | OPENED_LOCALLY | [OPENED](../../checkup/all-screens-fifth-build/report.json) |
| `/tributacao/comparativo-anual` | LAYOUT_BLOCKED | OPENED_LOCALLY | [OPENED](../../checkup/all-screens-fifth-build/report.json) |
| `/compras/pesquisas-precos` | RENDER_ERROR | OPENED_LOCALLY | [OPENED](../../checkup/all-screens-fifth-build/report.json) |
| `/compras/planejamento` | LAYOUT_BLOCKED | OPENED_LOCALLY | [OPENED](../../checkup/all-screens-fifth-build/report.json) |
| `/camara/sessoes` | RENDER_ERROR | OPENED_LOCALLY | [OPENED](../../checkup/all-screens-fifth-build/report.json) |
| `/configuracoes/usuarios` | LAYOUT_BLOCKED | OPENED_LOCALLY | [OPENED](../../checkup/all-screens-fifth-build/report.json) |
| `/configuracoes/modulos` | RENDER_ERROR | OPENED_LOCALLY | [OPENED](../../checkup/all-screens-fifth-build/report.json) |
| `/cultura/eventos` | RENDER_ERROR | OPENED_LOCALLY | [OPENED](../../checkup/all-screens-fifth-build/report.json) |
| `/cultura/espacos-reservas` | RENDER_ERROR | OPENED_LOCALLY | [OPENED](../../checkup/all-screens-fifth-build/report.json) |
| `/tributacao/economico/consulta` | LAYOUT_BLOCKED | OPENED_LOCALLY | [OPENED](../../checkup/all-screens-fifth-build/report.json) |
| `/frotas/movimentos` | LAYOUT_BLOCKED | OPENED_LOCALLY | [OPENED](../../checkup/all-screens-fifth-build/report.json) |
| `/saude/agenda` | RENDER_ERROR | OPENED_LOCALLY | [OPENED](../../checkup/all-screens-fifth-build/report.json) |
| `/saude/pacientes` | RENDER_ERROR | OPENED_LOCALLY | [OPENED](../../checkup/all-screens-fifth-build/report.json) |
| `/social/atendimentos` | RENDER_ERROR | OPENED_LOCALLY | [OPENED](../../checkup/all-screens-fifth-build/report.json) |
| `/social/prontuario` | RENDER_ERROR | OPENED_LOCALLY | [OPENED](../../checkup/all-screens-fifth-build/report.json) |
| `/assinatura-digital/pastas-inteligentes` | LAYOUT_BLOCKED | OPENED_LOCALLY | [OPENED](../../checkup/all-screens-fifth-build/report.json) |
| `/assinatura-digital/fluxos` | LAYOUT_BLOCKED | OPENED_LOCALLY | [OPENED](../../checkup/all-screens-fifth-build/report.json) |
| `/assinatura-digital/modelos` | LAYOUT_BLOCKED | OPENED_LOCALLY | [OPENED](../../checkup/all-screens-fifth-build/report.json) |
| `/assinatura-digital/usuarios` | RENDER_ERROR | OPENED_LOCALLY | [OPENED](../../checkup/all-screens-fifth-build/report.json) |
| `/assinatura-digital/tarefas` | LAYOUT_BLOCKED | OPENED_LOCALLY | [OPENED](../../checkup/all-screens-fifth-build/report.json) |
| `/assinatura-digital/classes` | LAYOUT_BLOCKED | OPENED_LOCALLY | [OPENED](../../checkup/all-screens-fifth-build/report.json) |
| `/assinatura-digital/thesaurus` | LAYOUT_BLOCKED | OPENED_LOCALLY | [OPENED](../../checkup/all-screens-fifth-build/report.json) |
| `/rh/poc` | RENDER_ERROR | OPENED_LOCALLY | [OPENED](../../checkup/all-screens-fifth-build/report.json) |
| `/notificacoes` | RENDER_ERROR | OPENED_LOCALLY | [OPENED](../../checkup/all-screens-fifth-build/report.json) |
| `/portal-paciente/agenda` | AUTH_REQUIRED | SEPARATE_PATIENT_IDENTITY_REQUIRED | [AUTH_REQUIRED](../../checkup/all-screens-fifth-build/report.json) |
| `/portal-paciente/saude` | AUTH_REQUIRED | SEPARATE_PATIENT_IDENTITY_REQUIRED | [AUTH_REQUIRED](../../checkup/all-screens-fifth-build/report.json) |
| `/portal-paciente/ouvidoria` | AUTH_REQUIRED | SEPARATE_PATIENT_IDENTITY_REQUIRED | [AUTH_REQUIRED](../../checkup/all-screens-fifth-build/report.json) |
| `/portal-paciente/dados` | AUTH_REQUIRED | SEPARATE_PATIENT_IDENTITY_REQUIRED | [AUTH_REQUIRED](../../checkup/all-screens-fifth-build/report.json) |
| `/portal/construcao-civil` | SERVER_ERROR | EXPECTED_ACCESS_MESSAGE | [ACCESS_UNAVAILABLE](../../checkup/all-screens-fifth-build/report.json) |
| `/portal/construcao-civil/nova` | SERVER_ERROR | EXPECTED_ACCESS_MESSAGE | [ACCESS_UNAVAILABLE](../../checkup/all-screens-fifth-build/report.json) |
| `/sst/aso/branco` | SERVER_ERROR | OPENED_LOCALLY | [OPENED](../../checkup/all-screens-fifth-build/report.json) |
| `/tributacao/imoveis/aurora-system-v1:property:000` | SERVER_ERROR | OPENED_LOCALLY | [OPENED](../../checkup/all-screens-fifth-build/report.json) |
| `/sst/configuracoes/aurora-system-v1:certificate-reason:000` | NOT_FOUND | OPENED_LOCALLY | [OPENED](../../checkup/all-screens-fifth-build/report.json) |
| `/social/pessoas/aurora-system-v1:person:027` | NOT_FOUND | OPENED_LOCALLY | [OPENED](../../checkup/all-screens-fifth-build/report.json) |
| `/rh/folha/eventos/aurora-mg-50k-v1:salary-event:000/editar` | NOT_FOUND | OPENED_LOCALLY | [OPENED](../../checkup/all-screens-fifth-build/report.json) |
| `/saude/vacinacao/carteira/aurora-system-v1%3Apatient%3A000` | RESOURCE_ERROR | OPENED_LOCALLY | [OPENED](../../checkup/all-screens-fifth-build/report.json) |
| `/rh/servidores/aurora-system-v1:employee:007/editar` | SERVER_ERROR | OPENED_LOCALLY | [OPENED](../../checkup/all-screens-fifth-build/report.json) |
| `/rh/dependentes/RH_CENARIOS_AJUSTES_2026_V1:dependent:aurora-mg-50k-v1:employee:007/editar` | NOT_FOUND | OPENED_LOCALLY | [OPENED](../../checkup/all-screens-fifth-build/report.json) |
| `/rh/folha/THIAGO_MORCATTY_DEMO_2026_V1:payroll/editar` | NOT_FOUND | OPENED_LOCALLY | [OPENED](../../checkup/all-screens-fifth-build/report.json) |
| `/rh/ponto/RH_HISTORICO_2025_2026_V1:PONTO:aurora-mg-50k-v1:employee:003:2026-12-31/editar` | NOT_FOUND | OPENED_LOCALLY | [OPENED](../../checkup/all-screens-fifth-build/report.json) |
| `/rh/atos/RH_CENARIOS_AJUSTES_2026_V1:act:aurora-mg-50k-v1:employee:000/editar` | NOT_FOUND | OPENED_LOCALLY | [OPENED](../../checkup/all-screens-fifth-build/report.json) |
| `/compras/solicitacoes/aurora-system-v1:purchase-request:000` | NOT_FOUND | OPENED_LOCALLY | [OPENED](../../checkup/all-screens-fifth-build/report.json) |
| `/compras/solicitacoes/aurora-system-v1:purchase-request:000/editar` | NOT_FOUND | OPENED_LOCALLY | [OPENED](../../checkup/all-screens-fifth-build/report.json) |
| `/compras/pesquisas-precos/aurora-system-v1:price-research:000` | NOT_FOUND | OPENED_LOCALLY | [OPENED](../../checkup/all-screens-fifth-build/report.json) |
| `/compras/processos/aurora-system-v1:purchase-process:000` | NOT_FOUND | OPENED_LOCALLY | [OPENED](../../checkup/all-screens-fifth-build/report.json) |
| `/compras/processos/aurora-system-v1:purchase-process:000/editar` | NOT_FOUND | OPENED_LOCALLY | [OPENED](../../checkup/all-screens-fifth-build/report.json) |
| `/compras/licitacoes/cmvv3edw9000508l5rgusxeg8` | RENDER_ERROR | OPENED_LOCALLY | [OPENED](../../checkup/all-screens-fifth-build/report.json) |
| `/protocolos/ouvidoria/aurora-system-v1:ombudsman:002` | RESOURCE_ERROR | OPENED_LOCALLY | [OPENED](../../checkup/all-screens-fifth-build/report.json) |
| `/planejamento/ppa/aurora-system-v1:ppa-instrument:000` | SERVER_ERROR | OPENED_LOCALLY | [OPENED](../../checkup/all-screens-fifth-build/report.json) |
| `/atendimento/chamados/aurora-system-v1:ticket:015` | NOT_FOUND | OPENED_LOCALLY | [OPENED](../../checkup/all-screens-fifth-build/report.json) |
| `/atendimento/ouvidoria/aurora-system-v1:ombudsman:002` | RESOURCE_ERROR | OPENED_LOCALLY | [OPENED](../../checkup/all-screens-fifth-build/report.json) |
| `/patrimonio/almoxarifados/aurora-system-v1%3Awarehouse%3A000/editar` | RESOURCE_ERROR | OPENED_LOCALLY | [OPENED](../../checkup/all-screens-fifth-build/report.json) |
| `/patrimonio/centros-custo/aurora-mg-50k-v1%3Acost-center%3A000/editar` | NOT_FOUND | OPENED_LOCALLY | [OPENED](../../checkup/all-screens-fifth-build/report.json) |
| `/patrimonio/bens/aurora-mg-50k-v1%3Afleet-asset%3A000` | RESOURCE_ERROR | OPENED_LOCALLY | [OPENED](../../checkup/all-screens-fifth-build/report.json) |
| `/saude/pacientes/aurora-system-v1%3Apatient%3A000` | RESOURCE_ERROR | OPENED_LOCALLY | [OPENED](../../checkup/all-screens-fifth-build/report.json) |
| `/tributacao/comparativo-anual?direction=ALL&firstYear=2025&governmentEntityId=p0-current-exe&metric=NET&minimumDifference=0&minimumPercentage=0&query=&secondYear=2026&view=rows` | LAYOUT_BLOCKED | OPENED_LOCALLY | [OPENED](../../checkup/all-screens-fifth-build/report.json) |
