import { ChatInputCommandInteraction, TextChannel } from "discord.js";
import { prisma } from "../../utils/prismaClient.js";
import { goToNextTurn, step, Image } from "../../step.js";
import { Completion } from "../../utils/gpt.js";
import { handleThreads } from "../../threads.js";
import { handleInteraction } from "../../interaction.js";
import { FigmaData } from "@prisma/client";
import { decrypt } from "../../utils/encryption.js";
import { getSvgUrl } from "../../utils/figma.js";
import catchError from "../../utils/errors.js";
import { getFigmaData } from "../figma.js";

function getUpdateOptions(interaction: ChatInputCommandInteraction) {
  const newFact = interaction.options.getString("new-facts");
  const figmaDescription = interaction.options.getString("figma-description");
  return { newFact, figmaDescription };
}

async function getSvg(figmaData: FigmaData): Promise<string | void> {
  // Decrypt the token from the retrieved figmaData
  const { fileId, encryptedToken, tokenIV } = figmaData;
  const token = decrypt({ iv: tokenIV, content: encryptedToken });

  // Get the svg url with the file ID and decrypted token
  const svgUrl = await getSvgUrl(fileId, token);
  return await fetch(svgUrl)
    .then((response) => response.text())
    .catch(catchError);
}

export default async function handleUpdate(
  interaction: ChatInputCommandInteraction,
) {
  let { newFact: userInput, figmaDescription } = getUpdateOptions(interaction);

  const turnObject = await prisma.turn.findFirst({
    include: {
      game: true,
      facts: {
        include: {
          image: true,
        },
      },
    },
    where: { game: { channel: interaction.channelId } },
    orderBy: { id: "desc" },
  });
  const { facts, game, turn: oldTurn } = turnObject;
  const currentFact = facts[facts.length - 1];
  const oldFacts = facts.slice(1, facts.length - 1);
  const [proposition] = facts;
  if (userInput == undefined) {
    userInput = currentFact.text;
  }

  // const subcommand = interaction.options.getSubcommand();
  // switch (subcommand) {
  //   case "add":
  //     newFact = `${currentFact} ${newFact}`;
  //     break;
  //   case "update":
  //     newFact = newFact == undefined ? currentFact : newFact;
  //     break;
  //   case "replace":
  //     const { replace } = getReplaceOptions(interaction);
  //     newFact = currentFact.replace(replace, newFact);
  //     break;
  //   default:
  //     break;
  // }
  let image = null;
  if (currentFact.image != null) {
    const figmaData = await getFigmaData(interaction.user.username);
    const svg = await getSvg(figmaData);
    const description = figmaDescription ?? currentFact.image.description;
    image = { svg, description };
  }

  const { completions, messages, status, turn } = await step({
    coherenceCheck: game.coherenceCheck,
    currentFact,
    newFact: { text: userInput, image },
    oldFacts,
    proposition,
    turn: oldTurn,
  });

  const completionsArray: Completion[] = Object.values(completions).flatMap(
    (c) => c ?? [],
  );

  function createNewFact(text: string, image: null | Image) {
    if (image == null) {
      return { text };
    }
    const { svg, description } = image;
    return {
      text,
      image: { create: { svg, description } },
    };
  }
  const newFacts = facts.map(({ text, image }) => createNewFact(text, image));
  if (goToNextTurn(status)) {
    newFacts.push(createNewFact(userInput, image));
  }
  console.log(newFacts);
  const newTurnObject = await prisma.turn.create({
    data: {
      completions: {
        create: completionsArray,
      },
      facts: {
        create: newFacts,
      },
      game: {
        connect: { id: game.id },
      },
      newFact: userInput,
      player: interaction.user.username,
      status,
      turn,
    },
  });
  console.log(newTurnObject);
  const completionsObjects = await prisma.completion.findMany({
    where: { turnId: turnObject.id },
    orderBy: { id: "desc" },
  });
  console.log(completionsObjects);
  const message = messages.join("\n");

  if (interaction.channel instanceof TextChannel) {
    await handleThreads(interaction.channel, completions);
  }

  return await handleInteraction({ interaction, message });
}
