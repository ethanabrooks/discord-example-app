export const introduction = `
# Introduction
The following is a transcript of a text-based game. \
Our goal is to generate a diagram of the physical layout of the objects in the game at the end of the transcript. \
Read through the transcript and note each object. \
Ensure that the final diagram includes all objects present in the scene at the end of the transcript \
and excludes any objects that have left the scene over the course of the game.
`;

export const instructions = `
# Instructions
1. List all objects present in the scene at the end of the transcript.
2. Consider give an approximate size for each object.
3. Identify any objects which are likely to have some physical relationship to each other. \
For example, a "table" and a "chair" are likely to be near each other; a "flower" is likely to be in a "vase"; \
    people face each other during a conversation (so objects should not obstruct their view of each other).
4. Identify plausible xy coordinates (in meters) that account for these relationships.
5. Generate code to generate using the javascript canvas library for a diagram that describes each of these objects, their sizes, and their positions. 
For example, for a village square:
\`\`\`javascript
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
