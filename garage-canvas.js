import { Matrix4, Vector3 } from './vendor/three.module.js';

// CPU projection of the existing 3D geometry onto a 2D canvas. No GPU context.
export class CanvasGarageRenderer {
  constructor(){this.domElement=document.createElement('canvas');this.domElement.dataset.renderer='canvas2d';this.ctx=this.domElement.getContext('2d',{alpha:false});if(!this.ctx)throw Error('Canvas konnte nicht gestartet werden.');this.ratio=1;this.width=1;this.height=1;this.cache=new WeakMap();}
  setPixelRatio(value){this.ratio=Math.min(value,1.5);}
  setSize(w,h){this.width=w;this.height=h;this.domElement.width=Math.round(w*this.ratio);this.domElement.height=Math.round(h*this.ratio);this.domElement.style.width=w+'px';this.domElement.style.height=h+'px';}
  render(scene,camera){
    scene.updateMatrixWorld(true);camera.updateMatrixWorld(true);
    const ctx=this.ctx,w=this.width,h=this.height;ctx.setTransform(this.ratio,0,0,this.ratio,0,0);ctx.globalAlpha=1;ctx.fillStyle='#080e14';ctx.fillRect(0,0,w,h);
    const projection=new Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse),matrix=new Matrix4(),v=new Vector3(),lines=[],faces=[];
    scene.traverseVisible(object=>{
      if(!object.geometry||!object.material)return;const material=Array.isArray(object.material)?object.material[0]:object.material;if(!material.visible)return;
      const position=object.geometry.attributes.position;if(!position)return;
      const isLine=object.isLineSegments,part=object.userData.partId;
      // Contours preserve the transparent technical view; selected parts gain a fill.
      if(!isLine&&part&&material.opacity<.5)return;
      matrix.multiplyMatrices(projection,object.matrixWorld);
      let coords=this.cache.get(object);if(!coords||coords.length!==position.count*3){coords=new Float32Array(position.count*3);this.cache.set(object,coords);}
      for(let i=0;i<position.count;i++){v.fromBufferAttribute(position,i).applyMatrix4(matrix);coords[i*3]=(v.x+1)*w/2;coords[i*3+1]=(1-v.y)*h/2;coords[i*3+2]=v.z;}
      if(isLine){lines.push({coords,material,outline:object.userData.outline});return;}
      const index=object.geometry.index, count=index?index.count:position.count;
      const color='#'+material.color.getHexString();
      for(let i=0;i<count;i+=3){const a=(index?index.getX(i):i)*3,b=(index?index.getX(i+1):i+1)*3,c=(index?index.getX(i+2):i+2)*3;if([a,b,c].some(j=>coords[j+2]<-1||coords[j+2]>1))continue;faces.push({p:[coords[a],coords[a+1],coords[b],coords[b+1],coords[c],coords[c+1]],z:(coords[a+2]+coords[b+2]+coords[c+2])/3,color,alpha:part?.12:material.opacity});}
    });
    faces.sort((a,b)=>b.z-a.z);for(const face of faces){ctx.globalAlpha=face.alpha;ctx.fillStyle=face.color;ctx.beginPath();ctx.moveTo(face.p[0],face.p[1]);ctx.lineTo(face.p[2],face.p[3]);ctx.lineTo(face.p[4],face.p[5]);ctx.closePath();ctx.fill();}
    for(const {coords:c,material,outline}of lines){ctx.strokeStyle=outline?'#'+material.color.getHexString():'#263c48';ctx.globalAlpha=material.opacity;ctx.lineWidth=outline?1:.7;ctx.beginPath();for(let i=0;i<c.length;i+=6){if(c[i+2]<-1||c[i+2]>1||c[i+5]<-1||c[i+5]>1)continue;ctx.moveTo(c[i],c[i+1]);ctx.lineTo(c[i+3],c[i+4]);}ctx.stroke();}ctx.globalAlpha=1;
  }
  dispose(){this.cache=new WeakMap();}
}
