import assert from 'node:assert/strict';
import { runPortfolioTrials, type ScopeSimulationSpec } from '../lib/forecast/portfolio';
import { freezeForecastBasis, replayFrozenForecast } from '../lib/reports/forecastBasis';
const shape = (scopeId: string, dependsOnScopeIds: string[] = []): ScopeSimulationSpec => ({
 scopeId, items: [{id:'same',label:'same',low:0,likely:5,high:10}], gates: [], teamCapacity:1,
 dependsOnScopeIds, startDate: new Date('2026-09-29T00:00:00Z'), targetDate:null,
});
const specs = [shape('A'),shape('B'),{...shape('C',['A','B']),items:[]}];
const result = runPortfolioTrials(specs, 100000);
const frequency = result.get('C')!.filter(x=>x<=5).length/100000;
assert(Math.abs(frequency-.25)<.01, `independent identical shapes: ${frequency}`);
assert.notDeepEqual(result.get('A'),result.get('B'));
const reordered = runPortfolioTrials([...specs].reverse(),100000);
for(const spec of specs) assert.deepEqual(result.get(spec.scopeId),reordered.get(spec.scopeId));
const two = {...shape('A'),items:[{id:'z',label:'z',low:1,likely:2,high:4},...shape('A').items]};
assert.deepEqual(runPortfolioTrials([two]).get('A'),runPortfolioTrials([{...two,items:[...two.items].reverse()}]).get('A'));
const kept = runPortfolioTrials([shape('A')]).get('A')!;
const removed = runPortfolioTrials([{...two,items:two.items.filter(x=>x.id==='same')}]).get('A');
assert.deepEqual(kept,removed);
const capacity = runPortfolioTrials([{...shape('A'),teamCapacity:2}]).get('A')!;
capacity.forEach((x,i)=>assert.equal(x*2,kept[i]));
const constant = {...shape('A'),items:[{id:'constant',label:'constant',low:2,likely:2,high:2},...shape('A').items]};
runPortfolioTrials([constant]).get('A')!.forEach((x,i)=>assert(Math.abs(x-2-kept[i])<1e-12));
const diamond = [shape('root'),{...shape('left',['root']),items:[]},{...shape('right',['root']),items:[]},{...shape('bottom',['left','right']),items:[]}];
const d = runPortfolioTrials(diamond);
for(const id of ['left','right','bottom']) assert.deepEqual(d.get(id),d.get('root'));
console.log(JSON.stringify({pass:true,identicalShapeJointFrequency:frequency,reorder:true,removal:true,commonRandomness:true,diamond:true}));

const legacy = runPortfolioTrials(specs, 100000, "legacy-shared-seed-v1");
assert.deepEqual(legacy.get('A'), legacy.get('B'), 'Historical v1 retains original shared seed');
assert(Math.abs(legacy.get('C')!.filter(x=>x<=5).length/100000-.5)<.01);
console.log('PASS legacy v1 replay retains original correlation; new v2 remains independent');

const frozen = freezeForecastBasis(specs, []);
assert.equal(frozen.model, "triangular-pooled-calendar-finish-floor.v2");
const originalBasis = { ...frozen, model: "triangular-pooled-calendar-finish-floor.v1" as const };
const oldReplay = replayFrozenForecast(originalBasis);
assert.deepEqual(oldReplay.get('A')!.completionDaysSorted, oldReplay.get('B')!.completionDaysSorted);
const newReplay = replayFrozenForecast(frozen);
assert.notDeepEqual(newReplay.get('A')!.completionDaysSorted, newReplay.get('B')!.completionDaysSorted);
console.log('PASS frozen model version dispatches historical and current samplers correctly');
