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
  start: "start",
  choose: "choose",
};
function splitFacts(factsString: string) {
  return factsString.split("\n").flatMap((line) => {
    const index = line.indexOf("]");
    return index === -1 ? [] : [line.substring(index + 1).trim()];
  });
}

function factsToString(facts: string[]) {
  return facts.map((fact, index) => `${index + 1}. ${fact}`).join("\n");
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
          .setName(subcommands.choose)
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
    culprit: null,
    facts: [],
    players: [],
    turn: 0,
    factsToString() {
      return `${factsToString(this.facts)}
      
Culprit: ${this.culprit}`;
    },
    async checkCulprit(facts) {
      if (DEBUG) return prompt.culprit;
      const culprit = await complete({
        input: `
          ${facts.join("\n")}
          ${prompt.inferrence}`,
        model: gpt.four,
      });
      return culprit.endsWith(".")
        ? await complete({
            input: `"${culprit}"
        ${prompt.getName}`,
            model: gpt.three,
          })
        : culprit;
    },
    async execute(interaction: ChatInputCommandInteraction) {
      let player: string;
      await interaction.deferReply();
      switch (interaction.options.getSubcommand()) {
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
          const scenario = DEBUG
            ? prompt.scenario
            : await complete({
                input: prompt.initial,
                model: gpt.three,
              });
          const factsString = DEBUG
            ? prompt.factsString
            : await complete({
                input: `
          ${prompt.factPrefixes}
          ${scenario}`,
                model: gpt.three,
              });
          this.facts = splitFacts(factsString);
          this.culprit = await this.checkCulprit(this.facts);
          console.log(this.facts);
          const content = prompt.gameDescription;
          console.log(this.players);
          player = this.players[this.turn % this.players.length];
          await handleInteraction({
            interaction,
            text: `${this.factsToString()}
          
Turn: ${player}`,
          });
          break;
        case subcommands.choose:
          const factIndex = interaction.options.getNumber("fact") - 1;
          const newFactString = interaction.options.getString("new-facts");
          const username = interaction.user.username;
          if (factIndex < 0 || this.facts.length <= factIndex) {
            return await handleInteraction({
              interaction,
              text: `fact index must be between 1 and ${this.facts.length}.`,
            });
          }
          player = this.players[this.turn % this.players.length];
          if (player == username) {
            let newFactList = this.facts;
            if (!DEBUG) {
              const newFactsString2 = await complete({
                input: `
${prompt.factPrefixes}
${newFactString}`,
                model: gpt.three,
              });
              newFactList = this.facts
                .slice(0, factIndex)
                .concat(splitFacts(newFactsString2))
                .concat(this.facts.slice(factIndex + 1, -1));
            }
            const newCulprit = await this.checkCulprit(newFactList);
            if (newCulprit === this.culprit) {
              this.facts = newFactList;
              await handleInteraction({
                interaction,
                text: `${this.factsToString()}

Still in the game, ${username}.`,
              });
              return;
            } else {
              await handleInteraction({
                interaction,
                text: `You lose, ${username}. The new culprit is ${newCulprit}.`,
              });
              return;
            }
          } else {
            await handleInteraction({
              interaction,
              text: `It's not your turn, ${username}.`,
            });
          }
          this.turn += 1;
          break;

        default:
          break;
      }
    },
  },
];
