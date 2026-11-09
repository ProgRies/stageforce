import test from 'node:test';
import assert from 'node:assert/strict';
import {rankSearch} from '../src/domain.ts';

const org=(id,name,{city='',summary='',status='Lead'}={})=>{const values=Array(24).fill('');values[0]=id;values[1]=name;values[4]=city;values[9]=status;values[18]=summary;return{id,row:0,values,version:'1'};};
const names=list=>list.map(e=>e.values[1]);

test('organisation search puts names first and keeps email-only hits apart',()=>{
 const all=[
  org('a','Agentur Event'),org('b','Theater Heidelberg',{city:'Heidelberg'}),org('c','Stadt Heidelberg',{city:'Heidelberg'}),
  org('d','Kulturamt der Stadt Heidelberg'),org('e','Stadthalle Walldorf',{summary:'Nähe Stadt Heidelberg'}),org('f','Stadt Mannheim'),
 ];
 // The server's full-text search also found "Agentur Event" and "Stadt Mannheim" through email text.
 const r=rankSearch(all,'stadt  heidelberg',['a','c','f','e']);
 assert.deepEqual(names(r.main),['Stadt Heidelberg','Kulturamt der Stadt Heidelberg','Stadthalle Walldorf'],'name start, then name contains, then other master data');
 assert.deepEqual(names(r.other),['Agentur Event','Stadt Mannheim'],'matches only from emails and notes come separately, by name');
});

test('organisation search ignores case and accents and lists everything by name without a query',()=>{
 const all=[org('a','Zweckverband Süd'),org('b','Ärztekammer'),org('c','Bürgeramt Köln',{city:'Köln'})];
 assert.deepEqual(names(rankSearch(all,'  ',null).main),['Ärztekammer','Bürgeramt Köln','Zweckverband Süd']);
 assert.deepEqual(names(rankSearch(all,'KOLN',null).main),['Bürgeramt Köln']);
 assert.deepEqual(rankSearch(all,'kammer',null).other,[]);
});
