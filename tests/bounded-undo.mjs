import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync('neural-v20.js','utf8');
const cut=(a,b)=>{const i=source.indexOf(a),j=source.indexOf(b,i+1);assert.ok(i>=0&&j>i);return source.slice(i,j);};
const history=[],strokes=[],disposed=new Map();
const mesh=()=>({mesh:{}});
const scope={history,strokes,MAX_HISTORY_ACTIONS:64,safeDispose:m=>disposed.set(m,(disposed.get(m)||0)+1)};
const remember=vm.runInNewContext(cut('  function rememberAction','  function makeMaterial')+'\nrememberAction',scope);
const visible=mesh(),erased=mesh();strokes.push(visible);
remember({type:'draw',stroke:visible});
remember({type:'draw',stroke:erased});
remember({type:'erase',stroke:erased,index:1});
for(let i=0;i<62;i++){const s=mesh();strokes.push(s);remember({type:'draw',stroke:s});}
assert.equal(history.length,64);
assert.equal(disposed.has(visible.mesh),false);
assert.equal(disposed.has(erased.mesh),false,'Erase undo still references mesh');
for(let i=0;i<2;i++){const s=mesh();strokes.push(s);remember({type:'draw',stroke:s});}
assert.equal(disposed.get(erased.mesh),1);
assert.equal(disposed.has(visible.mesh),false);
const other=mesh();
remember({type:'draw',stroke:other});remember({type:'erase',stroke:other,index:0});
for(let i=0;i<65;i++){const s=mesh();strokes.push(s);remember({type:'draw',stroke:s});}
assert.equal(disposed.get(other.mesh),1);
assert.equal(disposed.get(erased.mesh),1);
assert.equal(history.length,64);
assert.match(cut('  function startStroke','  function refreshStroke'),/rememberAction\(\{type:'draw'/);
assert.match(cut('  function eraseNearestStroke','  function setTouchTool'),/rememberAction\(\{type:'erase'/);
console.log('PASS undo history capped at 64, erased mesh released once only after last retained reference, active meshes preserved');
