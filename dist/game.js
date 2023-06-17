import { capitalize } from './utils.js';
export function getResult(p1, p2) {
    var gameResult;
    if (RPSChoices[p1.objectName] && RPSChoices[p1.objectName][p2.objectName]) {
        // o1 wins
        gameResult = {
            win: p1,
            lose: p2,
            verb: RPSChoices[p1.objectName][p2.objectName],
        };
    }
    else if (RPSChoices[p2.objectName] &&
        RPSChoices[p2.objectName][p1.objectName]) {
        // o2 wins
        gameResult = {
            win: p2,
            lose: p1,
            verb: RPSChoices[p2.objectName][p1.objectName],
        };
    }
    else {
        // tie -- win/lose don't
        gameResult = { win: p1, lose: p2, verb: 'tie' };
    }
    return formatResult(gameResult);
}
function formatResult(result) {
    var win = result.win, lose = result.lose, verb = result.verb;
    return verb === 'tie'
        ? "<@".concat(win.id, "> and <@").concat(lose.id, "> draw with **").concat(win.objectName, "**")
        : "<@".concat(win.id, ">'s **").concat(win.objectName, "** ").concat(verb, " <@").concat(lose.id, ">'s **").concat(lose.objectName, "**");
}
// this is just to figure out winner + verb
var RPSChoices = {
    rock: {
        description: 'sedimentary, igneous, or perhaps even metamorphic',
        virus: 'outwaits',
        computer: 'smashes',
        scissors: 'crushes',
    },
    cowboy: {
        description: 'yeehaw~',
        scissors: 'puts away',
        wumpus: 'lassos',
        rock: 'steel-toe kicks',
    },
    scissors: {
        description: 'careful ! sharp ! edges !!',
        paper: 'cuts',
        computer: 'cuts cord of',
        virus: 'cuts DNA of',
    },
    virus: {
        description: 'genetic mutation, malware, or something inbetween',
        cowboy: 'infects',
        computer: 'corrupts',
        wumpus: 'infects',
    },
    computer: {
        description: 'beep boop beep bzzrrhggggg',
        cowboy: 'overwhelms',
        paper: 'uninstalls firmware for',
        wumpus: 'deletes assets for',
    },
    wumpus: {
        description: 'the purple Discord fella',
        paper: 'draws picture on',
        rock: 'paints cute face on',
        scissors: 'admires own reflection in',
    },
    paper: {
        description: 'versatile and iconic',
        virus: 'ignores',
        cowboy: 'gives papercut to',
        rock: 'covers',
    },
};
export function getRPSChoices() {
    return Object.keys(RPSChoices);
}
// Function to fetch shuffled options for select menu
export function getShuffledOptions() {
    var allChoices = getRPSChoices();
    var options = [];
    for (var _i = 0, allChoices_1 = allChoices; _i < allChoices_1.length; _i++) {
        var c = allChoices_1[_i];
        // Formatted for select menus
        // https://discord.com/developers/docs/interactions/message-components#select-menu-object-select-option-structure
        options.push({
            label: capitalize(c),
            value: c.toLowerCase(),
            description: RPSChoices[c]['description'],
        });
    }
    return options.sort(function () { return Math.random() - 0.5; });
}
//# sourceMappingURL=game.js.map