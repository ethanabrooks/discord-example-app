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
} from "discord.js";
import { buttons } from "./buttons.js";
import { Stream } from "form-data";
import catchError from "./utils/errors.js";
import { complete } from "./gpt.js";
import * as prompt from "./prompts.js";
import { threadId } from "worker_threads";

const DEBUG = false;
const BUILT_IN_RESPONSE_LIMIT = 2000;

function splitAtResponseLimit(text: string) {
  return [
    text.slice(0, BUILT_IN_RESPONSE_LIMIT),
    text.slice(BUILT_IN_RESPONSE_LIMIT),
  ];
}

async function handleInteraction({
  interaction,
  text,
  firstReply = true,
  files = [],
}: {
  interaction: CommandInteraction;
  text: string;
  firstReply?: boolean;
  files?: (
    | BufferResolvable
    | Stream
    | JSONEncodable<APIAttachment>
    | Attachment
    | AttachmentBuilder
    | AttachmentPayload
  )[];
}) {
  const [content, excess] = splitAtResponseLimit(text);
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
  if (channel == null) {
    console.log("Cannot send message to null channel");
    return;
  }

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
                text: excess,
                interaction,
                firstReply,
              });
              break;
            default:
              console.log("Cannot use button " + buttonInteraction.customId);
          }
        })
        .catch(async (e) => {
          catchError(e);
          console.log("firstReply:", firstReply);
          console.log("Trying again with firstReply", !firstReply);
          return await (!firstReply
            ? interaction.followUp(reply)
            : channel.send(reply).catch((e) => {
                catchError(e);
                console.log("Giving up");
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

async function performInferrence(facts: string[], proposition: string) {
  const input = `Do the following facts:
${factsToString(facts)}}

imply the proposition "${proposition}"? Let's think through this step by step.`;

  const explanation = await complete({ input, model: gpt.four });
  const inferrence = await complete({
    input: `${input}
${explanation}

In conclusion, the proposition "${proposition}" is [true|false|indeterminate]`,
    model: gpt.three,
  });
  return { explanation, inferrence };
}

function inferrenceToBoolean(inferrence: string) {
  inferrence = inferrence.toLowerCase();
  console.log("inferrence:", inferrence);
  const containsTrue = inferrence.includes("true");
  const containsFalse = inferrence.includes("false");
  if (containsTrue && !containsFalse) {
    return true;
  } else if (!containsTrue && containsFalse) {
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

async function userInputToFactsList(text: string) {
  const newFactsString = await complete({
    input: `
        ${prompt.factPrefixes}
        ${text}`,
    model: gpt.three,
  });
  return splitFacts(newFactsString);
}

function validFactIndex(factIndex: number, length: number) {
  return factIndex < 0 || length <= factIndex;
}

async function promptNewFactIndex(length: number, userInput: string) {
  const requiredFactIndex = length == 1 ? `${1}` : `between 1 and ${length}`;
  return `fact index must be ${requiredFactIndex}.
    
(You wrote: "${userInput}")`;
}

async function handleUpdateSubcommand({
  factIndex,
  facts,
  proposition,
  truth,
  turn,
  userInput,
}: {
  factIndex: number;
  facts: string[];
  proposition: string;
  truth: boolean;
  turn: number;
  userInput: string;
}) {
  if (validFactIndex(factIndex, facts.length)) {
    const text = await promptNewFactIndex(facts.length, userInput);
    return { text, facts, turn };
  }

  const newFacts = await userInputToFactsList(userInput);
  const fact = facts[factIndex];
  const short = await performInferrence(newFacts, fact);
  const texts = [
    getGroundTruthText({ facts: newFacts, proposition: fact, truth: true }),
    getInferenceText({
      explanation: short.explanation,
      inferrence: short.inferrence,
      factIndex,
      userInput,
    }),
  ];
  if (!inferrenceToBoolean(short.inferrence)) {
    return { texts: texts.concat(["### Try again!"]), facts, turn };
  }

  const updatedFacts = facts
    .slice(0, factIndex)
    .concat(newFacts)
    .concat(facts.slice(factIndex + 1));

  if (turn == 0) {
    return {
      texts: texts.concat([getWinText({ truth, newTruth: truth, win: false })]),
      facts: updatedFacts,
      turn: turn + 1,
    };
  }

  const long = await performInferrence(updatedFacts, proposition);
  const newTruth = inferrenceToBoolean(long.inferrence);
  const win = newTruth != truth;

  return {
    texts: [
      "# Single-Step Reasoning",
      ...texts,
      "# Multi-Step Reasoning",
      getGroundTruthText({ facts: updatedFacts, proposition, truth }),
      getInferenceText({
        factIndex,
        userInput,
        inferrence: long.inferrence,
        explanation: long.explanation,
      }),
      getWinText({ truth, newTruth, win }),
    ],
    facts: updatedFacts,
    turn: turn + 1,
  };
}

function getGroundTruthText({ facts, proposition, truth }) {
  return `## Facts
${factsToString(facts)}
## Proposition
${proposition.replace(/\.$/, "")}: **${truth}**`;
}

function getInferenceText({
  explanation,
  factIndex,
  inferrence,
  userInput,
}: {
  explanation: string;
  factIndex: number;
  inferrence: string;
  userInput: string;
}) {
  return `\
The user changed fact ${factIndex + 1} to "${userInput}".
Inferrence: **${inferrence}**
## Explanation
${explanation}`;
}

function getWinText({ truth, newTruth, win }) {
  return `## Status
Previous inference: **${truth}**
New inference: **${newTruth}**
${win ? "# You win!" : "Keep playing."}`;
}

function getOptions(interaction: ChatInputCommandInteraction) {
  const factIndex = interaction.options.getNumber("fact") - 1;
  const userInput = interaction.options.getString("new-facts");
  return { factIndex, userInput };
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
    proposition: null,
    negative: null,
    truth: null,
    facts: [],
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
            console.log("Thread Member Manager");
          } else {
            this.players = getUsernames(members);
          }
          this.proposition = randomChoice(prompt.propositions);
          this.truth = false; // randomBoolean();
          console.log(this.truth);
          if (!this.truth) {
            this.negative = await negate(this.proposition);
          }
          const fact = this.truth ? this.proposition : this.negative;
          this.facts = [fact];
          await handleInteraction({
            interaction,
            text: getGroundTruthText({
              facts: this.facts,
              proposition: this.proposition,
              truth: this.truth,
            }),
          });
          break;
        case subcommands.update:
          const proposition = this.proposition;
          const { factIndex, userInput } = getOptions(interaction);
          const { texts, facts, turn } = await handleUpdateSubcommand({
            factIndex,
            facts: this.facts,
            userInput,
            proposition,
            truth: this.truth,
            turn: this.turn,
          });
          const text = texts.join("\n");
          this.facts = facts;
          this.turn += turn;

          return await handleInteraction({ interaction, text });

        default:
          break;
      }
    },
  },
];
