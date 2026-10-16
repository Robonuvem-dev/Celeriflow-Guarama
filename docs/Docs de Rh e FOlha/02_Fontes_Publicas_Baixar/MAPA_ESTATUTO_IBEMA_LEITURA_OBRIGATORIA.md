# Estatuto do Servidor de Ibema — guia de conferência documental

**Fonte original obrigatória:** https://www.pibema.pr.gov.br/publicacao/oficial/Estatuto%20do%20Servidor.pdf

**Atenção:** este arquivo é um GUIA AUTORAL de navegação, **NÃO é o PDF da lei** e não o substitui. O original oficial é uma versão escaneada de 44 páginas da Lei Complementar municipal nº 025/2005. Sua vigência integral em 2026 **não foi demonstrada**; exigir consulta a alterações, consolidação e atos posteriores junto à prefeitura. Execute `BAIXAR_FONTES_WINDOWS.bat` em computador com internet para tentar acrescentar o PDF original à pasta `DOWNLOADS_OFICIAIS` antes de entregar o pacote ao Codex.

| Dispositivo (texto histórico) | Regra que o Codex deve examinar | Situação de implementação |
|---|---|---|
| Arts. 39–40 | Vencimento, remuneração e limites gerais | Exigir norma atual e configuração por vínculo |
| Art. 43 | Descontos e consignações | Implementar com limite/fonte de autorização adequados |
| Art. 56 | Quinquênio de 5% sobre o vencimento por 5 anos, teto de 30% | `PARAMETRO_HISTORICO` até confirmar validade em 2026 |
| Arts. 57–59 | 13º, avos e pagamento | Conferir remuneração elegível, datas e regime |
| Arts. 60–61 | Serviço extraordinário e limites/autorizações | Segregar horas +50%, +100%, base, autorização |
| Art. 62 | Adicional noturno 20%; 22h–5h; hora de 52m30s | Calcular minutos reais e horas noturnas reduzidas |
| Art. 63 | Adicional constitucional de férias de um terço | Evitar duplicar remuneração já paga |
| Arts. 64–67 | Insalubridade/periculosidade e laudos | Não calcular sem fonte jurídica/laudo |
| Arts. 73–75 | Licença-prêmio, 90 dias por quinquênio e conversão excepcional em pecúnia | Elegibilidade, saldo e decisão formal, NÃO pagamento automático |
| Art. 100 | Férias e períodos aquisitivos | Controlar saldos por aquisitivo e atos |
| **Art. 101** | Dias de férias por faltas e conversão em abono | **Alerta: faixas históricas não cobrem literalmente 6, 15, 24 e 33 faltas; bloquear até esclarecimento** |
| Arts. 102–103 | Restrições e regimes diferenciados de férias | Conferir situação concreta e norma em vigor |
| Art. 104 | Férias no desligamento, pagamento antecipado | Separar rubricas vencidas/proporcionais e adicional |
| Art. 105 | Interrupção de férias e saldo remanescente | Exigir justificativa e ato de autorização |

## Procedimento mínimo para Codex

1. Baixar, abrir e conferir manualmente o PDF da Prefeitura. Registrar URL, data, hash SHA-256 e páginas dos artigos.
2. Procurar texto consolidado e alterações da LC 025/2005 no Diário Oficial e no portal da Câmara/Prefeitura; pedir confirmação expressa da legislação vigente.
3. Não extrapolar Lei estadual nº 6.174/1970, manuais Meta4 Paraná ou regras CLT para cargo estatutário de Ibema.
4. Criar regras versionadas por município/regime/competência e sinalizar `AGUARDANDO_VALIDACAO_LEGAL` onde houver conflito.
5. Gerar memória de cálculo que aponta artigo, versão da regra e entradas utilizadas.
6. Demonstrar em `tenant_demo_ibema` com dados totalmente fictícios; não simular autenticação de órgãos como se houvesse homologação oficial.
