/* Small helpers on top of three's skeletons: world positions, two bone IK, bends in world space,
   and the bind pose box of the skin a bone carries (to fit gear to each body). */
import * as THREE from 'three';

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();

export const wpos = (o, out = new THREE.Vector3()) => o.getWorldPosition(out);
export const wquat = (o, out = new THREE.Quaternion()) => o.getWorldQuaternion(out);

/** Rotate a bone by q given in world space (about its own origin). */
export function rotateWorld(bone, q) {
  const pq = bone.parent ? wquat(bone.parent, _q2) : _q2.identity();
  const bq = wquat(bone, _q);
  const nq = q.clone().multiply(bq);
  bone.quaternion.copy(pq.invert().multiply(nq));
  bone.updateMatrixWorld(true);
}

export function bendWorld(bone, axis, angle) {
  rotateWorld(bone, new THREE.Quaternion().setFromAxisAngle(axis, angle));
}

/** Turn bone so the direction from it to `child` points along dir (world). */
export function aimBone(bone, child, dir, weight = 1) {
  const a = wpos(bone, new THREE.Vector3()), b = wpos(child, new THREE.Vector3());
  const cur = b.sub(a).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(cur, dir.clone().normalize());
  if (weight < 1) q.slerp(new THREE.Quaternion(), 1 - weight);
  rotateWorld(bone, q);
}

/** Two bone IK: upper, lower, end; moves end to target with the middle joint toward pole. */
export function twoBoneIK(upper, lower, end, target, pole, weight = 1) {
  if (weight <= 0) return;
  const A = wpos(upper, new THREE.Vector3()), B = wpos(lower, new THREE.Vector3()), C = wpos(end, new THREE.Vector3());
  const la = A.distanceTo(B), lb = B.distanceTo(C);
  const T = C.clone().lerp(target, weight);
  const AT = T.clone().sub(A);
  let d = AT.length();
  d = Math.min(d, (la + lb) * 0.999);
  const dir = AT.normalize();
  // the elbow: in the plane of dir and the pole, la from A
  const poleDir = pole.clone().sub(A);
  const pn = poleDir.sub(dir.clone().multiplyScalar(poleDir.dot(dir))).normalize();
  const cosA = THREE.MathUtils.clamp((la * la + d * d - lb * lb) / (2 * la * d), -1, 1);
  const sinA = Math.sqrt(1 - cosA * cosA);
  const elbow = A.clone().add(dir.clone().multiplyScalar(cosA * la)).add(pn.multiplyScalar(sinA * la));
  aimBone(upper, lower, elbow.clone().sub(A));
  const B2 = wpos(lower, new THREE.Vector3());
  aimBone(lower, end, A.clone().add(dir.clone().multiplyScalar(d)).sub(B2));
}

/** Bind pose box (world) of the vertices a bone carries more than minW of. */
export function boneBox(meshes, boneName, minW = 0.5) {
  const box = new THREE.Box3();
  for (const m of meshes) {
    if (!m.isSkinnedMesh) continue;
    const bi = m.skeleton.bones.findIndex((b) => b.name === boneName);
    if (bi < 0) continue;
    const pos = m.geometry.attributes.position, si = m.geometry.attributes.skinIndex, sw = m.geometry.attributes.skinWeight;
    for (let i = 0; i < pos.count; i++) {
      let w = 0;
      for (let k = 0; k < 4; k++) if (si.getComponent(i, k) === bi) w += sw.getComponent(i, k);
      if (w >= minW) { _v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld); box.expandByPoint(_v); }
    }
  }
  return box;
}

/** Attach obj to bone so it sits at the given world matrix in the current (bind) pose. */
export function attach(bone, obj, worldMatrix) {
  bone.updateMatrixWorld(true);
  const inv = bone.matrixWorld.clone().invert();
  obj.matrix.copy(inv.multiply(worldMatrix));
  obj.matrix.decompose(obj.position, obj.quaternion, obj.scale);
  bone.add(obj);
}
