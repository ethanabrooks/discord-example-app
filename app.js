import fetch from 'node-fetch';

const headers = {
    'X-Figma-Token': 'figd_SxDLSQgu5RkcS2Qnqar0aqTbl2tcQI8TFNs0xNXP'
}

// Function to get all IDs
function getAllIds(node) {
    let ids = [];
    if (node.children) {
        for (let child of node.children) {
            ids.push(child.id);
            ids = ids.concat(getAllIds(child));
        }
    }
    return ids;
}

// Fetch the Figma document
fetch('https://api.figma.com/v1/files/tfGDZJYwd92c5igOcaLhfu', { headers })
    .then(response => response.json())
    .then((data) => {
        // Retrieve all node IDs
        const allIds = getAllIds(data.document);

        // Convert array to comma-separated string
        const allIdsStr = allIds.join(',');

        // Fetch the images
        return fetch(`https://api.figma.com/v1/images/tfGDZJYwd92c5igOcaLhfu?ids=${allIdsStr}&format=png`, { headers });
    })
    .then(response => response.json())
    .then((data) => console.log(data))
    .catch(err => console.error(err));
