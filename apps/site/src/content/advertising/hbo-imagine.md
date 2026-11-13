---
title: HBO Imagine
client: HBO
agency: The Barbarian Group
partners: [BBDO New York]
year: 2009
role: Technical lead
recreation: hbo-cube
hero:
  src: /advertising/hbo-imagine/original-site.jpg
  width: 1274
  height: 669
  alt: The HBO Imagine site in 2009. A cube turned to a corner shows two angles of The Affair, a bedroom on one side and a living room on the other, with Spin buttons either side, playback controls below, and a bar reading 70% unlocked.
  caption: The original 2009 Flash site
video:
  youtube: UWVeFt3IyoI
  title: HBO Imagine case film
  caption: The campaign film, from The One Club for Creativity.
summary: An interactive mystery centered on four-sided story cubes. Spin them to change angles mid-scene and watch every side for the full story, then unlock the bigger story from the content around them.
credits:
  - { role: Client, name: HBO }
  - { role: Agency, name: BBDO New York }
  - { role: Interactive, name: The Barbarian Group }
  - { role: Director, name: Noam Murro }
  - { role: Production, name: Biscuit Filmworks }
  - { role: Visual effects, name: Animal Logic }
  - { role: Editorial, name: Butcher Editorial }
recognition:
  - Cannes Lions 2010, Bronze, Titanium and Integrated
  - Clio Awards 2010, Silver, Integrated Campaign
  - The One Show 2010, Pencil winner, Entertainment
  - Communication Arts, featured project
press:
  - { title: HBO Imagine Sets a New Bar for Interactive Fiction, source: GigaOm, url: "https://archive.nytimes.com/www.nytimes.com/external/gigaom/2009/09/21/21gigaom-hbo-imagine-sets-a-new-bar-for-interactive-fiction-969.html" }
  - { title: "HBO Imagine: Clues, Cubes and Mimes", source: Tubefilter, url: "https://www.tubefilter.com/2009/10/04/hbo-imagine-clues-cubes-and-mimes/amp/" }
  - { title: It’s more than you imagined, source: Communication Arts, url: "https://www.commarts.com/project/15244/it-s-more-than-you-imagined" }
---

HBO Imagine was the centrepiece of HBO’s 2009 campaign “It’s more than you imagined,” created by BBDO New York with The Barbarian Group. It followed Voyeur, BBDO’s earlier interactive film for HBO.

The site opened on a story cube: a two-minute film, *The Affair*, shot from four sides at once. Dragging the cube round switched angles while the scene played, and each side showed something the others missed. A second cube, *Heist*, followed. Together they opened into a branching story of 41 more videos, audio recordings, images, and news stories, with art theft, a bomb squad, teddy bears, and mimes, which viewers pieced together themselves. A Chart Your Progress view laid the story out roughly in order, showing how the pieces connected and how much was left to find. Once everything was unlocked, a final film tied it together.

I was the technical lead at The Barbarian Group and wrote the entire web experience in Flash.

The four angles had to stay in step, even with the cube turned to a corner and two sides showing at once. Rather than play four videos side by side, I composited all four angles into a single video and used it as the texture for every side of the cube, offsetting and cropping it so each side showed its own angle. One video meant one clock, so the sides could never drift apart.

<figure class="diagram"><svg viewBox="0 0 520 248" role="img" aria-labelledby="d-title d-desc"><title id="d-title">One video, four sides</title><desc id="d-desc">A single video frame split into four quarters, angles 1 to 4, with one playhead on one timeline. Each quarter is offset and cropped onto its own side of the cube: angles 1 and 2 on the two sides showing with the cube turned to a corner, angles 3 and 4 on the two sides facing away, shown on a plan of the cube from above.</desc><defs><marker id="d-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 L10 5 L0 10 Z" class="d-head"/></marker></defs><text class="d-label" x="16" y="26">One video</text><rect class="d-tone" style="fill-opacity:0.14" x="16" y="40" width="100" height="56"/><text class="d-tag" x="24" y="58">Angle 1</text><rect class="d-tone" style="fill-opacity:0.3" x="116" y="40" width="100" height="56"/><text class="d-tag" x="124" y="58">Angle 2</text><rect class="d-tone" style="fill-opacity:0.46" x="16" y="96" width="100" height="56"/><text class="d-tag" x="24" y="114">Angle 3</text><rect class="d-tone" style="fill-opacity:0.64" x="116" y="96" width="100" height="56"/><text class="d-tag" x="124" y="114">Angle 4</text><rect class="d-frame" x="16" y="40" width="200" height="112"/><text class="d-label d-mid" x="277" y="88">Offset + crop</text><line class="d-link" x1="232" y1="98" x2="322" y2="98" marker-end="url(#d-arrow)"/><text class="d-label" x="348" y="26">Four sides</text><path class="d-face d-top" d="M348 60 L400 40 L452 60 L400 80 Z"/><path class="d-back" d="M348 60 L400 80 L400 160 L348 140 Z M400 80 L452 60 L452 140 L400 160 Z"/><path class="d-tone d-face" style="fill-opacity:0.14" d="M348 60 L400 80 L400 160 L348 140 Z"/><path class="d-tone d-face" style="fill-opacity:0.3" d="M400 80 L452 60 L452 140 L400 160 Z"/><text class="d-tag d-mid" x="374" y="118">1</text><text class="d-tag d-mid" x="426" y="118">2</text><line class="d-time" x1="16" y1="190" x2="216" y2="190"/><path class="d-play" d="M90 182 L102 182 L96 190 Z"/><line class="d-play-line" x1="96" y1="190" x2="96" y2="200"/><text class="d-small" x="108" y="186">00:42</text><text class="d-label" x="16" y="222">One clock</text><path class="d-edge" style="stroke-opacity:0.48400000000000004" d="M372 210 L400 238"/><path class="d-edge" style="stroke-opacity:0.5800000000000001" d="M400 238 L428 210"/><path class="d-edge" style="stroke-opacity:0.676" d="M428 210 L400 182"/><path class="d-edge" style="stroke-opacity:0.784" d="M400 182 L372 210"/><text class="d-small d-mid" x="378" y="238">1</text><text class="d-small d-mid" x="422" y="238">2</text><text class="d-small d-mid" x="424" y="192">3</text><text class="d-small d-mid" x="376" y="192">4</text><text class="d-label" x="446" y="206">From</text><text class="d-label" x="446" y="220">above</text></svg><figcaption class="mono">All four angles live in one video. Each side of the cube shows its own quarter, so they share a single clock.</figcaption></figure>





The cube below works the same way. The scene is a greybox of the gallery from *Heist*, modelled and rendered in Blender.

Offline, the same four-sided film played on a 14-foot cube that toured New York, Philadelphia, and Washington, D.C.
