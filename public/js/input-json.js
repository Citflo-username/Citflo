// Sample JSON data
const data = {
    nodes: [
    { id: "A", alias: "Urine", type: "input", color: "yellow", COD: 15000, N: 15000, P: 1200, Q: 0.7, gravity: 0.1, xBias: -800 },
    { id: "H", alias: "Valorisation", type: "input", color: "#32cd32", COD: 15000, N: 15000, P: 1200, Q: -0.01, gravity: 0.1, xBias: -500 },
    { id: "N", alias: "Composting Toilet", type: "input", color: "brown", COD: 350000, N: 5000, P: 3000, Q: -0.01, gravity: 0.1, xBias: -300 },
    { id: "C", alias: "Eaux de lavage", type: "input", color: "magenta", COD: 500, N: 33, P: 0.15, Q: 120, gravity: 0.1, xBias: -200 },
    { id: "B", alias: "Matière fécale", type: "input", color: "brown", COD: 350000, N: 5000, P: 3000, Q: 0.2, gravity: 0.1, xBias: -600 },
    { id: "K", alias: "Amont", type: "input", color: "#1e90ff", COD: 1, N: 0.1, P: 0.04, Q: 10000000, gravity: 0, xBias: 200 },


    { id: "J", alias: "Boues et minéralisation", type: "input", color: "brown", COD: 150000, N: 1000, P: 3000, Q: -0.01, gravity: 5, xBias: -10 },

    { id: "G", alias: "Urine diversion", type: "calculated", color: "grey", COD: 0, N: 0, P: 0, Q: 0, gravity: 0.05, xBias: 0 },
    { id: "M", alias: "Fecal diversion", type: "calculated", color: "grey", COD: 0, N: 0, P: 0, Q: 0, gravity: 0.05, xBias: 0 },
    { id: "D", alias: "Eaux à traiter", type: "calculated", color: "grey", COD: 0, N: 0, P: 0, Q: 0, gravity: 0.05, xBias: 0 },
    { id: "E", alias: "Traitement sur site", type: "calculated", color: "grey", COD: 0, N: 0, P: 0, Q: 0, gravity: 0.05, xBias: 100 },
    { id: "F", alias: "Lac", type: "calculated", color: "#1e90ff", COD: 0, N: 0, P: 0, Q: 0, gravity: 0.05, xBias: 200 },
    { id: "L", alias: "Aval", type: "calculated", color: "#1e90ff", COD: 0, N: 0, P: 0, Q: 0, gravity: -0.2, xBias: -200 },

    ],
    links: [
    { source: "A", target: "G" },
    { source: "G", target: "M" },
    { source: "M", target: "D" },
    { source: "H", target: "G" },
    { source: "N", target: "M" },
    { source: "B", target: "M" },
    { source: "C", target: "D" },
    { source: "D", target: "E" },

    { source: "J", target: "E" },

    { source: "E", target: "F" },

    { source: "K", target: "F" },
    { source: "F", target: "L" },
    ]
};