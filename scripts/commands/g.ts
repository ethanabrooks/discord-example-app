import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import { handleInteraction } from "../interaction.js";
import { interactionToMessages, messagesToContent } from "../messages.js";

export default {
  data: new SlashCommandBuilder()
    .setName("g")
    .setDescription(`Submit message history to GPT for response`),
  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply();
    const messages = await interactionToMessages(interaction);
    const message = await messagesToContent(messages);
    await handleInteraction({ interaction, message });
  },
};
