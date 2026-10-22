// Gmail displays local times. Parse only explicit ISO or numeric German dates;
// ambiguous/relative strings stay empty for the user to confirm.
globalThis.stageForceDate=value=>{
 const raw=String(value||'').trim();
 if(/^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:\d{2})$/.test(raw)){const d=new Date(raw);return Number.isFinite(+d)?d:null;}
 const m=raw.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4}),?\s+(?:um\s+)?(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s+Uhr)?$/);
 if(!m)return null;const [,day,month,year,hour,minute,second='0']=m;
 const d=new Date(+year,+month-1,+day,+hour,+minute,+second);
 return d.getFullYear()===+year&&d.getMonth()===+month-1&&d.getDate()===+day&&d.getHours()===+hour&&d.getMinutes()===+minute?d:null;
};
