# Fontes públicas — download complementar

O pacote inicial contém os três documentos da POC já fornecidos pelo usuário; **não** contém o PDF oficial do Estatuto de Ibema nem os PDFs da SEAP/TCE/eSocial, pois neste ambiente os servidores externos não puderam ser acessados para gravação de binários. O link para o Estatuto foi verificado como PDF de 44 páginas e aparece no catálogo.

Execute, **com internet no seu computador**, `py -3 02_Fontes_Publicas_Baixar/baixar_fontes_oficiais.py` a partir da pasta raiz do pacote (ou use `BAIXAR_FONTES_WINDOWS.bat`). O script usa a biblioteca padrão do Python, valida assinatura de arquivo PDF/ZIP, calcula SHA-256 e salva `DOWNLOAD_RESULTADOS.json`.

O script tenta baixar todas as fontes diretas do catálogo, inclusive o Estatuto de Ibema, formulários da SEAP/PR, manual Meta4, ponto, SIAFIC e schemas eSocial. Páginas-índice são apenas referências e não são convertidas. URLs podem mudar, expirar ou exigir autenticação. Nunca trate o download como prova de vigência normativa: confira a versão consolidada e os atos posteriores.

**Atenção jurídica:** estatuto de 2005 é fonte histórica primária; sem certidão de vigência ou texto consolidado não se deve parametrizar definitivamente a folha de produção.
