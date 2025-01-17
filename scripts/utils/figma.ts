import fetch from "node-fetch";
import catchError from "./errors.js";
import { FigmaData } from "@prisma/client";
import { decrypt } from "./encryption.js";
import { SlashCommandSubcommandBuilder } from "discord.js";

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

export async function getSvg(figmaData: FigmaData): Promise<string | void> {
  // Decrypt the token from the retrieved figmaData
  const { fileId, encryptedToken, tokenIV } = figmaData;
  const token = decrypt({ iv: tokenIV, content: encryptedToken });

  // Get the svg url with the file ID and decrypted token
  const svgUrl = await getSvgUrl(fileId, token);
  return await fetch(svgUrl)
    .then((response) => response.text())
    .catch(catchError);
}

export function addFigmaDescriptionOption(
  builder: SlashCommandSubcommandBuilder,
) {
  return builder.addStringOption((option) =>
    option
      .setName("figma-description")
      .setDescription("Write a new description of the Figma diagram.")
      .setRequired(false),
  );
}
