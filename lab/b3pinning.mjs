// THE FIELD-HOLD PROOF.
//
// The bloom's central promise is that the map does not move. That is not
// inferrable from positions alone — a node can be pinned and still be reported
// as having drifted if the classification is wrong — so this asks the page
// which nodes it is actually holding fixed, and then measures exactly those,
// during the bloom and after the exit.
//
// It is how the exit leak was found: 220 nodes that held EXACTLY still for the
// whole bloom (mean 0.000, max 0.000) came out of the exit 3.75 units adrift,
// because `select(null)` released the entire field one line after pinning it.
import { chromium } from "playwright";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const p = await (await b.newContext({ viewport:{width:1400,height:900} })).newPage();
p.on("pageerror",(e)=>console.log("PAGEERROR",e.message.slice(0,200)));
await p.goto("http://localhost:4400/pb3.html",{waitUntil:"networkidle"});
await p.waitForTimeout(1600);
await p.evaluate(()=>{ window.__quiet=async(m=14000)=>{const t=performance.now();while(performance.now()-t<m){const b=window.__lab.busy();if(b.settled&&b.alpha<0.02)return true;await new Promise(r=>setTimeout(r,90));}return false;};});
const r = await p.evaluate(async () => {
  const snap=()=>new Map([...window.__lab.positions()].map(([k,v])=>[k,{x:v.x,y:v.y}]));
  const ns=window.__lab.nodes();
  const id=ns.filter(n=>n.kind==="transcript").map(n=>({n,s:window.__lab.preview(n.id).seats})).sort((a,b)=>b.s-a.s)[0].n.id;
  // Let the world go fully quiet first: several seconds beyond `quiet`.
  await new Promise(r=>setTimeout(r,6000));
  const rest=snap();
  await new Promise(r=>setTimeout(r,4000));
  const drift0=snap();
  let s=0,n=0; for(const [k,q] of rest){const w=drift0.get(k); s+=Math.hypot(q.x-w.x,q.y-w.y); n++;}
  const idleDrift=+(s/n).toFixed(3);

  window.__lab.select(id);
  await new Promise(r=>setTimeout(r,900));
  const pinnedAt900=new Set(window.__lab.pinned());
  await window.__quiet();
  const pinnedSettled=new Set(window.__lab.pinned());
  const mid=snap();
  // Error of the nodes that were pinned the whole time.
  const err=(set,a,b)=>{let s=0,mx=0,n=0;for(const k of set){const p=a.get(k),q=b.get(k);if(!p||!q)continue;const d=Math.hypot(p.x-q.x,p.y-q.y);s+=d;mx=Math.max(mx,d);n++;}return{n,mean:+(s/n).toFixed(3),max:+mx.toFixed(3)};};
  const during=err(pinnedAt900,rest,mid);
  window.__lab.select(null);
  await window.__quiet();
  await new Promise(r=>setTimeout(r,1500));
  const end=snap();
  return { idleDrift, pinned900:pinnedAt900.size, pinnedSettled:pinnedSettled.size,
           duringPinned:during, afterPinned:err(pinnedAt900,rest,end),
           all:err(new Set(rest.keys()),rest,end) };
});
console.log(JSON.stringify(r,null,1));
await b.close();
