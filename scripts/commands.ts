import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  TextChannel,
  SlashCommandSubcommandBuilder,
} from "discord.js";
import catchError from "./errors.js";
import { Completion } from "./gpt.js";
import propositions from "./propositions.js";
import { FigmaData } from "@prisma/client";
import { getSvgUrl, handleFigma } from "./figma.js";
import { decrypt } from "./encryption.js";
import { Image, step, goToNextTurn, getSetupText } from "./step.js";
import { negate } from "./text.js";
import { randomBoolean, randomChoice } from "./math.js";
import { handleInteraction } from "./interaction.js";
import { handleThreads } from "./threads.js";
import { prisma } from "./prismaClient.js";

const subcommands = {
  // add: "add",
  figma: "figma",
  // replace: "replace",
  start: "start",
  update: "update",
};

function throwIfUndefined<T>(value: T | undefined, name: string) {
  if (value == undefined) {
    throw new Error(`${name} is undefined`);
  }
  if (value == null) {
    throw new Error(`${name} is null`);
  }
}

function getStartOptions(interaction: ChatInputCommandInteraction) {
  let proposition = interaction.options.getString("proposition");
  let figmaDescription = interaction.options.getString("figma-description");
  let useFigma = interaction.options.getBoolean("use-figma");
  if (useFigma == undefined) {
    useFigma = true;
  }
  let coherenceCheck = interaction.options.getBoolean("coherence-check");
  if (coherenceCheck == undefined) {
    coherenceCheck = false;
  }
  return { proposition, coherenceCheck, useFigma, figmaDescription };
}

function getUpdateOptions(interaction: ChatInputCommandInteraction) {
  const newFact = interaction.options.getString("new-facts");
  const figmaDescription = interaction.options.getString("figma-description");
  return { newFact, figmaDescription };
}

// function getReplaceOptions(interaction: ChatInputCommandInteraction) {
//   const replace = interaction.options.getString("replace");
//   const newFact = interaction.options.getString("new-facts");
//   throwIfUndefined(newFact, "replace");
//   throwIfUndefined(newFact, "new-fact");
//   return { newFact, replace };
// }

async function getLastFigmaData(interaction: ChatInputCommandInteraction) {
  return await prisma.figmaData.findFirst({
    where: { username: interaction.user.username },
    orderBy: { id: "desc" },
  });
}

async function getSvg(figmaData: FigmaData): Promise<string | void> {
  // Decrypt the token from the retrieved figmaData
  const { fileId, encryptedToken, tokenIV } = figmaData;
  const token = decrypt({ iv: tokenIV, content: encryptedToken });

  // Get the svg url with the file ID and decrypted token
  const svgUrl = await getSvgUrl(fileId, token);
  return await fetch(svgUrl)
    .then((response) => response.text())
    .catch(catchError);
}

async function handleStart(interaction: ChatInputCommandInteraction) {
  let { coherenceCheck, figmaDescription, proposition, useFigma } =
    getStartOptions(interaction);
  const truth = randomBoolean();
  if (proposition == undefined) {
    const positiveFact = `${randomChoice(propositions)}.`;
    proposition = truth ? positiveFact : (await negate(positiveFact)).output;
  }

  let image: { svg: string; description: string } = undefined;
  if (useFigma) {
    const figmaData = await getLastFigmaData(interaction);
    if (figmaData == null) {
      return await handleInteraction({
        interaction,
        message: `You need to submit figma data. Run \`/figma\``,
      });
    }
    const svg = await getSvg(figmaData);
    if (typeof svg !== "string") {
      return await handleInteraction({
        interaction,
        message: `Couldn't get svg data from Figma`,
      });
    }
    // Retrieve the description from the most recent turn data
    const oldFact = await prisma.fact.findFirst({
      include: { image: true },
      where: { turn: { game: { channel: interaction.channelId } } },
      orderBy: { id: "desc" },
    });

    // If a turnData was found and it has Image with a description, use it
    // Otherwise, default to an empty string
    const description = figmaDescription ?? oldFact?.image?.description;
    image = { svg, description };
  }

  const game = await prisma.game.create({
    data: {
      channel: interaction.channelId,
      coherenceCheck,
      turns: {
        create: {
          facts: { create: { text: proposition, image: { create: image } } },
          player: interaction.user.username,
          status: "initial",
          turn: 0,
        },
      },
    },
  });
  console.log(game);

  const fact = { text: proposition, image };
  await handleInteraction({
    interaction,
    message: getSetupText({
      fact,
      factStatus: "initial",
      proposition: fact,
    }),
  });
}

async function handleUpdate(interaction: ChatInputCommandInteraction) {
  let { newFact: userInput, figmaDescription } = getUpdateOptions(interaction);

  const turnObject = await prisma.turn.findFirst({
    include: {
      game: true,
      facts: {
        include: {
          image: true,
        },
      },
    },
    where: { game: { channel: interaction.channelId } },
    orderBy: { id: "desc" },
  });
  const { facts, game, turn: oldTurn } = turnObject;
  const currentFact = facts[facts.length - 1];
  const oldFacts = facts.slice(1, facts.length - 1);
  const [proposition] = facts;
  if (userInput == undefined) {
    userInput = currentFact.text;
  }

  // const subcommand = interaction.options.getSubcommand();
  // switch (subcommand) {
  //   case "add":
  //     newFact = `${currentFact} ${newFact}`;
  //     break;
  //   case "update":
  //     newFact = newFact == undefined ? currentFact : newFact;
  //     break;
  //   case "replace":
  //     const { replace } = getReplaceOptions(interaction);
  //     newFact = currentFact.replace(replace, newFact);
  //     break;
  //   default:
  //     break;
  // }
  let image = null;
  if (currentFact.image != null) {
    const figmaData = await getLastFigmaData(interaction);
    const svg = await getSvg(figmaData);
    const description = figmaDescription ?? currentFact.image.description;
    image = { svg, description };
  }

  const { completions, messages, status, turn } = await step({
    coherenceCheck: game.coherenceCheck,
    currentFact,
    newFact: { text: userInput, image },
    oldFacts,
    proposition,
    turn: oldTurn,
  });

  const completionsArray: Completion[] = Object.values(completions).flatMap(
    (c) => c ?? [],
  );

  function createNewFact(text: string, image: null | Image) {
    if (image == null) {
      return { text };
    }
    const { svg, description } = image;
    return {
      text,
      image: { create: { svg, description } },
    };
  }
  const newFacts = facts.map(({ text, image }) => createNewFact(text, image));
  if (goToNextTurn(status)) {
    newFacts.push(createNewFact(userInput, image));
  }
  console.log(newFacts);
  const newTurnObject = await prisma.turn.create({
    data: {
      completions: {
        create: completionsArray,
      },
      facts: {
        create: newFacts,
      },
      game: {
        connect: { id: game.id },
      },
      newFact: userInput,
      player: interaction.user.username,
      status,
      turn,
    },
  });
  console.log(newTurnObject);
  const completionsObjects = await prisma.completion.findMany({
    where: { turnId: turnObject.id },
    orderBy: { id: "desc" },
  });
  console.log(completionsObjects);
  const message = messages.join("\n");

  if (interaction.channel instanceof TextChannel) {
    await handleThreads(interaction.channel, completions);
  }

  return await handleInteraction({ interaction, message });
}

function addFigmaDescriptionOption(builder: SlashCommandSubcommandBuilder) {
  return builder.addStringOption((option) =>
    option
      .setName("figma-description")
      .setDescription("Write a new description of the Figma diagram.")
      .setRequired(false),
  );
}
// Create commands
export const Commands = [
  {
    data: new SlashCommandBuilder()
      .setName("figma")
      .setDescription(`Submit figma data`)
      .addStringOption((option) =>
        option.setName("token").setDescription("Your figma dev token."),
      )
      .addStringOption((option) =>
        option.setName("url").setDescription("The URL for your figma diagram."),
      ),
    async execute(interaction: ChatInputCommandInteraction) {
      return await handleFigma(interaction);
    },
  },
  {
    data: new SlashCommandBuilder()
      .setName("play")
      .setDescription(`Play break the chain`)
      .addSubcommand((subcommand) =>
        addFigmaDescriptionOption(
          subcommand
            .setName(subcommands.start)
            .setDescription("Start a new game.")
            .addStringOption((option) =>
              option
                .setName("proposition")
                .setDescription(
                  "The target proposition that GPT tries to prove.",
                )
                .setRequired(false),
            )
            .addBooleanOption((option) =>
              option
                .setName("coherence-check")
                .setDescription("Whether to check for coherence.")
                .setRequired(false),
            )
            .addBooleanOption((option) =>
              option
                .setName("use-figma")
                .setDescription(
                  "Whether to incorporate Figma diagram into prompts.",
                )
                .setRequired(false),
            ),
        ),
      )
      .addSubcommand((subcommand) =>
        addFigmaDescriptionOption(
          subcommand
            .setName(subcommands.update)
            .setDescription("Choose a new set of facts to replace the old set.")
            .addStringOption((option) =>
              option
                .setName("new-facts")
                .setDescription("The new facts to replace the old ones with.")
                .setRequired(false),
            ),
        ),
      ),
    async execute(interaction: ChatInputCommandInteraction) {
      const subcommand = interaction.options.getSubcommand();
      await interaction.deferReply();
      switch (subcommand) {
        case subcommands.start:
          await handleStart(interaction);
          break;
        case subcommands.update:
          await handleUpdate(interaction);
          break;
      }
    },
  },
];
