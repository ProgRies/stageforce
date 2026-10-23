import '../integrations/chrome/extract.js';
export type ContactSuggestion={name:string;emails:string[];phones:string[];token:string;messageId?:string};
export function extractContact(selection:string):ContactSuggestion{
 const parser=(globalThis as unknown as {stageForceExtract:{contact:(text:string)=>Omit<ContactSuggestion,'token'>}}).stageForceExtract;
 return {...parser.contact(selection),token:crypto.randomUUID()};
}
