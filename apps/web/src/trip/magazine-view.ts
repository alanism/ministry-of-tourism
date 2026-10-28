/** A reader-only rearrangement of the two printed postcard faces. Canonical export SVG stays untouched. */
export function postcardPreviewSvg(svg:string,turned:boolean):string {
  if(!turned)return svg;
  return svg
    .replace(/(<g\b[^>]*\bdata-postcard-face="front"[^>]*\btransform=")[^"]*(")/g,'$1translate(47.36 592) rotate(5 570 500)$2')
    .replace(/(<g\b[^>]*\bdata-postcard-face="back"[^>]*\btransform=")[^"]*(")/g,'$1translate(-35.52 -568.32) rotate(-2 590 1220)$2');
}
