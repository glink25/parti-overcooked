import * as THREE from 'three';

const UP = new THREE.Vector3(0, 1, 0);

export function conveyorSegment(a, b) {
  const dx=b.x-a.x,dz=b.z-a.z,length=Math.hypot(dx,dz);
  if(length<=1e-6)throw new Error('Conveyor segment must have a positive length');
  if(Math.abs(dx)>1e-6&&Math.abs(dz)>1e-6)throw new Error('Conveyor segment must be horizontal or vertical');
  return {length,centerX:(a.x+b.x)/2,centerZ:(a.z+b.z)/2,angle:Math.atan2(dx,dz),dx:dx/length,dz:dz/length};
}

export function conveyorPathRects(points,width=.8,origin={x:0,z:0}){
  const rects=[],half=width/2;
  for(let index=1;index<points.length;index++){
    const a={x:points[index-1].x+origin.x,z:points[index-1].z+origin.z},b={x:points[index].x+origin.x,z:points[index].z+origin.z};
    conveyorSegment(a,b);
    rects.push({x:Math.min(a.x,b.x)-half,z:Math.min(a.z,b.z)-half,w:Math.abs(b.x-a.x)+width,h:Math.abs(b.z-a.z)+width,kind:'conveyor'});
  }
  return rects;
}

export function conveyorArrowQuaternion(segment, reverse = false) {
  const direction=new THREE.Vector3(segment.dx*(reverse?-1:1),0,segment.dz*(reverse?-1:1));
  return new THREE.Quaternion().setFromUnitVectors(UP,direction);
}
