// Read-only release gate: board evidence and Git ancestry; never changes status or deploys.
const fs = require('node:fs');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const assert = require('node:assert/strict');

const EVIDENCE = /^([0-9a-f]{7,40})\s+·\s+\S/i;
function readBlock(html, id) {
  const match = html.match(new RegExp(`<script[^>]*id=["']${id}["'][^>]*>([\\s\\S]*?)<\\/script>`));
  if (!match) throw new Error(`Missing #${id}`);
  return JSON.parse(match[1]);
}
function assessRelease({tasks, checks, reviews, revision, manualOnly = false, isAncestor}) {
  const errors = [], accepted = new Map();
  const release = tasks.find(task => task.releaseGate);
  if (!release) errors.push('No release-gate card is defined.');
  const excused = new Set(manualOnly ? release?.releaseGate?.excusable ?? [] : []);
  const mandatory = tasks.filter(task => !task.optional && task !== release && !excused.has(task.id));
  const blocking = reviews.flatMap(review => review.findings ?? []).filter(finding => ['blocker','major'].includes(finding.severity) && ['open','accepted'].includes(finding.disposition));
  for (const finding of blocking.filter(finding => !(finding.tasks?.length))) errors.push(`Plan-wide finding ${finding.id} remains open (${finding.severity}).`);
  for (const task of mandatory) {
    const reasons = [];
    const record = task.records?.at(-1);
    const commit = String(record?.commit ?? '').trim().match(EVIDENCE)?.[1];
    if (!['complete','verified'].includes(task.status)) reasons.push(`status is ${task.status}`);
    if (!record || record.status !== task.status || !commit || !record.by?.trim() || record.by === 'not given' || !record.model?.trim()) reasons.push('latest record lacks commit, result, checker or model');
    if (task.status === 'verified' && record?.kind !== 'independent') reasons.push('Verified lacks an independent record');
    for (const blocker of task.blockers ?? []) if (!blocker.resolved || !blocker.note?.trim()) reasons.push(`unresolved or unrecorded ${blocker.scope} blocker`);
    for (const finding of blocking.filter(finding => finding.tasks?.includes(task.id))) reasons.push(`open ${finding.severity} finding ${finding.id}`);
    if (commit && !isAncestor(commit, revision)) reasons.push(`recorded revision ${commit} is absent from release revision ${revision}`);
    accepted.set(task.id, reasons.length === 0);
    if (reasons.length) errors.push(`${task.id}: ${reasons.join('; ')}.`);
  }
  for (const blocker of release?.blockers ?? []) if (!blocker.resolved || !blocker.note?.trim()) errors.push(`${release.id}: release approval is unresolved or has no approval note.`);
  for (let number = 1; number <= (manualOnly ? 13 : 14); number++) {
    const id = `A${String(number).padStart(2,'0')}`;
    const check = checks.find(check => check.id === id);
    const feeding = tasks.filter(task => task.checks?.includes(id));
    if (!check || !feeding.length || !feeding.every(task => accepted.get(task.id))) errors.push(`${id} has no complete, evidenced set of feeding tasks.`);
  }
  return {ok: errors.length === 0, revision, mode: manualOnly ? 'manual-only' : 'live-Muse', mandatoryTasks: mandatory.length, excused: [...excused], errors};
}
function selfTest() {
  const checkIds = Array.from({length:14},(_,i)=>`A${String(i+1).padStart(2,'0')}`);
  const record = {status:'complete',commit:'abcdef0 · deterministic checks passed',by:'Synthetic checker',model:'fixture-model',kind:'self'};
  const fixture = () => ({tasks:[{id:'MOT-69',status:'complete',records:[{...record}],blockers:[],checks:checkIds.slice(0,13)},{id:'MOT-95',status:'complete',records:[{...record}],blockers:[],checks:['A14']},{id:'MOT-101',status:'planned',records:[],blockers:[{scope:'live',resolved:true,note:'Approved by synthetic owner'}],releaseGate:{excusable:['MOT-95']},checks:['A15']}],checks:checkIds.map(id=>({id})),reviews:[],revision:'release-fixture',isAncestor:()=>true});
  assert.equal(assessRelease(fixture()).ok,true);
  let sample=fixture();sample.tasks[0].records[0].commit='';assert.equal(assessRelease(sample).ok,false);
  sample=fixture();sample.tasks[0].records.push({...record,status:'doing'});assert.equal(assessRelease(sample).ok,false);
  sample=fixture();sample.tasks[0].status='verified';sample.tasks[0].records[0].status='verified';assert.equal(assessRelease(sample).ok,false);
  sample=fixture();sample.tasks[0].records[0].by='not given';assert.equal(assessRelease(sample).ok,false);
  sample=fixture();sample.tasks[0].blockers=[{scope:'live',resolved:true,note:''}];assert.equal(assessRelease(sample).ok,false);
  sample=fixture();sample.isAncestor=()=>false;assert.equal(assessRelease(sample).ok,false);
  sample=fixture();sample.reviews=[{findings:[{id:'R-test',severity:'major',disposition:'open',tasks:[]}]}];assert.equal(assessRelease(sample).ok,false);
  sample=fixture();sample.tasks[0].status='planned';assert.equal(assessRelease(sample).ok,false);
  sample=fixture();sample.tasks[1].status='planned';assert.equal(assessRelease(sample).ok,false);assert.equal(assessRelease({...sample,manualOnly:true}).ok,true);
  sample=fixture();sample.tasks[2].blockers[0].resolved=false;assert.equal(assessRelease(sample).ok,false);
  console.log(JSON.stringify({ok:true,checks:11,scope:'release evidence, regressions, independent record, approvals, blocking findings, ancestry, and manual-only scope'}));
}
function main() {
  const args=process.argv.slice(2);
  if (args.includes('--self-test')) return selfTest();
  const option=name=>{const index=args.indexOf(name);return index>=0?args[index+1]:undefined;};
  const repo=path.resolve(option('--repo')??process.cwd());
  const plan=option('--plan');
  if (!plan) throw new Error('Supply --plan with the canonical production_integration_kanban.html path.');
  const git=(...args)=>execFileSync('git',['-C',repo,...args],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
  const revision=git('rev-parse','--verify',`${option('--revision')??'HEAD'}^{commit}`);
  const html=fs.readFileSync(path.resolve(plan),'utf8');
  const result=assessRelease({tasks:readBlock(html,'task-data'),checks:readBlock(html,'check-data'),reviews:readBlock(html,'review-data'),revision,manualOnly:args.includes('--manual-only'),isAncestor:(commit,revision)=>{try{git('merge-base','--is-ancestor',commit,revision);return true;}catch{return false;}}});
  console.log(JSON.stringify(result,null,2));
  if (!result.ok) process.exitCode=1;
}
if (require.main===module) {try{main();}catch(error){console.error(error.message);process.exitCode=1;}}
module.exports={assessRelease,readBlock};
