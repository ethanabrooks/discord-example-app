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
  const input = `Given the following facts:
${factsToString(facts)}}

is the proposition "${proposition}" more likely to be true than false? Let's think through this step by step.`;

  const explanation = await complete({ input, model: gpt.four });
  const inferrence = await complete({
    input: `${input}
${explanation}

In conclusion, the proposition "${proposition}" is probably [true|false|indeterminate]`,
    model: gpt.three,
  });
  return { explanation, inferrence };
}

function inferrenceToBoolean(inferrence: string) {
  inferrence = inferrence.toLowerCase();
  console.log("inferrence:", inferrence);
  const containsTrue = inferrence.includes("true");
  const containsFalse = inferrence.includes("false");
  if (inferrence.includes("true than false") || (containsTrue && !containsFalse)) {
    return true;
  } else if (inferrence.includes("false than true") || (!containsTrue && containsFalse)) {
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

async function userInputToFactsList(text: string, facts: string[]) {
  const noPronouns = await complete({
    input: `${prompt.replacePronouns}

\`\`\`md
# Original facts
${factsToString(facts)}
# New facts
${text}
\`\`\``,
    model: gpt.three,
  });
  const [, noPronounsWithBackticks] = noPronouns.split(`
# New facts`);
  const [newFactString] = noPronounsWithBackticks.split(`
\`\`\``);
  const factsString = await complete({
    input: `
        ${prompt.factPrefixes}
        ${newFactString}`,
    model: gpt.three,
  });
  return splitFacts(factsString);
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
  turn,
  userInput,
}: {
  factIndex: number;
  facts: string[];
  proposition: string;
  turn: number;
  userInput: string;
}) {
  if (validFactIndex(factIndex, facts.length)) {
    const text = await promptNewFactIndex(facts.length, userInput);
    return { text, facts, turn };
  }

  const newFacts = await userInputToFactsList(userInput, facts);
  const fact = facts[factIndex];
  const short = await performInferrence(newFacts, fact);
  const texts = [
    getGroundTruthText({ facts: newFacts, proposition: fact }),
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
      texts: texts.concat([getWinText({ win: false })]),
      facts: updatedFacts,
      turn: turn + 1,
    };
  }

  const long = await performInferrence(updatedFacts, proposition);
  const newTruth = inferrenceToBoolean(long.inferrence);
  const win = !newTruth;

  return {
    texts: [
      "# Single-Step Reasoning",
      ...texts,
      "# Multi-Step Reasoning",
      getGroundTruthText({ facts: updatedFacts, proposition }),
      getInferenceText({
        factIndex,
        userInput,
        inferrence: long.inferrence,
        explanation: long.explanation,
      }),
      getWinText({ win }),
    ],
    facts: updatedFacts,
    turn: turn + 1,
  };
}

function getGroundTruthText({ facts, proposition }) {
  return `## Facts
${factsToString(facts)}
## Proposition
_${proposition}_`;
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
The user changed fact ${factIndex + 1} to: _${userInput}_
Inferrence: **${inferrence}**
## Explanation
${explanation}`;
}

function getWinText({ win }: { win: boolean }) {
  return `${win ? "# You win!" : "## Keep playing."}`;
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
          const truth = randomBoolean();
          console.log(truth);
          console.log("this.proposition", this.proposition);
          if (!truth) {
            this.proposition = await negate(this.proposition);
          }
          this.facts = [this.proposition];
          console.log("facts", this.facts);
          await handleInteraction({
            interaction,
            text: getGroundTruthText({
              facts: this.facts,
              proposition: this.proposition,
            }),
          });
          break;
        case subcommands.update:
          const proposition = this.proposition;
          const { factIndex, userInput } = getOptions(interaction);
          const { texts, facts, turn } = await handleUpdateSubcommand({
            factIndex,
            facts: this.facts,
            proposition,
            turn: this.turn,
            userInput,
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
