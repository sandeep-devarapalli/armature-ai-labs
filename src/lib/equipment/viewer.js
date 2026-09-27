import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export function mountEquipment(host, kind, hotspots, onSelect) {
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#e8e9e4');
  const camera = new THREE.PerspectiveCamera(38, 1, .1, 100);
  camera.position.set(5, 4, 6);
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5)); host.append(renderer.domElement);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, kind === 'printer' ? 1.5 : .4, 0); controls.enablePan = false; controls.enableZoom = false;
  renderer.domElement.style.touchAction = 'pan-y'; controls.minDistance = 3; controls.maxDistance = 12;
  scene.add(new THREE.HemisphereLight(0xffffff, 0x707469, 3));
  const light = new THREE.DirectionalLight(0xffffff, 3); light.position.set(4, 7, 4); scene.add(light);
  const materials = {
    dark: new THREE.MeshStandardMaterial({ color: '#292c2d', roughness: .6 }),
    metal: new THREE.MeshStandardMaterial({ color: '#adb3af', roughness: .4, metalness: .5 }),
    accent: new THREE.MeshStandardMaterial({ color: '#77933e', roughness: .5 }),
    glass: new THREE.MeshStandardMaterial({ color: '#869791', transparent: true, opacity: .18, side: THREE.DoubleSide }),
    board: new THREE.MeshStandardMaterial({ color: '#315047', roughness: .6 })
  };
  const box = (size, position, material = 'dark') => { const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), materials[material]); mesh.position.set(...position); scene.add(mesh); return mesh; };
  if (kind === 'printer') {
    box([2.8,.25,2.7],[0,.12,0]); box([2.8,.2,2.7],[0,3.1,0]);
    for (const x of [-1.32,1.32]) { box([.16,3,2.7],[x,1.6,0]); }
    box([2.7,3,.14],[0,1.6,-1.28]); box([2.45,2.65,.05],[0,1.55,1.36],'glass');
    box([2.2,.12,2.15],[0,.7,0],'metal'); box([.7,.45,.6],[0,2.25,.35],'accent');
    box([2.5,.09,.09],[0,2.45,.35],'metal'); box([.6,.48,.12],[-1.05,2.85,1.4],'dark');
    box([.48,.34,.02],[-1.05,2.85,1.48],'accent'); box([.06,.5,.1],[1.05,1.5,1.45],'metal');
  } else {
    box([3,.14,2.1],[0,.15,0],'board'); box([1.65,.25,1.3],[0,.4,0]);
    box([1.65,.5,1.3],[0,.72,0]);
    const fan = new THREE.Mesh(new THREE.CylinderGeometry(.52,.52,.04,24), materials.metal); fan.position.set(0,1,0); scene.add(fan);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(.17,.17,.055,20), materials.dark); hub.position.set(0,1.03,0); scene.add(hub);
    for (const x of [-.3,.35]) { box([.55,.45,.4],[x,.4,1],'metal'); box([.42,.12,.02],[x,.4,1.21]); }
    box([.48,.3,.35],[-1,.32,1],'metal');
    for (const z of [-.65,-.25]) box([.25,.08,.25],[1.25,.3,z],'metal');
    box([1.5,.13,.14],[0,.3,-.95]);
  }
  const pins = hotspots.map((item,index) => {
    const button = document.createElement('button'); button.type='button'; button.className='equipment-pin'; button.textContent=String(index+1); button.setAttribute('aria-label', item.title); button.addEventListener('click',()=>onSelect(index)); host.append(button);
    return { button, position: new THREE.Vector3(...item.position) };
  });
  let frame = 0, disposed = false;
  const projected = new THREE.Vector3();
  function render() { frame=0; if(disposed || document.hidden)return; renderer.render(scene,camera); renderer.domElement.dataset.frames=String(Number(renderer.domElement.dataset.frames||0)+1); pins.forEach(pin=>{projected.copy(pin.position).project(camera);pin.button.style.left=`${(projected.x*.5+.5)*host.clientWidth}px`;pin.button.style.top=`${(-projected.y*.5+.5)*host.clientHeight}px`;}); }
  function request() { if(!frame && !disposed)frame=requestAnimationFrame(render); }
  function resize() { camera.aspect=host.clientWidth/Math.max(host.clientHeight,1);camera.updateProjectionMatrix();renderer.setSize(host.clientWidth,host.clientHeight);request(); }
  const observer=new ResizeObserver(resize);observer.observe(host);controls.addEventListener('change',request); document.addEventListener('visibilitychange',request);controls.update();resize();
  return { zoom(amount) { camera.position.sub(controls.target).multiplyScalar(amount).clampLength(3,12).add(controls.target);controls.update();request(); }, reset() {camera.position.set(5,4,6);controls.update();request();}, dispose() {disposed=true;cancelAnimationFrame(frame);observer.disconnect();document.removeEventListener('visibilitychange',request);controls.dispose();scene.traverse(node=>node.geometry?.dispose());Object.values(materials).forEach(material=>material.dispose());renderer.dispose();renderer.forceContextLoss();renderer.domElement.remove();pins.forEach(pin=>pin.button.remove());} };
}
