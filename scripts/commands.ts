import {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  CommandInteraction,
  ButtonInteraction,
  BufferResolvable,
  JSONEncodable,
  APIAttachment,
  Attachment,
  AttachmentBuilder,
  AttachmentPayload,
  ChatInputCommandInteraction,
  ButtonStyle,
  TextChannel,
} from "discord.js";
import { buttons } from "./buttons.js";
import { Stream } from "form-data";
import catchError from "./utils/errors.js";
import { complete, Completion } from "./gpt.js";
import propositions from "./propositions.js";
import { PrismaClient } from "@prisma/client";
import { getSvgUrl } from "./figma.js";

export const prisma = new PrismaClient();

const BUILT_IN_RESPONSE_LIMIT = 2000;
const headerPrefix = "###";
const tryAgainText = `${headerPrefix} Try again!`;
const keepPlayingText = `${headerPrefix} Keep playing.`;
const winText = "# You win!";
type Inferences<Type> = {
  oneStep?: Type;
  coherence?: Type;
  multiStep?: Type;
};

const threadNames: Inferences<string> = {
  oneStep: "Reasoning for replacement inference",
  coherence: "Reasoning for coherence inference",
  multiStep: "Reasoning for chain inference",
};

type Status = "win" | "try again" | "continue";

function splitAtResponseLimit(text: string) {
  return [
    text.slice(0, BUILT_IN_RESPONSE_LIMIT),
    text.slice(BUILT_IN_RESPONSE_LIMIT),
  ];
}

async function handleInteraction({
  interaction,
  firstReply = true,
  files = [],
  message,
}: {
  firstReply?: boolean;
  files?: (
    | BufferResolvable
    | Stream
    | JSONEncodable<APIAttachment>
    | Attachment
    | AttachmentBuilder
    | AttachmentPayload
  )[];
  interaction: CommandInteraction;
  message: string;
}) {
  const [content, excess] = splitAtResponseLimit(message);
  const button = new ButtonBuilder()
    .setCustomId(buttons.reveal.id)
    .setLabel("Response cut off. Click to reveal")
    .setStyle(ButtonStyle.Primary);
  const components: ActionRowBuilder<ButtonBuilder>[] =
    excess.length == 0
      ? []
      : [new ActionRowBuilder<ButtonBuilder>().addComponents(button)];

  const reply = { content, components, files };
  const channel = interaction.channel;
  // Update reply
  await (firstReply ? interaction.followUp(reply) : channel.send(reply)).then(
    (response) =>
      response
        .awaitMessageComponent()
        .then(async (buttonInteraction: ButtonInteraction) => {
          async function acknowledgeAndremoveButtons() {
            const content =
              reply.content.length > 0 ? reply.content : "Content was empty"; // this is necessary because of an annoying error that gets thrown when you try to update a message with no content
            await buttonInteraction.update({
              content,
              components: [],
            });
          }
          // Send new message
          switch (buttonInteraction.customId) {
            case buttons.reveal.id:
              acknowledgeAndremoveButtons();
              handleInteraction({
                message: excess,
                interaction,
                firstReply,
              });
              break;
            default:
              throw Error("Cannot use button " + buttonInteraction.customId);
          }
        })
        .catch(async (e) => {
          catchError(e);
          return await (!firstReply
            ? interaction.followUp(reply)
            : channel.send(reply).catch((e) => {
                catchError(e);
                return;
              }));
        }),
  );
}
const gpt = {
  three: "gpt-3.5-turbo",
  four: "gpt-4",
};
const subcommands = {
  add: "add",
  figmaToken: "figma-token",
  replace: "replace",
  start: "start",
  update: "update",
};

function inferenceToBoolean(inference: string) {
  inference = inference.toLowerCase();
  const containsTrue = inference.includes("true");
  const containsFalse = inference.includes("false");
  if (
    inference.includes("true than false") ||
    (containsTrue && !containsFalse)
  ) {
    return true;
  } else if (
    inference.includes("false than true") ||
    (!containsTrue && containsFalse)
  ) {
    return false;
  }
  return null;
}

function randomChoice<Type>(array: Type[]) {
  return array[Math.floor(Math.random() * array.length)];
}

function randomBoolean() {
  return Math.random() < 0.5;
}

async function negate(text: string) {
  return await complete({
    input: `Negate this statement (just return the negated statement, nothing else): ${text}`,
    model: `${gpt.three}`,
  });
}

function getStatusText(status: Status) {
  switch (status) {
    case "try again":
      return tryAgainText;
    case "continue":
      return keepPlayingText;
    case "win":
      return winText;
    default:
      throw new Error(`Invalid status: ${status}`);
  }
}

function goToNextTurn(status: Status) {
  switch (status) {
    case "try again":
      return false;
    case "continue":
    case "win":
      return true;
    default:
      throw new Error(`Invalid status: ${status}`);
  }
}

async function infer(premise: string, conclusion: string) {
  const completions: Completion[] = [];
  const concludingText = `In conclusion, the proposition is probably [true|false|indeterminate]`;
  const input = `Consider the following facts: _${premise}_
Do these facts imply _${conclusion}_? Think through it step by step. When you are done, finish with the text: "${concludingText}"`;
  const completion = await complete({ input, model: gpt.four });
  completions.push(completion);
  let [explanation, inference] = completion.output.split(
    "In conclusion, the proposition",
  );
  if (inference == undefined) {
    const inferenceCompletion = await complete({
      input: `${input}
${explanation}

${concludingText}`,
      model: gpt.four,
    });
    completions.push(inferenceCompletion);
    inference = inferenceCompletion.output;
  }
  return { inference, completions };
}

async function step({
  coherenceCheck,
  currentFact,
  newFact,
  oldFacts,
  proposition,
  turn,
}: {
  coherenceCheck: boolean;
  currentFact: string;
  newFact: string;
  oldFacts: string[];
  proposition: string;
  turn: number;
}): Promise<{
  messages: string[];
  completions: Inferences<Completion[]>;
  status: Status;
  turn: number;
}> {
  const commentsIntro = [
    `${headerPrefix} Proposed new facts`,
    `_${newFact}_`,
    `${headerPrefix} Result`,
  ];

  function turnResult({
    status,
    completions,
    comments,
  }: {
    status: Status;
    completions: Inferences<Completion[]>;
    comments: string[];
  }) {
    const verb = goToNextTurn(status)
      ? "You replaced"
      : "You failed to replace";
    const whatYouDid = `\
${verb}: _${currentFact}_ 
with: "${newFact}"`;
    return {
      messages: [
        whatYouDid,
        ...comments,
        getInferenceSetupText({
          fact: goToNextTurn(status) ? newFact : currentFact,
          proposition,
          factStatus: goToNextTurn(status) ? "updated" : "unchanged",
        }),
        getStatusText(status),
      ],
      completions,
      status,
      turn: turn + +goToNextTurn(status),
    };
  }

  const oneStep = await getInferenceResult({
    premise: newFact,
    conclusion: currentFact,
  });
  if (!oneStep.success) {
    return turnResult({
      status: "try again",
      completions: { oneStep: oneStep.completions },
      comments: [
        ...commentsIntro,
        "The new facts did not imply the replaced fact.",
      ],
    });
  }

  if (turn == 0) {
    return turnResult({
      status: "continue",
      completions: { oneStep: oneStep.completions },
      comments: [
        ...commentsIntro,
        `The new fact imply _${proposition}_`,
        "The first fact was successfully updated.",
      ],
    });
  }
  const oneStepComment = `The new facts _${newFact}_`;
  let coherenceCompletions = null;
  if (coherenceCheck) {
    const coherence = await getInferenceResult({
      premise: [...oldFacts, newFact].join("\n"),
      conclusion: proposition,
    });
    if (!coherence.success) {
      return turnResult({
        status: "try again",
        completions: {
          oneStep: oneStep.completions,
          coherence: coherence.completions,
        },
        comments: [
          ...commentsIntro,
          `${oneStepComment}. However, taken with all of the existing facts, they do not imply the proposition. The proposed facts were rejected.`,
        ],
      });
    }
    coherenceCompletions = coherence.completions;
  }
  const multiStep = await getInferenceResult({
    premise: newFact,
    conclusion: proposition,
  });
  const status = multiStep.success ? "continue" : "win";
  return turnResult({
    status,
    completions: {
      oneStep: oneStep.completions,
      coherence: coherenceCompletions,
      multiStep: multiStep.completions,
    },
    comments: [
      ...commentsIntro,
      oneStepComment,
      `Taken with all of the existing facts, they also imply the target proposition: _${proposition}_`,
      multiStep.success
        ? `Your new facts were added but the target proposition still follows from updated facts.`
        : "You broke the chain! GPT couldn't infer the target proposition from the updated facts.",
    ],
  });
}

async function getInferenceResult({
  premise,
  conclusion,
}: {
  premise: string;
  conclusion: string;
}) {
  const { completions, inference } = await infer(premise, conclusion);
  const success = inferenceToBoolean(inference);
  return { completions, success };
}

function bold(text: string) {
  return `**${text}**`;
}

type FactStatus = "initial" | "updated" | "unchanged";

function getFactWord(status: FactStatus) {
  switch (status) {
    case "initial":
      return "";
    case "updated":
      return " now";
    case "unchanged":
      return " still";
  }
}

function getInferenceSetupText({
  fact,
  proposition,
  factStatus,
}: {
  fact: string;
  factStatus: FactStatus;
  proposition: string;
}) {
  return `\
${headerPrefix} The facts are${getFactWord(factStatus)}:
${fact}
${headerPrefix} Target Proposition
_${proposition}_`;
}

function throwIfUndefined<T>(value: T | undefined, name: string) {
  if (value == undefined) {
    throw new Error(`${name} is undefined`);
  }
  if (value == null) {
    throw new Error(`${name} is null`);
  }
}

function getFigmaTokenOptions(interaction: ChatInputCommandInteraction) {
  let token = interaction.options.getString("token");
  throwIfUndefined(token, "token");
  return { token };
}

function getStartOptions(interaction: ChatInputCommandInteraction) {
  let proposition = interaction.options.getString("proposition");
  const figmaUrl = interaction.options.getString("figma-url");
  let coherenceCheck = interaction.options.getBoolean("coherence-check");
  if (coherenceCheck == undefined) {
    coherenceCheck = false;
  }
  return { proposition, figmaUrl, coherenceCheck };
}

function getUpdateOptions(interaction: ChatInputCommandInteraction) {
  const newFact = interaction.options.getString("new-facts");
  const figmaUrl = interaction.options.getString("figma-url");
  return { newFact, figmaUrl };
}

function getReplaceOptions(interaction: ChatInputCommandInteraction) {
  const replace = interaction.options.getString("replace");
  const newFact = interaction.options.getString("new-facts");
  throwIfUndefined(newFact, "replace");
  throwIfUndefined(newFact, "new-fact");
  return { newFact, replace };
}

function chunkString(input: string, chunkSize: number): string[] {
  return input.length == 0
    ? []
    : [
        input.slice(0, chunkSize),
        ...chunkString(input.slice(chunkSize), chunkSize),
      ];
}

async function handleThreads(
  channel: TextChannel,
  completions: Inferences<Completion[]>,
) {
  return await Object.entries(completions)
    .filter(([, completions]: [string, Completion[]]) => completions != null)
    .map(([key, completions]: [string, Completion[]]) => ({
      name: threadNames[key],
      text: completions
        .map(
          ({ input, output }) => `
# Input
${input}
# Output
${output}
`,
        )
        .join("\n"),
    }))
    .forEach(async ({ name, text }) => {
      const thread = await channel.threads.create({
        name,
        autoArchiveDuration: 60,
      });
      chunkString(text, BUILT_IN_RESPONSE_LIMIT).forEach(async (chunk) => {
        return await thread.send(chunk);
      });
    });
}

async function handleStart(
  interaction: ChatInputCommandInteraction,
  tokens: { [username: string]: string },
) {
  let { proposition, figmaUrl, coherenceCheck } = getStartOptions(interaction);
  const truth = randomBoolean();
  if (proposition == undefined) {
    const positiveFact = `${randomChoice(propositions)}.`;
    proposition = truth ? positiveFact : (await negate(positiveFact)).output;
  }
  const turnObject = await prisma.turn.findFirst({
    where: { game: { channel: interaction.channelId } },
    orderBy: { id: "desc" },
  });
  if (turnObject != undefined) {
    figmaUrl = turnObject.figmaUrl;
  }
  const figmaResult = await handleFigma({
    figmaUrl,
    tokens,
    interaction,
    fact: proposition,
  });
  let svg = null;
  if (figmaResult != undefined) {
    ({ fact: proposition, svg } = figmaResult);
  }

  const game = await prisma.game.create({
    data: {
      channel: interaction.channelId,
      coherenceCheck,
      proposition,
      turns: {
        create: {
          facts: { create: { text: proposition } },
          figmaUrl,
          player: interaction.user.username,
          svg,
          status: "initial",
          turn: 0,
        },
      },
    },
  });
  console.log(game);

  await handleInteraction({
    interaction,
    message: getInferenceSetupText({
      fact: proposition,
      factStatus: "initial",
      proposition,
    }),
  });
}

async function handleFigma({
  figmaUrl,
  tokens,
  interaction,
  fact,
}: {
  figmaUrl: string;
  tokens: { [username: string]: string };
  interaction: ChatInputCommandInteraction;
  fact: string;
}) {
  const token = tokens[interaction.user.username];

  if (token == undefined) {
    await handleInteraction({
      interaction,
      message: `You need to authenticate figma first. Run \`/play figma-token\``,
    });
    return;
  }
  const svgUrl = await getSvgUrl(figmaUrl, token);
  const svg = await fetch(svgUrl)
    .then((response) => {
      return response.text();
    }) // Get the response as text
    .catch((err) => {
      catchError(err);
      return null;
    });
  const [pre, code, post] = fact.split(/```svg\s|\s```/);

  if (svg != null) {
    fact =
      code == undefined
        ? `\
\`\`\`svg
${svg}
\`\`\`
${pre}`
        : `\
${pre}\`\`\`svg
${svg}
\`\`\`
${post}`;
  }
  return { fact, svg };
}

async function handleOther(
  interaction: ChatInputCommandInteraction,
  tokens: { [username: string]: string },
) {
  let { newFact, figmaUrl } = getUpdateOptions(interaction);

  const turnObject = await prisma.turn.findFirst({
    include: { game: true, facts: true },
    where: { game: { channel: interaction.channelId } },
    orderBy: { id: "desc" },
  });
  const { facts, figmaUrl: prevFigmaUrl, turn, game } = turnObject;
  const factTexts = facts.map(({ text }) => text);
  const currentFact = factTexts[factTexts.length - 1];
  const oldFacts = factTexts.slice(0, factTexts.length - 1);

  const subcommand = interaction.options.getSubcommand();
  switch (subcommand) {
    case "add":
      newFact = `${currentFact} ${newFact}`;
      break;
    case "update":
      newFact = newFact == undefined ? currentFact : newFact;
      break;
    case "replace":
      const { replace } = getReplaceOptions(interaction);
      newFact = currentFact.replace(replace, newFact);
      break;
    default:
      break;
  }
  let svg = null;
  if (figmaUrl == undefined) {
    figmaUrl = prevFigmaUrl;
  }
  console.log("#############3 figma url");
  console.log(figmaUrl);

  if (figmaUrl != undefined) {
    const figmaResult = await handleFigma({
      figmaUrl,
      tokens,
      interaction,
      fact: newFact,
    });
    if (figmaResult != undefined) {
      ({ fact: newFact, svg } = figmaResult);
    }
  }

  const {
    completions,
    messages,
    status,
    turn: newTurn,
  } = await step({
    coherenceCheck: game.coherenceCheck,
    currentFact,
    newFact,
    oldFacts,
    proposition: game.proposition,
    turn,
  });

  const completionsArray: Completion[] = Object.values(completions).flatMap(
    (c) => (c == null ? [] : c),
  );
  if (goToNextTurn(status)) {
    factTexts.push(newFact);
  }
  const newTurnObject = await prisma.turn.create({
    data: {
      facts: {
        create: factTexts.map((text) => ({ text })),
      },
      completions: {
        create: completionsArray,
      },
      figmaUrl,
      gameId: game.id,
      player: interaction.user.username,
      status,
      svg,
      turn: newTurn,
      newFact,
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
// Create commands
export const Commands = [
  {
    data: new SlashCommandBuilder()
      .setName("play")
      .setDescription(`Play break the chain`)
      .addSubcommand((subcommand) =>
        subcommand
          .setName(subcommands.figmaToken)
          .setDescription("Authenticate figma.")
          .addStringOption((option) =>
            option
              .setName("token")
              .setDescription("Your figma dev token.")
              .setRequired(true),
          ),
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName(subcommands.start)
          .setDescription("Start a new game.")
          .addStringOption((option) =>
            option
              .setName("proposition")
              .setDescription("The target proposition that GPT tries to prove.")
              .setRequired(false),
          )
          .addStringOption((option) =>
            option
              .setName("figma-url")
              .setDescription("The new facts to replace the old ones with.")
              .setRequired(false),
          )
          .addBooleanOption((option) =>
            option
              .setName("coherence-check")
              .setDescription("Whether to check for coherence.")
              .setRequired(false),
          ),
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName(subcommands.add)
          .setDescription("Choose a new set of facts to add the old set.")
          .addStringOption((option) =>
            option
              .setName("new-facts")
              .setDescription("The new facts to add")
              .setRequired(true),
          )
          .addStringOption((option) =>
            option
              .setName("figma-url")
              .setDescription("The new facts to replace the old ones with.")
              .setRequired(false),
          ),
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName(subcommands.update)
          .setDescription("Choose a new set of facts to replace the old set.")
          .addStringOption((option) =>
            option
              .setName("new-facts")
              .setDescription("The new facts to replace the old ones with.")
              .setRequired(false),
          )
          .addStringOption((option) =>
            option
              .setName("figma-url")
              .setDescription("The new facts to replace the old ones with.")
              .setRequired(false),
          ),
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName(subcommands.replace)
          .setDescription(
            "Choose a new set of facts to replace a substring of the old set.",
          )
          .addStringOption((option) =>
            option
              .setName("replace")
              .setDescription("The substring to replace the new facts.")
              .setRequired(true),
          )
          .addStringOption((option) =>
            option
              .setName("new-facts")
              .setDescription("The new facts to replace the substring with.")
              .setRequired(true),
          ),
      ),
    tokens: {
      [process.env.DISCORD_USERNAME]: process.env.FIGMA_TOKEN,
    },
    async execute(interaction: ChatInputCommandInteraction) {
      const subcommand = interaction.options.getSubcommand();
      await interaction.deferReply();
      switch (subcommand) {
        case subcommands.start:
          await handleStart(interaction, this.tokens);
          break;
        case subcommands.figmaToken:
          const { token } = getFigmaTokenOptions(interaction);
          this.tokens[interaction.user.username] = token;
          handleInteraction({ interaction, message: "Saved figma token." });
          break;
        default:
          await handleOther(interaction, this.tokens);
          break;
      }
    },
  },
];
