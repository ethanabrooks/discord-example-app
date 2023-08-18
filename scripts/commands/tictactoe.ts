import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import handleStart, { difficultyStrings } from "./play/start.js";
import handleUpdate from "./play/update.js";
import { addFigmaDescriptionOption } from "../utils/figma.js";
import { handleInteraction } from "../interaction.js";
import { interactionToMessages, messagesToContent, queryInferences } from "../messages.js";

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

function checksToDo(grid: string[][], row, col): string[][] {
  // Given a move and the current state decide which checks to perform
  const checks: string[][] = [];
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
    checks.push(rowCheck);
    checks.push(rowCheck.slice().reverse()); // Can perform inference in both directions
  }
  if (addCol) {
    checks.push(colCheck);
    checks.push(colCheck.slice().reverse());
  }
  if (addMainDiag) {
    checks.push(mainDiagCheck);
    checks.push(mainDiagCheck.slice().reverse());
  }
  if (addAntiDiag) {
    checks.push(antiDiagCheck);
    checks.push(antiDiagCheck.slice().reverse());
  }

  return checks;
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
          message: "State:\n" + printState(grid),
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
        const checks: string[][] = checksToDo(grid, row, col);
        console.log("Checks:", checks);

        if (checks.length > 0) {
          const responses: string[] = await queryInferences(checks);


          // Parse responses
          for (const res of responses) {
            // Break into lines
            const lines = res.split('\n');
            const lastLine = lines[lines.length - 1];

            // Check whether yes or no was in the last line
            const yes_regex = /^yes/i;
            const no_regex = /^no/i;
            if (yes_regex.test(lastLine)) {
              // console.log("The string contains 'yes'.");
              winCond = "yes";
              break;
            } else if (no_regex.test(lastLine))  {
              // console.log("The string contains 'no'.");
              winCond = "no";
            } else {
              winCond = "undef"
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
