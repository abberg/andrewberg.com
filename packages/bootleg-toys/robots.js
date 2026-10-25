import { readdirSync, existsSync, readFileSync } from 'node:fs';

// The models folder is full of ripped game assets: robots, but also effects,
// characters, backgrounds and banners. Robots are the folders named like
// A110_010_gundammk2 (a series code, a number, a name) holding a matching .fbx.
export const robotFolder = /^[A-Z]\d{3}_\d{3}_(?!.*_eff)(.+)$/;

// Ships, bases, bullets and stray effect pieces share that naming, but they're
// a single rigid mesh with a handful of bones at most, where a robot is rigged
// (the Mega Man robots have few bones but are built from many meshes). Count
// both straight from the binary FBX rather than parsing it.
function count(buffer, text) {
  let n = 0;
  for (let i = buffer.indexOf(text); i !== -1; i = buffer.indexOf(text, i + 1)) n++;
  return n;
}

function isRobot(fbx) {
  return count(fbx, 'LimbNode') >= 6 || count(fbx, 'GeometryS\x04\x00\x00\x00Mesh') >= 10;
}

// Hand-picked leftovers that pass those checks but aren't robots worth
// keeping: mobile armours, pilots, bikes, monsters and the like.
const excluded = new Set([
  'alphaazieru', 'nightingale', 'bug', 'masterasia', 'devilgundam', 'gaga_bo',
  'military_bike_side', 'zmaster', 'siegfried', 'alexander_a_ins', 'jimba_r', 'ulvorful',
  'arc2j1', 'wygar', 'ravana', 'dragon_schooner', 'strike_siegwurm_b', 'spacemonsterf',
  'kantam_robo', 'ryuho_last', 'samekh', 'samekh_s', 'kisaragi_om',
]);

// Kitbashing needs the standard humanoid rig: a head, a spine, two arms and
// two legs. Jets, dragons and tanks don't have one. Some that do still have
// nothing to recombine: Noir Getter 2 is a hooded cloak all the way down,
// and Hekiryugo is a dragon at heart.
const notForKitbash = new Set([
  'noir_getter2', 'hekiryugo', 'heybot', 'gunvarrel', 'black_six', 'beargguy3', 'kisei_kushiki_bunker',
  // Not good biped matches, picked out by eye.
  'big_duo', 'blackdomi', 'painkiller_enigma', 'beta_equuspedis', 'megillot',
  'aquarion_gepard',
  'godzilla', // an open shell, every part
]);
const humanoidBones = ['mot_head', 'mot_spine', 'mot_arm_l', 'mot_arm_r', 'mot_upleg_l', 'mot_upleg_r'];
const isHumanoid = (fbx) => humanoidBones.every((bone) => fbx.includes(`${bone}\x00\x01Model`));

// Robots that are the same model as another, under a different texture or
// pilot: the same body mesh to within half a percent (found by
// scripts/convert-kitbash.mjs). Only the first of each lends to kitbashes.
export const duplicates = {
  bawoo: ['bawoo_g'],
  qubeley: ['qubeleymk2_p1'],
  godgundam: ['godgundam_hp'],
  zakuwarrior_g_l: ['zakuwarrior_g_d'],
  billvine: ['billvine_dp'],
  lancelot: ['lancelot_z'],
  glasgow: ['glasgow_k'],
  sutherland: ['white_sutherland'],
  vincent_w: ['white_vincent_w'],
  gordon: ['gordon_a'],
  black_shinkalion: ['black_shinkalion_kurenai'],
  tsf_t00a_tamase: ['tsf_t00a_yoroi'],
  protagonist2: ['protagonist2_cs1'],
  masspro_b_sht: ['masspro_b_def', 'masspro_c_atk'],
  masspro_n_a1: ['masspro_n_c1', 'masspro_n_d1', 'masspro_mk2_b1', 'masspro_mk2_d1'],
  masspro_n_a2: ['masspro_n_b2', 'masspro_n_c2', 'masspro_n_d2', 'masspro_mk2_a2', 'masspro_mk2_c2', 'masspro_mk2_d2'],
  masspro_n_a3: ['masspro_mk2_d3'],
};
const duplicate = new Set(Object.values(duplicates).flat());

// Robots that only lend some parts. The Znarks are hovering pods and Shin
// Getter-3 is a tank: their rigs have no knees (so kitbash.js won't take
// their legs either), and Getter-3's body is the tank, but their heads, and
// the tank's and Getter-3's arms, make good robot parts.
export const onlyLends = {
  znark_shooter: ['head'],
  znark_tank: ['head', 'arms'],
  shingetter3: ['head', 'arms'],
  // Parts made of pieces that float apart, left out so every figure is one
  // connected piece.
  primavera: ['head', 'body', 'legs'],
  arvak: ['head', 'legs'],
  van_1: ['head', 'arms', 'legs'],
  signo_sht: ['head', 'arms', 'legs'],
  rgun_powered: ['head', 'arms', 'legs'],
  masspro_sp_c1: ['arms', 'legs'],
  signo_des: ['head', 'arms', 'legs'],
  gouka_byakuen: ['head', 'arms', 'legs'],
  scopedog_rsc: ['head', 'arms', 'legs'],
  lgaimmk2: ['head', 'arms', 'legs'],
  // Bodies with shoulder sockets far out from the chest, which borrowed arms
  // can't close.
  frareengine_imp: ['head', 'arms', 'legs'],
  earthengine_imp: ['arms', 'legs'],
  // Open, thin shells (clothes-like bodies with ragged edges whose insides
  // show), found by how much of each part's inside can be seen.
  pre_exes: ['legs'],
  zambot3: ['head', 'legs'],
  liger_thunder: ['head'],
  vg_einwald: ['head', 'arms'],
  powered723: ['head'],
  alseides: ['arms', 'legs'],
  goleam: ['arms'],
  kazuma_2: ['head'],
  gomin: ['head'],
  dybastar: ['head', 'arms'],
  busterm19: ['head', 'legs'],
  rovebarrel: ['head'],
  hackadoll_robo1: ['head', 'arms', 'legs'],
  // Bodies that hold together only through their own arms (shoulder pieces
  // with nothing joining them to the chest), so come apart with others'.
  burglarydog: ['head', 'arms', 'legs'],
  mindi: ['head', 'arms', 'legs'],
  nirvash_gb: ['head', 'arms', 'legs'],
  nirvash_t: ['head', 'arms', 'legs'],
  tawburn_com: ['head', 'arms', 'legs'],
  yf19_b: ['head', 'arms', 'legs'],
  yf21_b: ['head', 'arms', 'legs'],
  fei_yen_kn: ['head', 'arms', 'legs'],
  van_2: ['head', 'arms', 'legs'],
  van_omega: ['head', 'arms', 'legs'],
  masspro_sp_a1: ['head', 'arms', 'legs'],
  rival_cs: ['head', 'arms', 'legs'],
  signo_atk: ['head', 'arms', 'legs'],
  signo_fig: ['head', 'arms', 'legs'],
  diablo: ['head', 'arms', 'legs'],
};

// The robots in public/models (local only), each with whether it can be
// kitbashed.
export function fbxRobots() {
  const dir = new URL('./public/models/', import.meta.url);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((id) => robotFolder.test(id) && !excluded.has(id.match(robotFolder)[1]))
    .filter((id) => existsSync(new URL(`${id}/${id}.fbx`, dir)))
    .sort()
    .map((id) => ({ id, fbx: readFileSync(new URL(`${id}/${id}.fbx`, dir)) }))
    .filter(({ fbx }) => isRobot(fbx))
    .map(({ id, fbx }) => {
      const name = id.match(robotFolder)[1];
      return { id, name, humanoid: isHumanoid(fbx) && !notForKitbash.has(name) && !duplicate.has(name) };
    });
}
