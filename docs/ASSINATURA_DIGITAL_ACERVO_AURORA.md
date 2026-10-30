# Acervo documental de Aurora das Veredas

## Escopo autorizado

O responsável confirmou que Aurora das Veredas, sua gestão e seus cadastros
integram uma apresentação do software. A carga compreende 40 PDFs distintos de
uma página, com 14 assinaturas internas, 13 A1 e-CPF e 13 A1 e-CNPJ.

Responsável cadastral: Amanda Machado Santos, vínculo canônico da Secretaria
Municipal de Administração. No e-CNPJ, o titular é a Prefeitura Municipal de
Aurora das Veredas, com representação administrativa indicada no documento.

## Evidências

- As assinaturas são operações criptográficas executadas pela carga, verificadas
  pelas mesmas rotinas da Central; não foram inseridos indicadores de sucesso
  sem geração de evidência.
- Os certificados usam uma **cadeia privada de Aurora das Veredas**, identificada
  no emissor, nos documentos e no relatório. Não são certificados emitidos por
  autoridade certificadora credenciada à ICP-Brasil.
- A chave interna usada pelo acervo é exclusiva da carga. A chave interna
  configurada no ambiente de produção não é substituída.
- As datas anteriores representam a emissão/solicitação dos expedientes.
  `signedAt` contém o instante efetivo da assinatura; a expiração ocorre 90 dias
  depois desse instante.
- Cada original é gravado em Blob privado, lido novamente e comparado por
  SHA-256 antes da confirmação do registro.
- A origem da carga consta em `AuditEvent`, com evento
  `OWNER_AUTHORIZED_PRESENTATION_IMPORT`.

## Execução

```powershell
node --conditions=react-server --import tsx scripts/seed-aurora-signature-history.ts
node --conditions=react-server --import tsx scripts/seed-aurora-signature-history.ts --apply
node --conditions=react-server --import tsx scripts/seed-aurora-signature-history.ts --verify
```

O comando inicial é uma prévia sem alterações. A execução exige a instância
`guarama`, a instituição de Aurora e o vínculo ativo da responsável. Usa as
credenciais locais existentes; nunca imprime senhas ou chaves privadas.

IDs e UUIDs do acervo são determinísticos. Reexecuções reutilizam registros
assinados após verificar suas evidências. Cadastros existentes incompatíveis
interrompem a carga em vez de serem sobrescritos.

Material de assinatura, cópias dos PDFs e relatório ficam fora do repositório,
em `C:\Users\thiag\AppData\Local\Temp\opencode\aurora-signature-history`.
O arquivo `material/credentials.json` contém segredos e não deve ser publicado.

As duas integrações são suspensas ao final da importação porque suas chaves
não são provisionadas no provedor de segredos da aplicação. Os comprovantes
permanecem verificáveis com seus snapshots públicos. Para novas assinaturas
interativas, é necessário configurar a credencial correspondente antes de
reativar uma integração. A carga não altera a confiança global da aplicação.

## Conferência

`--verify` confere os 40 registros, a distribuição, o hash e a página única de
cada Blob. Também envia cada original à API pública do domínio e exige
validação positiva com comparação do arquivo.

Os registros podem ser consultados em `/assinatura-digital/registros` e os
comprovantes em `/validar-assinatura/{code}`. A carga não cria registros no
fluxo separado de pendências dos módulos nem presume reautenticação de uma
conta de acesso em nome de Amanda.

## Resultado da carga em 30/10/2026

- 40 registros assinados; nenhum pendente.
- Distribuição confirmada: 14 internos, 13 A1 e-CPF e 13 A1 e-CNPJ.
- 40 PDFs de uma página, totalizando 85.497 bytes.
- Datas de emissão/solicitação entre 12/08/2026 e 20/09/2026.
- 40 originais conferidos no Blob por hash e quantidade de páginas.
- 40 validações públicas positivas **com envio do original** no domínio
  `guarama.celeriflow.com.br`, confirmando também a carga no ambiente publicado.
- Dois testes automatizados aprovados e checagem TypeScript dos scripts e
  dependências concluída sem erros.

Exemplos de consulta pública:

- Interna: `/validar-assinatura/9e151396-ef04-4199-a5c5-ff51af5fa746`
- e-CPF: `/validar-assinatura/bcccecc9-d7e6-442c-a736-334ea8547896`
- e-CNPJ: `/validar-assinatura/5a324513-857c-4b27-a06d-da442cd1aa0d`
