(() => {
 const normalize=s=>s.replace(/\(0\)/g,'').replace(/[^+\d]/g,'');
 function phones(signature,links=[]){
  const current=signature.split(/(?:^|\n)(?:On .{1,250}wrote:|Am .{1,250}schrieb.{0,150}:|[- ]*(?:Forwarded message|Original Message|Ursprüngliche Nachricht|Weitergeleitete Nachricht)[- ]*|From:|Von:)/i)[0];
  const found=current===signature?[...links]:[];
  for(const line of current.slice(-10000).split('\n')){
   if(/\b(fax|telefax)\b/i.test(line))continue;
   const labelled=/(?:\b(?:tel(?:efon|ephone)?|phone|mobil(?:telefon|e)?|direct|durchwahl|fon)\.?\s*[:.]?\s*|[☎📞]\s*)(\+?\d[\d\s()/.-]{5,35}\d)/i.exec(line);
   if(labelled)found.push(labelled[1].trim());
  }
  const seen=new Set();return found.filter(p=>{const n=normalize(p);if(!/^\+?\d{6,15}$/.test(n)||seen.has(n))return false;seen.add(n);return true;}).slice(0,10);
 }
 function attachments(node){const items=[];const seen=new Set();for(const card of node.querySelectorAll('.aQH .aZo,.aQH [data-attachment-id]')){
  const name=(card.querySelector('.aV3,[data-filename]')?.textContent||card.getAttribute('data-filename')||'').trim();
  if(!name||seen.has(name))continue;seen.add(name);items.push({name:name.slice(0,500),size:(card.querySelector('.aV2')?.textContent||'').trim().slice(0,100),type:(name.split('.').pop()||'').slice(0,100),referenceOnly:true});
 }return items.slice(0,100);}

 function contact(selection){
  const source=String(selection||'').slice(0,10000).replace(/\r/g,'');
  const emails=[...new Set((source.match(/[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)||[]).map(s=>s.toLowerCase()))].slice(0,10);
  const lines=source.split('\n').map(s=>s.trim()).filter(Boolean),found=[];
  for(let i=0;i<lines.length;i++){
   const line=lines[i];if(/\b(?:fax|telefax)\b/i.test(line)||i>0&&/^(?:fax|telefax)\s*:?$/i.test(lines[i-1]))continue;
   const labelled=/^(?:tel(?:efon|ephone)?|phone|mobil(?:telefon|e)?|mobile phone|direct|durchwahl|fon)\.?\s*:?\s*$/i.test(line);
   found.push(...phones(line));if(labelled&&lines[i+1])found.push(lines[i+1]);
   for(const match of line.matchAll(/(?:\+\d[\d ()/.-]{5,32}\d)/g))found.push(match[0]);
   if(/^\+?[\d ()/.-]{6,40}$/.test(line)&&!/^\d{1,4}[./-]\d{1,2}[./-]\d{1,4}$/.test(line))found.push(line);
  }
  const seen=new Set(),numbers=found.map(s=>s.trim()).filter(p=>{const n=normalize(p);if(!/^\+?\d{6,15}$/.test(n)||seen.has(n))return false;seen.add(n);return true;}).slice(0,10);
  const label=/^(?:name|full name|kontakt|contact|ansprechpartner(?:in)?)\s*:?\s*(.*)$/i;
  const validName=s=>s&&s.length<=100&&!/[@\d:=<>/]/.test(s)&&!/^(?:kundendetails|customer details|e-?mail|telefon|mobiltelefon|phone|mobile|fax|www\.|https|mit freundlichen|best regards|kind regards)/i.test(s);
  let name='';for(let i=0;i<lines.length;i++){const m=label.exec(lines[i]);if(m){const candidate=m[1]||lines[i+1]||'';if(validName(candidate)){name=candidate;break;}}}
  if(!name){const inline=/^([^<>\n]{2,100})\s*<[^<>\s]+@[^<>\s]+>/.exec(source.trim());if(inline&&validName(inline[1].trim()))name=inline[1].trim();}
  if(!name){const index=lines.findIndex(l=>emails.some(e=>l.toLowerCase().includes(e)));if(index>0&&validName(lines[index-1]))name=lines[index-1];}
  if(!name&&emails[0])name=emails[0].split('@')[0].split('+')[0].split(/[._-]+/).map(p=>p.charAt(0).toUpperCase()+p.slice(1)).join(' ');
  if(!name&&!emails.length&&lines.length===1&&validName(lines[0]))name=lines[0];
  return{name:name.slice(0,300),emails,phones:numbers};
 }
 globalThis.stageForceExtract={phones,attachments,normalize,contact};
})();
