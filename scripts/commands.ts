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
  GuildMember,
  Collection,
  ThreadMemberManager,
  ChatInputCommandInteraction,
  ButtonStyle,
  TextChannel,
} from "discord.js";
import { buttons } from "./buttons.js";
import { Stream } from "form-data";
import catchError from "./utils/errors.js";
import { complete } from "./gpt.js";
import propositions from "./propositions.js";

const BUILT_IN_RESPONSE_LIMIT = 2000;
const headerPrefix = "###";
const tryAgainText = `${headerPrefix} Try again!`;
const keepPlayingText = `${headerPrefix} Keep playing.`;
const winText = "# You win!";
type Threads = {
  oneStep?: string[];
  coherence?: string[];
  multiStep?: string[];
};

const threadNames = {
  oneStep: "Reasoning for single-step inference",
  coherence: "Reasoning for coherence inference",
  multiStep: "Reasoning for multi-step inference",
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
  start: "start",
  update: "update",
};
function splitFacts(factsString: string) {
  return factsString.split("\n").flatMap((line) => {
    const index = line.indexOf("]");
    return index === -1 ? [] : [line.substring(index + 1).trim()];
  });
}

function factsToString(facts: string[]) {
  if (facts.length == 0) {
    return "No facts.";
  }
  return facts.map((fact, index) => `${index + 1}. ${fact}`).join("\n");
}

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

function getUsernames(members: Collection<string, GuildMember>) {
  return Array.from(members.values())
    .filter(({ user }) => !user.bot)
    .map(({ user }) => user.username);
}

function randomChoice(array: any[]) {
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

async function userInputToFacts(text: string) {
  const factsString = await complete({
    input: `Take the following text and prefix each assertion with '\n[FACT]' or '\n[OPINION]' (break up sentences if necessary):
        ${text}`,
    model: gpt.three,
  });
  return splitFacts(factsString);
}

function validFactIndex(factIndex: number, length: number) {
  return factIndex <= 0 || length < factIndex;
}

async function promptNewFactIndex(length: number, userInput: string) {
  const requiredFactIndex = length == 1 ? `${1}` : `between 1 and ${length}`;
  return `fact index must be ${requiredFactIndex}.
    
(You wrote: "${userInput}")`;
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

function fill<Type>(array: any[], value: Type): Type[] {
  return array.map(() => value);
}

function zip<A, B>(a: A[], b: B[]): [A, B][] {
  return a.map((k, i) => [k, b[i]]);
}

function selectionText(selection: boolean[]) {
  const indices = selection.flatMap((selected, i) => (selected ? [i + 1] : []));
  const last = indices.pop();
  if (indices.length == 0) {
    return `Does fact ${last}`;
  }
  return "Do facts " + indices.join(", ") + ` and ${last}`;
}

async function handleUpdateSubcommand({
  factIndex,
  facts,
  selection,
  turn,
  userInput,
}: {
  factIndex: number;
  facts: string[];
  selection: boolean[];
  turn: number;
  userInput: string;
}): Promise<{
  facts: string[];
  selection: boolean[];
  messages: string[];
  threads: Threads;
  turn: number;
}> {
  if (validFactIndex(factIndex, facts.length)) {
    const text = await promptNewFactIndex(facts.length, userInput);
    return {
      facts,
      selection,
      messages: [text, getStatusText("try again")],
      threads: {},
      turn,
    };
  }

  const [proposition] = facts;
  const userFacts = await userInputToFacts(userInput);
  const fact = facts[factIndex - 1];
  if (fact == undefined) {
    throw new Error(`Fact at index ${factIndex} is undefined. Facts:
${facts}`);
  }
  const updatedFacts = facts.concat(userFacts);
  const updatedSelection = selection
    .map((_, i) => i > 0 && i + 1 != factIndex)
    .concat(fill(userFacts, true));

  function turnResult({
    status,
    threads,
    comment = null,
  }: {
    status: Status;
    threads: Threads;
    comment?: string | null;
  }) {
    const resultFacts = goToNextTurn(status) ? updatedFacts : facts;
    const resultSelection = goToNextTurn(status) ? updatedSelection : selection;
    return {
      facts: resultFacts,
      selection: resultSelection,
      messages: [
        getInferenceSetupText({
          facts: resultFacts,
          selection: resultSelection,
          proposition,
        }),
        getStatusText(status),
      ].concat(comment ? [comment] : []),
      threads,
      turn: turn + +goToNextTurn(status),
    };
  }

  async function infer(selection: boolean[], proposition: string) {
    if (proposition == undefined) {
      throw new Error("Proposition is undefined");
    }
    const input = `Consider the following facts:
${factsToString(updatedFacts)}

${selectionText(
  selection,
)} imply "${proposition}"? Let's think through this step by step.`;

    const explanation = await complete({ input, model: gpt.four });
    const inference = await complete({
      input: `${input}
${explanation}

In conclusion, the proposition "${proposition}" is probably [true|false|indeterminate]`,
      model: gpt.three,
    });
    return { explanation, inference };
  }

  async function getInferenceResult({
    selection,
    proposition,
  }: {
    selection: boolean[];
    proposition: string;
  }) {
    if (proposition == undefined) {
      throw new Error("Proposition is undefined");
    }
    if (selection.length != updatedFacts.length) {
      console.log("selection");
      console.log(selection);
      console.log("facts");
      console.log(facts);
      throw new Error(
        `Expected selection length ${selection.length} to equal facts length ${facts.length}.`,
      );
    }
    console.log("selection", selection);
    console.log("updatedFacts", updatedFacts);
    const { explanation, inference } = await infer(selection, proposition);
    const paragraphs = [
      getInferenceSetupText({ facts: updatedFacts, proposition, selection }),
      getInferenceText({ explanation, inference }),
    ];
    const success = inferenceToBoolean(inference);
    return { paragraphs, success };
  }

  const oneStep = await getInferenceResult({
    selection: fill(facts, false).concat(fill(userFacts, true)),
    proposition: fact,
  });
  if (!oneStep.success) {
    return turnResult({
      status: "try again",
      threads: { oneStep: oneStep.paragraphs },
      comment: "New facts must imply replaced fact.",
    });
  }

  if (turn == 0) {
    return turnResult({
      status: "continue",
      threads: { oneStep: oneStep.paragraphs },
    });
  }
  const [, selectionTail] = fill(facts.concat(userFacts), true);
  const coherence = await getInferenceResult({
    selection: [false].concat(selectionTail),
    proposition,
  });
  if (!coherence.success) {
    return turnResult({
      status: "try again",
      threads: {
        oneStep: oneStep.paragraphs,
        coherence: coherence.paragraphs,
      },
      comment: "Collectively, all facts must imply proposition.",
    });
  }
  const conditionedOnUpdated = await getInferenceResult({
    selection: updatedSelection,
    proposition: fact,
  });
  const status = conditionedOnUpdated.success ? "continue" : "win";
  return turnResult({
    status,
    threads: {
      oneStep: oneStep.paragraphs,
      coherence: coherence.paragraphs,
      multiStep: conditionedOnUpdated.paragraphs,
    },
    comment: conditionedOnUpdated.success
      ? "Proposition still follows from updated facts."
      : "You broke the chain! GPT couldn't infer the proposition from the updated facts.",
  });
}

function bold(text: string) {
  return `**${text}**`;
}

function getInferenceSetupText({
  facts,
  selection,
  proposition,
}: {
  facts: string[];
  selection: boolean[];
  proposition: string;
}) {
  return `${headerPrefix} Facts
${factsToString(
  zip(facts, selection).map(([fact, selected]): string =>
    selected ? bold(fact) : fact,
  ),
)}
${headerPrefix} Proposition
_${proposition}_`;
}
function getInferenceText({
  explanation,
  inference,
}: {
  explanation: string;
  inference: string;
}) {
  return `\
Inference: ${bold(inference)}
${headerPrefix} Explanation
${explanation}`;
}

function getOptions(interaction: ChatInputCommandInteraction) {
  const factIndex = interaction.options.getNumber("fact");
  if (factIndex == undefined) {
    throw new Error("Fact index is undefined");
  }
  if (factIndex == null) {
    throw new Error("Fact index is null");
  }
  const userInput = interaction.options.getString("new-facts");
  if (userInput == undefined) {
    throw new Error("User input is undefined");
  }
  if (userInput == null) {
    throw new Error("User input is null");
  }
  return { factIndex, userInput };
}

function threadsToObjects(threads: Threads) {
  return Object.entries(threads).map(([key, value]: [string, string[]]) => ({
    name: threadNames[key],
    explanation: value.join("\n"),
  }));
}

async function handleThreads(
  channel: TextChannel,
  threads: { name; explanation }[],
) {
  return await threads.forEach(async ({ name, explanation }) => {
    const thread = await channel.threads.create({
      name,
      autoArchiveDuration: 60,
    });
    return await thread.send(explanation);
  });
}

// Create commands
export const Commands = [
  {
    data: new SlashCommandBuilder()
      .setName("play")
      .setDescription(`Play inference Jenga`)
      .addSubcommand((subcommand) =>
        subcommand
          .setName(subcommands.start)
          .setDescription("Start a new game."),
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName(subcommands.update)
          .setDescription("Choose a fact to update.")
          .addNumberOption((option) =>
            option
              .setName("fact")
              .setDescription("The fact to remove.")
              .setRequired(true),
          )
          .addStringOption((option) =>
            option
              .setName("new-facts")
              .setDescription("The facts to replace it with.")
              .setRequired(true),
          ),
      ),
    facts: [],
    players: [],
    selection: [],
    threads: {
      oneStep: null,
      coherence: null,
      multiStep: null,
    },
    turn: 0,
    async execute(interaction: ChatInputCommandInteraction) {
      await interaction.deferReply();
      const subcommand = interaction.options.getSubcommand();
      switch (subcommand) {
        case subcommands.start:
          const members: ThreadMemberManager | Collection<string, GuildMember> =
            interaction.channel.members;
          if (members instanceof ThreadMemberManager) {
            throw Error("Thread Member Manager");
          } else {
            this.players = getUsernames(members);
          }
          const truth = randomBoolean();
          const positiveProposition = randomChoice(propositions);
          const proposition = truth
            ? positiveProposition
            : await negate(positiveProposition);
          this.facts = [proposition];
          this.selection = [true];
          const channel = interaction.channel;
          if (channel == null) {
            throw Error("Cannot send message to null channel");
          }

          await handleInteraction({
            interaction,
            message: getInferenceSetupText({
              facts: this.facts,
              proposition,
              selection: this.selection,
            }),
          });
          break;
        case subcommands.update:
          const { factIndex, userInput } = getOptions(interaction);
          const whatYouDid = `You replaced fact ${factIndex} with "${userInput}"`;
          const { facts, messages, selection, threads, turn } =
            await handleUpdateSubcommand({
              factIndex,
              selection: this.selection,
              facts: this.facts,
              turn: this.turn,
              userInput,
            });
          const message = [whatYouDid].concat(messages).join("\n");
          this.facts = facts;
          this.selection = selection;
          this.turn = turn;

          if (interaction.channel instanceof TextChannel) {
            await handleThreads(interaction.channel, threadsToObjects(threads));
          }

          return await handleInteraction({ interaction, message });

        default:
          break;
      }
    },
  },
];
