import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openDB} from '../server/db.mjs';
import {createOrg,entity,save,contacts,history,search,addContact} from '../server/crm.mjs';
import {parseCSV,inspectCSV,csvRecords,stageFastbill,fastbillBatches,fastbillRows,fastbillPreview,decideFastbill,deleteFastbillBatch,fetchFastbillPage,NO_EMAIL} from '../server/fastbill.mjs';
import {reviewItems} from '../server/crm.mjs';
import {makeServer} from '../server/http.mjs';
import {createSession} from '../server/auth.mjs';
import {enableMfa,newSecret} from '../server/mfa.mjs';
function setup(){const db=openDB(':memory:');for(const id of['one','two'])db.prepare('INSERT INTO users VALUES(?,?,?,?,1,?)').run(id,id+'@example.test',id,'unused','2026-01-01');enableMfa(db,'one',newSecret());return{db,user:{id:'one',email:'one@example.test'},other:{id:'two',email:'two@example.test'}};}
const sample='Kundennummer;Firmenname;Vorname;Nachname;E-Mail;Telefon;Ort;IBAN;Betrag brutto\r\n0012;Example Studio;Pat;Test;pat@example.test;+49 12345678;Bonn;BANKSECRET;999.00';
function stage(db,user,text=sample,opts={}){return stageFastbill(db,user,{scope:'main',records:csvRecords(text),...opts});}
const first=(db,user,b)=>fastbillRows(db,user,{batchId:b.id}).items[0];

test('CSV quotes, separators, BOM, multiline and column validation preserve text and leading IDs',()=>{
 const p=parseCSV('\uFEFFsep=;\r\nFirma;Ansprechpartner\r\n"Example; Studio";"Pat ""Test""\nSecond line"\r\n');assert.equal(p.rows[0][0],'Example; Studio');assert.equal(p.rows[0][1],'Pat "Test"\nSecond line');
 assert.equal(parseCSV('Firma,Telefon\nTest,0123456').rows[0][1],'0123456');assert.equal(parseCSV('Firma\tTelefon\nTest\t0123456').rows.length,1);
 assert.throws(()=>parseCSV('Firma;firma\nA;B'),/eindeutige/);assert.throws(()=>parseCSV('Firma;Ort\nA'),/Spaltenzahl/);assert.throws(()=>parseCSV('Firma\n"A'),/Textfeld/);
 assert.throws(()=>csvRecords(sample,{name:0,phone:0}),/Spaltenzuordnung/);assert.throws(()=>csvRecords(sample,{constructor:0}),/Spaltenzuordnung/);
 const r=csvRecords(sample)[0];assert.equal(r.customerNumber,'0012');assert.equal(r.contactName,'Pat Test');assert.equal(r.phones[0],'+49 12345678');assert.ok(!JSON.stringify(r).includes('BANKSECRET'));assert.ok(!JSON.stringify(r).includes('999.00'));
 const i=inspectCSV(sample);assert.equal(i.count,1);assert.equal(i.mapping.phone,5);
 assert.throws(()=>csvRecords(sample,undefined,'invoices'),/Rechnungsnummer/);
});

test('staging never changes CRM; ambiguous matches remain choices; account and user isolation',()=>{const{db,user,other}=setup();try{
 createOrg(db,user,'Example Studio');createOrg(db,user,'Example Studio');const before=db.prepare('SELECT count(*) n FROM activities').get().n;const b=stage(db,user);const r=first(db,user,b);const p=fastbillPreview(db,user,r.id);assert.equal(p.candidates.length,2);assert.equal(p.status,'pending');assert.equal(db.prepare('SELECT count(*) n FROM activities').get().n,before);assert.throws(()=>fastbillPreview(db,other,r.id),/nicht gefunden/);assert.throws(()=>fastbillRows(db,other,{batchId:b.id}),/nicht gefunden/);assert.equal(fastbillBatches(db,other).length,0);
 decideFastbill(db,user,{rowId:r.id,decision:'ignored',note:'Not Stage'});assert.equal(fastbillRows(db,user,{batchId:stage(db,user).id}).total,0);
 }finally{db.close();}});

test('explicit enrichment is atomic, versioned, idempotent and never changes relationship or last contact',()=>{const{db,user}=setup();try{
 let org=createOrg(db,user,'Example Studio');org=save(db,user,{id:org.id,version:org.version,requestId:'prepare',fields:{9:'Kunde',15:'2025-01-01',19:'Vertrag manuell prüfen.'}}).entity;
 const b=stage(db,user),row=first(db,user,b);const request={rowId:row.id,decision:'applied',id:org.id,version:org.version,addContact:true,fields:{4:'Bonn'}};
 assert.throws(()=>decideFastbill(db,user,{...request,fields:{9:'Lead'}}),/nur Link/);assert.equal(contacts(db,org.id).length,0);
 assert.throws(()=>decideFastbill(db,user,{...request,contact:{email:'bad'}}),/E-Mail/);assert.equal(entity(db,org.id).values[4],'');
 const saved=decideFastbill(db,user,request).entity;assert.equal(saved.values[9],'Kunde');assert.equal(saved.values[15],'2025-01-01');assert.equal(saved.values[19],'Vertrag manuell prüfen.');assert.equal(contacts(db,org.id).length,1);assert.ok(search(db,'Bonn').includes(org.id));assert.equal(history(db,org.id).items[0].is_contact,false);
 assert.equal(decideFastbill(db,user,request).alreadySaved,true);assert.equal(contacts(db,org.id).length,1);
 const repeat=stage(db,user);assert.equal(fastbillRows(db,user,{batchId:repeat.id}).total,0);assert.equal(fastbillRows(db,user,{batchId:repeat.id,status:'applied'}).total,1);
 const changed=stage(db,user,sample.replace('Bonn','Berlin')),next=first(db,user,changed);assert.match(fastbillPreview(db,user,next.id).candidates[0].reason,/^Bestätigte Zuordnung/);assert.throws(()=>decideFastbill(db,user,{...request,rowId:next.id}),/inzwischen/);assert.equal(first(db,user,changed).status,'pending');
 decideFastbill(db,user,{...request,rowId:next.id,version:saved.version});assert.equal(contacts(db,org.id).length,1);
 }finally{db.close();}});

test('ignored evidence is remembered, changed evidence resurfaces and decisions can be reopened',()=>{const{db,user}=setup();try{
 const b=stage(db,user),r=first(db,user,b);decideFastbill(db,user,{rowId:r.id,decision:'ignored',note:'Other project'});
 const again=stage(db,user);assert.equal(fastbillRows(db,user,{batchId:again.id}).total,0);const ignored=fastbillRows(db,user,{batchId:again.id,status:'ignored'}).items[0];
 const changed=stage(db,user,sample.replace('Bonn','Berlin'));assert.equal(fastbillRows(db,user,{batchId:changed.id}).total,1);
 const differentAccount=stage(db,user,sample,{scope:'other-account'});assert.equal(first(db,user,differentAccount).status,'pending');
 decideFastbill(db,user,{rowId:ignored.id,decision:'pending'});assert.equal(fastbillPreview(db,user,ignored.id).status,'pending');deleteFastbillBatch(db,user,b.id);assert.equal(db.prepare('SELECT count(*) n FROM fastbill_rows WHERE batch_id=?').get(b.id).n,0);
 }finally{db.close();}});

test('cross-batch concurrent decisions conflict; customer IDs and numbers are separate and both map',()=>{const{db,user,other}=setup();try{
 const csv='CUSTOMER_ID;CUSTOMER_NUMBER;ORGANIZATION\n45;0012;Example Studio',org=createOrg(db,user,'Example Studio');const b=stage(db,user,csv),r=first(db,user,b),second=stage(db,other,csv),r2=first(db,other,second);
 decideFastbill(db,user,{rowId:r.id,id:org.id,version:org.version,decision:'applied'});assert.throws(()=>decideFastbill(db,other,{rowId:r2.id,decision:'ignored'}),/bereits bearbeitet|anderen Import/);
 const contact=stage(db,user,'CUSTOMER_ID;FIRST_NAME;LAST_NAME;EMAIL\n45;Pat;Test;pat@example.test');assert.equal(fastbillPreview(db,user,first(db,user,contact).id).candidates[0].id,org.id);
 const unrelated=stage(db,user,'CUSTOMER_ID;ORGANIZATION\n0012;Different');assert.equal(fastbillPreview(db,user,first(db,user,unrelated).id).candidates.length,0);
 }finally{db.close();}});

test('repeated API pages append idempotently to one owned batch',()=>{const{db,user,other}=setup();try{
 const b=stage(db,user),again=stage(db,user,sample,{batchId:b.id});assert.equal(again.count,1);assert.equal(again.duplicates,1);assert.equal(fastbillBatches(db,user).length,1);
 const changed=stage(db,user,sample.replace('0012','0013'),{batchId:b.id});assert.equal(changed.count,2);assert.throws(()=>stage(db,other,sample,{batchId:b.id}),/nicht gefunden/);assert.throws(()=>stage(db,user,sample,{batchId:b.id,scope:'other'}),/anderen Konto/);
 }finally{db.close();}});

test('API uses only fixed read services, caps pages, strips financial data and never returns credentials',async()=>{
 const calls=[];const fetcher=async(url,init)=>{calls.push({url,init});return new Response(JSON.stringify({RESPONSE:{CUSTOMERS:[{CUSTOMER_ID:'45',CUSTOMER_NUMBER:'0012',ORGANIZATION:'Example',PHONE:'01234567',BANK_IBAN:'BANKSECRET',DOCUMENT_HISTORY_URL:'https://secret.invalid'}]}}));};
 const r=await fetchFastbillPage({email:'owner@example.test',apiKey:'secret',kind:'customers',offset:100},fetcher);assert.equal(r.count,1);assert.equal(r.nextOffset,null);assert.equal(r.records[0].customerId,'45');assert.ok(!JSON.stringify(r).includes('BANKSECRET'));assert.ok(!JSON.stringify(r).includes('secret'));assert.equal(calls[0].url,'https://my.fastbill.com/api/1.0/api.php');assert.equal(calls[0].init.redirect,'error');assert.deepEqual(JSON.parse(calls[0].init.body),{SERVICE:'customer.get',LIMIT:100,OFFSET:100});
 await assert.rejects(fetchFastbillPage({email:'owner@example.test',apiKey:'secret',kind:'invoice.sendbyemail'},fetcher),/Ungültiger/);assert.equal(calls.length,1);
 const options={email:'owner@example.test',apiKey:'secret'};await assert.rejects(fetchFastbillPage(options,async()=>new Response(JSON.stringify({RESPONSE:{ERRORS:['secret leaked from upstream']}}))),/FastBill meldet/);
 await assert.rejects(fetchFastbillPage(options,async()=>new Response('not JSON')),/fehlgeschlagen/);
 const full=await fetchFastbillPage(options,async()=>new Response(JSON.stringify({RESPONSE:{CUSTOMERS:Array.from({length:100},(_,i)=>({CUSTOMER_ID:String(i),ORGANIZATION:'Example '+i}))}})));assert.equal(full.nextOffset,100);
 for(const[kind,container,service]of[['contacts','CONTACTS','contact.get'],['invoices','INVOICES','invoice.get']]){
  await fetchFastbillPage({...options,kind},async(url,init)=>{assert.equal(JSON.parse(init.body).SERVICE,service);return new Response(JSON.stringify({RESPONSE:{[container]:[]}}));});
 }
});

test('FastBill HTTP routes require signed-in session, origin and CSRF; no arbitrary API service relay',async()=>{const{db,user}=setup();const session=createSession(db,user),server=makeServer(db,{origin:'http://localhost:3000'});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;try{
 const post=(headers,body)=>fetch(base+'/api/fastbill',{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});const valid={Origin:'http://localhost:3000',Cookie:'stage_session='+session.token,'X-CSRF-Token':session.csrf};
 assert.equal((await post({Origin:valid.Origin},{action:'batches'})).status,401);assert.equal((await post({...valid,Origin:'https://evil.invalid'},{action:'batches'})).status,403);assert.equal((await post({...valid,'X-CSRF-Token':'wrong'},{action:'batches'})).status,403);
 let res=await post(valid,{action:'csv',text:sample,scope:'main'});assert.equal(res.status,200);const b=(await res.json()).data;res=await post(valid,{action:'rows',batchId:b.id});assert.equal((await res.json()).data.total,1);
 res=await post(valid,{action:'api',email:'owner@example.test',apiKey:'never-used',kind:'customer.delete'});assert.equal(res.status,400);
 assert.equal((await post(valid,{action:'arbitrary'})).status,400);
 }finally{await new Promise(r=>server.close(r));db.close();}});

test('version 2 upgrades preserve CRM and add empty import tables',()=>{const dir=mkdtempSync(join(tmpdir(),'stage-fastbill-'));let db=openDB(join(dir,'crm.sqlite'));try{
 const o=createOrg(db,null,'Example');db.exec('DROP TABLE fastbill_rows; DROP TABLE fastbill_batches; DROP TABLE fastbill_decisions; DROP TABLE fastbill_mappings; DELETE FROM schema_versions WHERE version=3; PRAGMA user_version=2');db.close();db=openDB(join(dir,'crm.sqlite'));assert.equal(db.prepare('PRAGMA user_version').get().user_version,11);assert.equal(entity(db,o.id).values[1],'Example');assert.equal(db.prepare('SELECT count(*) n FROM fastbill_batches').get().n,0);assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0);
 }finally{db.close();rmSync(dir,{recursive:true,force:true});}});

test('reviewer can append addresses to an existing contact without overwriting its name or creating a duplicate',()=>{const{db,user}=setup();try{
 const org=createOrg(db,user,'Example Studio');const cid=addContact(db,org.id,{name:'Pat Test',e_mails:['pat@example.test'],telefone:['0123456789']},true);const b=stage(db,user),r=first(db,user,b);
 const saved=decideFastbill(db,user,{rowId:r.id,decision:'applied',id:org.id,version:org.version,addContact:true,contact:{existingId:cid,name:'Do not replace',email:'pat@example.test',phones:'+49 12345678'}}).entity;
 const cs=contacts(db,org.id);assert.equal(cs.length,1);assert.equal(cs[0].name,'Pat Test');assert.deepEqual(cs[0].e_mails,['pat@example.test']);assert.deepEqual(cs[0].telefone,['0123456789','+49 12345678']);assert.equal(saved.values[15],'');
 decideFastbill(db,user,{rowId:r.id,decision:'pending'});assert.equal(db.prepare('SELECT count(*) n FROM fastbill_mappings').get().n,0);assert.equal(contacts(db,org.id)[0].telefone.length,2);
 const other=createOrg(db,user,'Other');db.prepare('INSERT INTO organisation_contacts VALUES(?,?,0)').run(other.id,cid);
 assert.throws(()=>decideFastbill(db,user,{rowId:r.id,decision:'applied',id:org.id,version:saved.version,addContact:true,contact:{existingId:cid}}),/Gemeinsam/);
 }finally{db.close();}});

test('invoice context is staged without amounts, taxes, bank details or automatic CRM changes',()=>{const{db,user}=setup();try{
 const csv='Kundennummer;Firmenname;Rechnungsnummer;Datum;Titel;Beschreibung;Storniert?;Betrag netto;Steuerbetrag;IBAN\n0012;Example Studio;R-12;01.03.2024;Other project;Website;ja;500;95;BANKSECRET';
 const records=csvRecords(csv,undefined,'invoices');assert.equal(records[0].canceled,'ja');assert.equal(records[0].reference,'R-12');const b=stageFastbill(db,user,{scope:'main',records});assert.equal(first(db,user,b).payload.description,'Website');assert.ok(!JSON.stringify(first(db,user,b)).includes('BANKSECRET'));assert.equal(db.prepare('SELECT count(*) n FROM organisations').get().n,0);
 }finally{db.close();}});

test('click to add creates one organisation per row, refuses likely duplicates and marks missing email for Prüfen',()=>{const{db,user}=setup();try{
 const csv='Kundennummer;Firmenname;Vorname;Nachname;E-Mail;Telefon;Ort\n0012;Example Studio GmbH;Pat;Test;pat@example.test;+49 12345678;Bonn\n0012;Example Studio GmbH;Sam;Other;sam@example.test;;Bonn\n0013;Quiet Theatre;;;;0221 9876543;Köln';
 const b=stage(db,user,csv),[a,second,quiet]=fastbillRows(db,user,{batchId:b.id}).items;
 assert.equal(a.match,null);const created=decideFastbill(db,user,{rowId:a.id,decision:'create'}).entity;
 assert.equal(created.values[1],'Example Studio GmbH');assert.equal(created.values[9],'Lead');assert.equal(created.values[4],'Bonn');assert.equal(contacts(db,created.id)[0].e_mails[0],'pat@example.test');assert.equal(created.values[19],'');
 // The second contact of the same customer points at the organisation just added instead of a new one.
 const hint=fastbillRows(db,user,{batchId:b.id}).items.find(r=>r.id===second.id).match;assert.equal(hint.id,created.id);assert.match(hint.reason,/Bestätigte Zuordnung/);
 assert.throws(()=>decideFastbill(db,user,{rowId:second.id,decision:'create'}),/Mögliche Treffer: Example Studio GmbH/);assert.equal(db.prepare('SELECT count(*) n FROM organisations').get().n,1);
 const q=decideFastbill(db,user,{rowId:quiet.id,decision:'create'}).entity;assert.equal(q.values[19],NO_EMAIL);assert.ok(reviewItems(db).some(r=>r.id===q.id));
 assert.throws(()=>decideFastbill(db,user,{rowId:quiet.id,decision:'create'}),/bereits bearbeitet/);assert.equal(db.prepare('SELECT count(*) n FROM organisations').get().n,2);
 const forced=decideFastbill(db,user,{rowId:second.id,decision:'create',confirmDuplicate:true}).entity;assert.notEqual(forced.id,created.id);
 }finally{db.close();}});

test('likely matches: legal forms, domains, phones and contact names suggest existing organisations',()=>{const{db,user}=setup();try{
 const studio=createOrg(db,user,'Example Studio');const theatre=createOrg(db,user,'Stadttheater Musterstadt e.V.');addContact(db,theatre.id,{name:'Kim Muster',e_mails:['kim@theater-muster.de'],telefone:['0221 9876543']},true);
 const csv='Kundennummer;Firmenname;Vorname;Nachname;E-Mail;Telefon\n1;Example Studio GmbH & Co. KG;;;;\n2;Theater Muster;;;info@theater-muster.de;\n3;Ganz Anders;;;;+49 221 9876543\n4;Kim Muster;Kim;Muster;;\n5;Studio;;;office@gmail.com;';
 const rows=fastbillRows(db,user,{batchId:stage(db,user,csv).id}).items,best=i=>rows[i].match;
 assert.equal(best(0).id,studio.id);assert.match(best(0).reason,/Ähnlicher Name/);
 assert.equal(best(1).id,theatre.id);assert.match(best(1).reason,/Gleiche Domain/);
 assert.equal(best(2).id,theatre.id);assert.match(best(2).reason,/Telefonnummer/);
 assert.equal(best(3).id,theatre.id);
 assert.equal(best(4),null,'a short generic name and a free-mail domain are no evidence');assert.match(best(3).reason,/Ansprechpartner/);
 }finally{db.close();}});

test('re-importing the same file only asks about undecided rows and decisions reach pending copies in older runs',()=>{const{db,user}=setup();try{
 const csv='Kundennummer;Firmenname\n1;Alpha Bühne\n2;Beta Saal\n3;Gamma Halle';
 const first=stage(db,user,csv),[a,b2]=fastbillRows(db,user,{batchId:first.id}).items;
 decideFastbill(db,user,{rowId:a.id,decision:'create'});decideFastbill(db,user,{rowId:b2.id,decision:'ignored'});
 const again=stage(db,user,csv);assert.equal(again.pending,1);assert.equal(again.known,2);
 const open=fastbillRows(db,user,{batchId:again.id}).items;assert.deepEqual(open.map(r=>r.payload.name),['Gamma Halle']);
 decideFastbill(db,user,{rowId:open[0].id,decision:'ignored'});assert.equal(fastbillBatches(db,user).every(b=>b.pending===0),true);
 }finally{db.close();}});

test('a new organisation is a Kunde only when an invoice export shows a real bill for that customer',()=>{const{db,user}=setup();try{
 stageFastbill(db,user,{scope:'main',records:csvRecords('Kundennummer;Firmenname;Rechnungsnummer;Typ;Storniert?\n1;Alpha;R-1;Rechnung;nein\n2;Beta;R-2;Rechnung;ja\n3;Gamma;R-3;Entwurf;nein',undefined,'invoices')});
 const rows=fastbillRows(db,user,{batchId:stage(db,user,'Kundennummer;Firmenname\n1;Alpha\n2;Beta\n3;Gamma\n4;Delta').id}).items;
 assert.deepEqual(rows.map(r=>decideFastbill(db,user,{rowId:r.id,decision:'create',confirmDuplicate:true}).entity.values[9]),['Kunde','Lead','Lead','Lead']);
 }finally{db.close();}});
