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
const COHERENCE_VALIDATION = false;
const headerPrefix = "###";
const tryAgainText = `${headerPrefix} Try again!`;
const keepPlayingText = `${headerPrefix} Keep playing.`;
const winText = "# You win!";
type Inferences<Type> = {
  oneStep?: Type;
  coherence?: Type;
  multiStep?: Type;
};
type Selection = {
  fact: string;
  selected: boolean;
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
  start: "start",
  update: "update",
};
function splitFacts(factsString: string) {
  return factsString.split("\n").flatMap((line) => {
    const index = line.indexOf("]");
    return index === -1 ? [] : [line.substring(index + 1).trim()];
  });
}

function factsToStrings(facts: string[]) {
  return facts.map((fact, index) => `${index + 1}. ${fact}`);
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

function getFact(input: Selection | string) {
  return typeof input == "string" ? input : input.fact;
}

function select(input: Selection | string) {
  const fact = getFact(input);
  return { fact, selected: true };
}

function deselect(input: Selection | string) {
  const fact = getFact(input);
  return { fact, selected: false };
}

function indicesText(selected: boolean[]) {
  const indices = selected.flatMap((selected, i) => (selected ? [i + 1] : []));
  const last = indices.pop();
  if (indices.length == 0) {
    return `${last}`;
  }
  return indices.join(", ") + ` and ${last}`;
}

async function handleUpdateSubcommand({
  factIndex,
  selections: selections,
  turn,
  userInput,
}: {
  factIndex: number;
  selections: Selection[];
  turn: number;
  userInput: string;
}): Promise<{
  messages: string[];
  selections: Selection[];
  reasons: Inferences<string[]>;
  turn: number;
}> {
  if (validFactIndex(factIndex, selections.length)) {
    const text = await promptNewFactIndex(
      selections.filter(({ selected }) => selected).length,
      userInput,
    );
    return {
      selections,
      messages: [text, getStatusText("try again")],
      reasons: {},
      turn,
    };
  }

  const facts = selections.map(getFact);
  const [proposition] = facts;
  const userFacts = await userInputToFacts(userInput);
  const plural = userFacts.length > 1;
  const commentsIntro = [
    `${headerPrefix} Proposed new fact${plural ? "s" : ""}`,
    ...userFacts.map((fact) => `_${fact}_`),
    `${headerPrefix} Result`,
  ];
  const replace = selections.filter(({ selected }) => selected)[factIndex - 1];
  if (replace == undefined) {
    throw new Error(`Fact at index ${factIndex} is undefined. Facts:
${selections}`);
  }

  const oldAndNew = selections
    .reduce(
      ({ tentative, count }, { selected, fact }) => {
        count = count + +selected;
        if (count == factIndex) {
          selected = false; // deselect the fact corresponding to factIndex
        }
        const selection = { fact, selected };
        return { tentative: [...tentative, { old: true, selection }], count };
      },
      { tentative: [], count: 0 },
    )
    .tentative.concat(
      userFacts.map(select).map((selection) => ({ old: false, selection })),
    ); // select all userFacts
  const tentative = oldAndNew.map(({ selection }) => selection);
  const tentativeWithItalics = oldAndNew.map(
    ({ old, selection: { fact, selected } }) => {
      return { fact: old ? fact : `_${fact}_`, selected };
    },
  );

  if (tentative.includes(replace)) {
    throw Error(`Tentative facts still include replaced fact.`);
  }

  function turnResult({
    status,
    reasons,
    comments,
  }: {
    status: Status;
    reasons: Inferences<string[]>;
    comments: string[];
  }) {
    const verb = goToNextTurn(status)
      ? "You replaced"
      : "You failed to replace";
    const whatYouDid = `${verb} fact ${factIndex} with "${userInput}"`;
    return {
      selections: goToNextTurn(status) ? tentative : selections,
      messages: [
        whatYouDid,
        ...comments,
        getInferenceSetupText({
          selections: goToNextTurn(status) ? tentativeWithItalics : selections,
          proposition,
          showAll: false,
          factStatus: goToNextTurn(status) ? "updated" : "unchanged",
        }),
        getStatusText(status),
      ],
      reasons,
      turn: turn + +goToNextTurn(status),
    };
  }

  async function infer(selections: Selection[], proposition: string) {
    if (proposition == undefined) {
      throw new Error("Proposition is undefined");
    }
    const indices = indicesText(selections.map(({ selected }) => !selected));
    const facts: string = factsToStrings(selections.map(getFact)).join("\n");
    const markdownString = await complete({
      input: `Remove fact${
        indices.length == 1 ? "" : "s"
      } ${indices} from the following list:
${facts}
Ensure that the remaining facts still make sense.`,
      model: gpt.three,
    });
    const markdownListRegex = /^(\d+\.\s.+)$/gm;
    const selectedFacts = [];
    let match;

    while ((match = markdownListRegex.exec(markdownString)) !== null) {
      selectedFacts.push(match[1]);
    }
    if (selectedFacts.length == 0) {
      selectedFacts.push(markdownString);
    }
    const input = `Consider the following fact${
      selectedFacts.length == 1 ? "" : "s"
    }:
${selectedFacts.join("\n")}
${
  selectedFacts.length == 1 ? "Does this fact" : "Do these facts"
} imply _${proposition}_? Think through it step by step.`;

    const explanation = await complete({ input, model: gpt.four });
    const inference = await complete({
      input: `${input}
${explanation}

In conclusion, the proposition _${proposition}_ is probably [true|false|indeterminate]`,
      model: gpt.three,
    });
    return { explanation, inference };
  }

  async function getInferenceResult({
    selections,
    proposition,
  }: {
    selections: Selection[];
    proposition: string;
  }) {
    const { explanation, inference } = await infer(selections, proposition);
    const paragraphs = [
      getInferenceSetupText({
        factStatus: "initial",
        proposition,
        selections,
        showAll: false,
      }),
      getInferenceText({ explanation, inference }),
    ];
    const success = inferenceToBoolean(inference);
    return { paragraphs, success };
  }

  const oneStep = await getInferenceResult({
    selections: [...selections.map(deselect), ...userFacts.map(select)],
    proposition: replace.fact,
  });
  if (!oneStep.success) {
    return turnResult({
      status: "try again",
      reasons: { oneStep: oneStep.paragraphs },
      comments: [
        ...commentsIntro,
        "The new facts did not imply the replaced fact.",
      ],
    });
  }

  if (turn == 0) {
    return turnResult({
      status: "continue",
      reasons: { oneStep: oneStep.paragraphs },
      comments: [
        ...commentsIntro,
        `The new fact${plural ? "s imply" : " implies"} _${proposition}_`,
        "The first fact was successfully updated.",
      ],
    });
  }
  const oneStepComment = `The new fact${plural ? "s imply" : " implies"} _${
    replace.fact
  }_`;
  const [head, ...tail]: Selection[] = [
    ...selections.map(select),
    ...userFacts.map(select),
  ];
  let coherenceParagraphs = null;
  if (COHERENCE_VALIDATION) {
    const coherence = await getInferenceResult({
      selections: [deselect(head), ...tail],
      proposition,
    });
    if (!coherence.success) {
      return turnResult({
        status: "try again",
        reasons: {
          oneStep: oneStep.paragraphs,
          coherence: coherence.paragraphs,
        },
        comments: [
          ...commentsIntro,
          `${oneStepComment}. However, taken with all of the existing facts, they do not imply the proposition. The proposed facts were rejected.`,
        ],
      });
    }
    coherenceParagraphs = coherence.paragraphs;
  }
  const multiStep = await getInferenceResult({
    selections: tentative,
    proposition,
  });
  const status = multiStep.success ? "continue" : "win";
  return turnResult({
    status,
    reasons: {
      oneStep: oneStep.paragraphs,
      coherence: coherenceParagraphs,
      multiStep: multiStep.paragraphs,
    },
    comments: [
      ...commentsIntro,
      oneStepComment,
      `Taken with all of the existing facts, they also imply the target proposition: _${proposition}_`,
      multiStep.success
        ? `Your new fact${
            plural ? "s were" : "was"
          } added but the target proposition still follows from updated facts.`
        : "You broke the chain! GPT couldn't infer the target proposition from the updated facts.",
    ],
  });
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
  selections,
  proposition,
  factStatus,
  showAll = true,
}: {
  factStatus: FactStatus;
  selections: Selection[];
  proposition: string;
  showAll?: boolean;
}) {
  const factStrings = factsToStrings(
    selections
      .filter(({ selected }) => selected)
      .map(({ fact: proposition, selected }): string =>
        selected && showAll ? bold(proposition) : proposition,
      ),
  );
  return `\
${headerPrefix} The fact${factStrings.length == 1 ? "" : "s"} are${getFactWord(
    factStatus,
  )}:
${factStrings.join("\n")}
${headerPrefix} Target Proposition
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
  reasons: Inferences<string[]>,
) {
  return await Object.entries(reasons)
    .filter(([, texts]) => texts != null)
    .map(([key, texts]) => ({
      name: threadNames[key],
      text: texts.join("\n"),
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
    selections: [],
    players: [],
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
          const positiveFact = `${randomChoice(propositions)}.`;
          const proposition = truth ? positiveFact : await negate(positiveFact);
          this.selections = [{ fact: proposition, selected: true }];
          const channel = interaction.channel;
          if (channel == null) {
            throw Error("Cannot send message to null channel");
          }

          await handleInteraction({
            interaction,
            message: getInferenceSetupText({
              factStatus: "initial",
              proposition,
              selections: this.selections,
              showAll: false,
            }),
          });
          break;
        case subcommands.update:
          const { factIndex, userInput } = getOptions(interaction);
          const {
            messages,
            selections,
            reasons: threads,
            turn,
          } = await handleUpdateSubcommand({
            factIndex,
            selections: this.selections,
            turn: this.turn,
            userInput,
          });
          const message = messages.join("\n");
          this.selections = selections;
          this.turn = turn;

          if (interaction.channel instanceof TextChannel) {
            await handleThreads(interaction.channel, threads);
          }

          return await handleInteraction({ interaction, message });

        default:
          break;
      }
    },
  },
];
