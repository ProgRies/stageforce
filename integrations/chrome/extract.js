(() => {
 const normalize=s=>s.replace(/\(0\)/g,'').replace(/[^+\d]/g,'');
 const NUMBER='(\\+?\\(?\\d[\\d\\s()/.-]{5,35}\\d)';
 // Long labels may appear anywhere in a segment; single letters (T, M, P, D) only at its start.
 const LONG='tel(?:efon|ephone)?|phone|ph|fon|mobil(?:telefon|e|funk)?|mobile phone|mob|handy|cell(?:phone)?|direkt(?:wahl)?|direct|durchwahl|büro|buero|office|zentrale|hotline';
 const labelled=new RegExp('(?:\\b(?:'+LONG+')\\.?\\s*[:.]?\\s*|[☎📞📱]\\s*)'+NUMBER,'i'),letter=new RegExp('^(?:[tmpd])\\s*[:.]?\\s*'+NUMBER,'i');
 const faxLabel=/^\s*(?:(?:tele)?fax\b|f\s*[:.]?\s*\+?\(?\d)/i,date=/^\d{1,4}[./-]\d{1,2}[./-]\d{1,4}$/;
 const segments=line=>line.split(/\s*[|·•]\s*|\t+|\s{3,}/).filter(s=>s.trim());
 // One line can hold several entries ("Tel. … | Fax … | Mobil …"); fax entries are dropped one by one.
 function linePhones(line){
  const found=[];
  for(const segment of segments(line)){
   if(faxLabel.test(segment))continue;
   const m=letter.exec(segment.trim())||labelled.exec(segment);
   if(m)found.push(m[1].trim());
   else if(/^\+\d[\d\s()/.-]{6,35}\d$/.test(segment.trim()))found.push(segment.trim());
  }
  return found;
 }
 function valid(list){const seen=new Set();return list.map(p=>p.trim()).filter(p=>{const n=normalize(p);if(date.test(p)||!/^\+?\d{6,15}$/.test(n)||seen.has(n))return false;seen.add(n);return true;}).slice(0,10);}
 const signOff=/^(?:--\s*|(?:mit )?(?:freundlichen|besten|herzlichen|lieben|vielen|viele|beste|liebe|sonnige)?\s*(?:grüßen?|gruß)(?:\s.*|[,!.]?)|(?:mfg|vg|lg|bg)\b.*|(?:best|kind|warm|many thanks and)?\s*regards\b.*|best(?: wishes)?,?|cheers\b.*|thanks?(?: you)?[,!]?|danke(?: und grüße)?[,!]?)$/i;
 // Suggestions come from the signature block only, so numbers mentioned in the text are not attached to the sender.
 function signatureBlock(text){
  const lines=text.split('\n');let start=-1;
  for(let i=0;i<lines.length;i++)if(signOff.test(lines[i].trim()))start=i;
  if(start>=0)return lines.slice(start+1).join('\n');
  const filled=lines.map((l,i)=>[l,i]).filter(([l])=>l.trim());
  return filled.length>20?lines.slice(filled[filled.length-20][1]).join('\n'):text;
 }
 function phones(signature,links=[]){
  const current=signature.split(/(?:^|\n)(?:On .{1,250}wrote:|Am .{1,250}schrieb.{0,150}:|[- ]*(?:Forwarded message|Original Message|Ursprüngliche Nachricht|Weitergeleitete Nachricht)[- ]*|From:|Von:)/i)[0];
  const found=current===signature?[...links]:[];
  for(const line of signatureBlock(current.slice(-10000)).split('\n'))found.push(...linePhones(line));
  return valid(found);
 }
 function attachments(node){const items=[];const seen=new Set();for(const card of node.querySelectorAll('.aQH .aZo,.aQH [data-attachment-id]')){
  const name=(card.querySelector('.aV3,[data-filename]')?.textContent||card.getAttribute('data-filename')||'').trim();
  if(!name||seen.has(name))continue;seen.add(name);items.push({name:name.slice(0,500),size:(card.querySelector('.aV2')?.textContent||'').trim().slice(0,100),type:(name.split('.').pop()||'').slice(0,100),referenceOnly:true});
 }return items.slice(0,100);}

 const company=/(?:^|[\s(])(?:gmbh|mbh|ag|ug|kg|kgaa|ohg|gbr|e\.\s?v\.|e\.\s?k\.|se|ltd\.?|limited|inc\.?|llc|llp|plc|corp\.?|co\.|s\.a\.|b\.v\.|holding|group|gruppe)(?=[\s,)]|$)|\s&\s/i;
 const roleWords=/\b(?:geschäftsführ\w*|inhaber\w*|gründer\w*|founder|co-?founder|ceo|cfo|cto|coo|cmo|vorstand\w*|prokurist\w*|leiter\w*|leitung|head|director|direktor\w*|manager\w*|managing|partner\w*|assisten\w*|assistant|referent\w*|sachbearbeit\w*|berater\w*|consultant|einkauf|vertrieb|verkauf|sales|marketing|buchhaltung|accounting|personal|hr|projekt\w*|project|account|key|team\w*|mitarbeiter\w*|associate|officer|specialist|spezialist\w*|koordinat\w*|coordinator|engineer|ingenieur\w*|developer|entwickler\w*|designer\w*|kundenservice|support|abteilung|department|office|büro)\b/i;
 const greeting=/^(?:mit freundlichen|freundliche|beste|viele|liebe|herzliche|best|kind|warm|many|regards|grüße|gruß|cheers|thanks|danke|hallo|hi|hello|dear|sehr geehrte)/i;
 const particle=/^(?:dr\.?|prof\.?|dipl\.?-?\w*\.?|ing\.?|mag\.?|med\.?|rer\.?|nat\.?|von|van|vom|zu|de|der|den|di|da|le|la|del|mr\.?|mrs\.?|ms\.?|frau|herr)$/i;
 const validName=s=>s&&s.length<=100&&!/[@\d:=<>/|]/.test(s)&&!/^(?:kundendetails|customer details|e-?mail|telefon|mobiltelefon|phone|mobile|fax|www\.|https|mit freundlichen|best regards|kind regards)/i.test(s);
 // A person's name: 1–5 capitalised words (titles and particles allowed), not a company, role or greeting.
 function personName(s,single=false){
  if(!validName(s)||company.test(s)||roleWords.test(s)||greeting.test(s))return false;
  const words=s.split(/\s+/),core=words.filter(w=>!particle.test(w));
  return core.length>=(single?1:2)&&core.length<=4&&core.every(w=>/^\p{Lu}[\p{L}'’.-]*$/u.test(w));
 }
 function field(lines,pattern){for(let i=0;i<lines.length;i++){const m=pattern.exec(lines[i]);if(m){const v=(m[1]||'').trim()||(lines[i+1]||'').trim();if(v&&!pattern.test(v))return v;}}return '';}

 function contact(selection){
  const source=String(selection||'').slice(0,10000).replace(/\r/g,'');
  const emails=[...new Set((source.match(/[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)||[]).map(s=>s.toLowerCase()))].slice(0,10);
  const lines=source.split('\n').map(s=>s.trim()).filter(Boolean),found=[];
  for(let i=0;i<lines.length;i++){
   const line=lines[i];if(i>0&&/^(?:fax|telefax)\s*:?$/i.test(lines[i-1]))continue;
   const label=new RegExp('^(?:'+LONG+'|[tmpd])\\.?\\s*:?\\s*$','i').test(line);
   found.push(...linePhones(line));if(label&&lines[i+1])found.push(lines[i+1]);
   for(const segment of segments(line))if(!faxLabel.test(segment))for(const match of segment.matchAll(/(?:\+\d[\d ()/.-]{5,32}\d)/g))found.push(match[0]);
   if(/^\+?[\d ()/.-]{6,40}$/.test(line))found.push(line);
  }
  const numbers=valid(found);
  let name=field(lines,/^(?:name|full name|vollständiger name|kontakt|contact|ansprechpartner(?:in)?)\s*:?\s*(.*)$/i);
  if(name&&!validName(name))name='';
  if(!name){const first=field(lines,/^(?:vorname|first name|given name)\s*:?\s*(.*)$/i),last=field(lines,/^(?:nachname|familienname|last name|surname|family name)\s*:?\s*(.*)$/i),both=[first,last].filter(validName).join(' ');if(both)name=both;}
  if(!name){const inline=/^([^<>\n]{2,100})\s*<[^<>\s]+@[^<>\s]+>/.exec(source.trim());if(inline&&validName(inline[1].trim().replace(/^"|"$/g,'')))name=inline[1].trim().replace(/^"|"$/g,'');}
  if(!name){
   const end=lines.findIndex(l=>emails.some(e=>l.toLowerCase().includes(e))),scope=end>0?lines.slice(0,end):lines;
   name=scope.find(l=>personName(l))||'';
   if(!name){const after=lines.findIndex(l=>greeting.test(l));if(after>=0&&personName(lines[after+1]||'',true))name=lines[after+1];}
  }
  if(!name&&emails[0])name=emails[0].split('@')[0].split('+')[0].split(/[._-]+/).map(p=>p.charAt(0).toUpperCase()+p.slice(1)).join(' ');
  if(!name&&!emails.length&&lines.length===1&&validName(lines[0]))name=lines[0];
  let role=field(lines,/^(?:position|funktion|rolle|role|job ?title|titel|abteilung|department)\s*:?\s*(.*)$/i);
  if(!role&&name){const i=lines.indexOf(name),next=lines[i+1]||'';if(i>=0&&validName(next)&&roleWords.test(next)&&!company.test(next))role=next;}
  let organisation=field(lines,/^(?:firma|unternehmen|company|organisation|organization|arbeitgeber)\s*:?\s*(.*)$/i);
  if(!organisation)organisation=lines.flatMap(segments).map(s=>s.trim()).find(l=>l.length<=120&&company.test(l)&&!/@|https?:|www\./i.test(l)&&!/^\+?[\d ()/.-]+$/.test(l))||'';
  return{name:name.slice(0,300),emails,phones:numbers,role:role.slice(0,500),organisation:organisation.slice(0,300)};
 }
 // Cuts reply history that Gmail did not mark as a quote (e.g. Outlook replies): the first reply header and everything after it.
 function stripQuoted(text){
  const lines=String(text||'').split('\n');
  for(let i=0;i<lines.length;i++){
   const line=lines[i].trim();
   const marker=/^(?:On .{1,250} wrote:|Am .{1,250} schrieb .{0,150}:|-{2,}\s*(?:Original Message|Ursprüngliche Nachricht)\s*-{2,})$/i.test(line);
   const header=/^(?:From|Von):\s*\S/i.test(line)&&lines.slice(i+1,i+5).some(l=>/^(?:Sent|Date|Gesendet|Datum):\s*\S/i.test(l.trim()));
   if(marker||header)return lines.slice(0,i).join('\n').trim();
  }
  return String(text||'').trim();
 }
 globalThis.stageForceExtract={phones,attachments,normalize,contact,stripQuoted};
})();
