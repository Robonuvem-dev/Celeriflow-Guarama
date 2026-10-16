// Next/Vercel may normalize request.url to an internal host. Compare the
// browser Origin with the actual Host header, as Server Actions also do.
export function isSameOriginRequest(request:Request){
 const raw=request.headers.get("origin");if(!raw)return false;
 try{const origin=new URL(raw),host=request.headers.get("host")||new URL(request.url).host;return ["http:","https:"].includes(origin.protocol)&&!origin.username&&!origin.password&&origin.origin===raw&&origin.host.toLowerCase()===host.toLowerCase();}catch{return false;}
}
