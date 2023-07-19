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
  // Object.values(buttons)
  //   .map(({ id, label, style }: ButtonComponents) =>
  //     new ButtonBuilder()
  //       .setCustomId(id)
  //       .setLabel(label)
  //       .setStyle(style),
  //   )
  //   .reduce(
  //     (row, button): ActionRowBuilder<ButtonBuilder> =>
  //       row.addComponents(button),
  //     new ActionRowBuilder<ButtonBuilder>(),
  //   ),

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
  add: "add",
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
  return facts.map((fact, index) => `${index + 1}. **${fact}**`).join("\n");
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
          .setName(subcommands.add)
          .setDescription("Add new facts.")
          .addStringOption((option) =>
            option
              .setName("new-facts")
              .setDescription("The facts to replace it with.")
              .setRequired(true),
          ),
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
    truth: null,
    facts: [],
    players: [],
    turn: 0,
    factsToString() {
      return `${factsToString(this.facts)}`;
    },
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
            this.players = Array.from(members.values())
              .filter(({ user }) => !user.bot)
              .map(({ user }) => user.username);
          }
          const randomIndex = Math.floor(
            Math.random() * prompt.propositions.length,
          );
          this.proposition = prompt.propositions[randomIndex];
          this.truth = Math.random() < 0.5;
          const fact = this.truth
            ? this.proposition
            : await complete({
                input: `Negate this statement (just return the negated statement, nothing else): ${this.proposition}`,
                model: `${gpt.three}`,
              });
          this.facts = [fact];
          console.log("TRUTH", this.truth);
          await handleInteraction({
            interaction,
            text: `Given the following facts:
            ${factsToString(this.facts)}

The statement "**${this.proposition}**" is: **_${this.truth}_**`,
          });
          break;
        case subcommands.add:
        case subcommands.update:
          const userInput = interaction.options.getString("new-facts");
          const newFactsString = await complete({
            input: `
        ${prompt.factPrefixes}
        ${userInput}`,
            model: gpt.three,
          });
          let newFactsList = splitFacts(newFactsString);
          const username = interaction.user.username;

          let whatYouDid: string;
          switch (subcommand) {
            case subcommands.add:
              newFactsList = this.facts.concat(newFactsList);
              whatYouDid = `${username} added facts: 
"${userInput}"`;
              break;
            case subcommands.update:
              const factIndex = interaction.options.getNumber("fact") - 1;
              whatYouDid = `${username} changed fact ${
                factIndex + 1
              } to: "${userInput}"`;
              if (factIndex < 0 || this.facts.length <= factIndex) {
                const requiredFactIndex =
                  this.facts.length == 1
                    ? `${1}`
                    : `between 1 and ${this.facts.length}`;
                return await handleInteraction({
                  interaction,
                  text: `fact index must be ${requiredFactIndex}`,
                });
              }
              newFactsList = this.facts
                .slice(0, factIndex)
                .concat(newFactsList)
                .concat(this.facts.slice(factIndex + 1));
              break;
            default:
              throw new Error(`Unknown subcommand ${subcommand}`);
          }

          const inferrencePrompt = `Given the following facts:
          ${factsToString(newFactsList)}}
          
          The statement "${this.proposition}" is:`;

          const inferrence = (
            await complete({
              input: inferrencePrompt + " [true|false|indeterminate]",
              model: gpt.four,
            })
          ).toLowerCase();
          console.log("inferrence:", inferrence);
          const containsTrue = inferrence.includes("true");
          const containsFalse = inferrence.includes("false");
          let newTruth: null | boolean = null;
          if (containsTrue && !containsFalse) {
            newTruth = true;
          } else if (!containsTrue && containsFalse) {
            newTruth = false;
          }
          const change = newTruth !== this.truth;
          console.log(
            "newTruth:",
            newTruth,
            "this.truth:",
            this.truth,
            "change:",
            change,
          );
          let text = `${whatYouDid}

${factsToString(newFactsList)}

The inferrence is ${change ? "now" : "still"}: ${inferrence} `;
          if (change == null) {
            text = `${text}

This resulted in an indeterminate inferrence so the facts are still:
${factsToString(this.facts)}.`;
          } else {
            this.facts = newFactsList;
          }
          console.log(this.facts);
          this.turn += 1;
          text = `${text}

${change ? "You lose, " : "Keep playing, "}${username}
`;
          return await handleInteraction({
            interaction,
            text,
          });

        default:
          break;
      }
    },
  },
];
