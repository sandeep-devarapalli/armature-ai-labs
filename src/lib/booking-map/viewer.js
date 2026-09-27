import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const active = new WeakMap();
function release(root) {
  const geometries = new Set(), materials = new Set(), textures = new Set();
  root.traverse(node => {
    if (node.geometry) geometries.add(node.geometry);
    for (const material of (Array.isArray(node.material) ? node.material : [node.material])) {
      if (!material) continue;
      materials.add(material);
      for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
    }
  });
  textures.forEach(texture => { texture.source?.data?.close?.(); texture.dispose(); });
  materials.forEach(material => material.dispose());
  geometries.forEach(geometry => geometry.dispose());
}
export async function mountViewer(host, { kind = 'printer', onPin = () => {}, onSeat = () => {}, selectedSeat = null, onCabin = () => {}, selectedCabin = null, bookingType = 'desk', unavailableCodes = [], availabilityMode = false } = {}) {
  active.get(host)?.dispose();
  host.style.position='relative';
  const container=document.createElement('div');
  container.style.cssText='position:absolute;inset:0;overflow:hidden;';
  host.append(container);
  const notice=document.createElement('div');
  notice.style.cssText='position:absolute;left:16px;bottom:16px;right:16px;font:11px/1.5 monospace;color:#536059;pointer-events:none;';
  notice.textContent='Loading 3D study…';container.append(notice);
  let renderer, controls, scene, observer, frame=0, disposed=false, fitDistance=0, radius=1;
  const seatMode=kind==='ground-seats'||kind==='first-seats';
  const cabinPins=[];
  const seats=[], blockedSeats=new Set(unavailableCodes);
  let fullCenter=null, fullExtent=1, seatingBounds=null;
  const replacedMaterials=new Set();
  const pins=[], abort=new AbortController(), projected=new THREE.Vector3();
  const api={dispose,selectSeat,selectCabin,focusSeats,setUnavailable,reset:()=>{ if(!controls||!fitDistance)return;if(seatMode){camera.zoom=1;camera.up.set(0,0,-1);controls.target.copy(fullCenter);camera.position.copy(fullCenter).add(new THREE.Vector3(0,fullExtent*3,.0001));camera.updateProjectionMatrix();}else camera.position.copy(controls.target).add(new THREE.Vector3(1.1,.9,1.4).normalize().multiplyScalar(fitDistance));controls.update();requestRender(); }};
  function setUnavailable(codes){blockedSeats.clear();codes.forEach(code=>blockedSeats.add(code));seats.forEach(seat=>{seat.blocked=blockedSeats.has(seat.id);seat.button.disabled=seat.blocked;seat.button.setAttribute('aria-label',`${seat.id} chair ${availabilityMode?(seat.blocked?'unavailable':'available'):(seat.blocked?'not selected for this view':'explore')}`);});cabinPins.forEach(pin=>{pin.button.disabled=blockedSeats.has(pin.id);pin.button.setAttribute('aria-label',pin.button.getAttribute('aria-label').replace(/ unavailable$/, '')+(pin.button.disabled?' unavailable':''));});if(blockedSeats.has(selectedSeat))selectedSeat=null;if(blockedSeats.has(selectedCabin))selectedCabin=null;selectSeat(selectedSeat);selectCabin(selectedCabin);}
  function selectCabin(id){if(blockedSeats.has(id))return;selectedCabin=id;cabinPins.forEach(pin=>{const chosen=pin.id===id;pin.button.setAttribute('aria-pressed',String(chosen));pin.button.style.background=chosen?'#165b3e':blockedSeats.has(pin.id)?'#676b66':'#f5f9f1';pin.button.style.color=chosen||blockedSeats.has(pin.id)?'white':'#244b38';});requestRender();}
  function selectSeat(id){if(blockedSeats.has(id))return;selectedSeat=id;seats.forEach(seat=>{const chosen=seat.id===id;seat.button.setAttribute('aria-pressed',String(chosen));seat.button.querySelectorAll('[data-chair-part]').forEach(part=>part.style.background=chosen?'#165b3e':seat.blocked?'#676b66':'#f5f9f1');seat.button.style.color=chosen||seat.blocked?'white':'#244b38';seat.materials.forEach(material=>{material.color.set(chosen?'#20aa65':seat.blocked?'#8c8e87':'#b9c9a8');if(material.emissive)material.emissive.set(chosen?'#084b20':'#000000');});});requestRender();}
  function focusSeats(){if(!seatingBounds||!controls)return;const c=seatingBounds.getCenter(new THREE.Vector3()),size=seatingBounds.getSize(new THREE.Vector3());controls.target.copy(c);camera.position.copy(c).add(new THREE.Vector3(0,fullExtent*3,.0001));camera.zoom=Math.min(8,Math.max(1,Math.min((camera.right-camera.left)/Math.max(size.x,.1),(camera.top-camera.bottom)/Math.max(size.z,.1))*.82));camera.updateProjectionMatrix();controls.update();requestRender();}
  active.set(host,api);
  function dispose() {
    if(disposed)return;disposed=true;cancelAnimationFrame(frame);abort.abort();observer?.disconnect();
    controls?.dispose();if(scene)release(scene);replacedMaterials.forEach(material=>material.dispose());renderer?.dispose();renderer?.forceContextLoss();container.remove();
    if(active.get(host)===api)active.delete(host);
  }
  function requestRender() { if(!disposed&&!frame)frame=requestAnimationFrame(render); }
  function render() {
    frame=0;if(disposed||document.hidden||!renderer)return;
    renderer.render(scene,camera);
    renderer.domElement.dataset.frames=String(Number(renderer.domElement.dataset.frames||0)+1);
    renderer.domElement.dataset.drawCalls=String(renderer.info.render.calls);
    renderer.domElement.dataset.triangles=String(renderer.info.render.triangles);
    pins.forEach(pin=>{
      projected.copy(pin.position).project(camera);
      pin.button.hidden=projected.z>1||projected.z< -1||Math.abs(projected.x)>1||Math.abs(projected.y)>1;
      if(pin.seat){const small=camera.zoom<1.5;pin.button.style.width=pin.button.style.height=small?'21px':'30px';pin.button.style.fontSize=small?'9px':'11px';}
      pin.button.style.left=`${(projected.x*.5+.5)*container.clientWidth}px`;
      pin.button.style.top=`${(-projected.y*.5+.5)*container.clientHeight}px`;
    });
  }
  const camera=seatMode?new THREE.OrthographicCamera(-10,10,10,-10,.01,1000):new THREE.PerspectiveCamera(38,1,.01,1000);

  try {
    renderer=new THREE.WebGLRenderer({antialias:true,alpha:false});
    renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.5));
    renderer.setClearColor('#e8ebe3');renderer.outputColorSpace=THREE.SRGBColorSpace;
    renderer.domElement.style.cssText='display:block;width:100%;height:100%;';
    renderer.domElement.setAttribute('aria-label',`${kind} interactive 3D illustration`);
    renderer.domElement.dataset.frames='0';container.prepend(renderer.domElement);
    scene=new THREE.Scene();scene.add(new THREE.HemisphereLight(0xffffff,0x738076,2.8));
    const light=new THREE.DirectionalLight(0xffffff,3);light.position.set(6,10,8);scene.add(light);
    controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=false;controls.enableZoom=false;controls.enablePan=false;
    controls.maxPolarAngle=Math.PI*.48;
    if(seatMode){camera.up.set(0,0,-1);controls.enableRotate=false;controls.enablePan=true;controls.mouseButtons.LEFT=THREE.MOUSE.PAN;controls.maxPolarAngle=.00001;}
    // One-finger vertical gestures scroll the page; touchscreen orbit is deliberately disabled.
    controls.touches.ONE=null;controls.touches.TWO=null;renderer.domElement.style.touchAction='pan-y';
    controls.addEventListener('change',requestRender);
    document.addEventListener('visibilitychange',requestRender,{signal:abort.signal});
    renderer.domElement.addEventListener('webglcontextlost',event=>{event.preventDefault();notice.textContent='3D view interrupted. Use the equipment details or floor list; reload to retry.';},{signal:abort.signal});
    let root, definitions=[];
    const building=seatMode||kind==='ground-floor'||kind==='first-floor';
    const floorKind=kind==='ground-seats'?'ground-floor':kind==='first-seats'?'first-floor':kind;
    if(building) {
      const modelDirectory=floorKind==='ground-floor'?'/building-models/r03/':'/building-models/r06/';
      api.sourceModel=`${modelDirectory}${floorKind}.glb`;renderer.domElement.dataset.sourceModel=api.sourceModel;
      const response=await fetch(`${modelDirectory}${floorKind}.glb`,{signal:abort.signal});
      if(!response.ok)throw new Error(`Model HTTP ${response.status}`);
      const bytes=await response.arrayBuffer();
      if(disposed)return api;
      const result=await new GLTFLoader().parseAsync(bytes,modelDirectory);
      if(disposed){release(result.scene);return api;}root=result.scene;
      notice.textContent=seatMode?(kind==='ground-seats'?'25 chairs · proposed layout · final positions to be confirmed':'First-floor cabin layout · final arrangement under review'):'Existing building model · working prototype · final equipment positions to be confirmed';
    } else {
      throw new Error('Only building floors are supported.');
      notice.textContent='Illustrative model · feature markers are not electrical pinouts';
    }
    let cabinStudy=null;
    if(building){const {reconcileCabins}=await import('./cabin-layout.js');if(disposed){release(root);return api;}cabinStudy=reconcileCabins(root,floorKind,THREE);api.cabinSources=cabinStudy.cabins.map(({chairs,...cabin})=>({...cabin,chairs:chairs.map(({center,bounds})=>({center,bounds}))}));renderer.domElement.dataset.cabinCounts=JSON.stringify(Object.fromEntries(cabinStudy.cabins.map(cabin=>[cabin.id,cabin.chairs.length])));}
    if(floorKind==='ground-floor'){const keep=new Set(['C1','C4','C7','C9','C12','C15','C17',...Array.from({length:9},(_,i)=>[`T${i+1}L`,`T${i+1}R`]).flat()]);root.traverse(node=>{const key=node.name.match(/GF10.*PROPOSED_(C\d+|T\d+[LRE])_chair_placeholder/i)?.[1];if(key&&!keep.has(key))node.visible=false;});}
    scene.add(root);root.updateMatrixWorld(true);
    if(floorKind==='ground-floor'){let count=0;root.traverse(node=>{if(/GF10.*PROPOSED_.*chair_placeholder/i.test(node.name)&&node.isMesh&&node.visible)count++;});renderer.domElement.dataset.sharedChairs=String(count);}
    const bounds=new THREE.Box3().setFromObject(root),center=bounds.getCenter(new THREE.Vector3());
    const size=bounds.getSize(new THREE.Vector3()),extent=Math.max(size.x,size.y,size.z);
    camera.near=Math.max(.01,extent/1000);camera.far=extent*100;
    radius=Math.max(.1,size.length()/2);
    camera.position.copy(center).add(new THREE.Vector3(1.1,.9,1.4).normalize().multiplyScalar(extent*2.2));
    fullCenter=center.clone();fullExtent=extent;
    if(seatMode)camera.position.copy(center).add(new THREE.Vector3(0,extent*3,.0001));
    controls.target.copy(center);controls.update();controls.saveState();
    if(kind==='ground-seats'&&bookingType!=='cabin'){
      const chairs=[];root.traverse(node=>{if(/GF10.*PROPOSED_.*chair_placeholder/i.test(node.name)&&node.isMesh&&node.visible)chairs.push(node);});
      const order=name=>{const key=name.match(/PROPOSED_(C\d+|T\d+[LRE])/i)?.[1]||'';return key.startsWith('C')?Number(key.slice(1)):100+Number(key.match(/\d+/)[0])*3+({L:0,R:1,E:2}[key.slice(-1)]);};
      chairs.sort((a,b)=>order(a.name)-order(b.name));
      const chosen=chairs.slice(0,25);
      seatingBounds=new THREE.Box3();
      chosen.forEach((node,index)=>{
        const id=`S${String(index+1).padStart(2,'0')}`,blocked=blockedSeats.has(id),box=new THREE.Box3().setFromObject(node),position=box.getCenter(new THREE.Vector3());position.y=box.max.y+.08;seatingBounds.union(box);
        const originals=Array.isArray(node.material)?node.material:[node.material];originals.forEach(material=>replacedMaterials.add(material));const materials=originals.map(material=>material.clone());node.material=Array.isArray(node.material)?materials:materials[0];
        const button=document.createElement('button');button.type='button';button.className='viewer-seat';button.innerHTML='<span data-chair-part style="position:absolute;left:12%;top:0;width:76%;height:18%;border:1px solid #244b38;border-radius:4px 4px 1px 1px"></span><span data-chair-part style="position:absolute;left:8%;top:23%;width:84%;height:60%;border:1px solid #244b38;border-radius:3px;display:grid;place-items:center"></span><span data-chair-part style="position:absolute;left:15%;bottom:0;width:12%;height:15%;border:1px solid #244b38"></span><span data-chair-part style="position:absolute;right:15%;bottom:0;width:12%;height:15%;border:1px solid #244b38"></span>';button.children[1].textContent=String(index+1);button.dataset.seat=id;button.dataset.source=node.name;button.disabled=blocked;button.setAttribute('aria-label',`${id} chair ${availabilityMode?(blocked?'unavailable':'available'):(blocked?'not selected for this view':'explore')}`);button.style.cssText='position:absolute;transform:translate(-50%,-50%);padding:0;background:transparent;border:0;cursor:pointer;font-weight:600;filter:drop-shadow(0 1px 2px #0003);z-index:1;';button.addEventListener('click',()=>{selectSeat(id);onSeat(id);},{signal:abort.signal});container.append(button);pins.push({button,position,seat:true});seats.push({id,blocked,button,materials,source:node.name,position:position.toArray()});
      });
      api.seatSources=seats.map(({id,source,position})=>({id,source,position}));selectSeat(selectedSeat);
    }
    if(seatMode&&bookingType==='cabin'&&cabinStudy){
      cabinStudy.cabins.forEach(cabin=>{const button=document.createElement('button');button.type='button';button.className='viewer-cabin';button.dataset.cabin=cabin.id;button.disabled=blockedSeats.has(cabin.id);button.textContent=`${cabin.id} · 6 seats`;button.setAttribute('aria-label',`${cabin.id} whole six-seat cabin in ${cabin.roomId}${blockedSeats.has(cabin.id)?' unavailable':''}`);button.style.cssText='position:absolute;transform:translate(-50%,-50%);padding:10px 12px;min-height:40px;white-space:nowrap;border:2px solid #244b38;border-radius:6px;cursor:pointer;font:600 12px sans-serif;box-shadow:0 2px 6px #0003;z-index:1;';button.addEventListener('click',()=>{selectCabin(cabin.id);onCabin(cabin.id);},{signal:abort.signal});container.append(button);pins.push({button,position:new THREE.Vector3(...cabin.center)});cabinPins.push({id:cabin.id,button});});selectCabin(selectedCabin);
      notice.textContent='Six-seat cabin layout study · whole-cabin selection · installation and clearance review pending';
    }
    const toolbar=document.createElement('div');toolbar.setAttribute('role','group');toolbar.setAttribute('aria-label','3D view controls');
    toolbar.style.cssText='position:absolute;left:12px;top:12px;display:flex;gap:4px;z-index:2;';
    [['Rotate left','↶',-.3,1],['Rotate right','↷',.3,1],['Zoom in','+',0,.85],['Zoom out','−',0,1.18]].forEach(([label,text,angle,scale])=>{
      const button=document.createElement('button');button.type='button';button.setAttribute('aria-label',label);button.title=label;button.textContent=text;
      button.style.cssText='width:42px;height:42px;background:#f8faf4;border:1px solid #a6b2a5;color:#263e35;border-radius:6px;font:20px sans-serif;cursor:pointer;';
      button.addEventListener('click',()=>{
        if(seatMode){if(angle)camera.up.applyAxisAngle(new THREE.Vector3(0,1,0),angle);camera.zoom=Math.min(8,Math.max(.8,camera.zoom/scale));camera.updateProjectionMatrix();camera.lookAt(controls.target);requestRender();return;}
        const offset=camera.position.clone().sub(controls.target).applyAxisAngle(new THREE.Vector3(0,1,0),angle);
        offset.setLength(Math.min(fitDistance*2.5,Math.max(radius*1.15,offset.length()*scale)));
        camera.position.copy(controls.target).add(offset);controls.update();requestRender();
      },{signal:abort.signal});toolbar.append(button);
    });if(kind==='ground-seats'&&bookingType!=='cabin'){const button=document.createElement('button');button.type='button';button.textContent='Zoom to seating';button.style.cssText='padding:0 10px;border:1px solid #a6b2a5;border-radius:6px;background:#f8faf4;color:#263e35;font:12px sans-serif;cursor:pointer;';button.addEventListener('click',focusSeats,{signal:abort.signal});toolbar.append(button);}container.append(toolbar);
    definitions.forEach(([label,coordinates,detail],index)=>{
      const button=document.createElement('button');button.type='button';button.className='viewer-pin';
      button.style.cssText='position:absolute;transform:translate(-50%,-50%);width:34px;height:34px;border-radius:50%;background:#263e35;color:white;border:2px solid #fff;cursor:pointer;font:600 12px sans-serif;box-shadow:0 2px 8px #0003;';
      button.textContent=String(index+1);button.title=label;button.setAttribute('aria-label',label);
      button.addEventListener('click',()=>onPin({id:index+1,label,detail,kind}),{signal:abort.signal});
      container.append(button);pins.push({button,position:new THREE.Vector3(...coordinates)});
    });
    observer=new ResizeObserver(()=>{
      const width=container.clientWidth,height=container.clientHeight;if(!width||!height)return;
      renderer.setSize(width,height,false);camera.aspect=width/height;
      if(seatMode){const span=fullExtent*1.12;camera.left=-span/2;camera.right=span/2;camera.top=span/2/camera.aspect;camera.bottom=-camera.top;if(camera.aspect>1){camera.top=span/2;camera.bottom=-span/2;camera.left=-span/2*camera.aspect;camera.right=-camera.left;}fitDistance=span;camera.updateProjectionMatrix();requestRender();return;}
      const previousFit=fitDistance;
      const halfFov=Math.min(THREE.MathUtils.degToRad(camera.fov/2),Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov/2))*camera.aspect));
      fitDistance=radius/Math.sin(halfFov)*1.15;
      const offset=camera.position.clone().sub(controls.target);
      offset.setLength(previousFit ? offset.length()*fitDistance/previousFit : fitDistance);
      camera.position.copy(controls.target).add(offset);camera.updateProjectionMatrix();controls.update();requestRender();
    });observer.observe(container);requestRender();
  } catch(error) {
    if(!disposed){notice.textContent='3D view unavailable. Use the chair and cabin list below.';notice.dataset.error=error.message;}
  }
  return api;
}
