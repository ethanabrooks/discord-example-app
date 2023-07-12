import {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  AttachmentBuilder,
  EmbedBuilder,
  CommandInteraction,
  Message,
} from "discord.js";
import createChatCompletionWithBackoff from "./gpt.js";
import { ChatCompletionRequestMessage } from "openai";

const clientId = process.env.APP_ID;
const BUILT_IN_RESPONSE_LIMIT = 2000;

function splitAtResponseLimit(text: string) {
  return [
    text.slice(0, BUILT_IN_RESPONSE_LIMIT),
    text.slice(BUILT_IN_RESPONSE_LIMIT),
  ];
}

type Options = {
  firstReply?: boolean;
  speak?: boolean;
};

// Buttons
type ButtonComponents = {
  id: string;
  label: string;
  style: ButtonStyle;
};
const buttons = {
  submit: {
    id: "submit",
    label: "Submit to GPT",
    style: ButtonStyle.Primary,
  },
  visualize: {
    id: "visualize",
    label: "Visualize",
    style: ButtonStyle.Secondary,
  },
};

async function replyWithGPTCompletion(interaction: CommandInteraction) {
  const channel = interaction.channel;
  let content: string;
  if (channel == null) {
    content = "Error: Channel not found";
  } else {
    const messages = await interaction.channel.messages
      .fetch({
        limit: 100,
        cache: false,
      })
      .then((messages) =>
        messages.reverse().map(
          (message): ChatCompletionRequestMessage => ({
            role:
              // message.interaction != null &&
              // Just check if author id matches bot id
              message.author.id === clientId ? "system" : "user",
            content: message.content,
          }),
        ),
      )
      .catch(console.error);
    if (messages instanceof Object) {
      console.log(messages);

      // Query GPT
      let excess: string;
      console.log(messages);
      const completion = await createChatCompletionWithBackoff(messages);
      if (completion === undefined) {
        [content, excess] = ["Error: GPT-3 API call failed", ""];
      } else {
        [content, excess] = splitAtResponseLimit(completion);
      }
    } else {
      content = "Error: Failed to fetch messages";
    }
  }
  return content;
}

// Create commands
export const Commands = [
  {
    data: new SlashCommandBuilder()
      .setName("g")
      .setDescription("Query GPT with recent chat history"),
    async execute(
      interaction: CommandInteraction,
      { firstReply = true, speak = true }: Options = {},
    ) {
      if (firstReply) {
        await interaction.deferReply();
      }

      const content = speak
        ? await replyWithGPTCompletion(interaction)
        : "behold the visualization";

      const row = Object.values(buttons)
        .map(({ id, label, style }: ButtonComponents) =>
          new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style),
        )
        .reduce(
          (row, button) => row.addComponents(button),
          new ActionRowBuilder<ButtonBuilder>(),
        );

      const reply = { content, components: [row] };

      // Update reply
      const response = await (firstReply
        ? interaction.followUp(reply)
        : interaction.channel.send(reply));

      // Button interaction
      try {
        const confirmation = await response.awaitMessageComponent();

        // Send new message
        switch (confirmation.customId) {
          case buttons.submit.id:
            await confirmation.update({ ...reply, components: [] });
            await this.execute(interaction, { firstReply: false });
            break;
          case buttons.visualize.id:
            // Add attached image
            const file = new AttachmentBuilder("test.png");
            const exampleEmbed = new EmbedBuilder()
              .setTitle("Test Image")
              .setImage("attachment://test.png");

            // Send image
            await interaction.channel.send({
              embeds: [exampleEmbed],
              files: [file],
            });

            // Clear
            await confirmation.update({ ...reply, components: [] });
            await this.execute(interaction, {
              firstReply: false,
              speak: false,
            });
            break;
          default:
            console.log("Cannot use button " + confirmation.customId);
        }

        // Timeout
      } catch (e) {
        console.log(e);
        await response.edit({
          content: `${e}`,
          components: [],
        });
      }
    },
  },
];
