---
title: HBO Imagine
client: HBO
agency: The Barbarian Group
partners: [BBDO New York]
year: 2009
role: Technical lead
recreation: hbo-cube
summary: An interactive mystery told through a four-sided story cube. Spin it to change angles mid-scene, then piece together the story from 41 more films, recordings, and clues.
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

The cube above works the same way. The scene is a greybox of the gallery from *Heist*, modelled and rendered in Blender.

Offline, the same four-sided film played on a 14-foot cube that toured New York, Philadelphia, and Washington, D.C.
