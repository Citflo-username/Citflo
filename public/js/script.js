// todo
// make connection from amont to lac to aval a bezier curve
// on hover, remove type and display units of L/d and g/d
// make removals of COD, TP and N in Boues user adjustable within range
// add Narrative element at top
// remove boues from display input nodes because we have master siwtch
// Banner stating Effluent P from treatment system and whether it meets 1 mg/L threshold
// Banner stating impact of effluent on lake concentration and load

// =============================================================================
// NETWORK FLOW VISUALIZATION - CLEANED VERSION
// =============================================================================

// Configuration constants
const CONFIG = {
    arrowheadRefX: 8,
    arrowLinkDistance: 100,
    circleR: 10,
    minArrowWidth: .6,
    markerWidth: 6,
    markerHeight: 60,
    dimensions: {
        width: window.innerWidth * 0.75,
        height: window.innerHeight
    },
    forces: {
        charge: -200,
        collision: 30,
        gravity: 0.2,
        xspread: 0.3,
        yGravity: 0.05,
        xBias: 0.1
    }
};

// =============================================================================
// STATE MANAGEMENT
// =============================================================================

let selectedInputNode = "A"; // Default to Urine
let thicknessBasis = "Q*P";
let isLogScale = true; // New state for scale toggle
let householdSettings = {
    litresPerPerson: 250,
    numberOfPeople: 1
};
let urineDiversion = false
let fecalDiversion = false

// =============================================================================
// BUSINESS LOGIC
// =============================================================================

/**
 * Updates flow calculations for Boues and related nodes
 */
function updateBouesFlow() {
    const eauxNode = data.nodes.find(n => n.alias === "Eaux à traiter");
    const bouesNode = data.nodes.find(n => n.alias === "Boues et minéralisation");
    // const mineralizationNode = data.nodes.find(n => n.alias === "Minéralisation");
    const valorisation = data.nodes.find(n => n.alias === "Valorisation");
    const fecalValorisation = data.nodes.find(n => n.alias === "Composting Toilet");
    const urine = data.nodes.find(n => n.alias === "Urine");
    const fecal = data.nodes.find(n => n.alias === "Matière fécale");

    if (eauxNode && bouesNode) {
        bouesNode.Q = -0.2
        bouesNode.P = 0.3 * eauxNode.P * eauxNode.Q / -bouesNode.Q
        bouesNode.N = 0.3 * eauxNode.N * eauxNode.Q / -bouesNode.Q
        bouesNode.COD = 0.8 * eauxNode.COD * eauxNode.Q / -bouesNode.Q

        calculateNodeValues(data.nodes, data.links);
        updateVisualization();
    } else {
        console.warn("Required nodes ('Eaux à traiter' or 'Boues') not found.");
    }

    if (urineDiversion === true) {
        valorisation.Q = -urine.Q
    } else {
        valorisation.Q = 0
    }

    if (fecalDiversion === true) {
        fecalValorisation.Q = -fecal.Q
    } else {
        fecalValorisation.Q = 0
    }

}

/**
 * Updates household flow calculations based on user inputs
 */
function updateHouseholdFlows() {
    const { numberOfPeople, litresPerPerson } = householdSettings;
    
    const lavageNode = data.nodes.find(d => d.alias === "Eaux de lavage");
    const urineNode = data.nodes.find(d => d.alias === "Urine");
    const fecalNode = data.nodes.find(d => d.alias === "Matière fécale");

    if (lavageNode) lavageNode.Q = numberOfPeople * litresPerPerson;
    if (urineNode) urineNode.Q = numberOfPeople * 0.7;
    if (fecalNode) fecalNode.Q = numberOfPeople * 0.2;

    
    calculateNodeValues(data.nodes, data.links);
    updateBouesFlow();
    updateVisualization();
    
}

/**
 * Helper function to get ID from link source/target
 */
function getLinkId(linkNode) {
    return typeof linkNode === 'string' ? linkNode : linkNode.id;
}

/**
 * Calculate values for calculated nodes with proper handling of negative values
 */
function calculateNodeValues(nodes, links) {
    nodes.forEach(node => {
        if (node.type === "calculated") {
            const incoming = links.filter(link => getLinkId(link.target) === node.id);
            let totalQ = 0;
            let weightedCOD = 0, weightedN = 0, weightedP = 0;
            
            incoming.forEach(link => {
                const sourceNode = nodes.find(n => n.id === getLinkId(link.source));
                if (sourceNode) {
                    totalQ += sourceNode.Q;
                    weightedCOD += sourceNode.Q * sourceNode.COD;
                    weightedN += sourceNode.Q * sourceNode.N;
                    weightedP += sourceNode.Q * sourceNode.P;
                }
            });

            node.Q = totalQ;
            if (totalQ > 0) {
                node.COD = weightedCOD / totalQ;
                node.N = weightedN / totalQ;
                node.P = weightedP / totalQ;
            } else {
                node.COD = 0;
                node.N = 0;
                node.P = 0;
            }
        }
    });
}

// =============================================================================
// VISUALIZATION SETUP
// =============================================================================

// Initial calculations
calculateNodeValues(data.nodes, data.links);

// SVG setup
const svg = d3.select("#graph")
    .append("svg")
    .attr("width", CONFIG.dimensions.width)
    .attr("height", CONFIG.dimensions.height);

// Define markers (arrowheads)
function setupMarkers() {
    const defs = svg.append("defs");
    
    // Regular arrow
    defs.append("marker")
        .attr("id", "arrow")
        .attr("viewBox", "0 -5 10 10")
        .attr("refX", CONFIG.arrowheadRefX)
        .attr("refY", 0)
        .attr("markerWidth", CONFIG.markerWidth)
        .attr("markerHeight", CONFIG.markerHeight)
        .attr("orient", "auto")
        .append("path")
        .attr("d", "M0,-5L10,0L0,5")
        .attr("fill", "#ccc");

    // Reverse arrow
    defs.append("marker")
        .attr("id", "arrow-reverse")
        .attr("viewBox", "0 -5 10 10")
        .attr("refX", 2)
        .attr("refY", 0)
        .attr("markerWidth", CONFIG.markerWidth)
        .attr("markerHeight", CONFIG.markerWidth)
        .attr("orient", "auto")
        .append("path")
        .attr("d", "M10,-5L0,0L10,5")
        .attr("fill", "#ccc");
}

// Force simulation setup
function setupSimulation() {
    const calculatedNodes = data.nodes.filter(d => d.type === "calculated");
    const xScale = d3.scaleLinear()
        .domain([0, calculatedNodes.length - 1])
        .range([100, CONFIG.dimensions.width - 100]);

    const calculatedNodeIndices = new Map(
        calculatedNodes.map((d, i) => [d.id, i])
    );

    return d3.forceSimulation(data.nodes)
        .force("link", d3.forceLink(data.links).id(d => d.id).distance(CONFIG.arrowLinkDistance))
        .force("charge", d3.forceManyBody().strength(CONFIG.forces.charge))
        .force("center", d3.forceCenter(CONFIG.dimensions.width / 2, CONFIG.dimensions.height / 2))
        .force("collision", d3.forceCollide().radius(CONFIG.forces.collision))
        .force("gravity", d3.forceY(d => d.type === "calculated" ? CONFIG.dimensions.height * 0.75 : CONFIG.dimensions.height / 2)
            .strength(d => d.type === "calculated" ? CONFIG.forces.gravity : 0))
        .force("xspread", d3.forceX(d => {
            if (d.type === "calculated") {
                const i = calculatedNodeIndices.get(d.id);
                return xScale(i);
            }
            return CONFIG.dimensions.width / 2;
        }).strength(d => d.type === "calculated" ? CONFIG.forces.xspread : 0))
        .force("yGravity", d3.forceY(d => CONFIG.dimensions.height / 2).strength(d => d.gravity ?? CONFIG.forces.yGravity))
        .force("xBias", d3.forceX(d => CONFIG.dimensions.width / 2 + (d.xBias ?? 0)).strength(CONFIG.forces.xBias));
}

// =============================================================================
// VISUAL ELEMENTS
// =============================================================================

// Setup markers
setupMarkers();

// Create simulation
const simulation = setupSimulation();

// Create links
let link = svg.append("g")
    .selectAll("line")
    .data(data.links)
    .enter()
    .append("line")
    .attr("stroke", "#ccc")
    .attr("stroke-dasharray", d => {
        // Make Mineralisation line dashed
        const sourceNode = data.nodes.find(n => n.id === getLinkId(d.source));
        return sourceNode && sourceNode.alias === "Minéralisation" ? "5,5" : null;
    })
    .attr("marker-start", d => {
        const source = data.nodes.find(n => n.id === getLinkId(d.source));
        return source && source.Q < 0 ? "url(#arrow-reverse)" : null;
    })
    .attr("marker-end", d => {
        const source = data.nodes.find(n => n.id === getLinkId(d.source));
        return source && source.Q >= 0 ? "url(#arrow)" : null;
    });

// Create nodes
const node = svg.append("g")
    .selectAll("circle")
    .data(data.nodes)
    .enter()
    .append("circle")
    .attr("r", CONFIG.circleR)
    .attr("fill", d => d.color || "#888")
    .attr("stroke", "#fff")
    .attr("stroke-width", 2)
    .style("opacity", d => {
        // Hide Mineralisation node
        if (d.alias === "Minéralisation") return 0;
        return d.Q === 0 ? 0 : 1;
    })
    .call(d3.drag()
        .on("start", dragstarted)
        .on("drag", dragged)
        .on("end", dragended));

// Create labels
const labelsGroup = svg.append("g")
    .selectAll("g")
    .data(data.nodes)
    .enter()
    .append("g")
    .style("pointer-events", "none");

// Node alias labels
labelsGroup.append("text")
    .attr("class", "node-alias")
    .attr("text-anchor", "middle")
    .attr("dy", d => {
        // Lower alias by 2em for special nodes so it appears one line above g/d de P
        const specialNodes = ["Matière fécale", "Minéralisation", "Boues et minéralisation"];
        return specialNodes.includes(d.alias) ? "1.5em" : "0em";
    })
    .style("font-weight", "bold")
    .text(d => {
        if (d.alias === "Urine diversion") return "";
        return d.alias
    });

// Flow rate labels (conditional display)
labelsGroup.append("text")
    .attr("class", "node-flow")
    .attr("text-anchor", "middle")
    .attr("dy", "1em")
    .style("font-size", "12px")
    .style("font-style", "italic")
    .text(d => {
        // Don't show "Litres par jour" for specific nodes
        if (d.alias === "Urine diversion") return "";
        const excludeFlow = ["Matière fécale", "Minéralisation", "Boues et minéralisation"];
        return excludeFlow.includes(d.alias) ? "" : `${Math.abs(d.Q).toFixed(1)} Litres par jour`;
    });

// P concentration labels
labelsGroup.append("text")
    .attr("class", "node-p-concentration")
    .attr("text-anchor", "middle")
    .attr("dy", "2em")
    .style("font-size", "12px")
    .style("font-style", "italic")
    .text(d => {
        // Only show mg/L de P for nodes NOT in the special group
        const specialNodes = ["Matière fécale", "Minéralisation", "Boues et minéralisation", "Eaux à traiter"];
        return specialNodes.includes(d.alias) ? "" : `${d.P < 10 ? d.P.toFixed(1) : d.P.toFixed(0)} mg/L de P`;
    });

// P mass flow labels
labelsGroup.append("text")
    .attr("class", "node-p-mass")
    .attr("text-anchor", "middle")
    .attr("dy", "3em")
    .style("font-size", "12px")
    .style("font-style", "italic")
    .text(d => {
        // Only show g/d de P for the special nodes
        const specialNodes = ["Matière fécale", "Minéralisation", "Boues et minéralisation"];
        return specialNodes.includes(d.alias) ? `${(Math.abs(d.P * d.Q) / 1000).toFixed(2)} g/d de P` : "";
    });

// =============================================================================
// INTERACTIVE FEATURES
// =============================================================================

// Tooltip
const tooltip = d3.select("body")
    .append("div")
    .attr("class", "tooltip")
    .style("opacity", 0);

// Node interactions
node.on("mouseover", function (event, d) {
    if (d.type === "input") {
        d3.select(this).style("cursor", "pointer");
    }
    tooltip.transition().duration(200).style("opacity", 0.9);
    tooltip.html(
        `ID: ${d.id}<br>Alias: ${d.alias}<br>Type: ${d.type}<br>COD: ${d.COD.toFixed(2)}<br>N: ${d.N.toFixed(2)}<br>P: ${d.P.toFixed(2)}<br>Q: ${d.Q.toFixed(2)}`
    )
        .style("left", (event.pageX + 10) + "px")
        .style("top", (event.pageY - 28) + "px");
})
    .on("mouseout", function () {
        tooltip.transition().duration(500).style("opacity", 0);
    })
    .on("click", function (event, d) {
        if (d.type === "input") {
            selectedInputNode = d.id;
            updateInputControls();
        }
    });

// =============================================================================
// UPDATE FUNCTIONS
// =============================================================================

/**
 * Updates link thickness based on selected basis and scale type
 */
function updateLinkThickness() {
    const values = data.nodes.map(d => {
        const val = thicknessBasis === "Q" ? Math.abs(d.Q) :
            thicknessBasis === "Q*COD" ? Math.abs(d.Q * d.COD) :
                thicknessBasis === "Q*N" ? Math.abs(d.Q * d.N) :
                    Math.abs(d.Q * d.P);
        return val > 0 ? val : null;
    }).filter(v => v !== null);

    const minValue = d3.min(values) || 0.01;
    const maxValue = d3.max(values) || 100;

    // Choose scale based on toggle
    const scale = isLogScale ? 
        d3.scaleLog().domain([minValue, maxValue]).range([.01, 10]) :
        d3.scaleLinear().domain([minValue, maxValue]).range([.01, 10]);

    link.attr("stroke-width", d => {
        const source = data.nodes.find(n => n.id === getLinkId(d.source));
        if (!source) return 1;
        const value = thicknessBasis === "Q" ? Math.abs(source.Q) :
            thicknessBasis === "Q*COD" ? Math.abs(source.Q * source.COD) :
                thicknessBasis === "Q*N" ? Math.abs(source.Q * source.N) :
                    Math.abs(source.Q * source.P);
        return value > 0 ? Math.max(CONFIG.minArrowWidth, scale(value)) : 0;
    });
}

/**
 * Updates all label text content
 */
function updateLabels() {
    labelsGroup.select(".node-alias").text(d => {
        if (d.alias === "Fecal diversion") return "";
        if (d.alias === "Urine diversion") return "";
        return d.alias
});
    
    labelsGroup.select(".node-flow").text(d => {
        const excludeFlow = ["Matière fécale", "Minéralisation", "Boues et minéralisation", "Lac"];
        if (d.alias === "Urine diversion") return "";
        if (d.alias === "Fecal diversion") return "";
        return excludeFlow.includes(d.alias) ? "" : `${Math.abs(d.Q.toFixed(1))} Litres par jour`;
    });
    
    labelsGroup.select(".node-p-concentration")
        .style("fill", d => {
            const specialNodes = ["Amont", "Traitement sur site", "Aval"];
            return specialNodes.includes(d.alias) ? "red" : "black";
        })
        .text(d => {
            // Only show mg/L de P for nodes NOT in the special group
            const specialNodes = ["Matière fécale", "Minéralisation", "Boues et minéralisation", "Lac"];
            if (d.alias === "Urine diversion") return "";
            if (d.alias === "Fecal diversion") return "";
            return specialNodes.includes(d.alias) ? "" : `${d.P < 10 ? d.P.toFixed(2) : d.P.toFixed(0)} mg/L de P`;
        });

    
    
    labelsGroup.select(".node-p-mass")
        .text(d => {
            if (d.alias === "Urine diversion") return "";
            if (d.alias === "Fecal diversion") return "";
            if (d.alias === "Lac") return "";
            return `${Math.abs((d.P * d.Q / 1000).toFixed(2))} g/d de P`
        });
}

/**
 * Master update function for visualization
 */
function updateVisualization() {
    updateLinkThickness();
    updateLabels();
    simulation.alpha(0.3).restart();
}

/**
 * Updates input control panel
 */
function updateInputControls() {
    const selectedNode = data.nodes.find(d => d.id === selectedInputNode);
    const inputControlsContainer = d3.select("#input-controls");
    inputControlsContainer.selectAll("*").remove();

    if (selectedNode && selectedNode.type === "input") {
        const controlDiv = inputControlsContainer
            .append("div")
            .classed("selected", true)
            .html(`
                <h3>Node ${selectedNode.id} (${selectedNode.alias})</h3>
                <label>COD:</label><input type="number" id="COD-${selectedNode.id}" value="${selectedNode.COD}" step="0.1"><br>
                <label>N:</label><input type="number" id="N-${selectedNode.id}" value="${selectedNode.N}" step="0.1"><br>
                <label>P:</label><input type="number" id="P-${selectedNode.id}" value="${selectedNode.P}" step="0.1"><br>
                <label>Q:</label><input type="number" id="Q-${selectedNode.id}" value="${selectedNode.Q}" step="0.1"><br>
            `);

        controlDiv.selectAll("input").on("change", function () {
            const [attr, id] = this.id.split("-");
            const node = data.nodes.find(d => d.id === id);
            node[attr] = +this.value;
            calculateNodeValues(data.nodes, data.links);
            updateVisualization();
        });
    }

    inputControlsContainer.append("div")
        .style("margin-top", "20px")
        .style("padding", "10px")
        .style("background", "#e8f4fd")
        .style("border-radius", "5px")
        .style("font-size", "12px")
        .style("color", "#666")
        .html("💡 Click on any blue input node above to edit its values");
}

// =============================================================================
// USER INTERFACE SETUP
// =============================================================================

function setupControlSidebar() {
    const controlPanel = d3.select("#controls");

    // Household settings section
    const householdContainer = controlPanel
        .insert("div", ":first-child")
        .attr("id", "household-settings")
        .style("margin-bottom", "20px")
        .style("padding", "15px")
        .style("background", "#f9f9f9")
        .style("border-radius", "8px")
        .style("border", "1px solid #ddd")
        .html(`
            <h3 style="margin-top: 0;">🏠 Household Settings</h3>

            <div style="margin-bottom: 15px;">
                <label><strong>Number of people in household:</strong></label><br>
                <input type="number" id="people-count" value="${householdSettings.numberOfPeople}" min="1" step="1" style="width:80px; margin-top:5px; padding:5px; border-radius:4px; border:1px solid #ccc;">
            </div>

            <div style="margin-bottom: 15px;">
                <label><strong>Litres used per person:</strong></label><br>
                <input type="number" id="litres-per-person" value="${householdSettings.litresPerPerson}" min="0" max="1000" step="1" style="width:80px; margin-top:5px; padding:5px; border-radius:4px; border:1px solid #ccc;">
            </div>

            <div>
                <label style="display: flex; align-items: center; cursor: pointer;">
                    <input type="checkbox" id="urine-diversion" ${urineDiversion ? 'checked' : ''} style="margin-right:10px; transform: scale(1.2);">
                    <strong>Urine diversion</strong>
                </label>
            </div>
            <div>
                <label style="display: flex; align-items: center; cursor: pointer;">
                    <input type="checkbox" id="fecal-diversion" ${fecalDiversion ? 'checked' : ''} style="margin-right:10px; transform: scale(1.2);">
                    <strong>Fecal diversion</strong>
                </label>
            </div>

        `);

    // Arrow thickness basis selector
    d3.select("#thickness-basis")
        .on("change", function () {
            thicknessBasis = this.value;
            updateLinkThickness();
        });

    // Arrow scale toggle
    d3.select(controlPanel.node())
        .append("div")
        .style("margin-top", "15px")
        .style("padding", "15px")
        .style("background", "#f9f9f9")
        .style("border-radius", "8px")
        .style("border", "1px solid #ddd")
        .html(`
            <label><strong>📊 Arrow Scale:</strong></label><br>
            <div style="margin-top: 10px;">
                <label style="display: block; margin-bottom: 5px; cursor: pointer;">
                    <input type="radio" id="linear-scale" name="scale" value="linear" ${!isLogScale ? 'checked' : ''} style="margin-right: 8px;">
                    Linear Scale
                </label>
                <label style="display: block; cursor: pointer;">
                    <input type="radio" id="log-scale" name="scale" value="log" ${isLogScale ? 'checked' : ''} style="margin-right: 8px;">
                    Logarithmic Scale
                </label>
            </div>
        `);

    // Event listeners for inputs
    d3.selectAll('input[name="scale"]').on("change", function () {
        isLogScale = this.value === "log";
        updateLinkThickness();
    });

    d3.select("#people-count").on("input", function () {
        householdSettings.numberOfPeople = parseInt(this.value) || 1;
        updateBouesFlow();
        updateHouseholdFlows();
    });

    d3.select("#litres-per-person").on("input", function () {
        householdSettings.litresPerPerson = parseFloat(this.value) || 0;
        updateBouesFlow();
        updateHouseholdFlows();
    });

    d3.select("#urine-diversion").on("change", function () {
        urineDiversion = this.checked;
        updateBouesFlow();
        updateHouseholdFlows();
    });

    d3.select("#fecal-diversion").on("change", function () {
        fecalDiversion = this.checked;
        updateBouesFlow();
        updateHouseholdFlows();
    });
}


// =============================================================================
// DRAG HANDLERS
// =============================================================================

function dragstarted(event, d) {
    if (!event.active) simulation.alphaTarget(0.3).restart();
    d.fx = d.x;
    d.fy = d.y;
}

function dragged(event, d) {
    d.fx = event.x;
    d.fy = event.y;
}

function dragended(event, d) {
    if (!event.active) simulation.alphaTarget(0);
    d.fx = null;
    d.fy = null;
}

// =============================================================================
// SIMULATION TICK HANDLER
// =============================================================================

simulation.on("tick", () => {
    link
        .attr("x1", d => d.source.x)
        .attr("y1", d => d.source.y)
        .attr("x2", d => d.target.x)
        .attr("y2", d => d.target.y);

    node
        .attr("cx", d => d.x)
        .attr("cy", d => d.y)
        .style("opacity", d => {
            // Hide Mineralisation node and zero-flow input nodes
            if (d.alias === "Minéralisation") return 0;
            if (d.alias === "Urine diversion") return 0;
            if (d.alias === "Fecal diversion") return 0;
            return (d.Q === 0 && d.type === "input") ? 0 : 1;
        });

    labelsGroup.attr("transform", d => {
        if (d.type === "input") {
            return `translate(${d.x},${d.y - CONFIG.circleR - 40})`;
        } else if (d.type === "calculated") {
            return `translate(${d.x},${d.y + CONFIG.circleR + 20})`;
        } else {
            return `translate(${d.x},${d.y - CONFIG.circleR - 10})`;
        }
    })
    .attr("opacity", d => {
        // Hide labels for Mineralisation and zero-flow input nodes
        if (d.alias === "Minéralisation") return 1;     // Showing the label for Minéralisation
        return (d.Q === 0 && d.type === "input") ? 0 : 1;
    });
});

// =============================================================================
// INITIALIZATION
// =============================================================================

// Initialize visualization
updateBouesFlow();
setupControlSidebar();
updateVisualization();