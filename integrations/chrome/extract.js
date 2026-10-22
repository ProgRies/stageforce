(() => {
 const normalize=s=>s.replace(/\(0\)/g,'').replace(/[^+\d]/g,'');
 function phones(signature,links=[]){
  const current=signature.split(/(?:^|\n)(?:On .{1,250}wrote:|Am .{1,250}schrieb.{0,150}:|[- ]*(?:Forwarded message|Original Message|Ursprüngliche Nachricht|Weitergeleitete Nachricht)[- ]*|From:|Von:)/i)[0];
  const found=current===signature?[...links]:[];
  for(const line of current.slice(-10000).split('\n')){
   if(/\b(fax|telefax)\b/i.test(line))continue;
   const labelled=/(?:\b(?:tel(?:efon|ephone)?|phone|mobil(?:e)?|direct|durchwahl|fon)\.?\s*[:.]?\s*|[☎📞]\s*)(\+?\d[\d\s()/.-]{5,35}\d)/i.exec(line);
   if(labelled)found.push(labelled[1].trim());
  }
  const seen=new Set();return found.filter(p=>{const n=normalize(p);if(!/^\+?\d{6,15}$/.test(n)||seen.has(n))return false;seen.add(n);return true;}).slice(0,10);
 }
 function attachments(node){const items=[];const seen=new Set();for(const card of node.querySelectorAll('.aQH .aZo,.aQH [data-attachment-id]')){
  const name=(card.querySelector('.aV3,[data-filename]')?.textContent||card.getAttribute('data-filename')||'').trim();
  if(!name||seen.has(name))continue;seen.add(name);items.push({name:name.slice(0,500),size:(card.querySelector('.aV2')?.textContent||'').trim().slice(0,100),type:(name.split('.').pop()||'').slice(0,100),referenceOnly:true});
 }return items.slice(0,100);}
 globalThis.stageForceExtract={phones,attachments,normalize};
})();
