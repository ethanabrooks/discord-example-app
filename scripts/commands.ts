import {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  AttachmentBuilder,
  EmbedBuilder,
  CommandInteraction,
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
  reveal: {
    id: "reveal",
    label: "Reponse cut off. Click to reveal.",
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
      // Query GPT
      content = await createChatCompletionWithBackoff(messages);
      if (content === undefined) {
        content = "Error: GPT-3 API call failed";
      }
    } else {
      content = "Error: Failed to fetch messages";
    }
  }
  return content;
}

async function handleInteraction({
  firstReply,
  interaction,
  text,
}: {
  firstReply: boolean;
  interaction: CommandInteraction;
  text: string;
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

  const reply = { content, components: [row] };

  // Update reply
  const response = await (firstReply
    ? interaction.followUp(reply)
    : interaction.channel.send(reply));

  // Button interaction
  try {
    const confirmation = await response.awaitMessageComponent();
    async function achknowledgeAndremoveButtons() {
      await confirmation.update({ ...reply, components: [] });
    }

    // Send new message
    switch (confirmation.customId) {
      case buttons.reveal.id:
        await achknowledgeAndremoveButtons();
        await handleInteraction({
          text: excess,
          interaction,
          firstReply,
        });
        break;
      case buttons.submit.id:
        await achknowledgeAndremoveButtons();
        await handleInteraction({
          firstReply: false,
          interaction,
          text: await replyWithGPTCompletion(interaction),
        });
        break;
      case buttons.visualize.id:
        // Add attached image
        const file = new AttachmentBuilder("test.png");
        const exampleEmbed = new EmbedBuilder()
          .setTitle("Test Image")
          .setImage(
            "https://th.bing.com/th/id/OIP.9M2bzzvmjOKDJmpq0UGZ2gHaFE?pid=ImgDet&rs=1",
          );

        // Send image
        await interaction.channel.send({
          embeds: [exampleEmbed],
          files: [file],
        });

        // Clear
        await achknowledgeAndremoveButtons();
        await handleInteraction({
          interaction,
          firstReply: false,
          text: "Behold the visualization!",
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
}

// Create commands
export const Commands = [
  {
    data: new SlashCommandBuilder()
      .setName("g")
      .setDescription("Query GPT with recent chat history"),
    async execute(interaction: CommandInteraction) {
      await interaction.deferReply();
      const text = await replyWithGPTCompletion(interaction);
      await handleInteraction({
        firstReply: true,
        interaction,
        text,
      });
    },
  },
];
