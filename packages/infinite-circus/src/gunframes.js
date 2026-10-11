import { BufferAttribute, Quaternion, Vector3 } from 'three';

// The weapon model only has frames for the standard animations (and the taunt), not for transformup or
// transformdn. This builds them: in each body transform frame the gun follows the robot's hand rigidly,
// then eases into its pod position under the jet as the transform ends (or out of it as one begins).

const GRIP_FRAME = 'taunt01'; // robot standing with the gun in hand
const POD_FRAME = 'taunt04'; // jet with the gun slung underneath
export const GUN_POD_FRAME = 'jetpod'; // the pod pose, moved to sit under `jet1`

const frame = (geometry, name) => geometry.morphAttributes.position.find(target => target.name === name);
const point = (attribute, index, target = new Vector3()) => target.fromBufferAttribute(attribute, index);
const smoothstep = (edge0, edge1, x) => {
  const t = Math.min(Math.max((x - edge0) / (edge1 - edge0), 0), 1);
  return t * t * (3 - 2 * t);
};

// Best-fit rotation taking point set `from` onto `to` (Horn's quaternion method, by power iteration).
function fitRotation(from, to) {
  const ca = from.reduce((sum, p) => sum.add(p), new Vector3()).divideScalar(from.length);
  const cb = to.reduce((sum, p) => sum.add(p), new Vector3()).divideScalar(to.length);
  let sxx = 0, sxy = 0, sxz = 0, syx = 0, syy = 0, syz = 0, szx = 0, szy = 0, szz = 0;
  for (let i = 0; i < from.length; i++) {
    const a = from[i].clone().sub(ca), b = to[i].clone().sub(cb);
    sxx += a.x * b.x; sxy += a.x * b.y; sxz += a.x * b.z;
    syx += a.y * b.x; syy += a.y * b.y; syz += a.y * b.z;
    szx += a.z * b.x; szy += a.z * b.y; szz += a.z * b.z;
  }
  const n = [
    [sxx + syy + szz, syz - szy, szx - sxz, sxy - syx],
    [syz - szy, sxx - syy - szz, sxy + syx, szx + sxz],
    [szx - sxz, sxy + syx, -sxx + syy - szz, syz + szy],
    [sxy - syx, szx + sxz, syz + szy, -sxx - syy + szz],
  ];
  // Shift so the largest eigenvalue dominates, then power-iterate for its eigenvector.
  const shift = n.flat().reduce((sum, value) => sum + Math.abs(value), 0);
  for (let i = 0; i < 4; i++) n[i][i] += shift;
  let q = [1, 0, 0, 0];
  for (let iteration = 0; iteration < 200; iteration++) {
    const next = n.map(row => row.reduce((sum, value, j) => sum + value * q[j], 0));
    const length = Math.hypot(...next);
    q = next.map(value => value / length);
  }
  const rotation = new Quaternion(q[1], q[2], q[3], q[0]).normalize();
  return { rotation, from: ca, to: cb };
}

// Applies "rotate about `from`, then move to `to`" to every point of a frame.
function transformFrame(source, { rotation, from, to }) {
  const result = new Float32Array(source.array.length);
  const p = new Vector3();
  for (let i = 0; i < source.count; i++) {
    point(source, i, p).sub(from).applyQuaternion(rotation).add(to);
    result.set([p.x, p.y, p.z], i * 3);
  }
  return result;
}

const blend = (a, b, t) => ({
  rotation: a.rotation.clone().slerp(b.rotation, t),
  from: a.from.clone().lerp(b.from, t),
  to: a.to.clone().lerp(b.to, t),
});

export function addTransformGunFrames(body, weapon) {
  if (frame(weapon, GUN_POD_FRAME)) return; // already added (the loaded geometry is cached)
  const gripBody = frame(body, GRIP_FRAME);
  const gripGun = frame(weapon, GRIP_FRAME);
  const normals = weapon.morphAttributes.normal[weapon.morphAttributes.position.indexOf(gripGun)];

  // The hand: body vertices within 4 units of where the gun touches the body in the grip frame.
  let contact = 0, closest = Infinity;
  const p = new Vector3(), q = new Vector3();
  for (let i = 0; i < gripBody.count; i++) {
    point(gripBody, i, p);
    for (let j = 0; j < gripGun.count; j++) {
      const d = p.distanceTo(point(gripGun, j, q));
      if (d < closest) { closest = d; contact = i; }
    }
  }
  const contactPoint = point(gripBody, contact);
  const hand = [];
  for (let i = 0; i < gripBody.count; i++) if (point(gripBody, i, p).distanceTo(contactPoint) < 4) hand.push(i);
  const handIn = name => hand.map(i => point(frame(body, name), i));

  // The pod: the taunt's jet pose is `jet1` raised 16 units, so drop the gun by the same to sit under `jet1`.
  const podGun = frame(weapon, POD_FRAME).clone();
  for (let i = 0; i < podGun.count; i++) podGun.setY(i, podGun.getY(i) - 16);
  const gunPoints = attribute => Array.from({ length: attribute.count }, (_, i) => point(attribute, i));
  const toPod = fitRotation(gunPoints(gripGun), gunPoints(podGun));

  const add = (name, array) => {
    const attribute = new BufferAttribute(array, 3);
    attribute.name = name;
    weapon.morphAttributes.position.push(attribute);
    weapon.morphAttributes.normal.push(normals);
  };
  add(GUN_POD_FRAME, podGun.array);

  for (const [animation, podWeight] of [
    ['transformdn', t => smoothstep(0.45, 1, t)], // robot to jet: stow the gun at the end
    ['transformup', t => 1 - smoothstep(0, 0.55, t)], // jet to robot: bring it to hand early
  ]) {
    const names = body.morphAttributes.position.map(target => target.name).filter(name => name.replace(/\d+$/, '') === animation);
    const reference = handIn(GRIP_FRAME);
    names.forEach((name, k) => {
      const inHand = fitRotation(reference, handIn(name));
      const placement = blend(inHand, toPod, podWeight(k / (names.length - 1)));
      add(name, transformFrame(gripGun, placement));
    });
  }
}
