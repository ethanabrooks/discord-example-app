import {
  AttachmentBuilder,
  CommandInteraction,
  EmbedBuilder,
} from "discord.js";
import { interactionToMessages, messagesToContent } from "../utils/messages.js";
import { ChatCompletionRequestMessage } from "openai";
import * as diagramPrompt from "../prompts/diagram.js";
import { DEBUG } from "../gpt.js";
import path from "path";
import { createCanvas } from "canvas";
import { createLogger } from "../utils/logger.js";

export default async function diagram(interaction: CommandInteraction) {
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
  let code: string = completion;
  const startString = "```javascript";
  let startIndex = completion.indexOf(startString);
  let endIndex = completion.indexOf("```", startIndex + 1);
  startIndex = startIndex === -1 ? 0 : startIndex + startString.length;

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
      console.log("Caught!")
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
