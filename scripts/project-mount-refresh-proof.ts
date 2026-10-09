import assert from "node:assert/strict";
import { createProjectMountRefresh } from "../lib/instrument/projectMountRefresh";
const retain=createProjectMountRefresh();
let reads=0;
const refresh=()=>{reads+=1;};
const parent=retain(refresh);
assert.equal(reads,1);
for(let i=0;i<10;i++){const child=retain(refresh);child();child();}
assert.equal(reads,1,"nested Timeline remounts cannot restart Control Room Scenario verification");
parent();
const nextPage=retain(refresh);
assert.equal(reads,2,"a new reader tree still revalidates on navigation");
const nested=retain(refresh);nextPage();
const overlappingPage=retain(refresh);
assert.equal(reads,2,"overlapping consumers share the current owner read");
nested();overlappingPage();
const strictRemount=retain(refresh);strictRemount();
assert.equal(reads,3,"full cleanup permits fresh entry without losing periodic or owner-bus refreshes");
console.log("PASS nested reader lifecycle no longer causes Scenario mount-refresh loop; new navigation remains verified");
