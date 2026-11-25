import { CanvasGarageRenderer } from './garage-canvas.js?v=23';
import { partVisible } from './garage-visibility.js?v=23';
import { EXTRA_PARTS } from './garage-parts.js?v=23';
import { PARTS } from './garage-core.js?v=23';
import * as THREE from './vendor/three.module.js';
import { OrbitControls } from './vendor/OrbitControls.js';

// Parametric, illustrative body-class model. No OEM model identity is claimed.
export function createGarageScene(host,{onHover,onSelect,onError}={}) {
  const scene=new THREE.Scene(); scene.background=new THREE.Color('#080e14'); scene.fog=new THREE.Fog('#080e14',14,40);
  const camera=new THREE.PerspectiveCamera(36,1,.05,100); camera.position.set(5.6,3.3,5.6);
  const renderer=new CanvasGarageRenderer();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2)); renderer.outputColorSpace=THREE.SRGBColorSpace; renderer.toneMapping=THREE.ACESFilmicToneMapping; renderer.toneMappingExposure=1.25;
  renderer.domElement.setAttribute('aria-label','Drehbares transparentes Fahrzeugmodell. Bauteile alternativ in der Liste auswählen.'); renderer.domElement.tabIndex=0;
  host.append(renderer.domElement);
  const controls=new OrbitControls(camera,renderer.domElement); controls.target.set(0,.9,0); controls.enableDamping=true; controls.dampingFactor=.075; controls.minDistance=3.8; controls.maxDistance=16; controls.maxPolarAngle=Math.PI*.93; controls.enablePan=true;
  scene.add(new THREE.HemisphereLight('#d7e9f4','#1b292e',2.2));
  const key=new THREE.DirectionalLight('#e1f6ff',3); key.position.set(3,7,4); scene.add(key);
  const rim=new THREE.DirectionalLight('#91b8eb',2); rim.position.set(-5,3,-4); scene.add(rim);
  const ground=new THREE.Group();scene.add(ground);
  const floor=new THREE.Mesh(new THREE.CircleGeometry(16,96),new THREE.MeshStandardMaterial({color:'#101c25',roughness:.75,metalness:.25})); floor.rotation.x=-Math.PI/2; floor.position.y=-.035;ground.add(floor);
  const platform=new THREE.Mesh(new THREE.CylinderGeometry(3.8,3.85,.055,96),new THREE.MeshStandardMaterial({color:'#1b2830',roughness:.72,metalness:.3})); platform.position.y=-.035;ground.add(platform);
  for(const radius of [3.65,3.8]){const ring=new THREE.Mesh(new THREE.TorusGeometry(radius,.006,6,160),new THREE.MeshBasicMaterial({color:radius===3.8?'#69949d':'#334d57',transparent:true,opacity:.65}));ring.rotation.x=-Math.PI/2;ring.position.y=.003;ground.add(ring);}
  const grid=new THREE.GridHelper(24,24,'#263c48','#172933');grid.position.y=-.027;grid.material.transparent=true;grid.material.opacity=.35;ground.add(grid);
  const model=new THREE.Group();scene.add(model);let meshes=[],groups=new Map(),hovered='',selected='',active=false,frame=0,xray=true,rotate=false,visibleGroup='all';
  const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2();let pointerStart;
  function surface(points,rows,cols,id,glass=false) {
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(points,3));const indices=[];
    for(let r=0;r<rows-1;r++)for(let c=0;c<cols-1;c++){const a=r*cols+c;indices.push(a,a+1,a+cols,a+1,a+cols+1,a+cols);}geo.setIndex(indices);geo.computeVertexNormals();
    const mat=new THREE.MeshPhysicalMaterial({color:glass?'#8daebf':'#a8bcc8',metalness:.6,roughness:.27,transparent:true,opacity:glass?.09:.16,side:THREE.DoubleSide,depthWrite:false});
    const mesh=new THREE.Mesh(geo,mat);mesh.userData.partId=id;mesh.userData.glass=glass;meshes.push(mesh);partGroup(id).add(mesh);
    const edges=new THREE.LineSegments(new THREE.EdgesGeometry(geo,32),new THREE.LineBasicMaterial({color:glass?'#8bacb9':'#afc8d2',transparent:true,opacity:glass?.4:.7}));edges.userData.outline=true;partGroup(id).add(edges);
    return mesh;
  }
  function partGroup(id){if(!groups.has(id)){const g=new THREE.Group();g.userData.partId=id;groups.set(id,g);model.add(g);}return groups.get(id);}
  function shape(points,id,glass=false){return surface(points.flat(),2,points.length/2,id,glass);}
  function solid(geometry,id,position,rotation,color='#55707e',opacity=.27){const mesh=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color,metalness:.65,roughness:.3,transparent:true,opacity,depthWrite:false}));mesh.position.set(...position);if(rotation)mesh.rotation.set(...rotation);mesh.userData.partId=id;mesh.userData.baseOpacity=opacity;meshes.push(mesh);partGroup(id).add(mesh);const edge=new THREE.LineSegments(new THREE.EdgesGeometry(geometry,24),new THREE.LineBasicMaterial({color:'#93bac8',transparent:true,opacity:.55}));edge.position.copy(mesh.position);edge.rotation.copy(mesh.rotation);edge.userData.outline=true;partGroup(id).add(edge);return mesh;}
  function patch(id,x0,x1,y0,y1,w0,w1,curve=.04){const points=[],rows=9,cols=15;for(let r=0;r<rows;r++){const t=r/(rows-1),x=x0+(x1-x0)*t,y=y0+(y1-y0)*t,w=w0+(w1-w0)*t;for(let c=0;c<cols;c++){const u=c/(cols-1)*2-1;points.push(x,y+curve*(1-u*u),u*w);}}surface(points,rows,cols,id);}
  function clearModel(){for(const g of groups.values())g.traverse(o=>{o.geometry?.dispose();if(o.material)o.material.dispose();});model.clear();groups.clear();meshes=[];}
  function build(type='sedan'){
    clearModel();hovered='';selected='';
    const suv=type==='suv',van=type==='van',wagon=type==='wagon',hatch=type==='hatchback';const roofY=van?2.12:suv?1.92:1.62;const front=van?1.92:2.32,back=hatch?-1.95:-2.3,width=suv||van?.97:.91;const roofFront=van?1.02:.48,roofBack=van?-1.48:wagon||suv?-1.4:hatch?-.85:-.7;
    const shoulder=van?1.23:suv?1.18:1.02,wheelY=suv?.46:.40,wheelRadius=suv?.43:.37,frontAxle=1.42,rearAxle=hatch?-1.28:-1.43;
    patch('hood',.98,front-.12,shoulder+.05,shoulder-.16,width*.88,width*.84,.06);
    patch('roof',roofBack,roofFront,roofY,roofY-.02,width*.71,width*.7,.08);
    patch('trunk',back+.08,wagon||suv||van?roofBack-.25:-1.38,shoulder-.11,shoulder+.01,width*.86,width*.84,.04);
    // Cabin glass and integrated door surfaces; body widths follow the shoulder line.
    shape([[roofFront,roofY,width*.70],[roofFront,roofY,-width*.70],[1.02,shoulder+.065,width*.86],[1.02,shoulder+.065,-width*.86]],'windshield',true);
    shape([[roofBack,roofY,width*.71],[roofBack,roofY,-width*.71],[wagon||suv||van?back+.14:-1.38,shoulder+.03,width*.86],[wagon||suv||van?back+.14:-1.38,shoulder+.03,-width*.86]],'rear-glass',true);
    for(const [side,sign] of [['l',1],['r',-1]]) {
      const z=sign*width;const divider=-.28;
      for(const [id,a,b]of [[`door-f${side}`,divider,.94],[`door-r${side}`,rearAxle+.23,divider]]){
        const pts=[];for(let r=0;r<6;r++){const y=.46+(shoulder-.46)*r/5;for(let c=0;c<8;c++){const x=a+(b-a)*c/7;pts.push(x,y,z*(.93+.07*Math.sin(r/5*Math.PI)));}}surface(pts,6,8,id);
        const topA=id.includes('door-f')?divider:roofBack+.05,topB=id.includes('door-f')?roofFront-.03:divider;
        shape([[a,shoulder+.035,z*.98],[b,shoulder+.035,z*.98],[topA,roofY-.07,z*.74],[topB,roofY-.07,z*.74]],`side-glass-${id.slice(5)}`,true);
        solid(new THREE.BoxGeometry(.19,.025,.025),id,[a+.18,shoulder-.1,z*1.006],null,'#d0e4ea',.8);
      }
      for(const [axle,x]of [['f',frontAxle],['r',rearAxle]]){
        const id=`fender-${axle}${side}`,radius=wheelRadius+.075,points=[];
        for(let r=0;r<2;r++)for(let c=0;c<25;c++){const angle=Math.PI*c/24;const xx=x+Math.cos(angle)*radius,yy=r===0?wheelY+Math.sin(angle)*radius:shoulder+.015;points.push(xx,Math.max(yy,wheelY),z*(r===0?1.025:1));}surface(points,2,25,id);
        const wheel=`wheel-${axle}${side}`,brake=`brake-${axle}${side}`;
        solid(new THREE.TorusGeometry(wheelRadius-.075,.085,12,48),wheel,[x,wheelY,z*.99],null,'#243440',.84);
        solid(new THREE.CylinderGeometry(wheelRadius-.105,wheelRadius-.105,.15,48),wheel,[x,wheelY,z*1.025],[Math.PI/2,0,0],'#547583',.42);
        solid(new THREE.CylinderGeometry(.19,.19,.025,40),brake,[x,wheelY,z*.91],[Math.PI/2,0,0],'#8eacc0',.45);
        solid(new THREE.BoxGeometry(.075,.18,.065),brake,[x+.16,wheelY,z*.93],null,'#53c3c7',.65);
        for(let spoke=0;spoke<8;spoke++){const angle=spoke/8*Math.PI*2;solid(new THREE.BoxGeometry(.025,.42,.018),wheel,[x,wheelY,z*1.12],[0,0,angle],'#d2e5ec',.8);}
        solid(new THREE.SphereGeometry(.055,12,8),wheel,[x,wheelY,z*1.14],null,'#e3eff4',1);
      }
      solid(new THREE.SphereGeometry(1,16,8),`mirror-${side==='l'?'left':'right'}`,[.81,shoulder+.14,z*1.18],null,'#a6cad4',.3).scale.set(.16,.075,.12);
      // Running boards / sills give continuous width without closing the wheel arches.
      solid(new THREE.BoxGeometry(2.02,.065,.06),`door-r${side}`,[-.1,.40,z*.98],null,'#6b8e9c',.4);
    }
    for(const [id,x,dir]of [['bumper-front',front,1],['bumper-rear',back,-1]]){
      const points=[];for(let r=0;r<6;r++)for(let c=0;c<17;c++){const u=c/8-1;points.push(x-dir*.12*u*u,.32+r/5*(shoulder-.45),u*width*.9);}surface(points,6,17,id);
    }
    for(const [side,sign]of [['l',1],['r',-1]]){
      solid(new THREE.BoxGeometry(.055,.075,.40),`light-f${side}`,[front-.045,shoulder-.12,sign*width*.66],null,'#c1f7ff',.95);
      solid(new THREE.BoxGeometry(.055,.065,.38),`light-r${side}`,[back+.025,shoulder-.09,sign*width*.66],null,'#c47f80',.7);
    }
    for(let i=0;i<12;i++)solid(new THREE.BoxGeometry(.022,.24,.018),'bumper-front',[front+.01,.65,-.40+i*.073],null,'#94aab4',.65);
    solid(new THREE.BoxGeometry(.62,.32,.56),'engine',[1.15,.82,0],null,'#7ca6b6',.27);
    for(let i=0;i<4;i++)solid(new THREE.CylinderGeometry(.09,.09,.38,12),'engine',[.94+i*.14,.96,0],[0,0,.18],'#90c4d0',.4);
    solid(new THREE.CylinderGeometry(.15,.20,.48,16),'transmission',[.59,.58,0],[0,0,Math.PI/2],'#88a5b2',.3);
    solid(new THREE.BoxGeometry(.36,.22,.30),'battery',[1.32,.88,-.57],null,'#7cc6c9',.34);
    solid(new THREE.CylinderGeometry(.035,.035,2.7,10),'exhaust',[-.75,.24,0],[0,0,Math.PI/2],'#7e9aaa',.5);
    solid(new THREE.BoxGeometry(.48,.10,.33),'exhaust',[-1.71,.27,0],null,'#7e9aaa',.3);
    for(const [id,x]of [['suspension-front',frontAxle],['suspension-rear',rearAxle]])solid(new THREE.CylinderGeometry(.045,.045,width*1.9,12),id,[x,wheelY,0],[Math.PI/2,0,0],'#81b8c9',.5);
    for(const spec of EXTRA_PARTS){
      if(groups.has(spec.id))continue;
      let geometry;
      if(spec.shape==='box')geometry=new THREE.BoxGeometry(...spec.size);
      else if(spec.shape==='cylinder')geometry=new THREE.CylinderGeometry(...spec.size,20);
      else if(spec.shape==='torus')geometry=new THREE.TorusGeometry(...spec.size,10,40);
      else if(spec.shape==='tube')geometry=new THREE.TubeGeometry(new THREE.CatmullRomCurve3(spec.points.map(p=>new THREE.Vector3(...p))),24,spec.r,6,false);
      else if(spec.shape==='spring'){
        const points=[];for(let i=0;i<=96;i++){const a=i/96*Math.PI*12;points.push(new THREE.Vector3(Math.cos(a)*spec.size[0],i/96*spec.size[1],Math.sin(a)*spec.size[0]));}
        geometry=new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),96,.009,6,false);
      }
      const position=[...(spec.position||[0,0,0])];if(position[1]>1.2)position[1]+=(roofY-1.62)*.7;
      solid(geometry,spec.id,position,spec.rotation,'#91a8bc',spec.group==='Verglasung'?.07:.25);
    }
    setGroup(visibleGroup);setHighlight();draw();
  }
  function setGroup(value){visibleGroup=value;for(const [id,group]of groups)group.visible=partVisible(PARTS.find(p=>p.id===id),value);hovered='';onHover?.('');setHighlight();draw();}
  function setHighlight(){for(const [id,group]of groups){const hot=id===hovered||id===selected;group.traverse(o=>{if(!o.material)return;if(o.userData.outline){o.material.color.set(hot?'#65afff':'#afc8d2');o.material.opacity=hot?1:(['Karosserie','Verglasung'].includes(PARTS.find(p=>p.id===id)?.group)?.55:.28);}else if(o.isMesh){o.material.color.set(hot?'#2b84ed':o.userData.glass?'#8daebf':'#a8bcc8');o.material.opacity=hot?.62:(o.userData.baseOpacity??(o.userData.glass?.09:xray?.16:.72));if(o.material.emissive)o.material.emissive.set(hot?'#073d7b':'#000000');}});}}
  function hit(event){const rect=renderer.domElement.getBoundingClientRect();pointer.set((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);raycaster.setFromCamera(pointer,camera);const hits=raycaster.intersectObjects(meshes.filter(mesh=>groups.get(mesh.userData.partId)?.visible),false);return hits.find(item=>item.object.visible)?.object.userData.partId||'';}
  renderer.domElement.addEventListener('pointermove',event=>{if(pointerStart&&Math.hypot(event.clientX-pointerStart.x,event.clientY-pointerStart.y)>5)return;const next=hit(event);if(next!==hovered){hovered=next;setHighlight();}onHover?.(next,event);renderer.domElement.style.cursor=next?'pointer':'grab';});
  renderer.domElement.addEventListener('pointerleave',()=>{hovered='';setHighlight();onHover?.('');});
  renderer.domElement.addEventListener('pointerdown',event=>{pointerStart={x:event.clientX,y:event.clientY};});
  renderer.domElement.addEventListener('pointerup',event=>{if(pointerStart&&Math.hypot(event.clientX-pointerStart.x,event.clientY-pointerStart.y)<6){const id=hit(event);if(id)onSelect?.(id);}pointerStart=null;});
  function resize(){const w=host.clientWidth,h=host.clientHeight;if(!w||!h)return;renderer.setSize(w,h,false);camera.aspect=w/h;camera.zoom=Math.min(1,Math.max(.5,camera.aspect/1.3));camera.updateProjectionMatrix();draw();}
  const observer=new ResizeObserver(resize);observer.observe(host);
  function draw(){renderer.render(scene,camera);}
  let lastFrame=0;function animate(time=0){if(!active)return;frame=requestAnimationFrame(animate);if(time-lastFrame<33)return;lastFrame=time;controls.autoRotate=rotate;controls.autoRotateSpeed=.65;controls.update();draw();}
  function preset(view='perspective'){const positions={perspective:[5.6,3.3,5.6],front:[8,1.7,0],rear:[-8,1.7,0],side:[0,1.8,8],top:[0,9,.01]};camera.position.set(...(positions[view]||positions.perspective));controls.target.set(0,.9,0);controls.update();draw();}
  return {build,resize,setGroup,setFloor(value){ground.visible=!!value;draw();},select(id){selected=id;setHighlight();draw();},setActive(value){active=value;cancelAnimationFrame(frame);if(active){resize();animate();}},preset,setXray(value){xray=value;setHighlight();draw();},setRotate(value){rotate=value;},zoom(factor){const delta=camera.position.clone().sub(controls.target).multiplyScalar(factor);if(delta.length()>=controls.minDistance&&delta.length()<=controls.maxDistance)camera.position.copy(controls.target).add(delta);controls.update();draw();},dispose(){active=false;cancelAnimationFrame(frame);observer.disconnect();controls.dispose();clearModel();renderer.dispose();renderer.domElement.remove();}};
}
