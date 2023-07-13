import {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  CommandInteraction,
} from "discord.js";
import { createChatCompletionWithBackoff, openai } from "./gpt.js";
import { ChatCompletionRequestMessage } from "openai";
import scenePrompt from "./scenePrompt.js";

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

async function interactionToMessages(
  interaction: CommandInteraction,
): Promise<void | ChatCompletionRequestMessage[]> {
  return await interaction.channel.messages
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
}

async function messagesToContent(
  messages: void | ChatCompletionRequestMessage[],
) {
  if (messages instanceof Object) {
    // Query GPT
    const content = await createChatCompletionWithBackoff(messages);
    return content === undefined ? "Error: GPT-3 API call failed" : content;
  } else {
    return "Error: Failed to fetch messages";
  }
}

async function replyWithGPTCompletion(interaction: CommandInteraction) {
  const channel = interaction.channel;
  if (channel == null) {
    return "Error: Channel not found";
  } else {
    const messages = await interactionToMessages(interaction);
    return await messagesToContent(messages);
  }
}

async function visualize(interaction: CommandInteraction) {
  // Add attached image
  let messages = await interactionToMessages(interaction);
  if (!(messages instanceof Object)) {
    messages = [];
  }
  messages.push({ role: "system", content: scenePrompt });
  const scene = await messagesToContent(messages);
  console.log("=================== Scene");
  console.log(scene);

  let response: any | null = null;
  try {
    response = await openai.createImage({
      prompt: scene.slice(0, 1000),
      n: 1,
      size: "256x256",
    });
  } catch (e) {
    console.log(`Error: ${e}`);
  }
  if (response != null) {
    const [data] = response.data.data;
    const exampleEmbed = new EmbedBuilder()
      .setTitle("Scene")
      .setImage(data.url)
      .setDescription(scene);

    const reply = { embeds: [exampleEmbed] };

    // Send image
    interaction.followUp(reply);
  } else {
    await interaction.reply("Error: Failed to create image");
  }
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
        await achknowledgeAndremoveButtons();
        await visualize(interaction);

        // Clear
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
