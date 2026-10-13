import { Effect, EffectAttribute } from 'postprocessing';
import { Uniform, Vector2 } from 'three';

// Zoom-style motion blur: each pixel averages samples along the line towards the centre, so the edges
// of the frame streak while the middle stays sharp. `strength` is the fraction of that distance sampled.
const fragmentShader = /* glsl */`
  uniform float strength;
  uniform vec2 center;

  void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    if (strength <= 0.0) {
      outputColor = inputColor;
      return;
    }
    vec2 toCenter = uv - center;
    vec4 sum = vec4(0.0);
    const int SAMPLES = 16;
    for (int i = 0; i < SAMPLES; i++) {
      float t = float(i) / float(SAMPLES - 1);
      sum += texture2D(inputBuffer, uv - toCenter * strength * t);
    }
    outputColor = sum / float(SAMPLES);
  }
`;

export class RadialBlurEffect extends Effect {
  constructor({ strength = 0, center = new Vector2(0.5, 0.5) } = {}) {
    super('RadialBlurEffect', fragmentShader, {
      attributes: EffectAttribute.CONVOLUTION,
      uniforms: new Map([
        ['strength', new Uniform(strength)],
        ['center', new Uniform(center)],
      ]),
    });
  }

  get strength() {
    return this.uniforms.get('strength').value;
  }

  set strength(value) {
    this.uniforms.get('strength').value = value;
  }
}
