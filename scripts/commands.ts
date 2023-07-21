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
import propositions from "./propositions.js";
import pronouns from "./pronouns.js";

const DEBUG = false;
const BUILT_IN_RESPONSE_LIMIT = 2000;
const headerPrefix = "###";

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

async function performInference(facts: string[], proposition: string) {
  const input = `Given the following facts:
${factsToString(facts)}}

is the proposition "${proposition}" more likely to be true than false? Let's think through this step by step.`;

  const explanation = await complete({ input, model: gpt.four });
  const inference = await complete({
    input: `${input}
${explanation}

In conclusion, the proposition "${proposition}" is probably [true|false|indeterminate]`,
    model: gpt.three,
  });
  return { explanation, inference };
}

function inferenceToBoolean(inference: string) {
  inference = inference.toLowerCase();
  console.log("inference:", inference);
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

async function userInputToFactsList(text: string) {
  const factsString = await complete({
    input: `Take the following text and prefix each assertion with '\n[FACT]' or '\n[OPINION]' (break up sentences if necessary):
        ${text}`,
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

function currentFactsString(facts: string[]) {
  return `${headerPrefix} Current facts
${factsToString(facts)}`;
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

  const newFacts = await userInputToFactsList(userInput);
  const { valid, explanation } = await validateFacts([
    proposition,
    ...newFacts,
  ]);
  if (!valid) {
    return { texts: [explanation, currentFactsString(facts)], facts, turn };
  }
  const fact = facts[factIndex];
  const short = await performInference(newFacts, fact);
  const texts = [
    getGroundTruthText({ facts: newFacts, proposition: fact }),
    getInferenceText({
      explanation: short.explanation,
      inference: short.inference,
      factIndex,
      userInput,
    }),
  ];
  if (!inferenceToBoolean(short.inference)) {
    return {
      texts: texts.concat([
        currentFactsString(facts),
        `${headerPrefix} Try again!`,
      ]),
      facts,
      turn,
    };
  }

  const updatedFacts = facts
    .slice(0, factIndex)
    .concat(newFacts)
    .concat(facts.slice(factIndex + 1));

  if (turn == 0) {
    return {
      texts: texts.concat([
        currentFactsString(updatedFacts),
        getWinText({ win: false }),
      ]),
      facts: updatedFacts,
      turn: turn + 1,
    };
  }

  const long = await performInference(updatedFacts, proposition);
  const newTruth = inferenceToBoolean(long.inference);
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
        inference: long.inference,
        explanation: long.explanation,
      }),
      currentFactsString(updatedFacts),
      getWinText({ win }),
    ],
    facts: updatedFacts,
    turn: turn + 1,
  };
}

function getGroundTruthText({ facts, proposition }) {
  return `${headerPrefix} Facts
${factsToString(facts)}
${headerPrefix} Proposition
_${proposition}_`;
}

function getInferenceText({
  explanation,
  factIndex,
  inference,
  userInput,
}: {
  explanation: string;
  factIndex: number;
  inference: string;
  userInput: string;
}) {
  return `\
The user changed fact ${factIndex + 1} to: _${userInput}_
inference: **${inference}**
${headerPrefix} Explanation
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
          this.proposition = randomChoice(propositions);
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
          this.turn = turn;

          return await handleInteraction({ interaction, text });

        default:
          break;
      }
    },
  },
];
async function validateFacts(
  facts: string[],
): Promise<{ valid: boolean; explanation: string }> {
  const query = `${factsToString(facts)}
Issues:`;
  const completion = await complete({
    input: `${pronouns}
    
${query}`,
  });
  const valid = completion == "none";
  const explanation = `${headerPrefix} Invalid use of pronouns
${query} ${completion}`;

  return { valid, explanation };
}
