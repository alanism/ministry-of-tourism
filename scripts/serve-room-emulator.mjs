import {startRoomEmulatorHttp} from '../packages/mot-server/src/room-emulator-http.ts';
const port=Number(process.argv[2]??48125),appOrigin=process.argv[3];
if(!appOrigin)throw Error('Supply exact loopback app origin; explicit emulator environment hosts required');
const server=await startRoomEmulatorHttp({port,appOrigin});
console.log(JSON.stringify({serviceMode:'local-emulator',url:server.url,appOrigin,productionConfigured:false}));
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{void server.close().then(()=>process.exit(0));});
