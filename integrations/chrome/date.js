// Gmail displays local times. Parse only explicit ISO, numeric German or spelled-out month dates;
// ambiguous/relative strings stay empty for the user to confirm.
globalThis.stageForceDate=value=>{
 const raw=String(value||'').trim();
 if(/^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:\d{2})$/.test(raw)){const d=new Date(raw);return Number.isFinite(+d)?d:null;}
 const local=(year,month,day,hour,minute,second=0)=>{const d=new Date(+year,+month-1,+day,+hour,+minute,+second);return d.getFullYear()===+year&&d.getMonth()===+month-1&&d.getDate()===+day&&d.getHours()===+hour&&d.getMinutes()===+minute?d:null;};
 // Spelled-out months, as in the inbox list's date tooltip: "Mo., 20. Okt. 2026, 10:00" or "Mon, Oct 20, 2026, 10:00 AM".
 const text=raw.replace(/[\u00a0\u202f]/g,' ').replace(/^[A-Za-zÄÖÜäöü]{2,4}\.?,\s*/,'');
 const named=text.match(/^(?:(\d{1,2})\.?\s+([A-Za-zÄÖÜäöü]{3,9})\.?|([A-Za-z]{3,9})\.?\s+(\d{1,2}),?)\s+(\d{4}),?\s+(?:um\s+)?(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM|am|pm)?(?:\s+Uhr)?$/);
 if(named){
  const months=['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'],de={mär:'mar',mrz:'mar',mai:'may',okt:'oct',dez:'dec'};
  const word=(named[2]||named[3]).toLowerCase().slice(0,3),month=months.indexOf(de[word]||word)+1;if(!month)return null;
  let hour=+named[6];const half=named[9]?.toUpperCase();if(half){if(hour<1||hour>12)return null;hour=hour%12+(half==='PM'?12:0);}
  return local(named[5],month,named[1]||named[4],hour,named[7],named[8]||0);
 }
 const m=raw.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4}),?\s+(?:um\s+)?(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s+Uhr)?$/);
 if(!m)return null;const [,day,month,year,hour,minute,second='0']=m;
 return local(year,month,day,hour,minute,second);
};
