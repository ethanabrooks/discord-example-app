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
} from "discord.js";
import { ButtonComponents, buttons } from "./buttons.js";
import submit from "./commands/submit.js";
import visualize from "./commands/visualize.js";
import diagram from "./commands/diagram.js";
import { interactionToMessages } from "./utils/messages.js";
import exportMessages from "./commands/export.js";
import sendToChannel from "./commands/sendToChannel.js";
import { Stream } from "form-data";
import catchError from "./utils/errors.js";

const BUILT_IN_RESPONSE_LIMIT = 2000;

function splitAtResponseLimit(text: string) {
  return [
    text.slice(0, BUILT_IN_RESPONSE_LIMIT),
    text.slice(BUILT_IN_RESPONSE_LIMIT),
  ];
}

async function handleInteraction({
  firstReply,
  interaction,
  text,
  files = [],
}: {
  firstReply: boolean;
  interaction: CommandInteraction;
  text: string;
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
  const row = Object.values(buttons)
    .filter(({ id }) => excess.length > 0 || id !== buttons.reveal.id)
    .map(({ id, label, style }: ButtonComponents) =>
      new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style),
    )
    .reduce(
      (row, button) => row.addComponents(button),
      new ActionRowBuilder<ButtonBuilder>(),
    );

  console.log("files", files);
  const reply = { content, components: [row], files };
  const channel = interaction.channel;
  if (channel == null) {
    console.log("Cannot send message to null channel");
    return;
  }

  // Update reply
  let response;
  response = await (firstReply
    ? interaction.followUp(reply)
    : channel.send(reply)).then(
      (response) => response
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
            case buttons.submit.id:
              await acknowledgeAndremoveButtons();
              await handleInteraction({
                firstReply: false,
                interaction,
                text: await submit(interaction),
              });
              break;
            case buttons.visualize.id:
              await acknowledgeAndremoveButtons();
              await visualize(interaction);
              break;
            case buttons.diagram.id:
              await acknowledgeAndremoveButtons();
              await diagram(interaction);
              break;
            default:
              console.log("Cannot use button " + buttonInteraction.customId);
          }
        }).catch(async (e) => {
          catchError(e)
          console.log("firstReply:", firstReply);
          console.log("Trying again with firstReply", !firstReply);
          return await (!firstReply
            ? interaction.followUp(reply)
            : channel.send(reply).catch(
              (e) => {
                catchError(e)
                console.log("Giving up");
                return;
              }
            ))
        }
        )
    )
}
;

// Create commands
export const Commands = [
  {
    data: new SlashCommandBuilder()
      .setName("g")
      .setDescription("Query GPT with recent chat history"),
    async execute(interaction: CommandInteraction) {
      await interaction.deferReply();
      await interactionToMessages(interaction);
      const text = await submit(interaction);
      await handleInteraction({
        firstReply: true,
        interaction,
        text,
      });
    },
  },
  {
    data: new SlashCommandBuilder()
      .setName("visualize")
      .setDescription("Visualize recent chat history as a scene"),
    async execute(interaction: CommandInteraction) {
      await interaction.deferReply();
      await visualize(interaction);
    },
  },
  {
    data: new SlashCommandBuilder()
      .setName("diagram")
      .setDescription("Create a diagram of the scene"),
    async execute(interaction: CommandInteraction) {
      await interaction.deferReply();
      await diagram(interaction);
    },
  },
  {
    data: new SlashCommandBuilder()
      .setName("export")
      .setDescription("Export messages to hastebin"),
    async execute(interaction: CommandInteraction) {
      await interaction.deferReply();
      const { text, files } = await exportMessages(interaction);
      await handleInteraction({
        firstReply: true,
        interaction,
        text,
        files,
      });
    },
  },
  {
    data: new SlashCommandBuilder()
      .setName("sendmessage")
      .setDescription("Send message to channel")
      .addStringOption((option) =>
        option
          .setName("message")
          .setDescription("Message to send")
          .setRequired(true),
      )
      .addStringOption((option) =>
        option
          .setName("channel")
          .setDescription("ID of destination channel")
          .setRequired(true),
      ),
    async execute(interaction: CommandInteraction) {
      await interaction.deferReply();

      const text = interaction.isChatInputCommand()
        ? await sendToChannel(interaction)
        : `Incompatible interaction: ${typeof interaction}`;
      await handleInteraction({
        firstReply: true,
        interaction,
        text,
      });
    },
  },
];
