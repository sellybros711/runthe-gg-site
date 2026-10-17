/* The pitching coach, head and shoulders, at the dugout rail: the close-up test.
 *
 *   ?coach=1            near frontal, the hardest framing for a face
 *   ?coach=1&frame=34   three quarter, head turned, the cap brim's shadow over the eyes
 *
 * The camera is on the field looking into the dugout: daylight on his face from the open sky
 * behind the camera, the dugout's dark back wall behind him (soft, out of focus).
 */
import * as THREE from 'three';
import * as G from './gear3d.js';
import { loadPerson, pose, fitOnHead, face, tuckHair } from './people.js';
import { wpos, bendWorld } from './rig.js';

const UPV = new THREE.Vector3(0, 1, 0);

export class Coach {
  constructor({ scene, camera, renderer, loader, Q }) {
    Object.assign(this, { scene, camera, renderer, loader, Q });
    this.frame = parseFloat(Q.get('frame') || '0');
  }

  async load() {
    const s = this.scene;
    s.background = new THREE.Color(0x14171b);
    const facts = await (await fetch('./assets/pitch.json')).json();
    const team = new THREE.Color(facts.pitcher.teamColors[0]);
    this.p = await loadPerson(this.loader, './assets/coach.glb', s);
    fitOnHead(this.p, G.cap(team.clone().multiplyScalar(0.7), { brimTilt: 0.3 }), { drop: 0.068, fwd: -0.004, tilt: 0.04 });
    tuckHair(this.p);
    face(this.p, new THREE.Vector3(0, 0, 0));
    this.buildDugout();
    // light: the open sky behind the camera, a low sun from the side, the dugout roof's shade on top
    // the three quarter test raises the sun so the brim shades his eyes, as it does at a real rail
    const high = this.frame > 0;
    const sun = new THREE.DirectionalLight(0xffe6cc, high ? 2.6 : 1.6);
    sun.position.set(-3, high ? 6.5 : 3.4, 4); sun.target.position.set(0, 1.5, 0);
    sun.castShadow = true;
    Object.assign(sun.shadow.camera, { left: -1, right: 1, top: 1, bottom: -1, near: 0.5, far: 12 });
    sun.shadow.mapSize.set(1024, 1024); sun.shadow.bias = -0.0003; sun.shadow.normalBias = 0.01; sun.shadow.radius = 4;
    s.add(sun, sun.target);
    const fill = new THREE.DirectionalLight(0xcfe0ff, 0.5);
    fill.position.set(2.5, 1.6, 3); s.add(fill);
    const rim = new THREE.DirectionalLight(0xfff0e0, 0.9);
    rim.position.set(1.5, 2.5, -2); s.add(rim);
    this.resize();
  }

  buildDugout() {
    const s = this.scene;
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(10, 4), new THREE.MeshStandardMaterial({ color: 0x1d2a3a, roughness: 0.9 }));
    wall.position.set(0, 1.5, -2.6); s.add(wall);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(10, 0.15, 3.6), new THREE.MeshStandardMaterial({ color: 0x2b2f35, roughness: 0.8 }));
    roof.position.set(0, 2.35, -0.9); roof.castShadow = true; s.add(roof);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(10, 6), new THREE.MeshStandardMaterial({ color: 0x5c5a55, roughness: 0.95 }));
    floor.rotation.x = -Math.PI / 2; s.add(floor);
    const bench = new THREE.Mesh(new THREE.BoxGeometry(6, 0.08, 0.45), new THREE.MeshStandardMaterial({ color: 0x6b4f35, roughness: 0.7 }));
    bench.position.set(0, 0.48, -2.2); s.add(bench);
    // helmets on the rack behind, soft shapes in the dark
    for (let i = 0; i < 7; i++) {
      const h = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), new THREE.MeshStandardMaterial({ color: 0x0f2340, roughness: 0.35 }));
      h.position.set(-1.6 + i * 0.5, 1.95, -2.45); s.add(h);
    }
    // the rail he leans on
    const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 6, 12), new THREE.MeshStandardMaterial({ color: 0x8a9096, roughness: 0.35, metalness: 0.7 }));
    rail.rotation.z = Math.PI / 2; rail.position.set(0, 1.12, 0.32); s.add(rail);
    // blur the background as a lens would: a soft dark veil between him and the wall
    const veil = new THREE.Mesh(new THREE.PlaneGeometry(10, 5), new THREE.MeshBasicMaterial({ color: 0x0c0f13, transparent: true, opacity: 0.35, depthWrite: false }));
    veil.position.set(0, 1.5, -1.2); s.add(veil);
  }

  resize() {
    const r = this.renderer;
    r.setSize(innerWidth, innerHeight, false);
    this.camera.aspect = innerWidth / innerHeight;
    // head and shoulders: about 0.62 m of him tall in portrait, wider on a desktop
    const portrait = innerWidth < innerHeight;
    this.camera.fov = portrait ? 13 : 9;
    this.camera.updateProjectionMatrix();
  }

  update(t) {
    const p = this.p;
    pose(p, { idle: [1 + t * 0.9, 1] });
    const B = p.bones;
    const turn = THREE.MathUtils.degToRad(this.frame);
    // he looks off down the line, shoulders following a little: the camera sees three quarters
    if (turn) { bendWorld(B.spine_03, UPV, -turn * 0.2); bendWorld(B.neck_01, UPV, -turn * 0.22); bendWorld(B.head, UPV, -turn * 0.3); }
    bendWorld(B.head, new THREE.Vector3(1, 0, 0), 0.05 + Math.sin(t * 0.7) * 0.012);
    p.root.updateMatrixWorld(true);
    const head = wpos(B.head);
    const portrait = innerWidth < innerHeight;
    const target = head.clone().add(new THREE.Vector3(0, portrait ? -0.06 : 0.0, 0));
    // the camera: a long lens, eye level, a little off his right shoulder
    const az = THREE.MathUtils.degToRad(-10);
    const dist = 3.2;
    this.camera.position.set(target.x + Math.sin(az) * dist, target.y + 0.02, target.z + Math.cos(az) * dist);
    this.camera.lookAt(target);
  }
}
