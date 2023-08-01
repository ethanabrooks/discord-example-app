import { ChatInputCommandInteraction } from "discord.js";
import { prisma } from "../utils/prismaClient.js";
import { handleInteraction } from "../interaction.js";

export async function getCustomCheckData(username: string) {
  return await prisma.customCheck.findFirst({
    where: { username },
    orderBy: { id: "desc" },
  });
}

async function getCustomCheckOptions(interaction: ChatInputCommandInteraction) {
  let check = interaction.options.getString("check");
  return { check };
}

export function invalidCustomCheck(check: string) {
  return null;
}

export default async function handleCustomCheck(
  interaction: ChatInputCommandInteraction,
) {
  await interaction.deferReply();
  const username = interaction.user.username;
  const { check } = await getCustomCheckOptions(interaction);
  const invalid = invalidCustomCheck(check);
  if (invalid != null) {
    return await handleInteraction({ interaction, message: invalid });
  }
  const data = { username, check };
  await prisma.customCheck.create({ data });
  const message = `Created figma data:
  ${JSON.stringify(data, null, 2)}`;
  return await handleInteraction({ interaction, message });
}
