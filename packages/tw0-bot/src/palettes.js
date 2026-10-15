// Colour schemes drawn from mecha in Gundam, Macross and The Five Star Stories.
// Each has a background, a backing that shows between the tiles, the main
// armour colour, and three accents in order of how much of the robot they
// cover: a secondary armour colour, then trim, then small details such as
// vents, sensors and markings.
export const palettes = [
  // Gundam
  {
    name: "RX-78-2",
    background: "#2B3A55",
    backing: "#11151F",
    main: "#F4F1E8",
    accents: ["#1F4FA8", "#D42A2A", "#F2C230"],
  },
  {
    name: "Zaku II",
    background: "#E6E1CF",
    backing: "#22301F",
    main: "#6C8B57",
    accents: ["#3E5B3A", "#8A8F8A", "#FF4D8D"],
  },
  {
    name: "Char's Zaku",
    background: "#E9E2D6",
    backing: "#3A1218",
    main: "#D9575A",
    accents: ["#8A2A35", "#9A9A9A", "#FF4D8D"],
  },
  {
    name: "Sazabi",
    background: "#BFB8B0",
    backing: "#3A0A12",
    main: "#C8202F",
    accents: ["#7A1420", "#D9A441", "#5A5D63"],
  },
  {
    name: "Unicorn, Destroy Mode",
    background: "#1C1E24",
    backing: "#000000",
    main: "#F2F2F0",
    accents: ["#FF2E3A", "#8C8F96", "#F2C230"],
  },
  {
    name: "Banshee",
    background: "#EDE7DA",
    backing: "#0E0E10",
    main: "#26262B",
    accents: ["#D8A93B", "#6E7178", "#6BE08A"],
  },
  {
    name: "Exia",
    background: "#D7E2EA",
    backing: "#18233A",
    main: "#F4F4F2",
    accents: ["#2357B5", "#D42A2A", "#3CC48A"],
  },
  {
    name: "Gouf",
    background: "#E8E4DA",
    backing: "#121A33",
    main: "#3E5FA8",
    accents: ["#24386B", "#9A9DA3", "#FF4D8D"],
  },

  // Macross
  {
    name: "VF-1S Skull Leader",
    background: "#8FB7D3",
    backing: "#0E0E0E",
    main: "#F3F1EA",
    accents: ["#1B1B1B", "#F2C230", "#C8202F"],
  },
  {
    name: "VF-1J Hikaru",
    background: "#E7E3D8",
    backing: "#1A1A1A",
    main: "#F5F3EE",
    accents: ["#C8202F", "#1B1B1B", "#F2C230"],
  },
  {
    name: "VF-1A low-vis",
    background: "#9EC6DD",
    backing: "#2A2E33",
    main: "#B9BDBF",
    accents: ["#6A7075", "#F07A28", "#F2C230"],
  },
  {
    name: "VF-19 Fire Valkyrie",
    background: "#1E1A22",
    backing: "#3A0A10",
    main: "#D8262E",
    accents: ["#F5F3EE", "#F2C230", "#1B1B1B"],
  },
  {
    name: "VF-25 Messiah",
    background: "#DCE3E8",
    backing: "#202328",
    main: "#F4F4F2",
    accents: ["#D8262E", "#3B3F46", "#F2C230"],
  },
  {
    name: "VF-27 Lucifer",
    background: "#E2DCE6",
    backing: "#0F0A16",
    main: "#2A1C3D",
    accents: ["#6B3FA0", "#C9A24A", "#E03A6A"],
  },
  {
    name: "Regult",
    background: "#E9E0CC",
    backing: "#2A2018",
    main: "#8FA3B0",
    accents: ["#C9B78F", "#5D6B75", "#E8453C"],
  },

  // The Five Star Stories
  {
    name: "Knight of Gold",
    background: "#1D2240",
    backing: "#0B0D1A",
    main: "#C9A24A",
    accents: ["#F2EEE3", "#B1252E", "#2F3D7A"],
  },
  {
    name: "Engage SR1",
    background: "#E6E8EE",
    backing: "#1A2240",
    main: "#F4F3EF",
    accents: ["#3A6BC9", "#C9A24A", "#B1252E"],
  },
  {
    name: "L.E.D. Mirage",
    background: "#2A2F45",
    backing: "#0D1020",
    main: "#C9C6D8",
    accents: ["#2F3D7A", "#C9A24A", "#B1252E"],
  },
  {
    name: "Jagd Mirage",
    background: "#E8E0CE",
    backing: "#0E0C08",
    main: "#2B2620",
    accents: ["#C9A24A", "#8C2A2A", "#E8E2D2"],
  },
];

// Main armour, secondary armour, trim, details.
export const paletteWeights = [78, 12, 6, 4];
