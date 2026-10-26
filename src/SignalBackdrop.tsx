import {useEffect,useRef} from 'react';

/** Noisy tributaries become a shared signal, drawn on a bounded canvas. The phone app also draws it in light mode (tone="light"). */
export default function SignalBackdrop({active,paused,tone='dark'}:{active:boolean;paused:boolean;tone?:'light'|'dark'}){
 const canvasRef=useRef<HTMLCanvasElement>(null),timeRef=useRef(0);
 useEffect(()=>{
  if(!active)return;
  const canvas=canvasRef.current,context=canvas?.getContext('2d',{alpha:true});
  if(!canvas||!context)return; // Keep the static gradient if canvas is unavailable.
  const motion=window.matchMedia('(prefers-reduced-motion: reduce)'),forced=window.matchMedia('(forced-colors: active)');
  let frame=0,last=0,disposed=false;
  const light=tone==='light',colors=light?['86,114,247','164,72,218','237,65,157']:['100,128,235','157,95,216','106,150,216'];
  const field=(u:number,lane:number,t:number)=>{
   const spread=(1-u)*(1-u);
   const wave=Math.sin(u*6.2-t*.075)*.13+Math.sin(u*11+t*.045)*.035;
   const detail=(Math.sin(u*19+lane*.7+t*.07)*.028+Math.sin(u*39-lane+t*.035)*.012)*spread;
   return .49+wave+lane*.012*(.20+spread*2.7)+detail;
  };
  function paint(){
   if(!canvas||!context||forced.matches)return;
   const w=canvas.width,h=canvas.height,t=timeRef.current;
   context.clearRect(0,0,w,h);context.globalCompositeOperation='source-over';
   // Soft light without an animated blur filter.
   for(const [x,y,r,color,opacity] of (light?[
    [.20+Math.sin(t*.025)*.04,.22,.67,'160,184,255',.42],
    [.78,.68+Math.sin(t*.03)*.04,.61,'226,196,250',.42],
    [.84,.15,.44,'250,200,226',.30],
   ]:[
    [.20+Math.sin(t*.025)*.04,.22,.67,'111,54,175',.38],
    [.78,.68+Math.sin(t*.03)*.04,.61,'36,85,172',.32],
    [.84,.15,.44,'140,54,147',.12],
   ]) as readonly (readonly [number,number,number,string,number])[]){
    const gradient=context.createRadialGradient(x*w,y*h,0,x*w,y*h,r*Math.max(w,h));
    gradient.addColorStop(0,`rgba(${color},${opacity})`);gradient.addColorStop(1,`rgba(${color},0)`);
    context.fillStyle=gradient;context.fillRect(0,0,w,h);
   }
   context.globalCompositeOperation=light?'source-over':'screen';
   // Layered harmonics create branching contours, not equation text.
   for(let lane=-12;lane<=12;lane++){
    context.beginPath();
    for(let step=0;step<=72;step++){
     const u=step/72,x=(u*1.10-.05)*w,y=field(u,lane,t)*h;
     if(step===0)context.moveTo(x,y);else context.lineTo(x,y);
    }
    const color=colors[(lane+12)%colors.length];
    context.strokeStyle=`rgba(${color},${light?.03:.018})`;context.lineWidth=5;context.stroke();
    context.strokeStyle=`rgba(${color},${light?.16:.10})`;context.lineWidth=.65;context.stroke();
   }
   // Sparse pulses travel along the field: information shared between sources.
   for(let i=0;i<26;i++){
    const u=(i*.381966+t*.0035)%1,lane=(i%13-6)*1.5,x=(u*1.10-.05)*w,y=field(u,lane,t)*h;
    const glow=context.createRadialGradient(x,y,0,x,y,5);
    const spark=light?'140,110,240':'182,183,250';glow.addColorStop(0,`rgba(${spark},${Math.sin(Math.PI*u)*(light?.32:.17)})`);glow.addColorStop(1,`rgba(${spark},0)`);
    context.fillStyle=glow;context.fillRect(x-5,y-5,10,10);
   }
   context.globalCompositeOperation='source-over';
  }
  const shouldRun=()=>!disposed&&!paused&&!motion.matches&&!forced.matches&&!document.hidden;
  function tick(now:number){
   frame=0;if(!shouldRun())return;
   if(!last)last=now;
   if(now-last>=1000/20){timeRef.current+=Math.min(now-last,100)/1000;last=now;paint();}
   frame=requestAnimationFrame(tick);
  }
  function synchronize(){
   cancelAnimationFrame(frame);frame=0;last=0;
   if(document.hidden||forced.matches)return;
   paint();if(shouldRun())frame=requestAnimationFrame(tick);
  }
  function resize(){
   // No Retina scaling; the decorative buffer never exceeds 960 x 540.
   const scale=Math.min(.5,960/window.innerWidth,540/window.innerHeight);
   canvas!.width=Math.max(1,Math.round(window.innerWidth*scale));canvas!.height=Math.max(1,Math.round(window.innerHeight*scale));
   synchronize();
  }
  resize();window.addEventListener('resize',resize);document.addEventListener('visibilitychange',synchronize);
  motion.addEventListener('change',synchronize);forced.addEventListener('change',synchronize);
  return()=>{
   disposed=true;cancelAnimationFrame(frame);window.removeEventListener('resize',resize);document.removeEventListener('visibilitychange',synchronize);
   motion.removeEventListener('change',synchronize);forced.removeEventListener('change',synchronize);
  };
 },[active,paused,tone]);
 return <div className="ambient-backdrop" aria-hidden="true"><canvas className="ambient-canvas" ref={canvasRef}/></div>;
}
