---
title: Cuervo Nation
client: Jose Cuervo
agency: The Barbarian Group
partners: [Tribal DDB]
year: 2005
role: Technical Lead
hero:
  src: /advertising/cuervo-nation/original-site.jpg
  width: 1768
  height: 1128
  alt: The Cuervo Nation site in 2005. An aerial photo of a small wooded island ringed by turquoise shallows, with a black and gold Cuervo Nation flag flying over red-roofed buildings and a numbered pin on the shore. Zoom and scroll controls and a volume slider sit at the top left, a banner in the corner reads Current Citizenship 5120, and a wave of gold tequila along the bottom carries the Cuervo Nation logo, “No politics. Just parties.”, and a Welcome to CuervoNation menu beside two bottles.
  caption: The original 2005 Flash site
summary: An explorable map of a Caribbean island nation run by Jose Cuervo. Drag and zoom across a high-resolution aerial photo, built from hundreds of dynamically loaded tiles.
---

Cuervo Nation was a Flash site for Jose Cuervo, made by The Barbarian Group with Tribal DDB. It presented a Caribbean island as a nation of its own, and the site was its map. Visitors dragged around an aerial photo of the island and zoomed in with a four-step slider, where numbered pins opened sections about life there, and a few hidden extras, a message in a bottle and a party shark among them, waited to be found.

Building the map was the central challenge. Its job was to make one big photo feel immediate: the island had to be on screen right away, and it had to stay sharp at every zoom.

There were four zoom levels. The widest fit the whole island on the 884 × 564 stage, and the closest was four and a half times larger, nearly 4,000 pixels across. Each level was cut into a grid of tiles, 221 × 141 pixels each: 16 at the widest zoom, then 64, 196, and 324 at the closest. One image of the whole island was built into the site. Every tile, even at the widest zoom, was a separate JPG, loaded as it was needed.

Zooming worked in two passes. First, the whole-island image built into the site scaled up to the new size while the view slid to its new position, so the change felt instant, if soft. When the slide finished, the tiles for that level began to load over the top, sharpening the picture piece by piece.

<sketch-demo name="cuervo-tiles" title="The four zoom levels of the Cuervo Nation map, loading tile by tile"></sketch-demo>

The order mattered. A level's tiles loaded one at a time, sorted by their distance from the centre of the view, so the part of the map the visitor was looking at came in first and the rest followed in rings around it. A small load sequencer worked through the queue, and it could stop as soon as the visitor zoomed again, so it never spent time on a level they had already left.

