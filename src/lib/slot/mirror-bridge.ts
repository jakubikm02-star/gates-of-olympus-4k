/**
 * The two public hosts are one deployment but two browser origins, so localStorage does not cross.
 * Third-party iframes only see partitioned storage, so a hidden frame cannot read the other save.
 * A top-level hop (once per tab, never from an installed app) copies the newer save both ways.
 * The installed app stays put and catches up from the encrypted cloud copy after that hop.
 */

export const MIRROR_ORIGINS = [
  "https://parkizmus.vercel.app",
  "https://gates-of-olympus-4k.vercel.app",
] as const;

export const MIRROR_SAVE_KEY = "parkizmus-v1";
export const MIRROR_BRIDGE_KEY = "park-bridge-key";

/** Keep the previous stamp when nothing but the clock changed, so opening the game does not beat real play. */
export function carryStamp<T extends { updatedAt: number }>(prev: T, next: T): T {
  if (stableBody(prev) === stableBody(next)) {
    return { ...next, updatedAt: prev.updatedAt || next.updatedAt };
  }
  return { ...next, updatedAt: Date.now() };
}

function stableBody(v: { updatedAt: number }): string {
  return stable({ ...v, updatedAt: 0 });
}

function stable(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v) ?? "null";
  if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stable(o[k])}`)
    .join(",")}}`;
}

/** Inline, before the bundle. ES5. No-op off the two public hosts and inside an installed app. */
export const MIRROR_HEAD_SCRIPT = `(function(){try{
var ORIGINS=${JSON.stringify(MIRROR_ORIGINS)};
var SAVE=${JSON.stringify(MIRROR_SAVE_KEY)};
var LEGACY=["olympus4k-v1"];
var PREFIX="parkizmus-save:";
var KEY=${JSON.stringify(MIRROR_BRIDGE_KEY)};
var here=window.location.origin;
var known=false,sib="";
for(var i=0;i<ORIGINS.length;i++){if(ORIGINS[i]===here)known=true;else sib=ORIGINS[i];}
if(!known||!sib)return;
var mode=new URLSearchParams(window.location.search).get("bridge");
function stamp(raw){if(!raw)return 0;try{var o=JSON.parse(raw);var n=o&&o.updatedAt;return typeof n==="number"&&isFinite(n)?n:0;}catch(e){return 0;}}
function newer(a,b){if(!a)return b||"";if(!b)return a;return stamp(a)>=stamp(b)?a:b;}
function readKey(){try{return window.localStorage.getItem(KEY)||"";}catch(e){return "";}}
function writeKey(k){if(!k)return;try{window.localStorage.setItem(KEY,k);}catch(e){}}
function bestSave(){var best="";try{
best=newer(best,window.localStorage.getItem(SAVE)||"");
for(var i=0;i<LEGACY.length;i++)best=newer(best,window.localStorage.getItem(LEGACY[i])||"");
for(var n=0;n<window.localStorage.length;n++){var name=window.localStorage.key(n);if(name&&name.indexOf(PREFIX)===0)best=newer(best,window.localStorage.getItem(name)||"");}
}catch(e){}return best;}
function storeSave(raw){if(!raw)return;try{window.localStorage.setItem(SAVE,raw);}catch(e){}}
function unpack(raw){try{var o=JSON.parse(raw);if(!o||typeof o!=="object")return{k:"",s:""};return{k:typeof o.k==="string"?o.k:"",s:typeof o.s==="string"?o.s:""};}catch(e){return{k:"",s:""};}}
function readEnv(){var h=window.location.hash?window.location.hash.slice(1):"";if(!h)return{k:"",s:""};var env=unpack(h);if(!env.k&&!env.s){try{env=unpack(decodeURIComponent(h));}catch(e){}}return env;}
function makeKey(){var a=new Uint8Array(32);window.crypto.getRandomValues(a);var s="";for(var i=0;i<a.length;i++)s+=String.fromCharCode(a[i]);return window.btoa(s);}
function merge(env){var localS=bestSave();var localK=readKey();var inS=env.s||"";var inK=env.k||"";var winS=newer(localS,inS);var winK="";
if(winS&&inS&&winS===inS&&inK)winK=inK;else if(localK)winK=localK;else winK=inK;
if(!winK)winK=makeKey();writeKey(winK);storeSave(winS);return{k:winK,s:winS||""};}
function go(toMode,env){window.location.replace(sib+"/?bridge="+toMode+"#"+encodeURIComponent(JSON.stringify(env)));}
if(mode==="peer"||mode==="done"){var merged=merge(readEnv());try{window.sessionStorage.setItem("park-bridge-at",String(Date.now()));}catch(e){}
if(mode==="peer"){go("done",merged);return;}window.history.replaceState(null,"","/");return;}
var standalone=false;
try{if(window.matchMedia("(display-mode: standalone), (display-mode: fullscreen)").matches)standalone=true;}catch(e){}
try{if(window.navigator.standalone)standalone=true;}catch(e){}
if(standalone)return;
try{if(window.navigator.onLine===false)return;}catch(e){}
var last=0;try{last=Number(window.sessionStorage.getItem("park-bridge-at")||0);}catch(e){}
if(last)return;
try{window.sessionStorage.setItem("park-bridge-at",String(Date.now()));}catch(e){}
var mineK=readKey();if(!mineK)mineK=makeKey();writeKey(mineK);
go("peer",{k:mineK,s:bestSave()||""});
}catch(e){}})();`;
