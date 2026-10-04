import Ascent from './Ascent.astro';
import Compass from './Compass.astro';
import Wpds from './Wpds.astro';
import Odyssey from './Odyssey.astro';
import Forge from './Forge.astro';

// Each system's hero, keyed by the logo name used in work.json.
export const workHeroes = {
  klaviyo: Ascent,
  veson: Compass,
  'washington-post': Wpds,
  okta: Odyssey,
  athenahealth: Forge,
};
