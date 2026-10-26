import {Problem} from './crm.mjs';
export function appearance(db,user){return db.prepare('SELECT mode FROM user_appearance WHERE user_id=?').get(user.id)?.mode||null;}
export function saveAppearance(db,user,b){if(!['light','dark','system'].includes(b.mode))throw new Problem('Invalid appearance.');db.prepare('INSERT INTO user_appearance VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET mode=excluded.mode').run(user.id,b.mode);return{mode:b.mode};}
