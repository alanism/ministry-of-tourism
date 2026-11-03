import {readFileSync} from 'node:fs';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {expect,it} from 'vitest';
import {createTrip,TripSession} from '@mot/core';
import {OwnMuseFiles,type OwnMuseFilesProps} from './OwnMuseFiles';
it('contains the complete file flow in the existing opaque panel with its own scrolling surface',()=>{
 const session=new TripSession(createTrip({title:'Synthetic trip',city:'Aspen',cityId:'aspen',timeZone:'America/Denver'}));
 const props:OwnMuseFilesProps={session,actor:{kind:'human',id:'owner',name:'Owner'},open:{doc:session.doc} as OwnMuseFilesProps['open'],tick:0,active:true,onClose(){},onExport(){},refresh(){},whenSaved:async()=>{},hasPendingNativeProposalId:()=>false};
 try{
  const html=renderToStaticMarkup(createElement(OwnMuseFiles,props));
  expect(html).toMatch(/class="[^"]*m-panel[^"]*mot-own-files/);
  const css=readFileSync(new URL('./own-muse-files.css',import.meta.url),'utf8');
  expect(css).toMatch(/\.mot-own-files\{[^}]*height:100%[^}]*overflow:auto/);
  expect(css).not.toMatch(/#[0-9a-f]{3,8}\b/i);expect(css).toContain('var(--m-wash)');
 }finally{session.destroy();}
});
