import { ChatInputCommandInteraction } from "discord.js";
import { handleInteraction } from "../interaction.js";
import { prisma } from "../utils/prismaClient.js";
import { encrypt } from "../utils/encryption.js";

async function getFigmaOptions(interaction: ChatInputCommandInteraction) {
  let token = interaction.options.getString("token");
  let url = interaction.options.getString("url");
  let description = interaction.options.getString("description");
  return { token, url, description };
}

export default async function handleFigma(
  interaction: ChatInputCommandInteraction,
) {
  const { token, url } = await getFigmaOptions(interaction);
  const figmaUrlBase = "https://www.figma.com/file/";
  if (!url.startsWith(figmaUrlBase)) {
    return await handleInteraction({
      interaction,
      message: `The URL must start with ${figmaUrlBase}`,
    });
  }
  const fileId = url.split("/")[4];
  const { iv, content } = encrypt(token);
  await prisma.figmaData.create({
    data: {
      encryptedToken: content,
      fileId,
      tokenIV: iv,
      username: interaction.user.username,
    },
  });

  await interaction.deferReply();
  return await handleInteraction({
    interaction,
    message: `Submitted figma file id: ${fileId}`,
  });
}
