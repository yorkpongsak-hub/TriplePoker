// Standalone QA harness: production manager/registry/web player with browser lifecycle shims.
// Does not add a game route or bypass authentication. Never deployed with the app.
const fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const out=path.resolve(__dirname,'../launch-preview');fs.mkdirSync(path.join(out,'audio-qa-assets'),{recursive:true});
const modules=[],ids=new Map();
const shims={
 'react-native':`const listeners=new Set();const AppState={currentState:'active',addEventListener:(e,fn)=>{listeners.add(fn);return{remove:()=>listeners.delete(fn)}}};globalThis.qaState=s=>{AppState.currentState=s;for(const fn of listeners)fn(s)};document.addEventListener('visibilitychange',()=>qaState(document.hidden?'background':'active'));module.exports={AppState,Platform:{OS:'web'}};`,
 'expo-audio':`module.exports={setAudioModeAsync:async()=>{},setIsAudioActiveAsync:async()=>{}};`,
 'expo-asset':`module.exports={Asset:{fromModule:x=>({uri:x})}};`,
 '@react-native-async-storage/async-storage':`module.exports={getItem:async k=>localStorage.getItem('audio-qa:'+k),setItem:async(k,v)=>localStorage.setItem('audio-qa:'+k,v)};`,
};
function bundle(file){
 if(ids.has(file))return ids.get(file);const id=modules.length;ids.set(file,id);modules.push('');
 let code;
 if(shims[file])code=shims[file];
 else if(/\.(mp3|wav)$/.test(file)){const name=id+path.extname(file);fs.copyFileSync(file,path.join(out,'audio-qa-assets',name));code='module.exports='+JSON.stringify('/audio-qa-assets/'+name);}
 else code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText;
 modules[id]=code.replace(/require\(["']([^"']+)["']\)/g,(_,dep)=>{
   if(shims[dep])return `require(${bundle(dep)})`;
   const base=path.resolve(path.dirname(file),dep);
   const resolved=['.web.ts','.ts','/index.ts',''].map(ext=>base+ext).find(p=>fs.existsSync(p)&&fs.statSync(p).isFile());
   if(!resolved)throw new Error('Cannot bundle '+dep);return `require(${bundle(resolved)})`;
 });return id;
}
const root=bundle(path.resolve(__dirname,'../src/audio/AudioManager.ts'));
const script=`const __DEV__=true;const modules={${modules.map((s,i)=>`${i}:function(module,exports,require){${s}\n}`).join(',')}};const cache={};function require(id){if(!cache[id]){const m={exports:{}};cache[id]=m;modules[id](m,m.exports,require)}return cache[id].exports}const audio=require(${root}).audio;
let completed=0;const state=document.getElementById('status');audio.initialize();
document.getElementById('music').onclick=()=>audio.playBGM();
document.getElementById('tap').onclick=()=>audio.playUiFeedback();
document.getElementById('repeat').onclick=()=>{let n=0;const timer=setInterval(()=>{audio.play('BUTTON_CONFIRM');completed++;if(++n===100)clearInterval(timer)},180)};
document.getElementById('boss').onclick=()=>audio.play('BOSS_REVEAL');
document.getElementById('mute').onclick=()=>audio.mute();document.getElementById('unmute').onclick=()=>audio.unmute();
document.getElementById('background').onclick=()=>qaState('background');document.getElementById('resume').onclick=()=>qaState('active');
document.getElementById('stop').onclick=()=>audio.stopBGM(0);
setInterval(()=>state.textContent=JSON.stringify({completed,...audio.getDebugState()},null,2),200);`;
fs.writeFileSync(path.join(out,'audio-qa.js'),script);
fs.writeFileSync(path.join(out,'audio-qa.html'),`<!doctype html><meta charset="utf-8"><title>Audio QA — real assets</title><style>body{font:16px Arial;background:#091d19;color:#fff;padding:20px}button{padding:14px;margin:5px;background:#ffd76a;border:0;border-radius:8px}pre{white-space:pre-wrap}</style><h1>Audio QA — real assets</h1><p>Production audio manager and web player; simulated lifecycle controls. Not a gameplay screen.</p>${[['music','Play music'],['tap','Tap sound'],['repeat','100 taps'],['boss','Boss cue'],['mute','Mute'],['unmute','Unmute'],['background','Simulate background'],['resume','Resume'],['stop','Stop music']].map(([id,title])=>`<button id="${id}">${title}</button>`).join('')}<pre id="status">Loading</pre><script src="/audio-qa.js"></script>`);
console.log('Audio QA ready at /audio-qa.html');
