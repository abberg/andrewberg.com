import * as THREE from 'three/webgpu';
import {
  Fn, Loop, atan, exp, float, int, mix, rtt, screenCoordinate, select, sqrt, uniform, vec2, vec4,
} from 'three/tsl';
import type { GBuffer } from '../render/gbuffer';
import type { Creases } from './creases';

type Float = THREE.Node<'float'>;
type Vec2 = THREE.Node<'vec2'>;

// Line extraction from the paper's Appendix A: the G2/H2 steerable quadrature
// pair of Freeman and Adelson (1991, tables III and IV) run over
// I = luminance + beta * depth (plus crease and part lines, see creases.ts),
// then non-maxima suppression across the line. Inside parts too busy to show
// their detail (parts.ts) the luminance is flattened to a constant grey, so
// only their outlines register.
//
// Every basis filter is x-y separable, so a horizontal pass applies six 1D
// filters and a vertical pass combines them into the seven basis responses,
// which go straight into the oriented-energy coefficients C1, C2, C3.
export const extractParams = {
  // Filter scale in pixels. 1 is the paper's 9-tap filter (sample spacing 0.67).
  scale: uniform(1.5),
  // Weight of linear depth in I, so silhouettes register against the background.
  beta: uniform(4),
  // Minimum oriented energy for a sample to survive.
  threshold: uniform(0.02),
};

// The 1D factors. x is in the filters' own units.
const f1 = (x: Float) => x.mul(x).mul(2).sub(1).mul(exp(x.mul(x).negate())).mul(0.9213);
const f2 = (x: Float) => exp(x.mul(x).negate());
const f3 = (x: Float) => x.mul(exp(x.mul(x).negate())).mul(Math.sqrt(1.843));
const f4 = (x: Float) => x.mul(x).mul(x).sub(x.mul(2.254)).mul(exp(x.mul(x).negate())).mul(0.978);
const f5 = (x: Float) => x.mul(x).sub(0.7515).mul(exp(x.mul(x).negate())).mul(0.978);
const f6 = (x: Float) => x.mul(exp(x.mul(x).negate()));

export function createExtraction(gbuffer: GBuffer, creases: Creases, pixelRatio: number) {
  const { scale, beta, threshold } = extractParams;
  const resolution = uniform(new THREE.Vector2());
  const radius = int(scale.mul(4).ceil());
  const spacing = float(0.67).div(scale);
  // Sampled at this spacing, f1 isn't quite zero-mean, so flat regions (above
  // all the background, sitting at depth 1) would respond. Taking dc * f2 off
  // f1, with dc chosen in update() to cancel its sum over the taps, fixes that.
  const dc = uniform(0);
  const g1 = (x: Float) => f1(x).sub(f2(x).mul(dc));
  const uvAt = (offset: Vec2) => screenCoordinate.xy.add(offset).div(resolution);

  const intensity = (uv: ReturnType<typeof uvAt>) => {
    const color = gbuffer.shading.sample(uv);
    const lines = creases.lines.sample(uv);
    const luminance = mix(color.r.mul(0.2126).add(color.g.mul(0.7152)).add(color.b.mul(0.0722)), float(0.5), lines.y);
    return luminance.add(gbuffer.depthAt(uv).mul(beta)).add(lines.x);
  };

  const target = () => ({ type: THREE.FloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });

  // Horizontal pass: f1, f2, f3, f4 into one target and f5, f6 into another.
  const horizontal = (pick: 0 | 1) => Fn(() => {
    const sumA = vec4(0).toVar();
    const sumB = vec4(0).toVar();
    Loop({ start: radius.negate(), end: radius, condition: '<=' }, ({ i }) => {
      const x = float(i).mul(spacing);
      const value = intensity(uvAt(vec2(float(i), 0)));
      sumA.addAssign(vec4(g1(x), f2(x), f3(x), f4(x)).mul(value));
      sumB.addAssign(vec4(f5(x), f6(x), 0, 0).mul(value));
    });
    return pick === 0 ? sumA : sumB;
  })();
  const passA = rtt(horizontal(0), null, null, target()).setResolutionScale(1 / pixelRatio);
  const passB = rtt(horizontal(1), null, null, target()).setResolutionScale(1 / pixelRatio);

  // Vertical pass: the seven basis responses, then the dominant orientation
  // and its strength. theta is the direction the filter is steered, which is
  // across the line, so it's the line's normal.
  const energy = rtt(Fn(() => {
    const g2a = float(0).toVar(), g2b = float(0).toVar(), g2c = float(0).toVar();
    const h2a = float(0).toVar(), h2b = float(0).toVar(), h2c = float(0).toVar(), h2d = float(0).toVar();
    Loop({ start: radius.negate(), end: radius, condition: '<=' }, ({ i }) => {
      const y = float(i).mul(spacing);
      const uv = uvAt(vec2(0, float(i)));
      const a = passA.sample(uv), b = passB.sample(uv);
      // a = (g1, f2, f3, f4)(x), b = (f5, f6)(x)
      g2a.addAssign(a.x.mul(f2(y)));
      g2b.addAssign(a.z.mul(f3(y)));
      g2c.addAssign(a.y.mul(g1(y)));
      h2a.addAssign(a.w.mul(f2(y)));
      h2b.addAssign(b.x.mul(f6(y)));
      h2c.addAssign(b.y.mul(f5(y)));
      h2d.addAssign(a.y.mul(f4(y)));
    });
    // Freeman and Adelson's G2b is 1.843 x y e^-(x²+y²); f3 carries sqrt(1.843) on each axis.
    const c2 = g2a.mul(g2a).sub(g2c.mul(g2c)).mul(0.5)
      .add(h2a.mul(h2a).sub(h2d.mul(h2d)).mul(0.46875))
      .add(h2b.mul(h2b).sub(h2c.mul(h2c)).mul(0.28125))
      .add(h2a.mul(h2c).sub(h2b.mul(h2d)).mul(0.1875));
    const c3 = g2a.mul(g2b).negate().sub(g2b.mul(g2c))
      .sub(h2c.mul(h2d).add(h2a.mul(h2b)).mul(0.9375))
      .sub(h2b.mul(h2c).mul(1.6875))
      .sub(h2a.mul(h2d).mul(0.1875));
    const strength = sqrt(c2.mul(c2).add(c3.mul(c3)));
    // Freeman and Adelson's angles run the other way round from y-down pixels,
    // so C3 changes sign (checked against synthetic edges and lines at 0-135°).
    const theta = atan(c3.negate(), c2).mul(0.5);
    return vec4(strength, theta.cos(), theta.sin(), 1);
  })(), null, null, target()).setResolutionScale(1 / pixelRatio);

  // Non-maxima suppression: keep a pixel only if its strength beats both
  // neighbours one pixel either side along the normal.
  const samples = rtt(Fn(() => {
    const here = energy.sample(uvAt(vec2(0)));
    const normal = here.yz;
    const ahead = energy.sample(uvAt(normal)).x;
    const behind = energy.sample(uvAt(normal.negate())).x;
    const keep = here.x.greaterThan(threshold).and(here.x.greaterThanEqual(ahead)).and(here.x.greaterThan(behind));
    // Out: strength (0 where suppressed), tangent (normal turned a quarter).
    return vec4(select(keep, here.x, 0), normal.y.negate(), normal.x, 1);
  })(), null, null, target()).setResolutionScale(1 / pixelRatio);

  return {
    energy,
    samples,
    update() {
      resolution.value.set(gbuffer.width, gbuffer.height);
      creases.update();
      const r = Math.ceil(scale.value * 4), step = 0.67 / scale.value;
      let sum1 = 0, sum2 = 0;
      for (let i = -r; i <= r; i++) {
        const x = i * step, e = Math.exp(-x * x);
        sum1 += 0.9213 * (2 * x * x - 1) * e;
        sum2 += e;
      }
      dc.value = sum1 / sum2;
    },
  };
}

export type Extraction = ReturnType<typeof createExtraction>;
