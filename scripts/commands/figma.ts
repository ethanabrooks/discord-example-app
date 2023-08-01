import { ChatInputCommandInteraction } from "discord.js";
import { handleInteraction } from "../interaction.js";
import { prisma } from "../utils/prismaClient.js";
import { encrypt } from "../utils/encryption.js";

interface FigmaDataInput {
  encryptedToken?: string | null;
  fileId?: string | null;
  tokenIV?: string | null;
  username: string;
}

async function getFigmaOptions(interaction: ChatInputCommandInteraction) {
  let token = interaction.options.getString("token");
  let url = interaction.options.getString("url");
  let description = interaction.options.getString("description");
  return { token, url, description };
}

export async function getFigmaData(username: string) {
  return await prisma.figmaData.findUnique({
    where: { username },
  });
}

export default async function handleFigma(
  interaction: ChatInputCommandInteraction,
) {
  await interaction.deferReply();
  const { token, url } = await getFigmaOptions(interaction);
  const figmaUrlBase = "https://www.figma.com/file/";
  if (url != null && !url.startsWith(figmaUrlBase)) {
    return await handleInteraction({
      interaction,
      message: `The URL must start with ${figmaUrlBase}`,
    });
  }
  const fileId = url?.split("/")[4];
  const encrypted = token ? encrypt(token) : null;
  const username = interaction.user.username;
  const exists = await getFigmaData(username);
  if (!exists) {
    if (fileId == null || token == null) {
      const nullFields: string[] = [];
      if (url == null) nullFields.push("url");
      if (token == null) nullFields.push("token");
      const message = `No figma data found for username ${username}. The following fields must not be null: ${nullFields.join(
        ",",
      )}`;
      return await handleInteraction({ interaction, message });
    } else {
      const data = {
        username,
        fileId,
        encryptedToken: encrypted.content,
        tokenIV: encrypted.iv,
      };
      await prisma.figmaData.create({ data });
      const message = `Created figma data:
  ${JSON.stringify(data, null, 2)}`;
      return await handleInteraction({ interaction, message });
    }
  } else {
    // exists
    const data: FigmaDataInput = { username };
    if (fileId != null) data.fileId = fileId;
    if (encrypted != null) {
      data.encryptedToken = encrypted.content;
      data.tokenIV = encrypted.iv;
    }
    await prisma.figmaData.update({
      where: { username },
      data,
    });
    const message = `update figma data:
  ${JSON.stringify(data, null, 2)}`;
    return await handleInteraction({ interaction, message });
  }
}
