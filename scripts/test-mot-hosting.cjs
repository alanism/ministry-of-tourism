const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),config=JSON.parse(fs.readFileSync(path.join(root,'firebase.json'),'utf8')),rc=JSON.parse(fs.readFileSync(path.join(root,'.firebaserc'),'utf8'));
assert.equal(rc.projects.default,'nonhumanintelligence');assert.deepEqual(rc.targets.nonhumanintelligence.hosting.mot,['ministryoftourism']);
const entries=Array.isArray(config.hosting)?config.hosting:[config.hosting];assert.equal(entries.length,1);assert.equal(entries[0].target,'mot');assert.equal(entries[0].site,undefined);assert.equal(entries[0].public,'apps/web/dist');assert.deepEqual(entries[0].rewrites,[{source:'**',destination:'/index.html'}]);assert(!Object.keys(rc.targets.nonhumanintelligence.hosting).some(key=>key!=='mot'));
console.log('MoT hosting project/target checks passed.');
