---
title: Max My Dream
client: Pepcid
agency: The Barbarian Group
partners: [JWT]
year: 2011
role: Frontend Technical Lead
film:
  src: /advertising/max-my-dream/case-study.mp4
  poster: /advertising/max-my-dream/case-study-poster.jpg
  width: 1280
  height: 720
  title: Max My Dream case study
  caption: The case study film, from the Clio Health 2011 entry
images:
  - src: /advertising/max-my-dream/dream-input.jpg
    width: 624
    height: 424
    alt: The Max My Dream home screen. A full moon over a night sky behind a curtain, and a text box reading “I dreamed that… an army of intelligent sea robots invaded the universe and took over the city!” with a character count and a Max my Dream button.
    caption: Typing a dream, up to 140 characters
  - src: /advertising/max-my-dream/parsing.jpg
    width: 624
    height: 424
    alt: The dream being read. Words from the sentence, army, invaded, intelligent, sea robots, took, drift around an alarm clock whose face fills in as it works.
    caption: Reading the dream, word by word
  - src: /advertising/max-my-dream/sea-robots.jpg
    width: 624
    height: 424
    alt: The same dream played back. A row of green wind-up robots wades through stylised waves in front of a dark city skyline, with glowing pink brains floating in the sky.
    caption: “An army of intelligent sea robots…”
  - src: /advertising/max-my-dream/faces.png
    width: 438
    height: 308
    alt: Another dream. A silhouetted figure stands among large illustrated faces grimacing in anger, under clouds with eyes peering out of the sky.
    caption: The dreamer in silhouette, among the cast
summary: Type a dream in 140 characters and watch it play. A language parser read each sentence for its characters, actions, and mood, and Flash animated it from a library of illustrated scenes.
recognition:
  - Clio Health 2011, Bronze, Innovative Media
press:
  - { title: Who Knew Heartburn Meds Could Be So Dreamy?, source: Adweek AgencySpy, url: "https://www.adweek.com/agencyspy/who-new-heartburn-meds-could-be-so-dreamy/" }
  - { title: Dream a little dream…of flying space tigers, source: The Barbarian Group, url: "https://web.archive.org/web/20121118060512/http://barbariangroup.com/posts/7389-dream_a_little_dream_of_flying_space_tigers" }
---

Max My Dream was a minisite for Pepcid Max, made by The Barbarian Group with JWT and launched in January 2011. Its pitch was the sweet dreams you have after a night free of heartburn. Visitors typed a dream of up to 140 characters, pressed Max My Dream, and the curtain of a night sky opened onto it, played out as a short animation over a music box loop. Then it faded, and each dream got its own link to share or embed.

Behind the curtain was a language problem. A natural language processor parsed each short sentence for its grammar, with an eye on internet slang, and pulled out the main characters, the actions, the mood, and the bystanders. It matched those against a database of everything the team could think of and illustrate, from pets to Kim Kardashian, mapped to the many ways people say the same thing: walking, strolling, trotting. The matches became a set of illustrations and animation templates, drawn by a dozen illustrators, that Flash assembled and played back.

I wrote the Flash player that put the scenes together. It took the parser’s output, a list of characters, actions, settings, and a mood, and built each dream from it at playback: loading the illustrations, placing them in a scene, and running the animation templates that moved them.

I also built the base animation templates. Other developers wrote effects that layered on top, so I worked with them to agree on an event API: the templates fired triggers as they played, and each effect listened for them to stay in sync with the animation.

Parsing was slow and expensive, so dreams went into a central queue and a pool of language servers worked through them. New servers could be added in minutes when traffic spiked.
