# Definições de integração — NFS-e Nacional e bancos

## Decisões do responsável

- NFS-e: **Emissor Público Nacional**. O sistema envia a DPS à SEFIN Nacional e recebe a NFS-e autorizada; emissão municipal própria com compartilhamento de notas não foi escolhida.
- Bancos: ainda não definidos. Podem ser utilizados perfis exemplificativos para desenvolver as operações, conservando a capacidade de substituir banco/layout/convênio por ente. Nenhum convênio, número de conta, credencial ou confirmação externa foi fornecido.

## Ambientes necessários

| Ambiente | Finalidade | Documentação SEFIN |
|---|---|---|
| Produção restrita | Exercitar emissão, consulta, eventos e rejeições com acesso habilitado | `https://sefin.producaorestrita.nfse.gov.br/API/SefinNacional/docs/index` |
| Produção | Operação oficial após parametrização e validação da integração | `https://sefin.nfse.gov.br/SefinNacional/docs/index` |

As bases de SEFIN não são as mesmas em ambos os ambientes. ADN/CNC/parâmetros municipais/DANFSE possuem serviços próprios; a seleção do emissor não torna esses serviços intercambiáveis.

Fonte oficial consultada: [APIs — Produção Restrita e Produção](https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/apis-prod-restrita-e-producao), página atualizada em 20/08/2026.

## Fluxo estabelecido pela documentação

1. Consultar parâmetros municipais e enquadramentos documentados necessários à DPS.
2. Gerar DPS com a versão aplicável do layout/XSD e assinatura digital exigida.
3. Enviar à SEFIN por `POST /nfse`; só autorização externa permite representar NFS-e nacional emitida.
4. Conservar DPS, resposta, XML autorizado, chave, ambiente, hashes e correlação canônica. Integrar escrita/débito sem repetir o mesmo fato fiscal.
5. Na retomada de envio com resposta desconhecida, consultar a DPS por `GET /dps/{id}` ou `HEAD /dps/{id}` antes de repetir a operação.
6. Consulta da nota: `GET /nfse/{chaveAcesso}`.
7. Eventos: `POST /nfse/{chaveAcesso}/eventos`; consultas por chave, tipo e sequência conforme API. Substituição ocorre pela DPS que referencia a nota anterior, conforme regras nacionais.

Manual oficial lido integralmente: [Manual de Contribuintes — Emissor Público API](https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/documentacao-atual/manual-contribuintes-emissor-publico-api-sistema-nacional-nfs-e-v1-2-out2025.pdf). A página de [documentação atual](https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/documentacao-atual/documentacao-atual) referencia XSD e layout de produção `v1.01-20260209`; produção restrita possui publicação própria e não deve herdar automaticamente a versão de produção.

## Dependências externas concretas

- Acesso habilitado aos ambientes oficiais e situação do convênio/parametrização municipal.
- Certificado digital e cadeia para a autenticação e assinatura do ator autorizado. O manual distingue os atores envolvidos nas consultas e emissões; certificado municipal não representa automaticamente cada prestador.
- Referência ao segredo/certificado no ambiente de execução, sem chave privada nem senha em código ou conversa.
- Especificação OpenAPI obtida do ambiente habilitado e amostras autorizadas de DPS/NFS-e/eventos. Tentativa de obter `swagger/v1/swagger.json` da SEFIN de produção restrita retornou HTTP 403 sem credenciais. O manual público foi obtido normalmente; o 403 não prova problema na API.

Estas dependências não encerram as tarefas internas. Transporte, XML/XSD/XMLDSig, persistência, fila/retomada, importação canônica e jornada autenticada do conector nacional ainda precisam ser concluídos e validados. Nenhuma emissão nacional ou homologação foi executada nesta decisão.
