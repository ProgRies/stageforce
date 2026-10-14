import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewOverview,reviewFindings,findingsFor,issues,phone,REVIEW_CATEGORIES} from '../src/domain.ts';
import {openDB} from '../server/db.mjs';
import {createOrg,addContact,entity,listData} from '../server/crm.mjs';
function record(id,fields={}){const values=Array(24).fill('');Object.assign(values,{0:id,1:'Fictional organisation '+id,9:'Lead',10:'Unbearbeitet',14:'+49 12345678'},fields);return{id,row:0,values,version:'1'};}

test('review counts organisations once overall and once per group, not once per mention',()=>{
 const entities=[record('a',{9:'Kunde',14:'',19:'Manuell prüfen: Rechnungsempfänger und Vertrag prüfen. Agentur zuordnen; Ansprechpartner klären.'}),record('b',{9:'Lead',10:'Gewonnen'}),record('c')];
 const o=reviewOverview(entities);assert.equal(o.affected,2);assert.equal(o.counts.fastbill,1);assert.equal(o.counts.phone,1);assert.equal(o.counts.status,1);
 assert.equal(o.counts['note-billing'],1);assert.equal(o.counts['note-relationship'],1);assert.equal(o.counts['note-contact'],1);
 const covered=new Set();for(const category of REVIEW_CATEGORIES)for(const e of entities)if(findingsFor(o.findings.get(e.id),category.id).length)covered.add(e.id);
 assert.deepEqual([...covered].sort(),['a','b']);assert.equal(findingsFor(o.findings.get('a'),'note-billing').length,1);
 assert.ok(Object.values(o.counts).reduce((a,b)=>a+b,0)>o.affected);
});
test('notes remain intact, unclassified notes stay visible and confirmed facts are not silently removed',()=>{
 const raw='Manuell prüfen: Rechnung ist bereits bezahlt.\nVertragspartner noch dokumentieren.';
 const a=record('a',{19:raw}),b=record('b',{19:'Bitte mit dem Team besprechen.'});
 const before=JSON.stringify([a,b]);const o=reviewOverview([a,b]);assert.equal(o.affected,2);
 assert.equal(findingsFor(o.findings.get('a'),'note-billing')[0].text,raw.replace(/^Manuell prüfen:\s*/,''));
 assert.equal(o.counts['note-other'],1);assert.equal(JSON.stringify([a,b]),before);
 assert.deepEqual(issues(a),reviewFindings(a).map(f=>f.text));
});
test('fixing actual fields clears only their automatic checks; stored review notes need human editing',()=>{
 const a=record('a',{9:'Kunde',14:'',19:'FastBill-Zuordnung manuell prüfen.'});
 assert.equal(reviewOverview([a]).counts.fastbill,1);
 a.values[3]='https://my.fastbill.com/customer/123';a.values[14]='+49 123456';
 let o=reviewOverview([a]);assert.equal(o.counts.fastbill,0);assert.equal(o.counts.phone,0);assert.equal(o.counts['note-billing'],1);assert.equal(o.affected,1);
 a.values[19]='';assert.equal(reviewOverview([a]).affected,0);
 const lead=record('l');assert.equal(reviewFindings(lead).length,0);lead.values[10]='Angebot';assert.equal(reviewOverview([lead]).counts.fastbill,1);
 lead.values[3]='https://fastbill.com.evil.invalid/customer/1';assert.match(findingsFor(reviewFindings(lead),'fastbill')[0].text,/nicht gültig/);
});
test('phone checks agree between compact lists and full records when primary numbers are unusable',()=>{
 const db=openDB(':memory:');try{
  const org=createOrg(db,null,'Fictional customer');
  addContact(db,org.id,{name:'Primary',telefone:['123']},true);
  addContact(db,org.id,{name:'Other',telefone:['?', '+49 123456789']});
  const compact=listData(db).entities[0],full=entity(db,org.id,true);
  assert.equal(phone(compact),'+49 123456789');assert.equal(phone(full),phone(compact));
  assert.equal(reviewOverview([compact]).counts.phone,0);assert.equal(reviewOverview([full]).counts.phone,0);
 }finally{db.close();}
});
