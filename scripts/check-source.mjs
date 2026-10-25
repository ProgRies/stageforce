import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
const files=execFileSync('git',['ls-files','-z'],{encoding:'utf8'}).split('\0').filter(Boolean);
const allowed=/^(public\/|integrations\/chrome\/|src\/|server\/|tests\/|scripts\/|docs\/|\.github\/|Dockerfile$|compose\.yaml$|\.env\.example$|\.gitignore$|\.dockerignore$|package(?:-lock)?\.json$|tsconfig\.json$|index\.html$|README\.md$)/;
for(const file of files){if(!allowed.test(file)||/\.(sqlite|db|eml|csv|xlsx)(\.|$)/i.test(file)||/(^|\/)(private|backups|data)\//.test(file)||/(snapshot|migration-report)\.json$/.test(file))throw Error('Forbidden source path: '+file);const text=readFileSync(file,'utf8');if(/BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY/.test(text)||/gh[pousr]_[A-Za-z0-9]{30,}/.test(text))throw Error('Potential credential in '+file);}
console.log('Source-only path and credential checks passed ('+files.length+' files).');
