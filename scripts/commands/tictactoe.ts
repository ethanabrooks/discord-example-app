import { ChatInputCommandInteraction, SlashCommandBuilder, TextChannel } from "discord.js";
import handleStart, { difficultyStrings } from "./play/start.js";
import handleUpdate from "./play/update.js";
import { addFigmaDescriptionOption } from "../utils/figma.js";
import { handleInteraction } from "../interaction.js";
import { handleThreads } from "../threads.js";
import { interactionToMessages, messagesToContent, queryInferences } from "../messages.js";
import { Completion } from "../utils/gpt.js"
import { Inferences } from "../step.js";

// Does not look that clean -- no idea :)
import pkg from 'ascii-table'
const AsciiTable = pkg; //"ascii-table";

const subcommands = {
  start: "start",
  update: "update",
};

// Game state
import * as fs from 'fs';
const filePath: string = 'tmp.txt';

async function saveState(filePath: string, grid: string[][]): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const arrayString: string = grid.join('\n');
    fs.writeFile(filePath, arrayString, (err) => {
      if (err) {
        reject(err);
        return;
      }
      resolve();
    });
  });
}

async function readState(filePath: string): Promise<string[][]> {
    return new Promise<string[][]>((resolve, reject) => {
        fs.readFile(filePath, 'utf-8', (err, data) => {
            if (err) {
                reject(err);
                return;
            }
            const lines = data.split('\n');
            const values: string[][] = [];
            lines.forEach((line) => {
              values.push(line.trim().split(','));
            })
            resolve(values);
        });
    });
}

function printState(array: any[][]): string {
    // Verbatim discord format
    let formattedArray: string = "```\n";

    // Create table
    let table = new AsciiTable();
    for (let row of array) {
      if (row.every(element => element === "")) {
        row = row.map(() => "  ");
      }
      table.addRow(row);
      table.addRow(row.map(() => "-"))
    }
    for (const row of array) {
      for (let c = 0; c < row.length; c++) {
        table.setAlign(c, AsciiTable.CENTER);
      }
    }

    table.setTitle('Tic-Tac-Trö');
    table.setTitleAlignCenter();
    formattedArray += table.toString();
    formattedArray += "```";
    return formattedArray;
}

type checkType = {
  "check": string[],
  "dir": string
}

function checksToDo(grid: string[][], row, col): checkType[] {
  // Given a move and the current state decide which checks to perform
  // const checks: string[][] = [];
  const checks: checkType[] = [];
  const numRows = grid.length;
  const numCols = grid[0].length;

  // Check if row is complete
  let addRow: boolean = true;
  let rowCheck: string[] = [];
  for (let c = 0; c < numCols; c++) {
    if (grid[row][c] === "") {
      addRow = false;
    } else {
      rowCheck.push(grid[row][c]);
    }
  }

  // Check if column is complete
  let addCol: boolean = true;
  let colCheck: string[] = [];
  for (let r = 0; r < numRows; r++) {
    if (grid[r][col] === "") {
      addCol = false;
    } else {
      colCheck.push(grid[r][col]);
    }
  }

  // Check if main diagonal is complete
  let addMainDiag: boolean = true;
  let mainDiagCheck: string[] = [];
  if (row !== col) {
    addMainDiag = false;
  } else {
    for (let r = 0; r < numRows; r++) {
      if (grid[r][r] === "") {
        addMainDiag = false;
      } else {
        mainDiagCheck.push(grid[r][r]);
      }
    }
  }

  // Check if antidiagonal is complete
  let addAntiDiag: boolean = true;
  let antiDiagCheck: string[] = [];
  const antiDiagSum: number = numRows - 1; // Assumes square matrix
  if (row + col !== antiDiagSum) {
    addAntiDiag = false;
  } else {
    for (let r = 0; r < numRows; r++) {
      if (grid[r][antiDiagSum-r] === "") {
        addAntiDiag = false;
      } else {
        antiDiagCheck.push(grid[r][antiDiagSum-r])
      }
    }
  }

  if (addRow) {
    // checks.push(rowCheck);
    checks.push({
      "check": rowCheck,
      "dir": "rowFwd"
    })
    // checks.push(rowCheck.slice().reverse()); // Can perform inference in both directions
    checks.push({
      "check": rowCheck.slice().reverse(),
      "dir": "rowBwd"
    })
  }
  if (addCol) {
    // checks.push(colCheck);
    checks.push({
      "check": colCheck,
      "dir": "colFwd"
    })
    // checks.push(colCheck.slice().reverse());
    checks.push({
      "check": colCheck.slice().reverse(),
      "dir": "colBwd"
    })
  }
  if (addMainDiag) {
    // checks.push(mainDiagCheck);
    checks.push({
      "check": mainDiagCheck,
      "dir": "mainDiagFwd"
    })
    // checks.push(mainDiagCheck.slice().reverse());
    checks.push({
      "check": mainDiagCheck.slice().reverse(),
      "dir": "mainDiagBwd"
    })
  }
  if (addAntiDiag) {
    // checks.push(antiDiagCheck);
    checks.push({
      "check": antiDiagCheck,
      "dir": "antiDiagFwd"
    })
    // checks.push(antiDiagCheck.slice().reverse());
    checks.push({
      "check": antiDiagCheck.slice().reverse(),
      "dir": "antiDiagBwd"
    })
  }

  return checks;
}

function parseCompletions(completions: Completion[][], inferences: string[][]): string[][] {
    let responses: string[][] = [];

    const n_queries: number = inferences.length; 
    for (let q = 0; q < n_queries; q++) {
      const n_statements: number = inferences[q].length;
      let q_responses: string[] = [];
      for (let s = 0; s < n_statements-1; s++) {
        const res = completions[q][s].output;

        // Regex check
        const lines = res.split('\n');
        const lastLine = lines[lines.length - 1];

        // Check whether yes or no was in the last line
        const yes_regex = /^yes/i;
        const no_regex = /^no/i;
        if (yes_regex.test(lastLine)) {
          // console.log("The string contains 'yes'.");
          q_responses.push("yes");
        } else if (no_regex.test(lastLine))  {
          // console.log("The string contains 'no'.");
          q_responses.push("no");
        } else {
          q_responses.push("undef");
        }
      }
      responses.push(q_responses);
    }

  return responses;
}


export default {
  data: new SlashCommandBuilder()
    .setName("tic")
    .setDescription(`Play inference tic-tac-toe`)
    .addSubcommand(subcommand =>
      subcommand
        .setName(subcommands.start)
        .setDescription('Start the game')
        .addIntegerOption((option) =>
          option
            .setName("size")
            .setDescription(
              `Grid size`,
            )
            .setRequired(true),
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName(subcommands.update)
        .setDescription('Update the game')
        .addIntegerOption((option) =>
          option
            .setName("row")
            .setDescription(
              `Row to update`,
            )
            .setRequired(true),
        )
        .addIntegerOption((option) =>
          option
            .setName("column")
            .setDescription(
              `Column to update`,
            )
            .setRequired(true),
        )
        .addStringOption((option) =>
          option
            .setName("statement")
            .setDescription(
              `The statement to add.`
            ) 
            .setRequired(true),
        )
    ),
  async execute(interaction: ChatInputCommandInteraction) {
    const subcommand = interaction.options.getSubcommand();
    await interaction.deferReply();

    // Game state
    let grid: string[][] = [];
    let grid_size: number = 0;

    switch (subcommand) {
      case subcommands.start:
        // Initialize game
        console.log("Start game")
        grid_size = interaction.options.getInteger("size")
        for (let i = 0; i < grid_size; i++) {
          const row: string[] = [];
          for (let j = 0; j < grid_size; j++) {
            row.push("");
          }
          grid.push(row);
        }

        // Save grid to file
        saveState(filePath, grid);
        console.log("Saved", grid);

        await handleInteraction({
          interaction,
          // message: `Started a new game`,
          message: "# New Game\n" + printState(grid),
        });

        break;


      case subcommands.update:
        // Load grid from file
        grid = await readState(filePath);
        grid_size = grid.length;
        console.log("Loaded", grid)

        const row = interaction.options.getInteger("row") - 1
        const col = interaction.options.getInteger("column") - 1
        const statement = interaction.options.getString("statement")

        console.log(grid_size, row, col);

        // Add statement to grid
        if (row < grid_size && row >= 0 && col < grid_size && col >= 0) {
          if (grid[row][col] === "") {
            grid[row][col] = statement;
          } else {
            await handleInteraction({
              interaction,
              message: `Cell occupied\n` + printState(grid),
            });
            return;
          }
        } else {
            await handleInteraction({
              interaction,
              message: `Cell out of bounds\n` + printState(grid),
            });
            return;
        }

        // Get checks to perform
        let winCond: string = "no"
        // const checks: string[][] = checksToDo(grid, row, col);
        const checks: checkType[] = checksToDo(grid, row, col);
        console.log("Checks:", checks);

        if (checks.length > 0) {
          const completions: Completion[][] = await queryInferences(checks.map(c => c.check));
          const responses: string[][] = parseCompletions(completions, checks.map(c => c.check));


          // Parse responses
          let inf: Inferences<Completion[]>;
          // for (const res of responses) {
          for (let r = 0; r < responses.length; r++) {
            const res = responses[r];
            const compl = completions[r];

            // Break into lines
            // const lines = res.split('\n');
            // const lastLine = lines[lines.length - 1];

            // // Check whether yes or no was in the last line
            // const yes_regex = /^yes/i;
            // const no_regex = /^no/i;
            // if (yes_regex.test(lastLine)) {
            console.log("Testing win condition", res)
            if (res.every(item => item === "yes")) {
              // console.log("The string contains 'yes'.");
              winCond = "yes";
              break;
            // } else if (no_regex.test(lastLine))  {
            } else if (res.includes("undef"))  {
              // console.log("The string contains 'no'.");
              winCond = "undef"
            } else {
              winCond = "no";
            }
            
            // inf[checks[r].dir] = compl; 
            switch (checks[r].dir) {
              case "rowFwd":
                inf = {
                  "rowFwd": compl
                };
                break;
              case "rowBwd":
                inf = {
                  "rowBwd": compl
                };
                break;
              case "colFwd":
                inf = {
                  "colFwd": compl
                };
                break;
              case "colBwd":
                inf = {
                  "colBwd": compl
                };
                break;
              case "mainDiagFwd":
                inf = {
                  "mainDiagFwd": compl
                };
                break;
              case "mainDiagBwd":
                inf = {
                  "mainDiagBwd": compl
                };
                break;
              case "antiDiagFwd":
                inf = {
                  "antiDiagFwd": compl
                };
                break;
              case "antiDiagBwd":
                inf = {
                  "antiDiagBwd": compl
                };
                break;

              default:
                inf = {
                  "rowFwd": compl
                };

            }

            if (interaction.channel instanceof TextChannel) {
              await handleThreads(interaction.channel, inf);
            }
          }
        }

        // Save grid to file
        saveState(filePath, grid);
        console.log("Saved", grid);

        let returnMsg = printState(grid)
        if (winCond == "yes") {
          returnMsg = "## You win!\n" + returnMsg
        } else if (winCond == "undef") {
          returnMsg = "### Check logs 🤷\n" + returnMsg
        }

        await handleInteraction({
          interaction,
          message: returnMsg,
        });

        break;
    }


  },
};
