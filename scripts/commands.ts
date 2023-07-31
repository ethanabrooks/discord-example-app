import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  TextChannel,
  SlashCommandSubcommandBuilder,
} from "discord.js";
import catchError from "./utils/errors.js";
import { Completion } from "./gpt.js";
import propositions from "./propositions.js";
import { FigmaData, PrismaClient } from "@prisma/client";
import { getSvgUrl } from "./figma.js";
import { encrypt, decrypt } from "./utils/encryption.js";
import { step, goToNextTurn, getInferenceSetupText } from "./step.js";
import { negate } from "./text.js";
import { randomBoolean } from "./math.js";
import { handleInteraction } from "./interaction.js";
import { handleThreads } from "./threads.js";
export const prisma = new PrismaClient();

const subcommands = {
  // add: "add",
  figma: "figma",
  // replace: "replace",
  start: "start",
  update: "update",
};

// async function step({
//   coherenceCheck,
//   currentFact,
//   newFact,
//   oldFacts,
//   proposition,
//   turn,
// }: {
//   coherenceCheck: boolean;
//   currentFact: string;
//   newFact: string;
//   oldFacts: string[];
//   proposition: string;
//   turn: number;
// }): Promise<{
//   messages: string[];
//   completions: Inferences<Completion[]>;
//   status: Status;
//   turn: number;
// }> {
//   const commentsIntro = [
//     `${headerPrefix} Proposed new facts`,
//     `_${newFact}_`,
//     `${headerPrefix} Result`,
//   ];

//   function turnResult({
//     status,
//     completions,
//     comments,
//   }: {
//     status: Status;
//     completions: Inferences<Completion[]>;
//     comments: string[];
//   }) {
//     const verb = goToNextTurn(status)
//       ? "You replaced"
//       : "You failed to replace";
//     const whatYouDid = `\
// ${verb}: _${currentFact}_
// with: "${newFact}"`;
//     return {
//       messages: [
//         whatYouDid,
//         ...comments,
//         getInferenceSetupText({
//           fact: goToNextTurn(status) ? newFact : currentFact,
//           proposition,
//           factStatus: goToNextTurn(status) ? "updated" : "unchanged",
//         }),
//         getStatusText(status),
//       ],
//       completions,
//       status,
//       turn: turn + +goToNextTurn(status),
//     };
//   }

//   const oneStep = await getInferenceResult({
//     premise: newFact,
//     conclusion: currentFact,
//   });
//   if (!oneStep.success) {
//     return turnResult({
//       status: "try again",
//       completions: { oneStep: oneStep.completions },
//       comments: [
//         ...commentsIntro,
//         "The new facts did not imply the replaced fact.",
//       ],
//     });
//   }

//   if (turn == 0) {
//     return turnResult({
//       status: "continue",
//       completions: { oneStep: oneStep.completions },
//       comments: [
//         ...commentsIntro,
//         `The new fact imply _${proposition}_`,
//         "The first fact was successfully updated.",
//       ],
//     });
//   }
//   const oneStepComment = `The new facts _${newFact}_`;
//   let coherenceCompletions = null;
//   if (coherenceCheck) {
//     const coherence = await getInferenceResult({
//       premise: [...oldFacts, newFact].join("\n"),
//       conclusion: proposition,
//     });
//     if (!coherence.success) {
//       return turnResult({
//         status: "try again",
//         completions: {
//           oneStep: oneStep.completions,
//           coherence: coherence.completions,
//         },
//         comments: [
//           ...commentsIntro,
//           `${oneStepComment}. However, taken with all of the existing facts, they do not imply the proposition. The proposed facts were rejected.`,
//         ],
//       });
//     }
//     coherenceCompletions = coherence.completions;
//   }
//   const multiStep = await getInferenceResult({
//     premise: newFact,
//     conclusion: proposition,
//   });
//   const status = multiStep.success ? "continue" : "win";
//   return turnResult({
//     status,
//     completions: {
//       oneStep: oneStep.completions,
//       coherence: coherenceCompletions,
//       multiStep: multiStep.completions,
//     },
//     comments: [
//       ...commentsIntro,
//       oneStepComment,
//       `Taken with all of the existing facts, they also imply the target proposition: _${proposition}_`,
//       multiStep.success
//         ? `Your new facts were added but the target proposition still follows from updated facts.`
//         : "You broke the chain! GPT couldn't infer the target proposition from the updated facts.",
//     ],
//   });
// }

function throwIfUndefined<T>(value: T | undefined, name: string) {
  if (value == undefined) {
    throw new Error(`${name} is undefined`);
  }
  if (value == null) {
    throw new Error(`${name} is null`);
  }
}

async function getFigmaOptions(interaction: ChatInputCommandInteraction) {
  let token = interaction.options.getString("token");
  let url = interaction.options.getString("url");
  let description = interaction.options.getString("description");
  return { token, url, description };
}

function getStartOptions(interaction: ChatInputCommandInteraction) {
  let proposition = interaction.options.getString("proposition");
  let figmaDescription = interaction.options.getString("figma-description");
  let useFigma = interaction.options.getBoolean("use-figma");
  if (useFigma == undefined) {
    useFigma = false;
  }
  let coherenceCheck = interaction.options.getBoolean("coherence-check");
  if (coherenceCheck == undefined) {
    coherenceCheck = false;
  }
  return { proposition, coherenceCheck, useFigma, figmaDescription };
}

function getUpdateOptions(interaction: ChatInputCommandInteraction) {
  const newFact = interaction.options.getString("new-facts");
  const figmaDescription = interaction.options.getBoolean("figma-description");
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

function randomChoice<Type>(array: Type[]) {
  return array[Math.floor(Math.random() * array.length)];
}

async function handleStart(interaction: ChatInputCommandInteraction) {
  let { coherenceCheck, figmaDescription, proposition, useFigma } =
    getStartOptions(interaction);
  const truth = randomBoolean();
  if (proposition == undefined) {
    const positiveFact = `${randomChoice(propositions)}.`;
    proposition = truth ? positiveFact : (await negate(positiveFact)).output;
  }

  let image = undefined;
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

    // If a turnData was found and it has svgData with a description, use it
    // Otherwise, default to an empty string
    const description = figmaDescription ?? oldFact?.image?.description;
    image = { svg, description };

    proposition = addFigmaToFact(proposition, svg, description);
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
    message: getInferenceSetupText({
      fact,
      factStatus: "initial",
      proposition: fact,
    }),
  });
}

async function handleUpdate(interaction: ChatInputCommandInteraction) {
  let { newFact: userInput } = getUpdateOptions(interaction);

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
    image = { svg, description: currentFact.image.description };
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

  function createNewFact(text: string, svg: string, description: string) {
    return {
      text,
      create: { svgData: { create: { svg, description } } },
    };
  }
  const newFacts = facts.map(({ text, image: { svg, description } }) =>
    createNewFact(text, svg, description),
  );
  if (goToNextTurn(status)) {
    newFacts.push(createNewFact(userInput, image.svg, image.description));
  }
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
      const { token, url } = await getFigmaOptions(interaction);
      const figmaUrlBase = "https://www.figma.com/file/";
      if (!url.startsWith(figmaUrlBase)) {
        return await handleInteraction({
          interaction,
          message: `The URL must start with ${figmaUrlBase}`,
        });
      }
      const fileId = url.split("/")[4];
      const { iv, content } = encrypt(token);
      await prisma.figmaData.create({
        data: {
          encryptedToken: content,
          fileId,
          tokenIV: iv,
          username: interaction.user.username,
        },
      });

      return await handleInteraction({
        interaction,
        message: `Submitted figma file id: ${fileId}`,
        deferred: false,
      });
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
function addFigmaToFact(
  proposition: string,
  svg: string,
  description: string,
): string {
  throw new Error("Function not implemented.");
}
