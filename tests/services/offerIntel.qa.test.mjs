import { test } from 'node:test';
import assert from 'node:assert';
import { analyseFightHistory, classifyStat, buildStatIntel, buildThreatTags, buildCardModel, describeOffer, RELIABILITY_TIERS } from '../../frontend/src/components/fights/offerIntel.js';

const mkH=(arr)=>arr.map(([r,m])=>({result:r,method:m}));
const edc={striking:0,grappling:0,submission:0,durability:0,tactical:0};
const kdc={striking:3,grappling:0,submission:0,durability:0,tactical:0};
const sdc={striking:1,grappling:0,submission:0,durability:0,tactical:0};
// classifyStat signature: (statKey, statValue, rank, domainCounts, totalFights)

test('aFH empty',()=>{const{domainCounts:d,totalFights:t}=analyseFightHistory([]);assert.strictEqual(t,0);assert.strictEqual(d.striking,0);});
test('cS rank2 ev3 CONFIRMED',()=>{assert.strictEqual(classifyStat("str",50,1,kdc,5),RELIABILITY_TIERS.CONFIRMED);assert.strictEqual(classifyStat("str",50,2,kdc,5),RELIABILITY_TIERS.CONFIRMED);});
test('cS rank2 ev1 SUSPECTED',()=>{assert.strictEqual(classifyStat("str",50,1,sdc,3),RELIABILITY_TIERS.SUSPECTED);});
test('cS rank2 ev0 UNKNOWN',()=>{assert.strictEqual(classifyStat("str",50,1,edc,1),RELIABILITY_TIERS.UNKNOWN);});
test('cS middle totalFights0 UNKNOWN',()=>{assert.strictEqual(classifyStat("str",50,4,edc,0),RELIABILITY_TIERS.UNKNOWN);});
test('cS middle totalFights5 domain0 UNKNOWN',()=>{assert.strictEqual(classifyStat("str",50,4,edc,5),RELIABILITY_TIERS.UNKNOWN);});
test('cS no UNVERIFIED tier exists',()=>{assert.strictEqual(RELIABILITY_TIERS.UNVERIFIED,undefined);});
test('bSI isCallout all CONFIRMED',()=>{const o={opponent:{str:90,spd:85,leg:80,wre:75,gnd:70,sub:65,chn:60,fiq:55,fightHistory:[]},isCallout:true};for(const e of buildStatIntel(o))assert.strictEqual(e.reliability,RELIABILITY_TIERS.CONFIRMED,e.key);});
test('bSI champion no callout keeps fog',()=>{const o={opponent:{str:90,spd:85,leg:80,wre:75,gnd:70,sub:65,chn:60,fiq:55,isChampion:true,fightHistory:[]},isCallout:false};for(const e of buildStatIntel(o))assert.notStrictEqual(e.reliability,RELIABILITY_TIERS.CONFIRMED,e.key);});
test('bTT UNKNOWN 0 tags',()=>{const o={opponent:{str:95,spd:90,leg:85,wre:80,gnd:70,sub:65,chn:60,fiq:55,fightHistory:[],style:""},context:{}};assert.strictEqual(buildThreatTags(o,50).length,0);});
test('bCM empty',()=>{assert.deepStrictEqual(buildCardModel([]),[]);assert.deepStrictEqual(buildCardModel(null),[]);});
test('bCM title 4th',()=>{const c=buildCardModel([{type:"Easy",opponent:{_id:"a"}},{type:"Even",opponent:{_id:"b"}},{type:"Hard",opponent:{_id:"c"}},{type:"TitleShot",opponent:{_id:"d"}}]);assert.strictEqual(c.length,4);assert.strictEqual(c[3].variant,"title");});
test('dO giantKiller >=10 only',()=>{const mk=v=>({opponent:{overallRating:v,fightHistory:[]},context:{record:{wins:0,losses:0},lastThree:[],streak:null}});const f={overallRating:60};assert.strictEqual(describeOffer(mk(70),f).giantKiller,true);assert.strictEqual(describeOffer(mk(69),f).giantKiller,false);assert.strictEqual(describeOffer(mk(60),f).giantKiller,false);});
