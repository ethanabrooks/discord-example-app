export const introduction = `
# Introduction
You will be given a transcript of a conversation.  Our goal is to generate a diagram of the physical layout of the objects in the game at the end of the transcript. Read through the transcript and note each object. Ensure that the final diagram includes all objects present in the scene at the end of the transcript and excludes any objects that have left the scene over the course of the game.`;

export const instructions = `
# Instructions
1. List all objects present in the scene described in the transcript.
2. Consider give an approximate size for each object.
3. Identify any objects which are likely to have some physical relationship to each other. \
For example, a "table" and a "chair" are likely to be near each other; a "flower" is likely to be in a "vase"; \
    people face each other during a conversation (so objects should not obstruct their view of each other).
4. Identify plausible xy coordinates (in meters) that account for these relationships.
5. Make a list of objects in the following format:
\`\`\`json
[
    {
        "desc": "A wooden town house",
        "loc": [x,y],
        "size": 2,
    },
    {
        "desc": "A stone fountain",
        "loc": [x,y],
        "size": 10,
    },
    ...
]
\`\`\`
but of course with the actual objects in the scene.
`;

export const codeInstruction = `
5. Generate code to generate using the javascript canvas library for a diagram that describes each of these objects, their sizes, and their positions. 
For example, for a village square:
\`\`\`javascript
    import { createCanvas } from "canvas";

    const canvas = createCanvas(500, 500);
    const context = canvas.getContext('2d');
    
    // Draw the central fountain
    context.beginPath();
    context.arc(250, 250, 50, 0, Math.PI * 2, true);
    context.fillStyle = '#0000FF'; // Fountain in blue
    context.fill();
    context.fillStyle = '#000000'; // Text color
    context.fillText('Fountain', 230, 250); // Positioning text can be adjusted as needed

    // Draw trees
    const treeCoordinates = [
        {x: 100, y: 100},
        {x: 400, y: 100},
        {x: 100, y: 400},
        {x: 400, y: 400}
    ];
    treeCoordinates.forEach((coords, index) => {
        context.beginPath();
        context.arc(coords.x, coords.y, 25, 0, Math.PI * 2, true);
        context.fillStyle = '#008000'; // Trees in green
        context.fill();
        context.fillStyle = '#000000'; // Text color
        context.fillText(\`Tree \${index + 1}\`, coords.x - 10, coords.y - 40); // Positioning text can be adjusted as needed
    });

    // Draw houses
    const houseCoordinates = [
        {x: 200, y: 50, width: 50, height: 50},
        {x: 350, y: 50, width: 50, height: 50},
        {x: 50, y: 200, width: 50, height: 50},
        {x: 400, y: 200, width: 50, height: 50}
    ];
    houseCoordinates.forEach((coords, index) => {
        context.fillStyle = '#A52A2A'; // Houses in brown
        context.fillRect(coords.x, coords.y, coords.width, coords.height);
        context.fillStyle = '#000000'; // Text color
        context.fillText(\`House \${index + 1}\`, coords.x + 10, coords.y + 30); // Positioning text can be adjusted as needed
    });
\`\`\`
`;

export const debugDigram = `
\`\`\`javascript
    import { createCanvas } from "canvas";

    const canvas = createCanvas(500, 500);
    const context = canvas.getContext('2d');
    
    // Draw the castle
    context.fillStyle = '#808080'; // Castle in gray
    context.fillRect(225, 225, 50, 100);
    context.fillStyle = '#000000'; // Text color
    context.fillText('Castle', 220, 350); // Positioning text can be adjusted as needed

    // Draw the church
    context.fillStyle = '#FFFFFF'; // Church in white
    context.fillRect(50, 50, 100, 150);
    context.fillStyle = '#000000'; // Text color
    context.fillText('Church', 40, 220); // Positioning text can be adjusted as needed

    // Draw the market square
    context.beginPath();
    context.arc(250, 250, 100, 0, Math.PI * 2, true);
    context.fillStyle = '#FFFF00'; // Market square in yellow
    context.fill();
    context.fillStyle = '#000000'; // Text color
    context.fillText('Market Square', 180, 250); // Positioning text can be adjusted as needed

    // Draw the inn
    context.fillStyle = '#FFA500'; // Inn in orange
    context.fillRect(350, 200, 100, 100);
    context.fillStyle = '#000000'; // Text color
    context.fillText('Inn', 380, 320); // Positioning text can be adjusted as needed

    // Draw the blacksmith
    context.fillStyle = '#000000'; // Blacksmith in black
    context.fillRect(150, 200, 80, 80);
    context.fillStyle = '#FFFFFF'; // Text color
    context.fillText('Blacksmith', 140, 300); // Positioning text can be adjusted as needed

    // Draw the mill
    context.fillStyle = '#8B4513'; // Mill in brown
    context.fillRect(200, 350, 100, 80);
    context.fillStyle = '#FFFFFF'; // Text color
    context.fillText('Mill', 220, 430); // Positioning text can be adjusted as needed

    // Draw the farmhouses
    const farmhouseCoordinates = [
        {x: 100, y: 400, width: 50, height: 50},
        {x: 400, y: 400, width: 50, height: 50},
        {x: 100, y: 100, width: 50, height: 50},
        {x: 400, y: 100, width: 50, height: 50}
    ];
    farmhouseCoordinates.forEach((coords, index) => {
        context.fillStyle = '#FF0000'; // Farmhouses in red
        context.fillRect(coords.x, coords.y, coords.width, coords.height);
        context.fillStyle = '#FFFFFF'; // Text color
        context.fillText(\`Farmhouse \$\{index + 1\}\`, coords.x + 10, coords.y + 30); // Positioning text can be adjusted as needed
    });

    // Draw the barns
    const barnCoordinates = [
        {x: 75, y: 375, width: 80, height: 80},
        {x: 425, y: 375, width: 80, height: 80},
        {x: 75, y: 75, width: 80, height: 80},
        {x: 425, y: 75, width: 80, height: 80}
    ];
    barnCoordinates.forEach((coords, index) => {
        context.fillStyle = '#800080'; // Barns in purple
        context.fillRect(coords.x, coords.y, coords.width, coords.height);
        context.fillStyle = '#FFFFFF'; // Text color
        context.fillText(\`Barn \$\{index + 1\}\`, coords.x + 10, coords.y + 30); // Positioning text can be adjusted as needed
    });

    // Draw the stables
    const stableCoordinates = [
        {x: 375, y: 200, width: 60, height: 80},
        {x: 125, y: 200, width: 60, height: 80}
    ];
    stableCoordinates.forEach((coords, index) => {
        context.fillStyle = '#00FFFF'; // Stables in cyan
        context.fillRect(coords.x, coords.y, coords.width, coords.height);
        context.fillStyle = '#000000'; // Text color
        context.fillText(\`Stable \$\{index + 1\}\`, coo    `;
