import {publicLinkUrl} from '../export/pdf.ts';
const escape=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const tokens=/!\[([^\]]*)\]\(([^)]+)\)|\[([^\]]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`/g;
function inline(value:string,html:boolean){
  let result='',at=0;
  for(const match of value.matchAll(tokens)){
    const encode=html?escape:(s:string)=>s;result+=encode(value.slice(at,match.index));at=match.index!+match[0].length;
    if(match[1]!==undefined){result+=encode(`${match[1]} (image not embedded)`);continue;}
    if(match[3]!==undefined){let url:string|undefined;try{url=publicLinkUrl(match[4]!);}catch{/* Unsupported targets remain inert labels. */}result+=html&&url?`<a href="${escape(url)}" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">${escape(match[3])}</a>`:encode(match[3]+(url?` (${url})`:' (link unavailable)'));continue;}
    const text=match[5]??match[6]??match[7]!,tag=match[5]?'strong':match[6]?'em':'code';result+=html?`<${tag}>${escape(text)}</${tag}>`:text;
  }
  return result+(html?escape(value.slice(at)):value.slice(at));
}
/** Deliberately small, inert reading subset. Stored Markdown/source text is never rewritten. */
export function magazineReadingText(source:string):string{
  let code=false;return source.replace(/\r/g,'').split('\n').map(line=>{
    if(/^\s*```/.test(line)){code=!code;return '';}
    if(code)return line;
    return inline(line.replace(/^\s{0,3}#{1,6}\s+/,'').replace(/^\s*>\s?/,'' ).replace(/^\s*[-*+]\s+/,'• '),false);
  }).join('\n');
}
export function magazineReadingHtml(source:string):string{
  const output:string[]=[];let code:string[]|null=null,list:'ul'|'ol'|null=null,paragraph:string[]=[];
  const flush=()=>{if(paragraph.length){output.push(`<p>${inline(paragraph.join('\n'),true)}</p>`);paragraph=[];}};
  const closeList=()=>{if(list){output.push(`</${list}>`);list=null;}};
  for(const line of source.replace(/\r/g,'').split('\n')){
    if(/^\s*```/.test(line)){flush();closeList();if(code){output.push(`<pre><code>${escape(code.join('\n'))}</code></pre>`);code=null;}else code=[];continue;}
    if(code){code.push(line);continue;}
    if(!line.trim()){flush();closeList();continue;}
    const heading=/^\s{0,3}(#{1,6})\s+(.+)$/.exec(line),item=/^\s*(?:([-*+])|\d+\.)\s+(.+)$/.exec(line),quote=/^\s*>\s?(.*)$/.exec(line);
    if(heading){flush();closeList();const level=Math.min(6,heading[1]!.length+2);output.push(`<h${level}>${inline(heading[2]!,true)}</h${level}>`);}
    else if(item){flush();const kind=item[1]?'ul':'ol';if(list!==kind){closeList();list=kind;output.push(`<${kind}>`);}output.push(`<li>${inline(item[2]!,true)}</li>`);}
    else if(quote){flush();closeList();output.push(`<blockquote>${inline(quote[1]!,true)}</blockquote>`);}
    else{closeList();paragraph.push(line);}
  }
  flush();closeList();if(code)output.push(`<pre><code>${escape(code.join('\n'))}</code></pre>`);return output.join('');
}
