---
title: Face Retirement
client: Merrill Edge
agency: Publicis
partners: [Starcom MediaVest Group]
year: 2012
role: Frontend Technical Lead
hero:
  src: /advertising/face-retirement/age-107.jpg
  width: 1085
  height: 657
  alt: The Face Retirement site in 2012. A man’s face aged to 107 fills the centre panel, deeply lined and grey-haired. To the left, a panel headed Age 107 jokes about working that long; to the right, Year 2082, with a gallon of gasoline at $39.88 and the cost of living up 939%. Below, a strip headed Meet the Future You shows the same face at 37, 47, 57, 67, 77, 87, 97, and 107.
  caption: The original 2012 site, as shown in WIRED
summary: Take a photo with your webcam and meet yourself at 67, 87, and 107. A face aging tool from Merrill Edge that put an older face, and that year’s prices, to the idea of saving for retirement.
recognition:
  - IAB MIXX Awards 2014, Gold, Cross-Media Integration, Social and Branded Content
  - The Internationalist Awards for Innovation in Media 2013, Winner, Innovative Digital Marketing
press:
  - { title: Know What You’ll Look Like in 30 Years — Maybe Then You’ll Max Out Your 401(k), source: WIRED, url: "https://www.wired.com/2012/12/retirement-magic-mirror/" }
  - { title: Digital Tool Ages Your Face To Scare You Into Saving Money, source: Popular Science, url: "https://www.popsci.com/technology/article/2012-12/retirement-tool-ages-faces-encourage-people-save-money/" }
  - { title: Using scary online photos to motivate saving for retirement, source: Marketplace, url: "https://marketplace.org/2012/12/06/using-scary-online-photos-motivate-saving-retirement" }
  - { title: "Face It, You’re Getting Old, Merrill Tells Customers", source: American Banker, url: "https://www.americanbanker.com/news/face-it-youre-getting-old-merrill-tells-customers" }
---

Face Retirement was a web app for Merrill Edge, Bank of America’s online brokerage, launched in December 2012 by Starcom MediaVest Group. It started from a Stanford study: people find it hard to save for a future self who feels like a stranger, and those shown an aged image of themselves were more willing to put money away.

Visitors entered their age and gender, then took a photo with their webcam. A face aging algorithm turned the photo into a row of future selves, a decade apart, all the way to 107. Each age came with the year it would arrive and what things might cost by then, so a face at 107 sat beside a $39.88 gallon of gas in 2082. From there, visitors could share their older selves on Facebook or look at opening a Merrill Edge IRA.

I worked at Publicis, Starcom’s sister company in the same building, as a shared resource on the project. As Frontend Technical Lead, I built the front end of the site.

The most involved part was the webcam capture: asking for the camera, helping visitors frame their face, and taking a photo the aging algorithm could work with. It needed no custom image processing, only the camera APIs that were already there, but it was the step every visitor had to get through before they saw anything.

The site was picked up widely, from WIRED to Marketplace. More than 450,000 people tried it in its first months, and around one in ten shared their aged photo on Facebook.
