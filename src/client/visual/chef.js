import * as THREE from 'three';

export function makeChefModel(colorHex, primitives) {
  const { box, cyl, sph, mat } = primitives;
  const g = new THREE.Group();
  const visualRig = new THREE.Group();
  g.add(visualRig);
  const color = new THREE.Color(colorHex).getHex();
  const skin = 0xffd2a1;

  const body = cyl(0.25, 0.34, 0.58, color, 10); body.position.y = 0.56;
  const apron = box(0.38, 0.42, 0.055, 0xfff8e7); apron.position.set(0, 0.52, 0.29);
  const neckerchief = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.16, 6), mat(0xffd34e));
  neckerchief.rotation.x = Math.PI / 2; neckerchief.position.set(0, 0.76, 0.29);
  const head = sph(0.22, skin, 12, 8); head.position.y = 1.02;
  const hair = sph(0.205, 0x593b2c, 9, 6); hair.scale.set(1.02, 0.52, 1.02); hair.position.set(0, 1.13, -0.025);
  const hatBrim = cyl(0.245, 0.245, 0.07, 0xfffdf3, 12); hatBrim.position.y = 1.19;
  const hatTop = cyl(0.16, 0.205, 0.23, 0xfffdf3, 10); hatTop.position.y = 1.33;
  const hatPuffL = sph(0.105, 0xfffdf3, 8, 6); hatPuffL.position.set(-0.09, 1.46, 0);
  const hatPuffR = hatPuffL.clone(); hatPuffR.position.x = 0.09;
  const eyeL = sph(0.026, 0x263238, 6, 4); eyeL.position.set(-0.075, 1.045, 0.19);
  const eyeR = eyeL.clone(); eyeR.position.x = 0.075;
  const browL = box(0.075, 0.018, 0.018, 0x5d4037); browL.position.set(-0.075, 1.105, 0.195); browL.rotation.z = -0.12;
  const browR = browL.clone(); browR.position.x = 0.075; browR.rotation.z = 0.12;
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.105, 7), mat(0xf0b183));
  nose.rotation.x = Math.PI / 2; nose.position.set(0, 0.985, 0.225); nose.castShadow = true;

  const armL = new THREE.Group(); armL.position.set(-0.27, 0.72, 0);
  const armR = new THREE.Group(); armR.position.set(0.27, 0.72, 0);
  const sleeveL = cyl(0.07, 0.075, 0.28, color, 7); sleeveL.position.y = -0.13;
  const sleeveR = sleeveL.clone();
  const handL = sph(0.075, skin, 7, 5); handL.position.y = -0.31;
  const handR = handL.clone();
  armL.add(sleeveL, handL); armR.add(sleeveR, handR);

  const legL = new THREE.Group(); legL.position.set(-0.13, 0.31, 0);
  const legR = new THREE.Group(); legR.position.set(0.13, 0.31, 0);
  const trouserL = cyl(0.075, 0.08, 0.27, 0x34495e, 7); trouserL.position.y = -0.12;
  const trouserR = trouserL.clone();
  const shoeL = box(0.16, 0.09, 0.23, 0x3a2b27); shoeL.position.set(0, -0.28, 0.055);
  const shoeR = shoeL.clone();
  legL.add(trouserL, shoeL); legR.add(trouserR, shoeR);

  const carryAnchor = new THREE.Group(); carryAnchor.position.set(0, 1.5, 0.18);
  visualRig.add(body, apron, neckerchief, head, hair, hatBrim, hatTop, hatPuffL, hatPuffR,
    eyeL, eyeR, browL, browR, nose, armL, armR, legL, legR, carryAnchor);
  g.userData = {
    visualRig, body, apron, head, hatTop, hatPuffL, hatPuffR, armL, armR, legL, legR, carryAnchor,
    carryingJson: '__none__', carryNode: null, animKick: 0,
    animation: { speed: 0, walkPhase: 0, workPhase: 0 },
  };
  return g;
}

export function advanceChefAnimation(animation, targetSpeed, dt, working = false) {
  const normalisedTarget = Math.max(0, Math.min(1, (Number(targetSpeed) || 0) / 3.2));
  const stoppedTarget = normalisedTarget < 0.035 ? 0 : normalisedTarget;
  const response = stoppedTarget > animation.speed ? 10 : 14;
  animation.speed += (stoppedTarget - animation.speed) * (1 - Math.exp(-Math.max(0, dt) * response));
  if (animation.speed < 0.008 && stoppedTarget === 0) animation.speed = 0;
  if (animation.speed > 0) animation.walkPhase += Math.max(0, dt) * (4.2 + animation.speed * 6.8);
  if (working) animation.workPhase += Math.max(0, dt) * 10.5;
  return animation;
}

export function animateChefModel(group, state, motion, now, dt, stationType) {
  const u = group.userData;
  const animation = advanceChefAnimation(u.animation, motion.speed, dt, Boolean(state && state.working));
  const speed = animation.speed;
  const stride = animation.walkPhase;
  const breath = Math.sin(now * 2.1) * 0.012;
  const working = Boolean(state && state.working);
  const carrying = Boolean(state && state.carrying);
  u.animKick = Math.max(0, (u.animKick || 0) - dt * 4.5);

  let armL = Math.sin(stride) * 0.55 * speed;
  let armR = -armL;
  if (carrying) { armL = -1.12; armR = -1.12; }
  if (working) {
    const wash = stationType === 'sink';
    const workPhase = animation.workPhase;
    armL = wash ? -0.8 + Math.sin(workPhase) * 0.25 : -0.45 + Math.abs(Math.sin(workPhase)) * 0.95;
    armR = wash ? -0.8 - Math.sin(workPhase) * 0.25 : -1.0 + Math.abs(Math.sin(workPhase + 0.6)) * 0.35;
  }
  u.armL.rotation.x = armL;
  u.armR.rotation.x = armR;
  u.legL.rotation.x = Math.sin(stride) * 0.62 * speed;
  u.legR.rotation.x = -Math.sin(stride) * 0.62 * speed;
  const bounce = Math.abs(Math.sin(stride)) * 0.055 * speed + breath;
  u.body.position.y = 0.56 + bounce;
  u.apron.position.y = 0.52 + bounce;
  u.head.position.y = 1.02 + bounce * 0.55;
  u.hatTop.position.y = 1.33 + bounce * 0.8 + u.animKick * 0.06;
  u.hatPuffL.position.y = 1.46 + bounce + u.animKick * 0.08;
  u.hatPuffR.position.y = 1.46 + bounce + u.animKick * 0.08;
  u.visualRig.rotation.z = -Math.sin(stride) * 0.038 * speed;
  u.visualRig.scale.y = 1 - u.animKick * 0.06;
  u.visualRig.scale.x = 1 + u.animKick * 0.035;
  u.visualRig.scale.z = 1 + u.animKick * 0.035;
  // The network root must stay rigid: position/yaw interpolation must never
  // inherit squash, bounce, or lean from the cosmetic animation rig.
  group.rotation.z = 0;
  group.scale.set(1, 1, 1);
}

export function kickChef(group, amount = 1) {
  if (group) group.userData.animKick = Math.max(group.userData.animKick || 0, amount);
}
