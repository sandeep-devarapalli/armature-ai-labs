import {AsciiRenderer} from './renderer.js';
import {pixelBands} from './pixel-bands.js';

// Ordered-dither "pixel field": two tones plus an accent for the brightest
// highlights, with blocks that coarsen in bands toward one edge.
// levels = [black point, white point, gamma, accent threshold] on source luma.
// detail = [sharpen amount, tone count (2 or 3)]; a third, mid tone keeps footage legible.
const FRAGMENT = `
precision mediump float;
varying vec2 uv;
uniform sampler2D source;
uniform vec2 size, cropMin, cropMax;
uniform vec3 lo, mid, hi, accent;
uniform vec4 tone;
uniform vec2 detail;
uniform vec4 blocksA, blocksB, edgesA;
uniform vec3 edgesB;
uniform float direction;
float luma(vec3 c){return dot(c,vec3(.299,.587,.114));}
float bayer2(vec2 a){a=floor(a);return fract(a.x/2.+a.y*a.y*.75);}
float bayer4(vec2 a){return bayer2(.5*a)*.25+bayer2(a);}
float bayer8(vec2 a){return bayer4(.5*a)*.25+bayer2(a);}
float sampleL(vec2 p){return luma(texture2D(source,mix(cropMin,cropMax,clamp(p,0.,1.))).rgb);}
void main(){
 float x=direction>.5?size.x-gl_FragCoord.x:gl_FragCoord.x;
 float block=blocksA.x;
 if(x>=edgesA.x)block=blocksA.y;
 if(x>=edgesA.y)block=blocksA.z;
 if(x>=edgesA.z)block=blocksA.w;
 if(x>=edgesA.w)block=blocksB.x;
 if(x>=edgesB.x)block=blocksB.y;
 if(x>=edgesB.y)block=blocksB.z;
 if(x>=edgesB.z)block=blocksB.w;
 vec2 cell=floor(vec2(x,gl_FragCoord.y)/block);
 vec2 local=(cell+.5)*block;
 if(direction>.5)local.x=size.x-local.x;
 vec2 centre=local/size;
 vec2 off=vec2(block)/size;
 float raw=sampleL(centre);
 float around=.25*(sampleL(centre+vec2(off.x,0.))+sampleL(centre-vec2(off.x,0.))+sampleL(centre+vec2(0.,off.y))+sampleL(centre-vec2(0.,off.y)));
 float sharp=clamp(raw+detail.x*(raw-around),0.,1.);
 float level=pow(clamp((sharp-tone.x)/max(.01,tone.y-tone.x),0.,1.),tone.z);
 float t=bayer8(cell);
 vec3 color=level>t?hi:lo;
 if(detail.y>2.5){
  float v=level*2.,f=floor(v),idx=min(2.,f+(v-f>t?1.:0.));
  color=idx<.5?lo:idx<1.5?mid:hi;
 }
 if(raw>tone.w)color=accent;
 gl_FragColor=vec4(color,1.);
}`;

const FALLBACK = { lo: [17, 17, 16], hi: [237, 230, 214], accent: [224, 112, 58] };

export class PixelRenderer extends AsciiRenderer {
  constructor(options){
    super({...options,settings:{...options.settings,fragmentShader:FRAGMENT}});
    this.colors={...FALLBACK,...(options.settings.colors||{})};
    if(!this.gl||this.failed)return;
    for(const name of ['lo','mid','hi','accent','tone','detail','blocksA','blocksB','edgesA','edgesB','direction'])
      this.uniforms[name]=this.gl.getUniformLocation(this.program,name);
  }

  setColors(colors){
    this.colors={...this.colors,...colors};
    this.requestDraw();
  }

  draw(time){
    if(!this.gl||this.failed||this.destroyed)return;
    const gl=this.gl,u=this.uniforms,s=this.settings;
    if(!u.lo)return super.draw(time);
    const cssWidth=this.canvas.clientWidth||this.canvas.width;
    const {blocks,edges}=pixelBands(this.canvas.width,Math.max(1,(this.canvas.width/cssWidth)*(s.pixelSize||3)),s.scales);
    gl.uniform4f(u.blocksA,blocks[0],blocks[1],blocks[2],blocks[3]);
    gl.uniform4f(u.blocksB,blocks[4],blocks[5],blocks[6],blocks[7]);
    gl.uniform4f(u.edgesA,edges[0],edges[1],edges[2],edges[3]);
    gl.uniform3f(u.edgesB,edges[4],edges[5],edges[6]);
    gl.uniform1f(u.direction,s.coarsen==='left'?1:0);
    const [black,white,gamma,highlight]=s.levels||[.04,.9,1,.93];
    gl.uniform4f(u.tone,black,white,gamma,highlight);
    gl.uniform2f(u.detail,s.sharpen??0,s.tones??2);
    const c=this.colors||FALLBACK;
    const mid=c.lo.map((v,i)=>v+(c.hi[i]-v)*.42);
    for(const [name,[r,g,b]] of [['lo',c.lo],['mid',mid],['hi',c.hi],['accent',c.accent]])
      gl.uniform3f(u[name],r/255,g/255,b/255);
    super.draw(time);
  }
}
