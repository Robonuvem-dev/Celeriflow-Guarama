import {Prisma} from "@prisma/client";
import type {PublicRecord} from "./query-contract";
export function monthlyTransparencyTotals(records:PublicRecord[],field:string){
 const months=Array.from({length:12},(_,index)=>({month:index+1,value:new Prisma.Decimal(0),complete:true,count:0}));
 let undated=0;
 for(const row of records){if(row.excludedFromTotals?.includes(field))continue;const match=String(row.values.date||"").match(/^\d{4}-(\d{2})-/),month=match?Number(match[1]):0;if(month<1||month>12){undated++;continue;}const target=months[month-1];target.count++;const value=row.values[field];if(value===null||value===undefined||value==="")target.complete=false;else target.value=target.value.add(String(value));}
 return {undated,months:months.map(month=>({month:month.month,count:month.count,value:month.complete&&undated===0?month.value.toFixed(2):null}))};
}
