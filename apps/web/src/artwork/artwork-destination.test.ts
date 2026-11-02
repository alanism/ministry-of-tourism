import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {expect,it} from 'vitest';
import ArtworkPreview from './ArtworkPreview';
import type {Artwork} from './catalog';
const artwork:Artwork={id:'picture',styleId:'fcc-editorial',label:'Picture',subject:'map',city:'bangkok',thumb:'https://foreignclubberscorespondence.web.app/a.webp',src:'https://foreignclubberscorespondence.web.app/a.webp',width:100,height:200};
it('names the actual magazine insertion destination before committing an image',()=>{
 const html=renderToStaticMarkup(createElement(ArtworkPreview,{artwork,origin:'Bangkok',away:false,busy:false,onAdd(){},onBack(){},destination:'magazine'} as Parameters<typeof ArtworkPreview>[0]));
 expect(html).toContain('Add image to magazine');
 expect(html).not.toContain('Add to board');
});
it('names the main board image representation separately from itinerary text',()=>{
 const html=renderToStaticMarkup(createElement(ArtworkPreview,{artwork,origin:'Bangkok',away:false,busy:false,onAdd(){},onBack(){}}));
 expect(html).toContain('Add image to board');
 expect(html).toContain('It won’t create a place, a booking or a stop.');
});
