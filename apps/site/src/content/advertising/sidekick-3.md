---
title: Sidekick 3
client: T-Mobile
agency: The Barbarian Group
partners: [Publicis West]
year: 2006
role: Technical Lead
hero:
  src: /advertising/sidekick-3/newsstand.jpg
  width: 1089
  height: 641
  alt: The Sidekick 3 site in 2006. An illustrated city street with a newsstand marked Bad News and Good News, a girl in a pink dress and boots holding a DJ turntable rig, and a boy in a number 8 jersey sitting on the pavement sorting records, under a navigation bar reading Buy Now, Demo It, Kick It to a Friend, Sidekick Events, Support.
  caption: The original 2006 Flash site, illustrated by We Love Dust
images:
  - src: /advertising/sidekick-3/skate-street.jpg
    width: 1093
    height: 615
    alt: Another street in the site. A kid in a panda mask skates past a corner building with wrought-iron balconies while a skater in a giraffe mask rides behind, in front of a Costumes shop with pink deer heads mounted over the windows and a crew painting graffiti on a wall.
    caption: Exploring the street, with the IM feature waiting below
  - src: /advertising/sidekick-3/instant-messaging.jpg
    width: 1088
    height: 612
    alt: The instant messaging demo. Furry gorilla hands hold a Sidekick 3 with its keyboard out, its screen showing a chat from RAGR7 asking which costume to rock, with octopus, gorilla, and lizard buddy icons popping up above it.
    caption: Demoing instant messaging, one feature at a time
summary: The brand site for T-Mobile's Sidekick 3. An illustrated street to wander, where each corner showed off something the new phone could do, and new features unlocked in the weeks before launch.
recognition:
  - Communication Arts, featured project
press:
  - { title: T-Mobile Takes Sidekick a Walk, source: Ad Age, url: "https://adage.com/article/adcritic-interactive/t-mobile-takes-sidekick-a-walk/123849/" }
  - { title: T-Mobile Sidekick 3, source: Communication Arts, url: "https://www.commarts.com/project/6919/t-mobile-sidekick-3" }
  - { title: Sidekick 3 Minisite, source: The Barbarian Group, url: "https://web.archive.org/web/20121028125444/http://barbariangroup.com/portfolio/sidekick_3_minisite" }
---

The Sidekick 3 was T-Mobile’s 2006 successor to its messaging phone with the swivel screen and full keyboard, a device with a strong following among younger consumers. The Barbarian Group built the brand site in partnership with Publicis West and the illustration studio We Love Dust.

The site presented an illustrated city for visitors to explore, drawn by We Love Dust and animated in Flash throughout. Each scene introduced a feature of the phone: a DJ at a newsstand, skaters in animal masks outside a costume shop, a gorilla sending an instant message. The site launched ahead of the phone, and further features were unlocked in the weeks leading up to its release.

As technical lead, I designed and built the tiling parallax scrolling engine that the site ran on. Each scene was composed of layers, from the skyline in the background to the street and characters in the foreground. As visitors interacted, the scene scrolled horizontally, with each layer moving at a different speed to give the flat illustrations a sense of depth.

<sketch-demo name="sidekick-parallax" title="How the layers of the Sidekick 3 street looped"></sketch-demo>

The street ran all the way round, with no start or end, so every layer had to loop with it. Each layer was a ring of tiles, and its length was set by its speed. A layer that scrolled at half the pace of the street had a ring half as long. Sized that way, all of the rings came back to the same place together after one lap.

Each part of the street also had its own soundscape. The engine blended these as the visitor moved, fading each one in as its scene came into view and out as it scrolled away.

I was also responsible for all of the animation, including the timeline animation for the on-screen characters and the build-in transition that introduced the city scene once the site had loaded.
