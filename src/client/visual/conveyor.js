import * as THREE from 'three';

const UP = new THREE.Vector3(0, 1, 0);

export function conveyorSegment(a, b) {
  const dx=b.x-a.x,dz=b.z-a.z,length=Math.hypot(dx,dz);
  if(length<=1e-6)throw new Error('Conveyor segment must have a positive length');
  if(Math.abs(dx)>1e-6&&Math.abs(dz)>1e-6)throw new Error('Conveyor segment must be horizontal or vertical');
  return {length,centerX:(a.x+b.x)/2,centerZ:(a.z+b.z)/2,angle:Math.atan2(dx,dz),dx:dx/length,dz:dz/length};
}

export function conveyorPathMetrics(points) {
  if (!Array.isArray(points) || points.length < 2) throw new Error('Conveyor path must contain at least two points');
  const segments = [];
  let total = 0;
  for (let index = 1; index < points.length; index++) {
    const a = points[index - 1];
    const b = points[index];
    const segment = conveyorSegment(a, b);
    segments.push({ ...segment, a, b, start: total, end: total + segment.length, index: index - 1 });
    total += segment.length;
  }
  return { segments, total };
}

export function conveyorPointAtDistance(points, distance, { loop = false, metrics = null } = {}) {
  const pathMetrics = metrics || conveyorPathMetrics(points);
  const finiteDistance = Number.isFinite(distance) ? distance : 0;
  const sampledDistance = loop
    ? ((finiteDistance % pathMetrics.total) + pathMetrics.total) % pathMetrics.total
    : Math.max(0, Math.min(pathMetrics.total, finiteDistance));
  const segment = pathMetrics.segments.find((entry) => sampledDistance <= entry.end + 1e-9) || pathMetrics.segments.at(-1);
  const travelled = Math.max(0, Math.min(segment.length, sampledDistance - segment.start));
  return {
    x: segment.a.x + segment.dx * travelled,
    z: segment.a.z + segment.dz * travelled,
    dx: segment.dx,
    dz: segment.dz,
    distance: sampledDistance,
    segmentIndex: segment.index,
  };
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
