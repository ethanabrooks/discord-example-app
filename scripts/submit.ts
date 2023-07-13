import { CommandInteraction } from "discord.js";
import { interactionToMessages, messagesToContent } from "./utils/messages.js";
import { createLogger } from "./utils/logger.js";

export default async function submit(interaction: CommandInteraction) {
  const channel = interaction.channel;
  if (channel == null) {
    return "Error: Channel not found";
  } else {
    const messages = await interactionToMessages(interaction);
    const logger = createLogger("submit", interaction.channelId);
    return await messagesToContent(messages, logger);
  }
}
