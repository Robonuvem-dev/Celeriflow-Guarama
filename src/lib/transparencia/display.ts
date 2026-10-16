import type {PublicCell} from "./query-contract";
export function displayPublicCell(value:PublicCell|undefined,kind?:string){
 if(value===null||value===undefined||value==="")return "Não informado";
 if(kind==="money"){const match=String(value).match(/^(-?)(\d+)(?:\.(\d+))?$/);if(match)return `${match[1]}R$ ${match[2].replace(/\B(?=(\d{3})+(?!\d))/g,".")},${(match[3]||"").padEnd(2,"0")}`;}
 if(kind==="date"){const match=String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);if(match)return `${match[3]}/${match[2]}/${match[1]}`;}
 return String(value);
}
