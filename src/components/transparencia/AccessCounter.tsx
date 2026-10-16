"use client";
import {useEffect,useRef} from "react";
export function AccessCounter({enabled,slug,query}:{enabled:boolean;slug:string;query:string}){
 const sent=useRef("");useEffect(()=>{const key=`${slug}:${query}`;if(!enabled||sent.current===key)return;sent.current=key;void fetch("/api/transparencia/acessos",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({slug,query}),keepalive:true}).catch(()=>{});},[enabled,slug,query]);return null;
}
