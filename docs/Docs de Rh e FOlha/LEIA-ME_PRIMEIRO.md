# CeleriFlow — Dossiê RH/Folha POC Ibema (11/10/2026)

Pacote **preparatório de desenvolvimento**, não comprova implementação nem certifica vigência normativa.

## Entregáveis

- `DOSSIÊ_CODEX_CELERIFLOW_RH_FOLHA_IBEMA.md`: instrução central de implementação; começo aqui.
- `01_Documentos_da_POC`: 3 PDFs do checklist/termo fornecidos anteriormente (reproduzidos sem alterações).
- `02_Fontes_Publicas_Baixar`: catálogo de **60 fontes** (PDF, ZIP e páginas oficiais), atalhos e script de download.
- `03_Matrizes_Requisitos`: **114 itens** de Folha + **20 itens** de Gestão eSocial extraídos literalmente (remoção de cabeçalhos de páginas) do checklist.
- `04_Dados_e_Casos_de_Teste`: 40 cenários, 42 rubricas propostas e arquivo de teste aritmético.
- `05_Modelos_de_Relatorios`: 8 modelos HTML autorais, usando dados fictícios (não são documentos oficiais).
- `06_Instrucoes_Codex`: prompt de início pronto para colar.

## Ordem recomendada

1. Abrir `DOSSIÊ_CODEX_CELERIFLOW_RH_FOLHA_IBEMA.md`; ler o checklist PDF e matrizes.
2. Conferir os downloads já presentes e seus resultados (passos no README da pasta 02); consultar a análise documental para uso e limitações.
3. Entregar a pasta completa ao Codex no workspace do CeleriFlow, sem `.env`, certificados ou CPFs reais.
4. Solicitar primeiro **auditoria/diagnóstico sem alterar código**, depois um plano e implementação por lotes.

## Situação dos arquivos — conferência em 11/10/2026

O checkout contém **38 downloads externos** (35 PDFs e 3 ZIPs), incluindo o **Estatuto original de Ibema**, além dos três PDFs do certame. Seus hashes conferem com `DOWNLOAD_RESULTADOS.json`. Há uma tentativa com HTTP 404 (formulário de General Carneiro); 21 fontes do catálogo são páginas de consulta e não arquivos locais baixados.

O Estatuto é escaneado, histórico (LC 025/2005); sua presença não comprova vigência integral em 2026. Os XSDs incluem um pacote com implantação futura, que deve ser selecionado por data e ambiente.

Consulte [a análise detalhada dos 67 arquivos originais](../ANALISE_DOCUMENTAL_RH_FOLHA_IBEMA_2026.md), com aproveitamento por módulo, lacunas, roteiro de demonstração e documentos ainda necessários.
