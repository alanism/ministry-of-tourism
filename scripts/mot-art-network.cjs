// CDP observations only: no requests, proxy changes, browser-cache changes or private headers.
const {createHash}=require('node:crypto');
function captureArtNetwork(cdp){
  let sequence=0;const requests=new Map();
  const publicUrl=value=>{try{const url=new URL(value);if(url.protocol!=='https:'||url.username||url.password||!['foreignclubberscorespondence.web.app','foreignclubberscorespondence.firebaseapp.com'].includes(url.host))return null;url.hash='';const matchKey=createHash('sha256').update(url.href).digest('hex');url.search='';return{url:url.href,matchKey}}catch{return null}};
  const span=(timing,start,end)=>Number.isFinite(timing?.[start])&&Number.isFinite(timing?.[end])&&timing[start]>=0&&timing[end]>=timing[start]?timing[end]-timing[start]:null;
  const onRequest=event=>{
    if(event.type!=='Image')return;
    const url=publicUrl(event.request.url);if(!url){requests.delete(event.requestId);return;}
    const prior=requests.get(event.requestId);
    if(prior&&event.redirectResponse){prior.redirected=true;return;}
    requests.set(event.requestId,{...url,sequence:++sequence,start:event.timestamp,redirected:false});
  };
  const onResponse=event=>{
    const item=requests.get(event.requestId);if(!item)return;
    const response=event.response,timing=item.redirected?undefined:response.timing;
    Object.assign(item,{status:response.status,protocol:response.protocol,fromDiskCache:response.fromDiskCache??null,fromServiceWorker:response.fromServiceWorker??null,
      proxyResolutionMs:span(timing,'proxyStart','proxyEnd'),dnsMs:span(timing,'dnsStart','dnsEnd'),connectMs:span(timing,'connectStart','connectEnd'),tlsMs:span(timing,'sslStart','sslEnd'),waitingForHeadersMs:span(timing,'sendEnd','receiveHeadersStart')});
  };
  const onFinished=event=>{const item=requests.get(event.requestId);if(item)Object.assign(item,{durationMs:Number.isFinite(item.start)&&Number.isFinite(event.timestamp)?(event.timestamp-item.start)*1000:null,encodedBytes:event.encodedDataLength});};
  cdp.on('Network.requestWillBeSent',onRequest);cdp.on('Network.responseReceived',onResponse);cdp.on('Network.loadingFinished',onFinished);
  return{
    mark:()=>sequence,
    forImage:(url,after)=>{const safe=publicUrl(url);return safe?[...requests.values()].filter(item=>item.matchKey===safe.matchKey&&item.sequence>after).map(({start,sequence,matchKey,...item})=>structuredClone(item)):[]},
    dispose:()=>{cdp.off('Network.requestWillBeSent',onRequest);cdp.off('Network.responseReceived',onResponse);cdp.off('Network.loadingFinished',onFinished);requests.clear();},
  };
}
module.exports={captureArtNetwork};
