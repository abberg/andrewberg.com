---
title: Max My Dream
client: Pepcid
agency: The Barbarian Group
partners: [JWT]
year: 2011
role: Developer
images:
  - src: /advertising/max-my-dream/dream-input.png
    width: 450
    height: 343
    alt: The Max My Dream home screen. A full moon over a night sky behind a curtain, and a text box reading “I dreamed that… an army of intelligent sea robots invaded the universe and took over the city!” with 62 characters left and a Max my Dream button.
    caption: Typing a dream, up to 140 characters
  - src: /advertising/max-my-dream/sea-robots.png
    width: 450
    height: 343
    alt: The same dream played back. A row of green wind-up robots wades through stylised waves in front of a dark city skyline, with glowing pink brains floating in the sky.
    caption: “An army of intelligent sea robots…”
  - src: /advertising/max-my-dream/faces.png
    width: 450
    height: 343
    alt: Another dream. A silhouetted figure stands among large illustrated faces grimacing in anger, under clouds with eyes peering out of the sky.
    caption: The dreamer in silhouette, among the cast
  - src: /advertising/max-my-dream/share.png
    width: 450
    height: 343
    alt: The end of a dream. Under the line “Start dreaming, heartburn free,” a box reads “Your dream now lives at” with a short maxmydream.com URL and buttons for Facebook, Twitter, email, and embed, then Replay Dream and Max another Dream.
    caption: Every dream got its own link
summary: Type a dream in 140 characters and watch it play. A language parser read each sentence for its characters, actions, and mood, and Flash animated it from a library of illustrated scenes.
press:
  - { title: Who Knew Heartburn Meds Could Be So Dreamy?, source: Adweek AgencySpy, url: "https://www.adweek.com/agencyspy/who-new-heartburn-meds-could-be-so-dreamy/" }
  - { title: Dream a little dream…of flying space tigers, source: The Barbarian Group, url: "https://web.archive.org/web/20121118060512/http://barbariangroup.com/posts/7389-dream_a_little_dream_of_flying_space_tigers" }
---

Max My Dream was a minisite for Pepcid Max, made by The Barbarian Group with JWT and launched in January 2011. Its pitch was the sweet dreams you have after a night free of heartburn. Visitors typed a dream of up to 140 characters, pressed Max My Dream, and the curtain of a night sky opened onto it, played out as a short animation over a music box loop. Then it faded, and each dream got its own link to share or embed.

Behind the curtain was a language problem. A natural language processor parsed each short sentence for its grammar, with an eye on internet slang, and pulled out the main characters, the actions, the mood, and the bystanders. It matched those against a database of everything the team could think of and illustrate, from pets to Kim Kardashian, mapped to the many ways people say the same thing: walking, strolling, trotting. The matches became a set of illustrations and animation templates, drawn by a dozen illustrators, that Flash assembled and played back.

Parsing was slow and expensive, so dreams went into a central queue and a pool of language servers worked through them. New servers could be added in minutes when traffic spiked.
