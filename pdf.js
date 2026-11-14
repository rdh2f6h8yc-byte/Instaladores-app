const HW=[761,761,761,761,761,761,761,761,761,761,761,761,761,761,761,761,761,761,761,761,761,761,761,761,761,761,761,761,761,761,761,761,278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584,761,556,0,222,556,333,1000,556,556,333,1000,667,333,1000,0,611,0,0,222,222,333,333,350,556,1000,333,1000,500,333,944,0,500,667,278,333,556,556,556,556,260,556,333,737,370,556,584,333,737,333,400,584,333,333,333,556,537,278,333,333,365,556,834,834,834,611,667,667,667,667,667,667,1000,722,667,667,667,667,278,278,278,278,722,722,778,778,778,778,778,584,778,722,722,722,722,667,667,611,556,556,556,556,556,556,889,500,556,556,556,556,278,278,278,278,556,556,556,556,556,556,556,584,611,556,556,556,556,500,556,500],HBW=[761,761,761,761,761,761,761,761,761,761,761,761,761,761,761,761,761,761,761,761,761,761,761,761,761,761,761,761,761,761,761,761,278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584,761,556,0,278,556,500,1000,556,556,333,1000,667,333,1000,0,611,0,0,278,278,500,500,350,556,1000,333,1000,556,333,944,0,500,667,278,333,556,556,556,556,280,556,333,737,370,556,584,333,737,333,400,584,333,333,333,611,556,278,333,333,365,556,834,834,834,611,722,722,722,722,722,722,1000,722,667,667,667,667,278,278,278,278,722,722,778,778,778,778,778,584,778,722,722,722,722,667,667,611,556,556,556,556,556,556,889,556,556,556,556,556,278,278,278,278,611,611,611,611,611,611,611,584,611,611,611,611,611,556,611,556];

// Generador de PDF propio (Helvetica, A4 vertical u horizontal, varias imágenes JPEG)
const CPM={8364:128,8218:130,402:131,8222:132,8230:133,8224:134,8225:135,710:136,8240:137,352:138,8249:139,338:140,381:142,8216:145,8217:146,8220:147,8221:148,8226:149,8211:150,8212:151,732:152,8482:153,353:154,8250:155,339:156,382:158,376:159,8593:94,8595:118};
function cp(s){let o="";for(const ch of String(s)){let c=ch.codePointAt(0);if(c>=256||(c>=127&&c<160))c=CPM[c]||63;o+=String.fromCharCode(c)}return o}
const PT=v=>(v*72/25.4).toFixed(2);
function anchoMM(t,size,bold){const W=bold?HBW:HW;let w=0;for(let i=0;i<t.length;i++)w+=W[t.charCodeAt(i)]||556;return w/1000*size*25.4/72}
function partir(s,size,bold,max){const out=[];for(const par of String(s??"").split("\n")){let l="";for(const w of par.split(/\s+/)){const t=l?l+" "+w:w;if(l&&anchoMM(cp(t),size,bold)>max){out.push(l);l=w}else l=t}out.push(l)}return out}
class MiniPDF{
  constructor(){this.pags=[];this.imgs=[];this.nueva()}
  nueva(apaisado){this.c=[];this.W=apaisado?297:210;this.H=apaisado?210:297;this.pags.push({c:this.c,W:this.W,H:this.H})}
  rgb(h){const n=parseInt(h.slice(1),16);return[(n>>16)&255,(n>>8)&255,n&255].map(v=>(v/255).toFixed(3)).join(" ")}
  rect(x,y,w,h,col){this.c.push(`${this.rgb(col)} rg ${PT(x)} ${PT(this.H-y-h)} ${PT(w)} ${PT(h)} re f`)}
  marco(x,y,w,h,col,lw){this.c.push(`${this.rgb(col)} RG ${lw||.5} w ${PT(x)} ${PT(this.H-y-h)} ${PT(w)} ${PT(h)} re S`)}
  linea(x1,y1,x2,y2,col,w){this.c.push(`${this.rgb(col)} RG ${w||.5} w ${PT(x1)} ${PT(this.H-y1)} m ${PT(x2)} ${PT(this.H-y2)} l S`)}
  txt(x,y,s,size,bold,col,al){const t=cp(s),w=anchoMM(t,size,bold),xx=al==="r"?x-w:al==="c"?x-w/2:x;
    this.c.push(`BT /${bold?"F2":"F1"} ${size} Tf ${this.rgb(col)} rg ${PT(xx)} ${PT(this.H-y)} Td (${t.replace(/[\\()]/g,m=>"\\"+m)}) Tj ET`);return w}
  imagen(jpg,pw,ph,x,y,w,h){let i=this.imgs.findIndex(m=>m.jpg===jpg);if(i<0){this.imgs.push({jpg,pw,ph});i=this.imgs.length-1}
    this.c.push(`q ${PT(w)} 0 0 ${PT(h)} ${PT(x)} ${PT(this.H-y-h)} cm /Im${i+1} Do Q`)}
  salida(){const ob=[];const add=s=>{ob.push(s);return ob.length};
    add("<< /Type /Catalog /Pages 2 0 R >>");add("PAGES");
    add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
    add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
    const ims=this.imgs.map(m=>add(`<< /Type /XObject /Subtype /Image /Width ${m.pw} /Height ${m.ph} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${m.jpg.length} >>\nstream\n${m.jpg}\nendstream`));
    const xo=ims.length?` /XObject << ${ims.map((o,i)=>`/Im${i+1} ${o} 0 R`).join(" ")} >>`:"";
    const kids=[];
    for(const p of this.pags){const s=p.c.join("\n");const ci=add(`<< /Length ${s.length} >>\nstream\n${s}\nendstream`);
      kids.push(add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PT(p.W)} ${PT(p.H)}] /Contents ${ci} 0 R /Resources << /Font << /F1 3 0 R /F2 4 0 R >>${xo} >> >>`))}
    ob[1]=`<< /Type /Pages /Kids [${kids.map(k=>k+" 0 R").join(" ")}] /Count ${kids.length} >>`;
    let out="%PDF-1.4\n%\xE2\xE3\xCF\xD3\n";const off=[];
    ob.forEach((o,i)=>{off.push(out.length);out+=`${i+1} 0 obj\n${o}\nendobj\n`});
    const xr=out.length;out+=`xref\n0 ${ob.length+1}\n0000000000 65535 f \n`+off.map(o=>String(o).padStart(10,"0")+" 00000 n \n").join("");
    out+=`trailer\n<< /Size ${ob.length+1} /Root 1 0 R >>\nstartxref\n${xr}\n%%EOF`;
    const b=new Uint8Array(out.length);for(let i=0;i<out.length;i++)b[i]=out.charCodeAt(i)&255;return new Blob([b],{type:"application/pdf"})}
}
// Convierte una imagen (dataURL, blob URL o Blob) a JPEG para el PDF, con fondo blanco y tamaño máximo
async function aJPG(src,max,calidad){const url=src instanceof Blob?URL.createObjectURL(src):src;const im=new Image();
  await new Promise((ok,ko)=>{im.onload=ok;im.onerror=ko;im.src=url});if(src instanceof Blob)URL.revokeObjectURL(url);
  const k=Math.min(1,(max||1600)/Math.max(im.naturalWidth,im.naturalHeight)),cv=document.createElement("canvas");
  cv.width=Math.max(1,Math.round(im.naturalWidth*k));cv.height=Math.max(1,Math.round(im.naturalHeight*k));
  const cx=cv.getContext("2d");cx.fillStyle="#fff";cx.fillRect(0,0,cv.width,cv.height);cx.drawImage(im,0,0,cv.width,cv.height);
  return{jpg:atob(cv.toDataURL("image/jpeg",calidad||.85).split(",")[1]),w:cv.width,h:cv.height}}
const eurPDF=v=>{const s=(Math.round(v*100)/100).toFixed(2).split(".");return s[0].replace(/\B(?=(\d{3})+(?!\d))/g,".")+","+s[1]+" €"};
