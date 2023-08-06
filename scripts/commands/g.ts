import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import { handleInteraction } from "../interaction.js";
import { interactionToCCRMessages, messagesToContent } from "../messages.js";

export default {
  data: new SlashCommandBuilder()
    .setName("g")
    .setDescription(`Submit message history to GPT for response`),
  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply();
    const messages = await interactionToCCRMessages({ interaction });
    const message = await messagesToContent(messages);
    await handleInteraction({ interaction, message });
  },
};
