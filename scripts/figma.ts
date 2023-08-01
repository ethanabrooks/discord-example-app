import fetch from "node-fetch";
import catchError from "./errors.js";
import { ChatInputCommandInteraction } from "discord.js";
import { handleInteraction } from "./interaction.js";
import { encrypt } from "./encryption.js";
import { prisma } from "./prismaClient.js";

interface FigmaNode {
  id: string;
  children?: FigmaNode[];
  type: string;
}

interface FigmaResponse {
  document: FigmaNode;
}

interface ImageResponse {
  images: Record<string, string>;
  err: string | null;
}

function getFirstCanvasOrPageId(node: FigmaNode): string | null {
  // If the node is a canvas or a page, return its id
  if (node.type === "CANVAS" || node.type === "PAGE") {
    return node.id;
  }

  // If the node has children, recurse on the children
  if (node.children) {
    for (let child of node.children) {
      let result = getFirstCanvasOrPageId(child);
      if (result) {
        return result;
      }
    }
  }

  // If the node is not a canvas or a page and does not have any canvas or page children, return null
  return null;
}

// Fetch the Figma document
export async function getPngUrl(
  key: string,
  token: string,
): Promise<string | null> {
  return await fetch(`https://api.figma.com/v1/files/${key}`, {
    headers: { "X-Figma-Token": token },
  })
    .then((response) => response.json())
    .then(async (data: FigmaResponse) => {
      // Retrieve all node IDs
      const canvasOrPageId = getFirstCanvasOrPageId(data.document);

      // Fetch the images
      return await fetch(
        `https://api.figma.com/v1/images/${key}?ids=${canvasOrPageId}&format=png`,
        { headers: { "X-Figma-Token": token } },
      );
    })
    .then((response) => response.json())
    .then((data: ImageResponse) => {
      const [url] = Object.values(data.images);
      return url;
    })
    .catch((err) => {
      catchError(err);
      return null;
    });
}

export async function getSvgUrl(
  key: string,
  token: string,
): Promise<string | null> {
  return await fetch(`https://api.figma.com/v1/files/${key}`, {
    headers: { "X-Figma-Token": token },
  })
    .then((response) => response.json())
    .then(async (data: FigmaResponse) => {
      // Retrieve the id of the first canvas or page node
      const canvasOrPageId = getFirstCanvasOrPageId(data.document);

      // Fetch the images
      return await fetch(
        `https://api.figma.com/v1/images/${key}?ids=${canvasOrPageId}&format=svg&svg_include_id=true`,
        { headers: { "X-Figma-Token": token } },
      );
    })
    .then((response) => response.json())
    .then((data: ImageResponse) => {
      const [url] = Object.values(data.images);
      console.log(url);
      return url;
    })
    .catch((err) => {
      catchError(err);
      return null;
    });
}

export async function getFigmaOptions(
  interaction: ChatInputCommandInteraction,
) {
  let token = interaction.options.getString("token");
  let url = interaction.options.getString("url");
  let description = interaction.options.getString("description");
  return { token, url, description };
}

export async function handleFigma(interaction: ChatInputCommandInteraction) {
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
