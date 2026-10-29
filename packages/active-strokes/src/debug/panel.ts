import GUI from 'three/addons/libs/lil-gui.module.min.js';
import { extractParams } from '../extract/steerable';
import { creaseParams } from '../extract/creases';
import { partParams } from '../extract/parts';
import { motionParams } from '../render/motion';
import { toonParams } from '../render/toon';
import { defaultParams, type Params } from '../snakes/params';

// A panel for tuning everything live. Every setting also lives in the URL
// (only where it differs from the default), so a reload or a shared link keeps
// it, and Copy settings puts that query on the clipboard for baking in later.

const extractDefaults = {
  extractScale: extractParams.scale.value, extractBeta: extractParams.beta.value, extractThreshold: extractParams.threshold.value,
  creaseAngle: creaseParams.angle.value, creaseWeight: creaseParams.creaseWeight.value, partWeight: creaseParams.partWeight.value,
  partDetail: partParams.amount.value, partDensity: partParams.density.value,
};
const toonDefaults = {
  toon: toonParams.enabled.value === 1, toonThreshold: toonParams.threshold.value, toonSoftness: toonParams.softness.value,
  toonLit: toonParams.lit.value, toonShadow: toonParams.shadow.value,
  toonHighlightThreshold: toonParams.highlightThreshold.value, toonHighlight: toonParams.highlight.value,
  toonDetails: toonParams.details.value, paper: toonParams.paper.value,
};

export const views = {
  'Drawing': 7, 'Shading': 0, 'Velocity': 1, 'Depth': 2, 'Line strength': 3,
  'Line samples': 4, 'Samples (CPU)': 5, 'Snakes': 6, 'Creases and parts': 8,
};

export interface PanelHooks {
  setParams(params: Partial<Params>): void;
  setView(view: number): void;
  setDashed(dashed: boolean): void;
  reseed(): void;
  swipe(): void;
}

export function createPanel(hooks: PanelHooks) {
  const settings = { ...defaultParams, ...extractDefaults, ...toonDefaults, swipeEvery: motionParams.swipeEvery, swipeHold: motionParams.swipeHold, view: 7, dashed: false, paused: false };
  type Key = keyof typeof settings;
  const defaults = { ...settings };
  for (const [key, value] of new URLSearchParams(location.search)) {
    if (!(key in settings)) continue;
    if (typeof settings[key as Key] === 'number' && !Number.isNaN(Number(value))) (settings as Record<string, unknown>)[key] = Number(value);
    if (typeof settings[key as Key] === 'boolean') (settings as Record<string, unknown>)[key] = value === 'true';
  }

  const apply = (key: Key) => {
    const value = settings[key];
    if (key in defaultParams) hooks.setParams({ [key]: value });
    else if (key === 'extractScale') extractParams.scale.value = value as number;
    else if (key === 'extractBeta') extractParams.beta.value = value as number;
    else if (key === 'extractThreshold') extractParams.threshold.value = value as number;
    else if (key === 'creaseAngle') creaseParams.angle.value = value as number;
    else if (key === 'creaseWeight') creaseParams.creaseWeight.value = value as number;
    else if (key === 'partWeight') creaseParams.partWeight.value = value as number;
    else if (key === 'partDetail') partParams.amount.value = value as number;
    else if (key === 'partDensity') partParams.density.value = value as number;
    else if (key === 'toon') toonParams.enabled.value = value ? 1 : 0;
    else if (key === 'toonThreshold') toonParams.threshold.value = value as number;
    else if (key === 'toonSoftness') toonParams.softness.value = value as number;
    else if (key === 'toonLit') toonParams.lit.value = value as number;
    else if (key === 'toonShadow') toonParams.shadow.value = value as number;
    else if (key === 'toonHighlightThreshold') toonParams.highlightThreshold.value = value as number;
    else if (key === 'toonHighlight') toonParams.highlight.value = value as number;
    else if (key === 'toonDetails') toonParams.details.value = value as number;
    else if (key === 'paper') toonParams.paper.value = value as number;
    else if (key === 'swipeEvery') motionParams.swipeEvery = value as number;
    else if (key === 'swipeHold') motionParams.swipeHold = value as number;
    else if (key === 'view') hooks.setView(value as number);
    else if (key === 'dashed') hooks.setDashed(value as boolean);
    if (key === 'style') showStyle();
    syncUrl();
  };
  const query = () => {
    const search = new URLSearchParams();
    for (const key of Object.keys(settings) as Key[]) {
      if (settings[key] !== defaults[key] && key !== 'view' && key !== 'paused') search.set(key, String(settings[key]));
    }
    return search.toString();
  };
  const syncUrl = () => history.replaceState(null, '', `${location.pathname}${query() ? '?' + query() : ''}`);

  // Starts collapsed to its title bar, out of the drawing's way.
  const gui = new GUI({ title: 'Active Strokes' }).close();
  const add = (folder: GUI, key: Key, min?: number, max?: number, step?: number, name?: string) => {
    // lil-gui's typings can't follow a key that may be a number or a boolean.
    const controller = typeof settings[key] === 'boolean'
      ? folder.add(settings as unknown as Record<string, boolean>, key)
      : folder.add(settings as unknown as Record<string, number>, key, min, max, step);
    if (name) controller.name(name);
    return controller.onChange(() => apply(key));
  };

  const drawing = gui.addFolder('Drawing');
  drawing.add(settings, 'style', { 'Sketchy': 1, 'Ink': 0 }).name('Style').onChange(() => apply('style'));
  drawing.add(settings, 'view', views).name('View').onChange(() => apply('view'));
  add(drawing, 'dashed', undefined, undefined, undefined, 'Dashed test texture');
  add(drawing, 'paused', undefined, undefined, undefined, 'Pause walk');
  add(drawing, 'swipeEvery', 0, 8, 1, 'Swipe every (walks)');
  add(drawing, 'swipeHold', 0, 8, 0.05, 'Swipe hold (s)');
  drawing.add({ swipe: () => hooks.swipe() }, 'swipe').name('Swipe now');
  add(drawing, 'strokeWidth', 0.5, 6, 0.1, 'Stroke width');
  add(drawing, 'taper', 0, 40, 1, 'Taper');
  add(drawing, 'simplifyLength', 0, 60, 1, 'Hide fragments under');
  add(drawing, 'junctionReach', 0, 40, 1, 'Close gaps up to');
  add(drawing, 'fadeDelay', 0, 20, 1, 'Hide new lines for (frames)');
  add(drawing, 'fastFade', 0, 20, 0.5, 'Fast lines show above (px/frame)');
  drawing.add({ reseed: () => hooks.reseed() }, 'reseed').name('Reseed snakes');
  drawing.add({ copy: () => void navigator.clipboard.writeText(query()) }, 'copy').name('Copy settings');
  drawing.add({ reset: () => {
    Object.assign(settings, defaults);
    for (const key of Object.keys(settings) as Key[]) apply(key);
    gui.controllersRecursive().forEach(c => c.updateDisplay());
  } }, 'reset').name('Reset to defaults');

  const shading = gui.addFolder('Shading');
  add(shading, 'toon', undefined, undefined, undefined, 'Toon shading');
  add(shading, 'toonThreshold', 0, 1, 0.01, 'Light / shadow split');
  add(shading, 'toonSoftness', 0, 0.2, 0.005, 'Edge softness');
  add(shading, 'toonLit', 0, 0.6, 0.01, 'Lit tone');
  add(shading, 'toonShadow', 0, 0.8, 0.01, 'Shadow tone');
  add(shading, 'toonHighlightThreshold', 0, 1, 0.01, 'Highlight split');
  add(shading, 'toonHighlight', 0, 1, 0.01, 'Highlight tone');
  add(shading, 'toonDetails', 0, 1, 0.01, 'Texture details');
  add(shading, 'paper', 0, 2, 0.01, 'Paper grain');

  const sketchy = gui.addFolder('Sketchy');
  add(sketchy, 'sketchLayers', 1, 6, 1, 'Layers');
  add(sketchy, 'sketchLength', 10, 200, 1, 'Stroke length');
  add(sketchy, 'sketchCoverage', 0.2, 0.95, 0.01, 'Coverage');
  add(sketchy, 'sketchOffset', 0, 8, 0.1, 'Offset');
  add(sketchy, 'sketchWobble', 0, 4, 0.05, 'Wobble');
  add(sketchy, 'sketchWidthVariation', 0, 1, 0.01, 'Width variation');
  add(sketchy, 'sketchOpacityVariation', 0, 1, 0.01, 'Opacity variation');
  add(sketchy, 'sketchPressure', 0, 1, 0.01, 'Pressure');

  const brush = gui.addFolder('Brush paths').close();
  add(brush, 'kappaMax', 1, 30, 1, 'Fade frames');
  add(brush, 'uniformity', 0, 1, 0.01, 'Uniformity');
  add(brush, 'level', 0, 1, 0.01, 'Leveling');
  add(brush, 'joinTolerance', 0, 10, 0.1, 'Join tolerance');

  const snakes = gui.addFolder('Snakes').close();
  add(snakes, 'sigma', 2, 20, 0.5, 'Attraction width σ');
  add(snakes, 'attraction', 0, 1, 0.01, 'Attraction near line');
  add(snakes, 'attractionFar', 0, 1, 0.01, 'Attraction far from line');
  add(snakes, 'gamma', 0.5, 20, 0.1, 'Step γ (inverse)');
  add(snakes, 'alpha', 0, 2, 0.01, 'Membrane α');
  add(snakes, 'beta', 0, 2, 0.01, 'Thin plate β');
  add(snakes, 'stiffness', 0, 3, 0.05, 'Spring stiffness');
  add(snakes, 'iterations', 1, 20, 1, 'Iterations');
  add(snakes, 'deltaMax', 2, 20, 0.5, 'Vertex spacing');
  add(snakes, 'rCover', 2, 30, 0.5, 'Cover radius');
  add(snakes, 'rTrim', 1, 20, 0.5, 'Trim radius');
  add(snakes, 'rExtend', 5, 60, 1, 'Extend radius');
  add(snakes, 'rMerge', 5, 60, 1, 'Merge radius');
  add(snakes, 'thetaC', 0, 1, 0.01, 'Cover alignment');
  add(snakes, 'thetaPar', 0, 1, 0.01, 'Parallel alignment');
  add(snakes, 'thetaPerp', -1, 1, 0.01, 'Split angle');
  add(snakes, 'goodness', 0, 1, 0.01, 'Goodness balance');
  add(snakes, 'depthTolerance', 0.001, 0.2, 0.001, 'Depth tolerance');
  add(snakes, 'advectDepthSlack', 0, 0.02, 0.0005, 'Depth slack per px/frame');

  const extraction = gui.addFolder('Line extraction').close();
  add(extraction, 'extractScale', 0.5, 4, 0.05, 'Filter scale');
  add(extraction, 'extractBeta', 0, 20, 0.1, 'Depth weight β');
  add(extraction, 'extractThreshold', 0, 0.3, 0.001, 'Threshold');
  add(extraction, 'creaseAngle', 20, 90, 1, 'Crease angle');
  add(extraction, 'creaseWeight', 0, 1, 0.01, 'Crease weight');
  add(extraction, 'partWeight', 0, 1, 0.01, 'Part line weight');
  add(extraction, 'partDetail', 0, 1, 0.01, 'Simplify busy parts');
  add(extraction, 'partDensity', 0.01, 0.3, 0.005, 'Busy part density');

  function showStyle() {
    sketchy.show(settings.style === 1);
  }

  // Start from whatever the URL said.
  for (const key of Object.keys(settings) as Key[]) if (settings[key] !== defaults[key]) apply(key);
  showStyle();

  return {
    settings,
    gui,
    // For keyboard shortcuts that change settings behind the panel's back.
    set(key: Key, value: number | boolean) {
      (settings as Record<string, unknown>)[key] = value;
      apply(key);
      gui.controllersRecursive().forEach(c => c.updateDisplay());
    },
  };
}
