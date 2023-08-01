import { ChatInputCommandInteraction } from "discord.js";
import { prisma } from "../utils/prismaClient.js";
import { handleInteraction } from "../interaction.js";

async function getCustomCheckOptions(interaction: ChatInputCommandInteraction) {
  let check = interaction.options.getString("custom-check");
  return { check };
}

export default async function handleCustomCheck(
  interaction: ChatInputCommandInteraction,
) {
  await interaction.deferReply();
  const username = interaction.user.username;
  const { check } = await getCustomCheckOptions(interaction);
  const data = { username, check };
  await prisma.customCheck.create({ data });
  const message = `Created figma data:
  ${JSON.stringify(data, null, 2)}`;
  return await handleInteraction({ interaction, message });
}
