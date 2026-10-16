"use client";
export function SourceSelector({source,options}:{source:string;options:Record<string,string>}){
 return <select name="source" defaultValue={source} className="mt-1 block w-full rounded border p-2" onChange={event=>{const form=event.currentTarget.form;if(!form)return;for(const field of form.querySelectorAll<HTMLInputElement|HTMLSelectElement>('input[name^="f."],select[name^="f."],select[name="sort"]'))field.value="";}}>{Object.entries(options).map(([key,title])=><option key={key} value={key}>{title}</option>)}</select>;
}
