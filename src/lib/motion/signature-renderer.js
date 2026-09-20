import {AsciiRenderer} from './renderer.js';

const FRAGMENT = `
precision mediump float;
varying vec2 uv;
uniform sampler2D source;
uniform vec2 grid, size, cropMin, cropMax, sourceSize;
uniform float now, mediaTime, styleMode, paletteMode;
uniform int glowCount, contactCount;
uniform vec4 stamps[8], contacts[4];
float luma(vec3 c){return dot(c,vec3(.299,.587,.114));}
vec3 sampleAt(vec2 p){return texture2D(source,mix(cropMin,cropMax,clamp(p,0.,1.))).rgb;}
vec2 gradient(vec2 p,vec2 d){
 return vec2(luma(sampleAt(p+vec2(d.x,0.)))-luma(sampleAt(p-vec2(d.x,0.))),
             luma(sampleAt(p+vec2(0.,d.y)))-luma(sampleAt(p-vec2(0.,d.y))));
}
void main(){
 vec2 cell=floor(uv*grid), local=fract(uv*grid)-.5, centre=(cell+.5)/grid;
 vec3 color=sampleAt(centre);
 float light=luma(color);
 vec2 grad=gradient(centre,1./grid);
 float structure=clamp(length(grad)*4.,0.,1.);
 float contour=smoothstep(.025,.22,length(gradient(uv,1.5/sourceSize)));
 float aspect=size.x/size.y;
 float lens=0., pointerWave=0.;
 vec2 displacement=vec2(0.);
 for(int i=0;i<8;i++){
  if(i<glowCount){
   float age=now-stamps[i].z, fade=pow(max(0.,1.-age),2.);
   vec2 delta=(centre-stamps[i].xy)*vec2(aspect,1.);
   float distance=length(delta);
   lens=max(lens,(1.-smoothstep(.06,.25,distance))*fade);
   float ring=exp(-pow((distance-age*.22)/.035,2.))*fade;
   pointerWave=max(pointerWave,ring);
   displacement+=normalize(delta+vec2(.0001))*ring*.012;
  }
 }
 float contactWave=0.;
 for(int i=0;i<4;i++){
  if(i<contactCount){
   float age=mediaTime-contacts[i].z;
   if(age>=0.&&age<contacts[i].w){
    vec2 origin=(contacts[i].xy-cropMin)/(cropMax-cropMin);
    vec2 delta=(centre-origin)*vec2(aspect,1.);
    float distance=length(delta), fade=pow(1.-age/contacts[i].w,1.5);
    float ring=exp(-pow((distance-age*.16)/.028,2.))*fade;
    contactWave=max(contactWave,ring);
    displacement+=normalize(delta+vec2(.0001))*ring*.018;
   }
  }
 }
 vec3 paper=vec3(.79,.82,.81), accent=vec3(.73,.52,.33);
 vec3 sourceInk=clamp(mix(vec3(light),color,.58)*1.65+.12,0.,1.);
 vec3 ink=mix(paper,sourceInk,paletteMode);
 vec3 background=vec3(.025,.031,.033);
 float registration=(1.-smoothstep(.015,.04,abs(local.x)))*(1.-smoothstep(.10,.14,abs(local.y)));
 float dots=1.-smoothstep(.06,.14,length(local));
 float intensity=0., highlight=0.;
 if(styleMode<.5){
  float slope=grad.x*grad.y>0.?1.:-1.;
  float hatch=1.-smoothstep(.035,.10,abs(local.y+local.x*slope));
  float sparse=step(.72,fract(sin(dot(cell,vec2(12.9898,78.233)))*4375.5453));
  float detail=structure*(.15+.85*lens)+lens*.25;
  intensity=contour*.78+hatch*detail*.38+dots*(.04+light*.16)+registration*sparse*.06;
  highlight=lens*contour*.35;
 }else{
  vec2 moved=local+clamp(displacement*grid*.35,vec2(-.18),vec2(.18));
  float wave=max(contactWave,pointerWave);
  float radius=.09+.22*sqrt(light)+wave*.05;
  float field=1.-smoothstep(radius-.035,radius+.035,length(moved));
  float stitch=(1.-smoothstep(.022,.055,abs(moved.y)))*(1.-smoothstep(.2,.4,abs(moved.x)));
  intensity=field*(.16+.70*light)+stitch*structure*.18+contour*.17;
  highlight=wave*(.10+.70*structure+.20*light);
  intensity+=highlight*.20;
 }
 vec3 result=background+ink*clamp(intensity,0.,.93);
 result+=mix(accent,sourceInk,paletteMode)*highlight*.42;
 gl_FragColor=vec4(clamp(result,0.,1.),1.);
}`;

export class SignatureRenderer extends AsciiRenderer {
  constructor(options){
    super({...options,settings:{...options.settings,fragmentShader:FRAGMENT}});
    this.contactData=new Float32Array(16);
    if(!this.gl||this.failed)return;
    for(const name of ['sourceSize','mediaTime','styleMode','paletteMode','contactCount','contacts'])
      this.uniforms[name]=this.gl.getUniformLocation(this.program,name==='contacts'?'contacts[0]':name);
    for(const [i,event] of (this.settings.contactEvents||[]).slice(0,4).entries())
      this.contactData.set([event.x,1-event.y,event.time,event.duration||3.2],i*4);
  }

  draw(time){
    if(!this.gl||this.failed||this.destroyed)return;
    const gl=this.gl,u=this.uniforms;
    gl.uniform2f(u.sourceSize,this.video.videoWidth||720,this.video.videoHeight||406);
    gl.uniform1f(u.mediaTime,this.video.currentTime);
    gl.uniform1f(u.styleMode,this.settings.styleMode||0);
    gl.uniform1f(u.paletteMode,this.settings.paletteMode||0);
    gl.uniform1i(u.contactCount,Math.min(4,(this.settings.contactEvents||[]).length));
    gl.uniform4fv(u.contacts,this.contactData);
    super.draw(time);
  }
}
