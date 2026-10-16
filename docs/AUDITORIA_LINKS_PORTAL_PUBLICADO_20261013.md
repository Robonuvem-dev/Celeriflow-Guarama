# Auditoria dos links do Portal publicado

Endereço: `https://ibema.celeriflow.com.br/portal`. Verificação com navegador Chromium/Playwright, menus desktop e mobile, atalhos e rodapé, seguida de GET aos destinos e conferência das âncoras.

## Resultado

- 96 combinações de link/rótulo encontradas, incluindo submenus abertos no navegador.
- 25 destinos HTTP distintos: **23 responderam 200; dois apresentaram erro**.
- Nenhum erro JavaScript foi registrado na página inicial durante a inspeção.
- Portal do Servidor: encaminhamento funcional para `/portal-servidor/entrar?returnTo=%2Fportal-servidor`; exigir login nesse serviço é esperado.
- Portal da Transparência, publicações, despesas/receitas, contatos, e-SIC, Ouvidoria, Secretarias, notícias, concursos, leis, serviços, mapa, dados abertos e acessibilidade responderam com sucesso.

O HTML do Next contém o componente de fallback 404 nos scripts de hidratação; a simples busca dessa frase no HTML não foi tratada como erro real das páginas com status 200.

## Problemas encontrados

| Link/área | Problema publicado | Encaminhamento |
|---|---|---|
| `/portal/tributario` | HTTP 500 sem sessão; página usa autorização do módulo interno `TRIBUTACAO` | Incorporar ao desenvolvimento do Portal de Autoatendimento: entrada pública, login externo e concessão por titularidade/representação |
| `/portal/nfse` | HTTP 404; só existe `/portal/nfse/[code]` para consulta de autenticidade | Criar entrada do serviço e fluxos próprios no plano; não tratar validação como emissão de notas |
| Redes sociais no cabeçalho | Facebook, Instagram, YouTube e WhatsApp apontam para `#` | Configurar perfis/canal oficiais ou retirar a interatividade dos ícones sem destino |
| Redes sociais no rodapé | Três ícones apontam para `#` | Mesmo tratamento; não inventar URLs de Aurora |
| Notícias/eventos demonstrativos | Vários “Continuar lendo”/eventos usam `/portal/noticias` | O destino existe, mas o link é genérico; associar slug/detalhe quando o conteúdo estiver cadastrado |

### Dez âncoras inexistentes

- História: `/portal/historia#dados`, `#simbolos`, `#acervo`, `#hospedagem`, `#turismo`.
- Serviços: `/portal/servicos#educacao`, `#saude`, `#transporte`, `#empreendedor`.
- Diário Oficial: `/portal/dados-abertos#diario`.

Âncoras existentes conferidas: conteúdo principal, sete Secretarias, decretos, Lei Orgânica e Radar da Transparência.

## Direcionamento confirmado pelo responsável

Após o diagnóstico, o responsável informou que o Portal do Contribuinte/Autoatendimento ainda será construído e pediu análise do checklist e planejamento. Nenhuma página ou operação tributária foi alterada por esta auditoria. O plano deve absorver os dois acessos tributários inválidos e a relação solicitação externa → protocolo interno → serviço executor, acompanhada no card Processos e Protocolos.
