import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {artworkSchema} from './catalog';
import ArtworkThumbnail from './ArtworkThumbnail';
it('shows honest loading before thumbnail bytes arrive without inventing percentage progress',()=>{
 const catalog=JSON.parse(readFileSync(new URL('../../public/artwork/fcc/kyoto/cafe.json',import.meta.url),'utf8')),artwork=artworkSchema.parse(catalog.items[0]);
 const html=renderToStaticMarkup(createElement(ArtworkThumbnail,{artwork}));expect(html).toContain('Loading preview');expect(html).toContain('aria-busy="true"');expect(html).toContain('role="status"');expect(html).not.toMatch(/\d+\s*%\s*(complete|loaded)|Preview unavailable/);
});
