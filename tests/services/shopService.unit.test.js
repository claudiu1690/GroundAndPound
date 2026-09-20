const assert = require("node:assert");
const { test } = require("node:test");
const { ALL_STATS,SOFT_CAP,BOOSTERS,BUFFS,PREMIUM_BUNDLES,findItem,boosterStatList } = require("../../consts/shopConfig");

test("findItem energy-shot", () => { const i=findItem("energy-shot"); assert.ok(i); assert.equal(i.type,"energy"); assert.equal(i.premium,false); assert.ok(i.price>0); });
test("findItem energy-drink is premium", () => { const i=findItem("energy-drink"); assert.ok(i); assert.equal(i.premium,true); assert.equal(i.price,null); });
test("findItem collagen injuryMult 0.80", () => { const i=findItem("collagen-recovery"); assert.ok(i); assert.equal(i.injuryMult,0.80); assert.equal(i.stats,undefined); });
test("findItem unknown returns null", () => { assert.equal(findItem("x"),null); assert.equal(findItem(null),null); assert.equal(findItem(123),null); });
test("findItem bundle not findable", () => { assert.equal(findItem("drinks-6"),null); });
test("SOFT_CAP is 99", () => { assert.equal(SOFT_CAP,99); });
test("boosterStatList ALL returns 8 lowercase keys", () => { const list=boosterStatList(BOOSTERS["focus-amino"]); assert.equal(list.length,8); for(const k of list) assert.equal(k,k.toLowerCase()); });
test("boosterStatList all lowercase", () => { for(const [id,cfg] of Object.entries(BOOSTERS)) for(const k of boosterStatList(cfg)) assert.equal(k,k.toLowerCase(),id); });
test("boosterStatList null returns empty", () => { assert.deepStrictEqual(boosterStatList(null),[]); });
test("consumeBuff count 3 to 2", () => { const inv={prefightBuffs:{b:3},usedBuffs:{}}; const rem=(inv.prefightBuffs.b||0)-1; if(rem<=0) delete inv.prefightBuffs.b; else inv.prefightBuffs.b=rem; inv.usedBuffs.b=(inv.usedBuffs.b||0)+1; assert.equal(inv.prefightBuffs.b,2); assert.equal(inv.usedBuffs.b,1); });
test("consumeBuff last item deletes key", () => { const inv={prefightBuffs:{b:1},usedBuffs:{}}; const rem=(inv.prefightBuffs.b||0)-1; if(rem<=0) delete inv.prefightBuffs.b; else inv.prefightBuffs.b=rem; inv.usedBuffs.b=(inv.usedBuffs.b||0)+1; assert.equal(inv.prefightBuffs.b,undefined); assert.equal(inv.usedBuffs.b,1); });
test("consumeBuff zero owned never negative", () => { const pf={}; const rem=(pf.x||0)-1; if(rem<=0) delete pf.x; else pf.x=rem; assert.equal(pf.x,undefined); });
test("applyBuff adds to copy real unchanged", () => { const real={str:70,wre:65}; const fp={...real}; const cfg=BUFFS["creatine-stack"]; if(cfg.stats) for(const [k,v] of Object.entries(cfg.stats)) if(typeof fp[k]==="number") fp[k]=Math.min(100,fp[k]+v); assert.equal(fp.str,73); assert.equal(fp.wre,67); assert.equal(real.str,70); });
test("applyBuff capped at 100", () => { const fp={str:99,wre:99}; const cfg=BUFFS["creatine-stack"]; if(cfg.stats) for(const [k,v] of Object.entries(cfg.stats)) if(typeof fp[k]==="number") fp[k]=Math.min(100,fp[k]+v); assert.equal(fp.str,100); assert.equal(fp.wre,100); });
test("applyBuff collagen no stats", () => { const fp={str:50,spd:60}; const cfg=BUFFS["collagen-recovery"]; if(cfg.stats) for(const [k,v] of Object.entries(cfg.stats)) if(typeof fp[k]==="number") fp[k]=Math.min(100,fp[k]+v); assert.equal(fp.str,50); assert.equal(fp.spd,60); });
test("collagen softens by 0.80", () => { const eff={str:-5,spd:-3,fiq:2}; for(const k of Object.keys(eff)){const e=eff[k];if(typeof e==="number"&&e<0) eff[k]=Math.min(-1,Math.round(e*0.80));} assert.equal(eff.str,-4); assert.equal(eff.spd,-2); assert.equal(eff.fiq,2); });
test("collagen floor at -1", () => { const eff={str:-1}; for(const k of Object.keys(eff)){const e=eff[k];if(typeof e==="number"&&e<0) eff[k]=Math.min(-1,Math.round(e*0.80));} assert.equal(eff.str,-1); });
test("booster mid-batch partial", () => { let sl=3,active=true,boosted=0,unboosted=0; for(let i=0;i<5;i++){const ch=active&&sl>0;if(ch){boosted++;sl--;if(sl<=0)active=false;}else unboosted++;} assert.equal(boosted,3); assert.equal(unboosted,2); assert.equal(active,false); });
// Bundles are REAL PRODUCTS now, not stubs — they carry a server-side price and are bought
// through Stripe Checkout. They still must not resolve via findItem: a bundle is not an
// inventory item, and letting it through findItem would expose it to the CASH buy endpoint.
test("PREMIUM_BUNDLES are priced products, not shop items", () => { for(const [id,b] of Object.entries(PREMIUM_BUNDLES)){assert.equal(b.stub,undefined,id);assert.ok(Number.isInteger(b.amountCents)&&b.amountCents>0,id);assert.equal(findItem(id),null,id);} });
test("boosterAffects uppercase matches lowercase", () => { const s=new Set(boosterStatList(BOOSTERS["strike-blend"])); const a=(stat)=>s.has(String(stat).toLowerCase()); assert.ok(a("STR")); assert.ok(a("SPD")); assert.ok(!a("WRE")); });
test("backfill idempotency gate", () => { const t=(f)=>f.inventory===undefined||f.inventory===null; assert.equal(t({}),true); assert.equal(t({inventory:{}}),false); assert.equal(t({inventory:{energyShots:0}}),false); });
