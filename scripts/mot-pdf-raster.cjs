// Keep native Poppler pixels and the existing deadline; avoid its slow PNG compressor.
const fs=require('node:fs'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
async function rasterPdfPage(page,pdf,index,prefix){
 const started=performance.now(),timeout=15000;
 const data=execFileSync(process.env.MOT_PDFTOPPM||'pdftoppm',['-f',String(index),'-l',String(index),'-singlefile','-scale-to-x','1184','-scale-to-y','1680',pdf],{timeout,stdio:['ignore','pipe','pipe'],maxBuffer:8*1024*1024});
 const header=/^P6\r?\n(\d+) (\d+)\r?\n255\r?\n/.exec(data.subarray(0,64).toString('ascii'));
 assert(header,'Expected native Poppler RGB pixels');
 const width=Number(header[1]),height=Number(header[2]),rgb=data.subarray(header[0].length);
 assert.equal(width,1184);assert.equal(height,1680);assert.equal(rgb.length,width*height*3);
 const png=await page.evaluate(async({width,height,pixels})=>{
  const source=atob(pixels),rgba=new Uint8ClampedArray(width*height*4);
  for(let i=0,j=0;i<rgba.length;i+=4,j+=3){rgba[i]=source.charCodeAt(j);rgba[i+1]=source.charCodeAt(j+1);rgba[i+2]=source.charCodeAt(j+2);rgba[i+3]=255;}
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const context=canvas.getContext('2d');context.putImageData(new ImageData(rgba,width,height),0,0);
  const encoded=canvas.toDataURL('image/png'),image=new Image();image.src=encoded;await image.decode();context.drawImage(image,0,0);
  const restored=context.getImageData(0,0,width,height).data;
  for(let i=0;i<rgba.length;i++)if(rgba[i]!==restored[i])throw Error('PNG serialization changed native Poppler pixels');
  return encoded.split(',')[1];
 },{width,height,pixels:rgb.toString('base64')});
 const timing={page:index,elapsedMs:performance.now()-started,timeoutMs:timeout,pixelsIdentical:true};
 assert(timing.elapsedMs<timeout,'Native page raster exceeded the unchanged 15-second deadline');
 fs.writeFileSync(prefix+'.png',Buffer.from(png,'base64'));fs.writeFileSync(prefix+'-timing.json',JSON.stringify(timing));
 return timing;
}
module.exports={rasterPdfPage};
