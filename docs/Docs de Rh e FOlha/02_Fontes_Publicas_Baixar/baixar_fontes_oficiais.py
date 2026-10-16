#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Baixa documentos oficiais descritos em CATALOGO_FONTES_OFICIAIS.json.
Python >=3.9; somente biblioteca padrão; requer internet no computador do usuário.
Use: python baixar_fontes_oficiais.py --somente-essenciais
     python baixar_fontes_oficiais.py --listar
     python baixar_fontes_oficiais.py --grupo 05_eSocial
Não baixe conteúdo restrito sem autorização; não contorna CAPTCHA, login ou bloqueios.
"""
import argparse, hashlib, json, re, sys, time, urllib.request, urllib.error
from pathlib import Path

HERE=Path(__file__).resolve().parent
CATALOGO=HERE/'CATALOGO_FONTES_OFICIAIS.json'
DEST=HERE/'DOWNLOADS_OFICIAIS'
HEADERS={'User-Agent':'Mozilla/5.0 (compatible; CeleriFlow-Research-Downloader/1.0; Educational-Public-Docs)', 'Accept':'application/pdf, application/zip, application/octet-stream, */*'}

def safe_part(x):
    x=re.sub(r'[^A-Za-z0-9._-]+','_',x)
    return x.strip('._')[:110] or 'arquivo'

def valid_magic(p,typ):
    with p.open('rb') as f: header=f.read(16)
    if typ=='pdf': return header.startswith(b'%PDF-')
    if typ=='zip': return header.startswith((b'PK\x03\x04',b'PK\x05\x06',b'PK\x07\x08'))
    return False

def main():
    ap=argparse.ArgumentParser(description='Baixar e conferir documentos oficiais RH/Folha Ibema')
    ap.add_argument('--listar',action='store_true',help='Só listar URLs e arquivos')
    ap.add_argument('--somente-essenciais',action='store_true',help='Prioridade ALTA ou CRITICA')
    ap.add_argument('--grupo',help='Filtrar por grupo do catálogo, ex. 01_Ibema ou 05_eSocial')
    ap.add_argument('--max-mb',type=int,default=70,help='Limite por arquivo, MB')
    ap.add_argument('--forcar',action='store_true',help='Fazer download novamente mesmo quando já baixado')
    args=ap.parse_args()
    raw=json.loads(CATALOGO.read_text(encoding='utf-8'))
    rows=raw['fontes']
    rows=[x for x in rows if x['tipo'] in ('pdf','zip')]
    if args.somente_essenciais: rows=[x for x in rows if x['prioridade'] in ('ALTA','CRITICA')]
    if args.grupo: rows=[x for x in rows if x['grupo']==args.grupo]
    if args.listar:
        for x in rows:print(x['id'],x['tipo'],x['url'])
        print(f'{len(rows)} arquivos diretos listados')
        return 0
    DEST.mkdir(parents=True,exist_ok=True)
    maxbytes=args.max_mb*1024*1024
    res=[]
    for i,x in enumerate(rows,1):
        ext='.'+x['tipo']
        target=DEST/safe_part(x['grupo'])/(safe_part(x['id'])+ext)
        target.parent.mkdir(parents=True,exist_ok=True)
        tmp=target.with_suffix(ext+'.part')
        status={'id':x['id'],'url':x['url'],'tipo':x['tipo'],'arquivo':str(target.relative_to(HERE)),'baixado_em':None,'sha256':None,'bytes':None,'status':'PENDENTE','erro':None}
        print(f'[{i}/{len(rows)}] {x["id"]}...',flush=True)
        try:
            if target.exists() and valid_magic(target,x['tipo']) and not args.forcar:
                status['status']='EXISTENTE_VERIFICADO'
            else:
                req=urllib.request.Request(x['url'],headers=HEADERS,method='GET')
                with urllib.request.urlopen(req,timeout=65) as r, tmp.open('wb') as f:
                    n=0
                    while True:
                        chunk=r.read(1024*256)
                        if not chunk:break
                        n+=len(chunk)
                        if n>maxbytes:raise ValueError(f'Arquivo maior que --max-mb={args.max_mb}')
                        f.write(chunk)
                    status['baixado_em']=time.strftime('%Y-%m-%dT%H:%M:%S%z')
                if not valid_magic(tmp,x['tipo']):
                    raise ValueError('Conteúdo recebido não é PDF/ZIP válido (possível HTML/CAPTCHA/login/bloqueio)')
                tmp.replace(target)
                status['status']='BAIXADO_VERIFICADO'
            data=target.read_bytes();status['bytes']=len(data)
            status['sha256']=hashlib.sha256(data).hexdigest()
            print(f'    OK {status["bytes"]:,} bytes SHA256={status["sha256"][:14]}...')
        except (urllib.error.URLError,ValueError,TimeoutError,OSError,Exception) as ex:
            status['status']='FALHA';status['erro']=f'{type(ex).__name__}: {ex}'
            print('    FALHA:',status['erro'][:260])
            if tmp.exists():tmp.unlink()
        res.append(status)
        (HERE/'DOWNLOAD_RESULTADOS.json').write_text(json.dumps({'data_catalogo':raw['data_pesquisa'],'documentos':res},ensure_ascii=False,indent=2),encoding='utf-8')
    good=sum(x['status']!='FALHA' for x in res)
    print(f'\nFinalizado: {good}/{len(res)} disponíveis. Veja DOWNLOAD_RESULTADOS.json')
    return 0 if good==len(res) else 1

if __name__=='__main__':sys.exit(main())
