import {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  CommandInteraction,
  AttachmentBuilder,
} from "discord.js";
import { createChatCompletionWithBackoff, openai, DEBUG } from "./gpt.js";
import { ChatCompletionRequestMessage } from "openai";
import scenePrompt from "./scenePrompt.js";
import * as diagramPrompt from "./diagramPrompts.js";
import { createCanvas } from "canvas";
import { Logger, destination, pino } from "pino";
import path from "path";
import { existsSync, mkdirSync } from "fs";

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
  logger: Logger,
) {
  if (messages instanceof Object) {
    // Query GPT
    const content = await createChatCompletionWithBackoff({
      messages,
      logger,
    });
    return content === undefined ? "Error: GPT-3 API call failed" : content;
  } else {
    return "Error: Failed to fetch messages";
  }
}

function createLogger(subdirectory: string, channelId: string) {
  const dirPath = path.join("logs", subdirectory);
  if (!existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true });
  }
  return pino(
    {
      level: "debug",
      // transport: { target: "pino-pretty" },
    },
    destination(path.join(dirPath, `${channelId}.log`)),
  );
}

async function replyWithGPTCompletion(interaction: CommandInteraction) {
  const channel = interaction.channel;
  if (channel == null) {
    return "Error: Channel not found";
  } else {
    const messages = await interactionToMessages(interaction);
    const logger = createLogger(
      "replyWithGPTCompletion",
      interaction.channelId,
    );
    return await messagesToContent(messages, logger);
  }
}

async function visualize(interaction: CommandInteraction) {
  // Add attached image
  let messages = await interactionToMessages(interaction);
  if (!(messages instanceof Object)) {
    messages = [];
  }
  messages.push({ role: "system", content: scenePrompt });
  const logger = createLogger("visualize", interaction.channelId);
  const scene = await messagesToContent(messages, logger);
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
  } else {
    messages = []; // TODO: handle this better
  }
  let completion: string;
  if (DEBUG) {
    completion = diagramPrompt.debugDigram;
  } else {
    const logger1 = createLogger(
      path.join("diagram", "1"),
      interaction.channelId,
    );
    completion = await messagesToContent(messages, logger1);
    console.log("=================== Initial response");
    console.log(completion);
    const initialResponse: ChatCompletionRequestMessage = {
      role: "system",
      content: completion,
    };
    const codeInstructions: ChatCompletionRequestMessage = {
      role: "user",
      content: diagramPrompt.codeInstruction,
    };
    messages = messages.concat([initialResponse]).concat([codeInstructions]);
    const logger2 = createLogger(
      path.join("diagram", "2"),
      interaction.channelId,
    );
    completion = await messagesToContent(messages, logger2);
  }
  console.log("=================== Code reponse");
  console.log(completion);
  let code: string = completion;
  const startString = "```javascript";
  let startIndex = completion.indexOf(startString);
  let endIndex = completion.indexOf("```", startIndex + 1);
  startIndex = startIndex === -1 ? 0 : startIndex + startString.length;
  console.log("Start index: " + startIndex, "End index: " + endIndex);

  // remove everything before and including '```javascript'
  code = code.slice(startIndex, endIndex);

  // remove all imports
  code = code
    .split("\n")
    .reduce(
      (acc, line) =>
        line.trimStart().startsWith("import") ? acc : acc.concat(line),
      [],
    )
    .join("\n");
  console.log("================== Code");
  console.log(code);
  let buffer: Buffer;

  // keep dropping final line until no error
  let valid = false;
  while (!valid) {
    const canvas = createCanvas(500, 500);
    const finalCode = code.concat(`
              buffer = canvas.toBuffer("image/png");
              `);

    try {
      eval(finalCode);
      valid = true;
    } catch (e) {
      console.log(e);
      code = code.split("\n").slice(0, -2).join("\n");
    }
  }
  console.log("==================== Buffer");
  console.log(buffer);

  // Add attached image
  const name = "diagram.png";
  const file = new AttachmentBuilder(buffer, { name });
  const exampleEmbed = new EmbedBuilder()
    .setTitle("Test Image")
    .setImage(`attachment://${name}`);

  // Send image
  await interaction.followUp({
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
        break;
      case buttons.diagram.id:
        await achknowledgeAndremoveButtons();
        await diagram(interaction);
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
