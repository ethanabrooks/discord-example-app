import { EmbedBuilder, CommandInteraction } from "discord.js";
import { openai, DEBUG } from "./gpt.js";
import scenePrompt from "./prompts/scene.js";
import { interactionToMessages, messagesToContent } from "./utils/messages.js";
import { createLogger } from "./utils/logger.js";

export default async function visualize(interaction: CommandInteraction) {
  // Add attached image
  let messages = await interactionToMessages(interaction);
  if (!(messages instanceof Object)) {
    messages = [];
  }
  messages.push({ role: "system", content: scenePrompt });
  const logger = createLogger("visualize", interaction.channelId);
  const scene = await messagesToContent(messages, logger);

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
