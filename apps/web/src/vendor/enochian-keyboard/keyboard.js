// @ts-nocheck
/* Enochian typing keyboard behavior, copied unchanged from typing-keyboard/index.html
   (only the IIFE wrapper and demo mounting are replaced by this export).
   Based on Enochian UI UX Elements by alanism / UnCommon Core
   (https://github.com/alanism/Enochian-UI-UX-Elements), CC BY-NC 4.0. */
'use strict';
export function mount(root, output = root.querySelector('[data-keyboard-output]')) {
    if (root.enochianKeyboard) return root.enochianKeyboard;
    const $ = selector => root.querySelector(selector);
    const listenController = new AbortController();
    const on = (el, name, fn) => el.addEventListener(name, fn, {signal:listenController.signal});
    const emit = (name, detail) => root.dispatchEvent(new CustomEvent('enochian:keyboard-'+name, {bubbles:true, detail}));
    const status = text => $('[data-keyboard-status]').textContent = text;
    const keys = new Map(), held = new Map(), physical = new Map(), drags = new Map();
    const parameters = {volume:40, backlight:80};
    let caps=false, shift=false, fn=false, sound=false, audio=null, clockTimer=null, destroyed=false;
    const arrows = {ArrowLeft:'M12 3 5 8l7 5M5 8h10',ArrowDown:'M3 6l5 7 5-7M8 2v11',ArrowUp:'M3 10l5-7 5 7M8 3v11',ArrowRight:'M4 3l7 5-7 5M1 8h10'};
    const icon = path => '<svg class="mk-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="'+path+'"/></svg>';
    const functions = ['☼','☼','▯▯','⠿','· ·','⌁','⏮','⏯','⏭','×','−','+'];
    const rows = [
      [['esc','Escape',6,'',true], ...Array.from({length:12},(_,i)=>['F'+(i+1),'F'+(i+1),4,functions[i]]), ['del','Delete',6]],
      [['§','Backquote',4,'±'], ...'1234567890'.split('').map((x,i)=>[x,'Digit'+x,4,'!@#$%^&*()'[i]]), ['-','Minus',4,'_'],['=','Equal',4,'+'],['backspace','Backspace',8]],
      [['tab','Tab',7], ...'QWERTYUIOP'.split('').map(x=>[x,'Key'+x,4]), ['[','BracketLeft',4,'{'],[']','BracketRight',4,'}'],['↵','Enter',5]],
      [['caps','CapsLock',8], ...'ASDFGHJKL'.split('').map(x=>[x,'Key'+x,4]), [';','Semicolon',4,':'],["'",'Quote',4,'"'],['\\','Backslash',4,'|']],
      [['shift','ShiftLeft',5], ['`','IntlBackslash',4,'~'], ...'ZXCVBNM'.split('').map(x=>[x,'Key'+x,4]), [',','Comma',4,'<'],['.','Period',4,'>'],['/','Slash',4,'?'],['shift','ShiftRight',7],['','ArrowUp',4,'',true]],
      [['ctrl','ControlLeft',4,'⌃'],['fn','FnLeft',4],['alt','AltLeft',4,'⌥'],['⌘','MetaLeft',5,'▦'],['space','Space',25],['alt','AltRight',4,'⌥'],['fn','FnRight',6],['','ArrowLeft',4,'',true],['','ArrowDown',4,'',true]]
    ];
    const labels = {Escape:'Escape',Delete:'Delete',Backspace:'Backspace',Space:'Space',Tab:'Tab',Enter:'Enter',CapsLock:'Caps Lock',ShiftLeft:'Left Shift',ShiftRight:'Right Shift',ControlLeft:'Control',AltLeft:'Left Alt',AltRight:'Right Alt',MetaLeft:'Command',FnLeft:'Left Fn',FnRight:'Right Fn',ArrowLeft:'Left arrow',ArrowDown:'Down arrow',ArrowUp:'Up arrow',ArrowRight:'Right arrow'};
    function makeKey([label,code,width=4,secondary='',accent=false], row, col) {
      const button=document.createElement('button'); button.type='button'; button.className='mk-key'; button.dataset.code=code; button.dataset.down='false';
      button.setAttribute('aria-label',labels[code]||label+' key');
      if(width>4)button.dataset.wide=''; if(accent)button.dataset.accent='';
      if(/^(Shift|Fn)|CapsLock/.test(code))button.setAttribute('aria-pressed','false');
      if(row){button.style.gridColumn=col+' / span '+width;button.style.gridRow=row;button.dataset.row=row;}
      if(code==='Enter'){button.classList.add('mk-enter');button.style.gridRow='3 / span 2';}
      if(arrows[code]){button.classList.add('mk-arrow');label=icon(arrows[code]);}
      button.innerHTML='<span class="mk-primary'+(code==='MetaLeft'?' mk-meta':'')+'">'+label+'</span>'+(secondary?'<span class="mk-secondary">'+secondary+'</span>':'');
      keys.set(code,{button,label,secondary});
      on(button,'pointerdown',e=>{if(e.button!==0)return;button.focus({preventScroll:true});button.setPointerCapture(e.pointerId);press(code,'pointer:'+e.pointerId,true);});
      for(const name of ['pointerup','pointercancel','lostpointercapture'])on(button,name,e=>press(code,'pointer:'+e.pointerId,false));
      on(button,'keydown',e=>{if(e.key===' '||e.key==='Enter')press(code,'activation:'+e.code,true);});
      on(button,'keyup',e=>{if(e.key===' '||e.key==='Enter')press(code,'activation:'+e.code,false);});
      on(button,'click',()=>activate(code));
      return button;
    }
    rows.forEach((row,index)=>{let col=1;row.forEach(spec=>{ $('[data-keyboard-keys]').append(makeKey(spec,index+1,col));col+=spec[2]||4; });});
    $('.mk-rail').append(makeKey(['','ArrowRight',4,'',true]));
    function press(code, source, down) {
      if(!keys.has(code))return;
      const owners=held.get(code)||new Set(); down?owners.add(source):owners.delete(source); held.set(code,owners);
      keys.get(code).button.dataset.down=String(owners.size>0);
    }
    function modifiers() {
      for(const code of ['ShiftLeft','ShiftRight'])keys.get(code).button.setAttribute('aria-pressed',String(shift||physical.has('ShiftLeft')||physical.has('ShiftRight')));
      for(const code of ['FnLeft','FnRight'])keys.get(code).button.setAttribute('aria-pressed',String(fn));
      keys.get('CapsLock').button.setAttribute('aria-pressed',String(caps));
    }
    function edit(code, text) {
      if(!output)return;
      const value=output.value, start=output.selectionStart, end=output.selectionEnd;
      const segments=typeof Intl.Segmenter==='function'?[...new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(value)].map(s=>s.segment):Array.from(value);
      const boundaries=[0];for(const part of segments)boundaries.push(boundaries.at(-1)+part.length);
      const previous=boundaries.filter(i=>i<start).at(-1)??0, next=boundaries.find(i=>i>end)??value.length;
      if(code.startsWith('Arrow')) {
        let caret=code==='ArrowLeft'?(start===end?previous:start):code==='ArrowRight'?(start===end?next:end):null;
        if(code==='ArrowUp'||code==='ArrowDown') {
          const lineStart=value.lastIndexOf('\n',start-1)+1, column=start-lineStart;
          if(code==='ArrowUp'){const previousEnd=Math.max(0,lineStart-1),previousStart=value.lastIndexOf('\n',previousEnd-1)+1;caret=Math.min(previousStart+column,previousEnd);}
          else{const next=value.indexOf('\n',start);caret=next<0?value.length:Math.min(next+1+column,value.indexOf('\n',next+1)<0?value.length:value.indexOf('\n',next+1));}
        }
        output.setSelectionRange(caret,caret); return;
      }
      if(output.readOnly||output.disabled)return;
      let from=start,to=end;
      if(code==='Backspace') {if(from===to)from=previous;text='';}
      if(code==='Delete') {if(from===to)to=next;text='';}
      if(text===null)return;
      output.setRangeText(text,from,to,'end');
      output.dispatchEvent(new Event('input',{bubbles:true}));
    }
    function thock() {
      if(!sound||!parameters.volume)return;
      const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)return;
      try{
        audio ||= new Audio(); if(audio.state==='suspended')audio.resume().catch(()=>{});
        const osc=audio.createOscillator(), gain=audio.createGain(), now=audio.currentTime;
        osc.type='triangle';osc.frequency.setValueAtTime(175,now);osc.frequency.exponentialRampToValueAtTime(48,now+.07);
        gain.gain.setValueAtTime(.11*parameters.volume/100,now);gain.gain.exponentialRampToValueAtTime(.0001,now+.08);
        osc.connect(gain);gain.connect(audio.destination);osc.start();osc.stop(now+.09);osc.onended=()=>{osc.disconnect();gain.disconnect();};
      }catch(_){status('AUDIO UNAVAILABLE');}
    }
    function setSound(value) {sound=value;const b=$('[data-keyboard-sound]');b.setAttribute('aria-pressed',String(sound));b.setAttribute('aria-label','Sound '+(sound?'on':'off'));b.textContent='SOUND '+(sound?'ON':'OFF');status('SOUND '+(sound?'ON':'OFF'));if(!sound&&audio){audio.close().catch(()=>{});audio=null;}}
    function activate(code, physicalText=null) {
      const key=keys.get(code);if(!key)return;
      const shifted=shift||physical.has('ShiftLeft')||physical.has('ShiftRight');
      let text=null;
      if(physicalText!==null&&physicalText.length===1)text=physicalText;
      else if(code.startsWith('Key'))text=caps!==shifted?key.label.toUpperCase():key.label.toLowerCase();
      else if(/^(Digit|Minus|Equal|Bracket|Semicolon|Quote|Backslash|IntlBackslash)/.test(code))text=shifted?key.secondary:key.label;
      else if(code==='Backquote')text=shifted?'±':'§';
      else if(code==='Space')text=' ';else if(code==='Enter')text='\n';else if(code==='Tab')text='\t';
      const logicalKey=physicalText??(text!==null&&code!=='Enter'&&code!=='Tab'?text:/^(Shift|Control|Alt|Meta|Fn)(Left|Right)$/.test(code)?code.replace(/(Left|Right)$/,''):code);
      emit('key',{code,key:logicalKey,shift:shifted,capsLock:caps,fn});status((labels[code]||code.replace('Key',''))+' · PRESSED');
      if(code==='CapsLock'){caps=!caps;modifiers();return;}
      if(code.startsWith('Shift')){shift=!shift;modifiers();return;}
      if(code.startsWith('Fn')){fn=!fn;modifiers();return;}
      if(fn&&/^F\d+$/.test(code)){
        if(code==='F1'||code==='F2')setParameter('backlight',parameters.backlight+(code==='F1'?-10:10));
        if(code==='F10')setSound(!sound);
        if(code==='F11'||code==='F12')setParameter('volume',parameters.volume+(code==='F11'?-5:5));
        return;
      }
      edit(code,text);if(text!==null||code==='Backspace'||code==='Delete'){shift=false;modifiers();thock();}
    }
    if(output)on(output,'input',()=>emit('input',{value:output.value,selectionStart:output.selectionStart,selectionEnd:output.selectionEnd}));
    on(root,'keydown',e=>{
      if(e.target.matches('.mk-scroll')||e.target.closest('[role=slider]')||e.target.closest('.mk-toolbar'))return;
      if(e.target.closest('.mk-key')&&(e.key===' '||e.key==='Enter'))return;
      if(!keys.has(e.code))return;
      physical.set(e.code,e.key);press(e.code,'physical',true);
      if(e.code.startsWith('Shift')){modifiers();return;}
      if(e.target===output&&e.code==='CapsLock'){if(!e.repeat)caps=!caps;modifiers();return;}
      if(e.target===output||e.ctrlKey||e.metaKey||e.altKey)return;
      e.preventDefault();activate(e.code,e.key);
    });
    on(root,'keyup',e=>{physical.delete(e.code);press(e.code,'physical',false);modifiers();});
    function releaseAll(){held.clear();physical.clear();drags.clear();for(const {button}of keys.values())button.dataset.down='false';modifiers();}
    on(root,'focusout',e=>{if(!root.contains(e.relatedTarget))releaseAll();});
    on(window,'blur',()=>{releaseAll();setSound(false);});
    on(window,'pagehide',()=>{releaseAll();setSound(false);stopClock();});
    function setParameter(name,value,notify=true){
      parameters[name]=Math.max(0,Math.min(100,Math.round(value)));
      const el=$('[data-parameter="'+name+'"]');el.setAttribute('aria-valuenow',parameters[name]);el.setAttribute('aria-valuetext',parameters[name]+' percent');el.style.setProperty('--mk-angle',(-135+parameters[name]*2.7)+'deg');
      if(name==='backlight')root.style.setProperty('--mk-light',.08+parameters[name]/100*.92);
      if(notify){status(name.toUpperCase()+' · '+parameters[name]+'%');emit('parameter',{parameter:name,value:parameters[name]});}
    }
    for(const el of root.querySelectorAll('[data-parameter]')){
      const name=el.dataset.parameter,defaults=parameters[name];
      el.querySelector('svg').innerHTML=Array.from({length:15},(_,i)=>{const a=(-135+i*270/14-90)*Math.PI/180;return '<circle cx="'+(50+46*Math.cos(a))+'" cy="'+(50+46*Math.sin(a))+'" r="1.25" fill="currentColor"/>';}).join('');
      on(el,'pointerdown',e=>{if(e.button!==0)return;e.preventDefault();el.focus({preventScroll:true});el.setPointerCapture(e.pointerId);drags.set(name,{id:e.pointerId,y:e.clientY,value:parameters[name]});});
      on(el,'pointermove',e=>{const drag=drags.get(name);if(drag?.id===e.pointerId)setParameter(name,drag.value+(drag.y-e.clientY)/1.5);});
      for(const type of ['pointerup','pointercancel','lostpointercapture'])on(el,type,()=>drags.delete(name));
      on(el,'dblclick',()=>setParameter(name,defaults));
      on(el,'keydown',e=>{const delta={ArrowUp:1,ArrowRight:1,ArrowDown:-1,ArrowLeft:-1,PageUp:10,PageDown:-10}[e.key];if(delta!==undefined||e.key==='Home'||e.key==='End'){e.preventDefault();setParameter(name,e.key==='Home'?0:e.key==='End'?100:parameters[name]+delta);}});
      setParameter(name,defaults,false);
    }
    for(const button of root.querySelectorAll('[data-finish-choice]'))on(button,'click',()=>{root.dataset.finish=button.dataset.finishChoice;root.querySelectorAll('[data-finish-choice]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));});
    on($('[data-keyboard-sound]'),'click',()=>setSound(!sound));
    on($('[data-keyboard-clear]'),'click',()=>{if(output){output.value='';output.dispatchEvent(new Event('input',{bubbles:true}));}shift=false;caps=false;fn=false;releaseAll();status('CLEARED');});
    function updateClock(){const now=new Date();$('[data-clock]').textContent=now.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'});$('[data-clock]').dateTime=now.toISOString();$('[data-clock-date]').textContent=now.toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'});}
    function stopClock(){clearInterval(clockTimer);clockTimer=null;}
    function startClock(){if(destroyed||document.hidden)return;updateClock();stopClock();clockTimer=setInterval(updateClock,1000);}
    on(document,'visibilitychange',()=>{if(document.hidden){stopClock();releaseAll();setSound(false);}else startClock();});
    on(window,'pageshow',startClock);startClock();
    root.enochianKeyboard={destroy(){destroyed=true;stopClock();releaseAll();setSound(false);listenController.abort();$('[data-keyboard-keys]').replaceChildren();$('.mk-rail>.mk-key').remove();delete root.enochianKeyboard;}};
    return root.enochianKeyboard;
  }
