"use client";
import {useEffect,useRef,useState} from "react";
import Image from "next/image";
export function PublicNotice({title,text,imageUrl,frequency="VISIT",noticeKey="default"}:{title:string;text:string;imageUrl:string|null;frequency?:"VISIT"|"SESSION"|"DAILY";noticeKey?:string}){
 const [closed,setClosed]=useState(false),dialog=useRef<HTMLDialogElement>(null);
 const key=`transparency-notice:${noticeKey}:${frequency==="DAILY"?new Date().toISOString().slice(0,10):"session"}`;
 useEffect(()=>{if(closed||!dialog.current)return;try{const storage=frequency==="SESSION"?sessionStorage:localStorage;if(frequency!=="VISIT"&&storage.getItem(key)==="1")return;}catch{}if(!dialog.current.open)dialog.current.showModal();},[closed,frequency,key]);
 const dismiss=()=>{try{if(frequency!=="VISIT")(frequency==="SESSION"?sessionStorage:localStorage).setItem(key,"1");}catch{}dialog.current?.close();setClosed(true);};
 return closed?null:<dialog ref={dialog} aria-labelledby="transparency-notice-title" onCancel={event=>{event.preventDefault();dismiss();}} className="relative w-[min(90vw,650px)] rounded border border-sky-200 bg-white p-5 text-slate-900 backdrop:bg-black/40"><h2 id="transparency-notice-title" className="pr-10 text-lg font-bold">{title}</h2><button type="button" autoFocus onClick={dismiss} aria-label="Fechar aviso" className="absolute right-3 top-3 rounded border px-2 py-1">×</button><p className="mt-3 whitespace-pre-wrap text-sm">{text}</p>{imageUrl&&<Image unoptimized src={imageUrl} alt={title||"Aviso institucional"} width={600} height={200} className="mt-3 max-h-48 w-auto object-contain"/>}</dialog>;
}
