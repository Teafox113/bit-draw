import {validateRegionHints} from './auto-regions.js';
const plain=v=>v&&typeof v==='object'&&!Array.isArray(v);
export function validateRecipe(input,allowed){
  if(!plain(input)||input.format!=='bitdraw-recipe'||input.version!==1)throw Error('請提供 bitdraw-recipe v1');
  if(typeof input.name!=='string'||!input.name.trim()||input.name.length>80)throw Error('流程名稱需為 1–80 字');
  if(JSON.stringify(input).length>200000)throw Error('流程上限 200 KB');
  if(!Array.isArray(input.commands)||!input.commands.length||input.commands.length>100)throw Error('流程需有 1–100 筆指令');
  if(input.commands.some(c=>!plain(c)||!allowed.includes(c.op)||['undo','redo'].includes(c.op)))throw Error('流程包含不支援的指令');
  const parameters=input.parameters??{};if(!plain(parameters)||Object.keys(parameters).length>32)throw Error('參數格式無效');
  for(const [key,s] of Object.entries(parameters)){
    if(!/^[a-zA-Z][a-zA-Z0-9_]{0,39}$/.test(key)||!plain(s)||!['color','integer','number','string','boolean','regionGroups'].includes(s.type))throw Error('參數名稱／型別無效');
    if(s.min!==undefined&&!Number.isFinite(s.min)||s.max!==undefined&&!Number.isFinite(s.max)||s.min>s.max)throw Error('參數範圍無效');
  }
  function check(v,depth=0){if(depth>16)throw Error('流程巢狀過深');if(Array.isArray(v))return v.forEach(v=>check(v,depth+1));if(plain(v)){if('$param'in v){if(Object.keys(v).length!==1||!Object.hasOwn(parameters,v.$param))throw Error('未知參數參照');}else for(const [k,x]of Object.entries(v)){if(['__proto__','constructor','prototype'].includes(k))throw Error('不支援的欄位');check(x,depth+1);}}}
  check(input.commands);
  return {format:'bitdraw-recipe',version:1,name:input.name.trim(),description:String(input.description??'').slice(0,500),parameters:structuredClone(parameters),commands:structuredClone(input.commands)};
}
export function resolveRecipe(recipe,values={},allowed){
  const r=validateRecipe(recipe,allowed);if(!plain(values)||Object.keys(values).some(k=>!Object.hasOwn(r.parameters,k)))throw Error('提供了未知參數');const params={};
  for(const [key,s]of Object.entries(r.parameters)){
    const v=Object.hasOwn(values,key)?values[key]:s.default;
    const valid=s.type==='regionGroups'?!!validateRegionHints(v):s.type==='color'?typeof v==='string'&&/^#[0-9a-f]{6}$/i.test(v):s.type==='integer'?Number.isInteger(v):s.type==='number'?Number.isFinite(v):s.type==='boolean'?typeof v==='boolean':typeof v==='string'&&v.length<=200;
    if(!valid||(typeof v==='number'&&(s.min!==undefined&&v<s.min||s.max!==undefined&&v>s.max)))throw Error(`參數 ${key} 不符合 ${s.type} 或範圍`);params[key]=v;
  }
  const walk=v=>Array.isArray(v)?v.map(walk):plain(v)?('$param'in v?params[v.$param]:Object.fromEntries(Object.entries(v).map(([k,x])=>[k,walk(x)]))):v;
  return walk(r.commands);
}
