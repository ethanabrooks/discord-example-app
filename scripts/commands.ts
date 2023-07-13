import {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  CommandInteraction,
  AttachmentBuilder,
} from "discord.js";
import { createChatCompletionWithBackoff, openai } from "./gpt.js";
import { ChatCompletionRequestMessage } from "openai";
import scenePrompt from "./scenePrompt.js";
import * as diagramPrompt from "./diagramPrompts.js";
import { initializeApp } from "firebase/app";
import { createCanvas } from "canvas";

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
  diagram: {
    id: "diagram",
    label: "Diagram",
    style: ButtonStyle.Secondary,
  },
  reveal: {
    id: "reveal",
    label: "Reponse cut off. Click to reveal.",
    style: ButtonStyle.Secondary,
  },
};

async function interactionToTranscript(
  interaction: CommandInteraction,
): Promise<string | void> {
  return await interaction.channel.messages
    .fetch({
      limit: 100,
      cache: false,
    })
    .then((messages) =>
      messages
        .reverse()
        .map((message): string => message.content)
        .join(""),
    )
    .catch(console.error);
}

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

async function replyWithImage({
  interaction,
  url,
  description,
}: {
  interaction: CommandInteraction;
  url: string;
  description: string;
}) {
  console.log("================ url:", url);
  const exampleEmbed = new EmbedBuilder()
    .setTitle("Scene")
    .setImage(url)
    .setDescription(description);

  const reply = { embeds: [exampleEmbed] };

  // Send image
  interaction.followUp(reply);
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
    await replyWithImage({ interaction, url: data.url, description: scene });
  } else {
    await interaction.reply("Error: Failed to create image");
  }
}

async function diagram(interaction: CommandInteraction) {
  let messages = await interactionToMessages(interaction);
  if (messages instanceof Object) {
    const introduction: ChatCompletionRequestMessage = {
      role: "user",
      content: diagramPrompt.introduction + "\n# Transcript\n",
    };
    const instructions: ChatCompletionRequestMessage = {
      role: "user",
      content: diagramPrompt.instructions,
    };
    messages = [introduction].concat(messages).concat([instructions]);
  }
  const completion = `
  \`\`\`javascript
const canvas = createCanvas(500, 500);
const context = canvas.getContext('2d');

// Draw the medieval village layout
// Village center
context.beginPath();
context.arc(250, 250, 5, 0, Math.PI * 2, true);
context.fillStyle = '#000000'; // Village center in black
context.fill();
context.fillStyle = '#000000'; // Text color
context.fillText('Village Center', 260, 250); // Positioning text can be adjusted as needed

// Houses
const houseCoordinates = [
    {x: 200, y: 200, width: 50, height: 50},
    {x: 300, y: 200, width: 50, height: 50},
    {x: 200, y: 300, width: 50, height: 50},
    {x: 300, y: 300, width: 50, height: 50}
];
houseCoordinates.forEach((coords, index) => {
    context.fillStyle = '#A52A2A'; // Houses in brown
    context.fillRect(coords.x, coords.y, coords.width, coords.height);
    context.fillStyle = '#000000'; // Text color
    context.fillText(\`House \$\{index + 1\}\`, coords.x + 10, coords.y + 30); // Positioning text can be adjusted as needed
});

// Streets
context.beginPath();
context.moveTo(225, 200);
context.lineTo(275, 200);
context.lineTo(275, 350);
context.lineTo(225, 350);
context.closePath();
context.strokeStyle = '#000000'; // Streets in black
context.lineWidth = 2;
context.stroke();

// Well
context.beginPath();
context.arc(250, 275, 10, 0, Math.PI * 2, true);
context.fillStyle = '#0000FF'; // Well in blue
context.fill();
context.fillStyle = '#000000'; // Text color
context.fillText('Well', 240, 280); // Positioning text can be adjusted as needed

// Market stall
context.fillStyle = '#FFFF00'; // Market stall in yellow
context.fillRect(275, 275, 25, 25);
context.fillStyle = '#000000'; // Text color
context.fillText('Market Stall', 280, 300); // Positioning text can be adjusted as needed

// Church
context.fillStyle = '#FFFFFF'; // Church in white
context.fillRect(225, 150, 100, 50);
context.fillStyle = '#000000'; // Text color
context.fillText('Church', 240, 180); // Positioning text can be adjusted as needed
\`\`\`

This code will generate a diagram of a medieval village layout with houses, streets, a well, a market stall, and a church. The positions and sizes of the objects can be adjusted as needed.
  `;
  // await messagesToContent(messages);
  console.log("=================== Completion");
  console.log(completion);

  const regex = /```javascript([\s\S]*?)```/g;

  let match: RegExpExecArray;
  let buffer: Buffer;
  let code = "";
  while ((match = regex.exec(completion)) !== null) {
    code = match[1];
  }
  const canvas = createCanvas(256, 256);
  code = code.concat(`
            buffer = canvas.toBuffer("image/png");
            `);

  eval(code);
  console.log("buffer", buffer);
  console.log("====================================");

  // Add attached image
  const name = "diagram.png";
  const file = new AttachmentBuilder(buffer, { name });
  const exampleEmbed = new EmbedBuilder()
    .setTitle("Test Image")
    .setImage(`attachment://${name}`);

  // Send image
  await interaction.channel.send({
    embeds: [exampleEmbed],
    files: [file],
  });
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
];
