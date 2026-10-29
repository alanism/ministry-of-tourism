const assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const {captureArtNetwork}=require('./mot-art-network.cjs');
const url='https://foreignclubberscorespondence.web.app/assets/generated/kyoto/cafe/kyoto-cafe-v01-e61ccfcc20-480w.webp';
const cdp=new EventEmitter(),capture=captureArtNetwork(cdp),mark=capture.mark();
// Replay the observed 8.133-second trace, not a synthetic passing performance sample.
cdp.emit('Network.requestWillBeSent',{requestId:'slow',type:'Image',timestamp:32202.803525,request:{url,headers:{Cookie:'PRIVATE_COOKIE'}}});
cdp.emit('Network.responseReceived',{requestId:'slow',response:{status:200,protocol:'h2',fromDiskCache:false,headers:{'Set-Cookie':'PRIVATE_RESPONSE'},timing:{proxyStart:.081,proxyEnd:7219.253,dnsStart:7219.789,dnsEnd:7412.062,connectStart:7412.687,connectEnd:7488.108,sslStart:7448.252,sslEnd:7488.058,sendEnd:7488.52,receiveHeadersStart:7629.205}}});
cdp.emit('Network.loadingFinished',{requestId:'slow',timestamp:32210.481664,encodedDataLength:56101});
const [slow]=capture.forImage(url,mark);assert(slow);assert(Math.abs(slow.durationMs-7678.139)<.001);assert(Math.abs(slow.proxyResolutionMs-7219.172)<.001);assert.equal(slow.status,200);assert.equal(slow.encodedBytes,56101);
assert.deepEqual(capture.forImage(url,capture.mark()),[],'A cached view must not reuse a previous view’s request timing.');
const next=capture.mark();cdp.emit('Network.requestWillBeSent',{requestId:'query',type:'Image',timestamp:10,request:{url:url+'?token=PRIVATE_QUERY#PRIVATE_FRAGMENT'}});
cdp.emit('Network.responseReceived',{requestId:'query',response:{status:200,fromDiskCache:true,timing:undefined}});
cdp.emit('Network.loadingFinished',{requestId:'query',timestamp:10.1,encodedDataLength:0});
const cached=capture.forImage(url+'?token=PRIVATE_QUERY#PRIVATE_FRAGMENT',next);assert.equal(cached.length,1);assert.equal(cached[0].proxyResolutionMs,null,'Unreported phases are unknown, not zero.');assert.equal(cached[0].fromDiskCache,true);assert(!JSON.stringify([...capture.forImage(url,mark),...cached]).includes('PRIVATE_'));
cdp.emit('Network.requestWillBeSent',{requestId:'other-query',type:'Image',timestamp:10.2,request:{url:url+'?token=PRIVATE_OTHER'}});
assert.equal(capture.forImage(url+'?token=PRIVATE_QUERY',next).length,1,'Query redaction must not merge distinct image requests.');
for(const forbidden of ['https://private.example/artwork/PRIVATE_TRIP.png','blob:https://foreignclubberscorespondence.web.app/PRIVATE_BOARD','https://PRIVATE_USER:PRIVATE_PASS@foreignclubberscorespondence.web.app/assets/generated/x.png']){
 cdp.emit('Network.requestWillBeSent',{requestId:forbidden,type:'Image',timestamp:11,request:{url:forbidden}});assert.deepEqual(capture.forImage(forbidden,next),[]);
}
const redirectMark=capture.mark();cdp.emit('Network.requestWillBeSent',{requestId:'redirect',type:'Image',timestamp:20,request:{url}});cdp.emit('Network.requestWillBeSent',{requestId:'redirect',type:'Image',timestamp:21,redirectResponse:{status:302},request:{url:url.replace('480w','960w')}});cdp.emit('Network.responseReceived',{requestId:'redirect',response:{status:200,timing:{proxyStart:0,proxyEnd:1}}});cdp.emit('Network.loadingFinished',{requestId:'redirect',timestamp:22,encodedDataLength:10});const [redirect]=capture.forImage(url,redirectMark);assert(redirect.redirected);assert.equal(redirect.proxyResolutionMs,null,'A final-hop proxy phase must not masquerade as whole-chain timing.');
capture.dispose();for(const event of ['Network.requestWillBeSent','Network.responseReceived','Network.loadingFinished'])assert.equal(cdp.listenerCount(event),0);
console.log('Art network timing: real-trace replay, view isolation, missing phases, URL/header privacy and redirects pass.');
