/* Coral Reef page background — ported from "Coral Reef: Living Wallpaper" by Luke (BioCraftEd), used with permission.
   Time-synced to the visitor's local clock. Hidden: ?reef=demo (600 s day loop), ?reef=dawn|afternoon|night (hold a scene).
   WebGL (water wobble/sparkle + light rays, the wallpaper's own GLSL) with a 2D-canvas fallback. No whale, no audio. */
(function(){
'use strict';
var SW=396, SH=212, FISH_TOP=0.12, FISH_BOT=0.6, STEP=1/60;
var cv=document.getElementById('reefbg'); if(!cv) return;
var q=(location.search.match(/[?&]reef=([a-z]+)/i)||[])[1]; q=q&&q.toLowerCase();
var MODE=q==='demo'?2:(q==='dawn'||q==='afternoon'||q==='night')?1:0;
var FIXED={dawn:0.25,afternoon:0.63,night:0.95}[q];
var mobile=matchMedia('(pointer:coarse)').matches||Math.min(screen.width,screen.height)<768;
var reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
var FPS=mobile?30:60;

/* ---------- reef_palette: the wallpaper's nine keyframes, verbatim ---------- */
function K(t,wash,lift,ray,ray_str,stack_str,ray_ang,ray_focus,fog,fog_a,glint,night){return{t:t,wash:wash,lift:lift,ray:ray,ray_str:ray_str,stack_str:stack_str,ray_ang:ray_ang,ray_focus:ray_focus,fog:fog,fog_a:fog_a,glint:glint,night:night};}
var KEYS=[K(0,[62,82,132],[5,8,16],[178,204,255],0.1,0.16,-8,0.5,[10,20,40],0.62,0.22,1),
 K(0.17,[96,98,138],[3,4,9],[235,196,170],0.08,0.1,24,0.3,[26,36,60],0.55,0.3,0.8),
 K(0.25,[236,196,176],[2,2,3],[255,208,148],0.46,0.55,22,0.32,[150,158,158],0.48,1.1,0.12),
 K(0.33,[252,250,242],[0,0,0],[255,244,205],0.4,0.5,14,0.4,[104,160,178],0.42,0.9,0),
 K(0.5,[255,255,255],[0,0,0],[184,235,255],0.34,0.42,6,0.46,[96,158,180],0.4,0.75,0),
 K(0.63,[250,244,232],[0,0,0],[252,238,190],0.4,0.48,-4,0.52,[102,156,174],0.42,0.85,0),
 K(0.72,[244,196,170],[0,0,0],[255,178,120],0.46,0.55,-18,0.58,[150,120,128],0.5,1.15,0.1),
 K(0.8,[120,104,150],[3,3,8],[205,180,235],0.12,0.14,-14,0.55,[42,40,72],0.56,0.4,0.72),
 K(0.88,[66,84,134],[5,8,15],[180,205,255],0.1,0.15,-8,0.5,[12,22,42],0.6,0.24,1)];
function lerp(a,b,f){return a+(b-a)*f;}
function l3(a,b,f){return[lerp(a[0],b[0],f),lerp(a[1],b[1],f),lerp(a[2],b[2],f)];}
function palette(t){
  var n=KEYS.length,ka,kb,ta,tb; t-=Math.floor(t);
  if(t>=KEYS[n-1].t){ka=KEYS[n-1];kb=KEYS[0];ta=ka.t;tb=1;}
  else{var i=0;while(t>=KEYS[i+1].t)i++;ka=KEYS[i];kb=KEYS[i+1];ta=ka.t;tb=kb.t;}
  var f=(t-ta)/(tb-ta); f=f*f*(3-2*f);
  var p={wash:l3(ka.wash,kb.wash,f),lift:l3(ka.lift,kb.lift,f),ray:l3(ka.ray,kb.ray,f),ray_str:lerp(ka.ray_str,kb.ray_str,f),
    stack_str:lerp(ka.stack_str,kb.stack_str,f),ray_ang:lerp(ka.ray_ang,kb.ray_ang,f),ray_focus:lerp(ka.ray_focus,kb.ray_focus,f),
    fog:l3(ka.fog,kb.fog,f),fog_a:lerp(ka.fog_a,kb.fog_a,f),glint:lerp(ka.glint,kb.glint,f),night:lerp(ka.night,kb.night,f)};
  p.dayness=1-p.night; return p;
}
var dayClock=600*0.25;
function dayT(){
  if(document.documentElement.getAttribute('data-theme')==='dark') return 0.95;   // Dark theme: always the night reef
  if(MODE===1) return FIXED;
  if(MODE===2) return (dayClock/600)%1;
  var d=new Date(); return (d.getHours()*3600+d.getMinutes()*60+d.getSeconds())/86400;   // visitor's local time
}
window.BCD_REEF={palette:palette,dayT:dayT,mode:MODE};

/* ---------- helpers ---------- */
function rr(a,b){return a+Math.random()*(b-a);}
function ri(a,b){return Math.floor(rr(a,b+1));}
function ch(){return arguments[Math.floor(Math.random()*arguments.length)];}
function angDiff(a,b){return ((a-b)%360+540)%360-180;}
var D2R=Math.PI/180;
function mk(w,h){var c=document.createElement('canvas');c.width=w;c.height=h;return c;}
function rgb(c,a){return 'rgba('+Math.round(c[0])+','+Math.round(c[1])+','+Math.round(c[2])+','+(a==null?1:a)+')';}

/* ---------- fish (oFish Create/Step, per 1/60 s step) ---------- */
var fish=[], ft=0;
function Fish(sp,deep){
  var f=this; f.sp=sp; f.deep=deep; f.alpha=deep?0.57:1;
  f.x=rr(40,SW-40); f.y=rr(SH*FISH_TOP,SH*FISH_BOT);
  f.face=ch(-1,1); f.draw_face=f.face; f.cruise=rr(0.22,0.45); f.fin=rr(0.4,0.6);
  f.dir=f.face>0?rr(-20,20):180+rr(-20,20); f.target=f.dir; f.whim=ri(60,240); f.bob=rr(0,2*Math.PI);
  f.swimming=Math.random()<0.5; f.state=f.swimming?ri(90,240):ri(60,180);
  f.spd=f.swimming?f.cruise:0.03; f.isp=f.swimming?f.fin:0.1; f.img=Math.random()*4;
}
Fish.prototype.step=function(act){
  var f=this;
  if(--f.state<=0){f.swimming=!f.swimming;f.state=f.swimming?ri(90,240):ri(60,180);if(f.swimming&&Math.random()<0.5)f.whim=1;}
  f.spd+=((f.swimming?f.cruise:0.03)-f.spd)*0.05; f.isp+=((f.swimming?f.fin:0.1)-f.isp)*0.05;
  if(f.swimming&&--f.whim<=0){f.whim=ri(90,300);if(Math.random()<0.18)f.face=-f.face;var p=rr(-22,22);f.target=f.face>0?p:180-p;}
  var m=26,top=SH*FISH_TOP,bot=SH*FISH_BOT;
  if(f.x<m){f.face=1;f.target=rr(-15,15);}
  if(f.x>SW-m){f.face=-1;f.target=180+rr(-15,15);}
  if(f.y<top)f.target=f.face>0?rr(-30,-15):180+rr(15,30);
  if(f.y>bot)f.target=f.face>0?rr(15,30):180-rr(15,30);
  f.dir+=Math.max(-2.2,Math.min(2.2,angDiff(f.target,f.dir)));
  var mv=f.spd*act, cx=Math.cos(f.dir*D2R);
  f.x+=cx*mv; f.y+=-Math.sin(f.dir*D2R)*mv+Math.sin(f.bob+ft*2.1)*0.04+(1-f.spd/f.cruise)*0.015;
  if(Math.abs(cx)>0.25)f.draw_face=cx>0?1:-1;
  f.img=(f.img+f.isp*0.25)%4;   // GameMaker sprite speed 15 fps x image_speed, at 60 steps/s
};
for(var s=0;s<5;s++){for(var k=0;k<3;k++)fish.push(new Fish(s,false));}
for(s=0;s<5;s++)fish.push(new Fish(s,true));

/* ---------- particles (bubbles, motes, night glow) ---------- */
var parts=[], glows=[];
var bubSpr=mk(5,5),gl0=bubSpr.getContext('2d');
gl0.fillStyle='rgba(255,255,255,.18)';gl0.fillRect(1,1,3,3);gl0.fillStyle='rgba(255,255,255,.8)';
[[1,0],[2,0],[3,0],[0,1],[4,1],[0,2],[4,2],[0,3],[4,3],[1,4],[2,4],[3,4]].forEach(function(p){gl0.clearRect(p[0],p[1],1,1);gl0.fillRect(p[0],p[1],1,1);});
gl0.fillStyle='#fff';gl0.clearRect(1,1,1,1);gl0.fillRect(1,1,1,1);
var glowSpr=mk(17,17),g1=glowSpr.getContext('2d');
for(var gy=0;gy<17;gy++)for(var gx=0;gx<17;gx++){var ff=1-Math.hypot(gx-8,gy-8)/8;if(ff>0){g1.fillStyle='rgba(150,255,215,'+(ff*ff*0.5)+')';g1.fillRect(gx,gy,1,1);}}
g1.fillStyle='#ebfff5';g1.fillRect(8,8,1,1);
function P(kind,x,y){
  var p={k:kind,x:x,y:y,age:0,ph:Math.random()*6.283};
  if(kind===0){p.size=rr(0.5,1.1);p.spd=rr(0.25,0.6);p.dir=rr(84,96);p.life=ri(240,480);}
  else if(kind===1){p.size=1;p.spd=rr(0.02,0.09);p.dir=rr(0,360);p.life=ri(480,900);}
  else{p.size=rr(0.5,1.1);p.spd=rr(0.015,0.05);p.dir=rr(60,120);p.life=ri(900,1500);}
  return p;
}
function alpha3(p,mid){var u=p.age/p.life;return u<0.5?mid*u*2:mid*(1-u)*2;}
function emit(rate){return rate>=0.05&&Math.random()<rate/60;}
function stepParts(pal){
  var mr=4*(0.25+0.75*pal.dayness), gr=1.5*pal.night, br=3*(0.4+0.6*pal.dayness);
  if(emit(br))parts.push(P(0,rr(10,SW-10),rr(SH*0.55,SH-6)));
  if(emit(mr))parts.push(P(1,rr(4,SW-4),rr(8,SH-8)));
  if(emit(gr))glows.push(P(2,rr(8,SW-8),rr(SH*0.4,SH-8)));
  if(Math.random()*4<(0.35+0.65*pal.dayness)/60){var bx=rr(24,SW-24),by=SH-rr(8,26),n=6+ri(0,4);
    for(var i=0;i<n;i++)parts.push(P(0,bx+rr(-2,2),by+rr(0,10)));}
  [parts,glows].forEach(function(L){
    for(var i=L.length-1;i>=0;i--){var p=L[i];
      if(++p.age>=p.life){L.splice(i,1);continue;}
      var w=p.k===0?{s:0.03,d:8,ds:0.001,ss:0.0006}:p.k===1?{s:0.01,d:2,ds:0,ss:0}:{s:0.008,d:2,ds:0,ss:0};
      p.spd+=w.ds; p.size+=w.ss; p.ph+=0.12;
      var sp=p.spd+Math.sin(p.ph)*w.s, dr=(p.dir+Math.sin(p.ph*0.7)*w.d)*D2R;
      p.x+=Math.cos(dr)*sp; p.y-=Math.sin(dr)*sp;
    }});
}

/* ---------- scene layers drawn on small 2D canvases (art resolution) ---------- */
var atlas=new Image(), cA=mk(SW,SH), cB=mk(SW,SH), cP=mk(SW,SH), cG=mk(SW,SH);
var xA=cA.getContext('2d'),xB=cB.getContext('2d'),xP=cP.getContext('2d'),xG=cG.getContext('2d');
[xA,xB,xP,xG].forEach(function(x){x.imageSmoothingEnabled=false;});
function layer(x,i,a){x.globalAlpha=a==null?1:a;x.drawImage(atlas,0,i*SH,SW,SH,0,0,SW,SH);x.globalAlpha=1;}
function drawFish(x,f){
  var k=f.sp*4+(Math.floor(f.img)%4), sx=(k%12)*32, sy=SH*5+Math.floor(k/12)*32;
  x.save();x.globalAlpha=f.alpha;x.translate(Math.round(f.x),Math.round(f.y));x.scale(-f.draw_face,1);
  x.drawImage(atlas,sx,sy,32,32,-16,-16,32,32);x.restore();
}
function paintScene(pal){
  xA.clearRect(0,0,SW,SH); layer(xA,0); if(pal.night>0.001)layer(xA,4,pal.night);
  fish.forEach(function(f){if(f.deep)drawFish(xA,f);});
  xA.fillStyle=rgb(pal.fog,pal.fog_a);xA.fillRect(0,0,SW,SH); layer(xA,1); layer(xA,2);
  xB.clearRect(0,0,SW,SH); layer(xB,3); fish.forEach(function(f){if(!f.deep)drawFish(xB,f);});
  xP.clearRect(0,0,SW,SH); xP.imageSmoothingEnabled=true;
  parts.forEach(function(p){
    if(p.k===0){var a=alpha3(p,0.65),s=5*p.size;xP.globalAlpha=a;xP.drawImage(bubSpr,p.x-2*p.size,p.y-2*p.size,s,s);}
    else{xP.globalAlpha=alpha3(p,0.16);xP.fillStyle='#fff';xP.fillRect(Math.round(p.x),Math.round(p.y),1,1);}
  }); xP.globalAlpha=1;
  xG.clearRect(0,0,SW,SH); xG.imageSmoothingEnabled=true; xG.globalCompositeOperation='lighter';
  glows.forEach(function(p){var s=17*p.size;xG.globalAlpha=alpha3(p,0.5);xG.drawImage(glowSpr,p.x-8*p.size,p.y-8*p.size,s,s);});
  xG.globalAlpha=1; xG.globalCompositeOperation='source-over';
}

/* ---------- view: crop the art to the viewport aspect (cover), like the wallpaper's apply_fill_view ---------- */
var view=[0,0,1,1];
function resize(){
  var W=innerWidth,H=innerHeight,s=Math.min(1,1100/Math.max(W,H));   // devicePixelRatio deliberately 1
  cv.width=Math.max(1,Math.round(W*s)); cv.height=Math.max(1,Math.round(H*s));
  var a=W/H, vw=SW, vh=SH; if(a<SW/SH)vw=Math.round(SH*a); else vh=Math.round(SW/a);
  var x0=(SW-vw)>>1, y0=(SH-vh)>>1; view=[x0/SW,y0/SH,(x0+vw)/SW,(y0+vh)/SH];
}

/* ---------- WebGL renderer: the wallpaper's sh_water + sh_rays, plus its wash/lift/glow end pass ---------- */
var FS=[
'precision mediump float;',
'varying vec2 v;',
'uniform sampler2D uA,uB,uP,uG;',
'uniform vec4 uView; uniform vec2 uTexel; uniform float uT,uWT,uGlint,uAng,uAsp,uStack,uRay,uFocus;',
'uniform vec3 uTint,uWash,uLift; uniform float uLiftOn;',
// sh_rays, verbatim maths (n = position in the painting)
'float rays(vec2 n,float s){',
' float b=n.x+n.y*tan(radians(uAng))*uAsp;',
' float r1=pow(0.5+0.5*sin(b*42.0+uT*0.50),6.0);',
' float r2=pow(0.5+0.5*sin(b*17.0-uT*0.31+1.7),3.0);',
' float r3=pow(0.5+0.5*sin(b*67.0+uT*0.77+4.1),9.0);',
' float beams=r1*0.50+r2*0.28+r3*0.22;',
' float fall=pow(max(1.0-n.y,0.0),1.7);',
' float d=(b-uFocus)*2.6; float focus=0.35+0.65*exp(-d*d);',
' float breathe=0.85+0.15*sin(uT*0.35+n.x*3.0);',
' return beams*fall*focus*breathe*s;}',
// the scene surface: back layers + "stack" rays (additive), then the front layer and near fish over it
'vec3 scene(vec2 uv){',
' vec3 a=texture2D(uA,uv).rgb+uTint*rays(uv,uStack);',
' vec4 b=texture2D(uB,uv); return mix(a,b.rgb,b.a);}',
'float hash21(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}',
'float vnoise(vec2 p){vec2 i=floor(p);vec2 f=fract(p);f=f*f*(3.0-2.0*f);',
' return mix(mix(hash21(i),hash21(i+vec2(1.0,0.0)),f.x),mix(hash21(i+vec2(0.0,1.0)),hash21(i+vec2(1.0,1.0)),f.x),f.y);}',
'float luma(vec3 c){return dot(c,vec3(0.299,0.587,0.114));}',
'void main(){',
' vec2 uv=mix(uView.xy,uView.zw,v); vec2 n=uv; vec2 px=uv/uTexel; vec2 e=vec2(1.0)-uTexel;',
// sh_water: detail mask, domain-warped swell, sparkle band, depth grade
' float l0=luma(scene(uv));',
' float lr=luma(scene(clamp(uv+vec2(uTexel.x*2.0,0.0),vec2(0.0),e)));',
' float ld=luma(scene(clamp(uv+vec2(0.0,uTexel.y*2.0),vec2(0.0),e)));',
' float mask=clamp(1.0-(abs(l0-lr)+abs(l0-ld))*2.2,0.50,1.0);',
' float a=dot(px,vec2(0.853,0.522))+(vnoise(px/19.0)-0.5)*12.0;',
' float b=dot(px,vec2(-0.500,0.866))+(vnoise(px/23.0+vec2(37.0,11.0))-0.5)*12.0;',
' float amp=mix(1.9,0.45,n.y)*mask;',
' float wx=sin(a*0.096+uWT*1.10)+0.6*sin(a*0.163-uWT*0.75)+0.4*sin(a*0.038+uWT*0.50);',
' float wy=cos(b*0.107+uWT*0.90)+0.6*cos(b*0.171-uWT*1.30);',
' vec2 off=vec2(wx*0.5,wy*0.4)*amp*uTexel;',
' vec3 col=scene(clamp(uv+off,vec2(0.0),e));',
' float band=max(1.0-n.y/0.10,0.0);',
' float sp=sin(px.x*0.140-uWT*1.70)+0.6*sin(px.x*0.083+uWT*1.10)+0.4*sin(px.x*0.222-uWT*0.60);',
' col+=pow(max(sp*0.5,0.0),6.0)*band*band*uGlint*0.35;',
' col*=mix(vec3(1.0),vec3(0.86,0.96,1.06),n.y*0.12*3.0);',
// particles (bubbles, motes) sit on top of the water pass
' vec4 p=texture2D(uP,uv); col=mix(col,p.rgb,p.a);',
// Draw End: rays (additive), multiply by the day wash, add lift, then night glow
' col+=uTint*rays(n,uRay); col*=uWash; col+=uLift*uLiftOn; vec4 g=texture2D(uG,uv); col+=g.rgb*g.a;',
' gl_FragColor=vec4(col,1.0);}'].join('\n');
var gl=null,prog,U={},tex=[];
function initGL(){
  try{gl=cv.getContext('webgl',{alpha:false,antialias:false,premultipliedAlpha:false,powerPreference:'low-power'});}catch(e){gl=null;}
  if(!gl) return false;
  function sh(t,src){var s=gl.createShader(t);gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s));return s;}
  try{
    prog=gl.createProgram();
    gl.attachShader(prog,sh(gl.VERTEX_SHADER,'attribute vec2 p;varying vec2 v;void main(){v=vec2(p.x*0.5+0.5,0.5-p.y*0.5);gl_Position=vec4(p,0.0,1.0);}'));
    gl.attachShader(prog,sh(gl.FRAGMENT_SHADER,FS)); gl.linkProgram(prog);
    if(!gl.getProgramParameter(prog,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(prog));
  }catch(e){ if(window.console)console.warn('reef: WebGL shader failed, using 2D',e); gl=null; return false; }
  gl.useProgram(prog);
  var b=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);
  var loc=gl.getAttribLocation(prog,'p');gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,2,gl.FLOAT,false,0,0);
  ['uA','uB','uP','uG','uView','uTexel','uT','uWT','uGlint','uAng','uAsp','uStack','uRay','uFocus','uTint','uWash','uLift','uLiftOn'].forEach(function(n){U[n]=gl.getUniformLocation(prog,n);});
  for(var i=0;i<4;i++){var t=gl.createTexture();gl.activeTexture(gl.TEXTURE0+i);gl.bindTexture(gl.TEXTURE_2D,t);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);tex.push(t);}
  gl.uniform1i(U.uA,0);gl.uniform1i(U.uB,1);gl.uniform1i(U.uP,2);gl.uniform1i(U.uG,3);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);
  cv.addEventListener('webglcontextlost',function(e){e.preventDefault();gl=null;ctx2=cv.getContext('2d');},false);
  return true;
}
function drawGL(pal){
  [cA,cB,cP,cG].forEach(function(c,i){gl.activeTexture(gl.TEXTURE0+i);gl.bindTexture(gl.TEXTURE_2D,tex[i]);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,c);});
  gl.viewport(0,0,cv.width,cv.height);
  gl.uniform4f(U.uView,view[0],view[1],view[2],view[3]); gl.uniform2f(U.uTexel,1/SW,1/SH);
  gl.uniform1f(U.uT,t%628.3185307); gl.uniform1f(U.uWT,(t*0.9)%628.3185307); gl.uniform1f(U.uGlint,pal.glint);
  gl.uniform1f(U.uAng,pal.ray_ang); gl.uniform1f(U.uAsp,SH/SW); gl.uniform1f(U.uStack,pal.stack_str>0.01?pal.stack_str:0);
  gl.uniform1f(U.uRay,pal.ray_str); gl.uniform1f(U.uFocus,pal.ray_focus);
  gl.uniform3f(U.uTint,pal.ray[0]/255,pal.ray[1]/255,pal.ray[2]/255);
  gl.uniform3f(U.uWash,pal.wash[0]/255,pal.wash[1]/255,pal.wash[2]/255);
  gl.uniform3f(U.uLift,pal.lift[0]/255,pal.lift[1]/255,pal.lift[2]/255);
  gl.uniform1f(U.uLiftOn,(pal.lift[0]+pal.lift[1]+pal.lift[2])>1?1:0);
  gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
}
/* 2D fallback: same layers and day grade, no wobble; the rays become a soft tinted wash */
var ctx2=null, cS=mk(SW,SH), xS=cS.getContext('2d');
function draw2D(pal){
  xS.globalCompositeOperation='source-over'; xS.drawImage(cA,0,0);
  if(pal.stack_str>0.01){var g=xS.createLinearGradient(0,0,0,SH);g.addColorStop(0,rgb(pal.ray,pal.stack_str*0.35));g.addColorStop(1,rgb(pal.ray,0));
    xS.globalCompositeOperation='lighter';xS.fillStyle=g;xS.fillRect(0,0,SW,SH);xS.globalCompositeOperation='source-over';}
  xS.drawImage(cB,0,0); xS.drawImage(cP,0,0);
  xS.globalCompositeOperation='multiply'; xS.fillStyle=rgb(pal.wash); xS.fillRect(0,0,SW,SH);
  xS.globalCompositeOperation='lighter';
  if(pal.lift[0]+pal.lift[1]+pal.lift[2]>1){xS.fillStyle=rgb(pal.lift);xS.fillRect(0,0,SW,SH);}
  xS.drawImage(cG,0,0); xS.globalCompositeOperation='source-over';
  ctx2.imageSmoothingEnabled=false;
  ctx2.drawImage(cS,view[0]*SW,view[1]*SH,(view[2]-view[0])*SW,(view[3]-view[1])*SH,0,0,cv.width,cv.height);
}

/* ---------- loop ---------- */
var t=0, acc=0, last=0, raf=0, running=false, pal=palette(dayT());
function simulate(steps){
  for(var i=0;i<steps;i++){
    t+=STEP; ft+=STEP; if(MODE===2)dayClock+=STEP;
    pal=palette(dayT());
    var act=0.45+0.55*pal.dayness; fish.forEach(function(f){f.step(act);}); stepParts(pal);
  }
}
function render(){ paintScene(pal); if(gl)drawGL(pal); else draw2D(pal); }
function frame(now){
  raf=requestAnimationFrame(frame);
  if(!last){last=now;return;}
  var dt=(now-last)/1000; if(dt<1/FPS-0.002)return;   // FPS cap (30 on phones)
  last=now; acc+=Math.min(dt,0.25);
  var n=Math.floor(acc/STEP); acc-=n*STEP; if(n>0){simulate(n);render();}
}
function start(){ if(running||reduced)return; running=true; last=0; raf=requestAnimationFrame(frame); }
function stop(){ running=false; cancelAnimationFrame(raf); }
atlas.onload=function(){
  resize(); if(!initGL()) ctx2=cv.getContext('2d');
  cv.classList.add('on'); document.documentElement.classList.add('reef-on');
  if(reduced){
    simulate(240); render();                                    // one settled still frame…
    setInterval(function(){pal=palette(dayT());render();},60000); // …that follows the clock, without motion
  } else { simulate(120); render(); start(); }
};
atlas.onerror=function(){ if(window.console)console.warn('reef: atlas failed to load; keeping the plain background'); };
atlas.src=(cv.getAttribute('data-atlas')||'assets/reef/reef-atlas.webp');
addEventListener('resize',function(){resize();if(!running)render();});
document.addEventListener('visibilitychange',function(){ if(document.hidden)stop(); else start(); });
})();
