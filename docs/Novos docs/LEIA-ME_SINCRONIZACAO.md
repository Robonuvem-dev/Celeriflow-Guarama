# Documentos adicionais — sincronização entre notebooks

Os anexos recebidos estão em `docs/Novos docs/Novos docs/`. Essa organização foi mantida conforme a pasta fornecida.

O GitHub limita arquivos individuais a 100 MiB. O arquivo original `LEI Nº 687-2025 - PPA 2026-2029.zip` tem 144.417.700 bytes e, por isso, está preservado localmente e ignorado pelo Git. Para sincronizar todo o seu conteúdo sem modificar o documento, o arquivo foi dividido nestas partes binárias:

| Arquivo | Bytes | SHA-256 |
|---|---:|---|
| `PPA_2026-2029.zip.part01` | 73.400.320 | `ddbdbe641921035d5438c2ce5c061b86854aa0b5cc7baf6e78181024d5c8d7ab` |
| `PPA_2026-2029.zip.part02` | 71.017.380 | `72799b8727a8ea1dff7f5bbfcf2cd3f50ce97c6b462959483e9a33af1675b7a3` |

As partes não são ZIPs independentes: devem ser concatenadas na ordem 01, 02. A reconstrução foi conferida byte a byte contra o original.

## Reconstruir depois do pull

Com Python disponível, executar na raiz do repositório:

```powershell
python -c "from pathlib import Path; import hashlib; p=Path('docs/Novos docs/Novos docs'); data=b''.join((p/n).read_bytes() for n in ['PPA_2026-2029.zip.part01','PPA_2026-2029.zip.part02']); assert len(data)==144417700 and hashlib.sha256(data).hexdigest()=='25e20bee5251855cd117ef0d190b4a30d4dd2d0c170193ae291ea94854bded14', 'Partes incompletas ou alteradas'; target=p/'LEI Nº 687-2025 - PPA 2026-2029.zip'; target.write_bytes(data); print(target)"
```

Em seguida, abrir/extrair o ZIP para consultar o PDF de 113 páginas. O ZIP reconstruído permanece ignorado para evitar novo bloqueio no push.

**SHA-256 do ZIP original/reconstruído:** `25e20bee5251855cd117ef0d190b4a30d4dd2d0c170193ae291ea94854bded14`.

Os commits locais antigos que incluíam o PDF/ZIP acima do limite foram consolidados antes do envio. Há uma referência de recuperação **local**, `backup/rh-docs-before-sync-20261011`, com esses commits anteriores; ela não deve ser enviada ao GitHub, pois ainda contém os objetos grandes.

O relatório `docs/ANALISE_DOCUMENTAL_RH_FOLHA_IBEMA_2026.md` analisou o pacote original de 67 arquivos. A análise dos anexos adicionais está em [ANALISE_NOVOS_DOCUMENTOS_IBEMA_2025_2026.md](../ANALISE_NOVOS_DOCUMENTOS_IBEMA_2025_2026.md), com catálogo dos 141 arquivos em [CATALOGO_NOVOS_DOCUMENTOS_IBEMA.md](../CATALOGO_NOVOS_DOCUMENTOS_IBEMA.md). O catálogo distingue conteúdos repetidos, competências, modelos e referências de outros municípios.
