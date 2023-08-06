import { ChatInputCommandInteraction, TextChannel } from "discord.js";
import { prisma } from "../../utils/prismaClient.js";
import { goToNextTurn, step, Image, getDifficulty } from "../../step.js";
import { Completion } from "../../utils/gpt.js";
import { handleThreads } from "../../threads.js";
import { handleInteraction } from "../../interaction.js";
import { getSvg } from "../../utils/figma.js";
import { getFigmaData } from "../figma.js";
import { invalidCustomCheck } from "../customCheck.js";

function getUpdateOptions(interaction: ChatInputCommandInteraction) {
  const newFact = interaction.options.getString("new-facts");
  const figmaDescription = interaction.options.getString("figma-description");
  return { newFact, figmaDescription };
}

export default async function handleUpdate(
  interaction: ChatInputCommandInteraction,
) {
  let { newFact: playerInput, figmaDescription } =
    getUpdateOptions(interaction);

  const game = await prisma.game.findFirst({
    include: { customCheck: true },
    where: { channel: interaction.channelId },
    orderBy: { id: "desc" },
  });
  const turns = await prisma.turn.findMany({
    include: {
      fact: { include: { image: true } },
      game: true,
    },
    where: { game },
  });
  const facts = turns.flatMap((t) => t.fact);
  const currentFact = facts[facts.length - 1];
  const oldFacts = facts.slice(1, facts.length - 1);
  const [proposition] = facts;
  const currentTurnNumber = turns.length - 1;
  const firstTurn = currentTurnNumber == 0;
  const turn = turns[currentTurnNumber];
  if (playerInput == undefined) {
    playerInput = currentFact.text;
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

  if (game.customCheck != null) {
    const invalid = invalidCustomCheck(game.customCheck.check);
    if (invalid != null) {
      return await handleInteraction({
        interaction,
        message: invalid,
      });
    }
  }

  const difficulty = getDifficulty(game.difficulty);
  const { completions, messages, status } = await step({
    difficulty,
    currentFact,
    customCheck: game.customCheck,
    newFact: { text: playerInput, image },
    oldFacts,
    proposition,
    firstTurn,
  });

  const completionsArray: Completion[] = Object.values(completions).flatMap(
    (c) => c ?? [],
  );

  if (goToNextTurn(status)) {
    type FactCreateInput = {
      text: string;
      image?: {
        create: {
          svg: string;
          description?: string;
        };
      };
    };

    const fact = { text: playerInput };
    if (image != null) {
      fact["image"] = { create: image };
    }

    await prisma.turn.create({
      data: {
        completions: {
          create: completionsArray,
        },
        fact: {
          create: fact,
        },
        game: {
          connect: { id: game.id },
        },
        playerInput,
        player: interaction.user.username,
        status,
      },
    });
  }
  const completionsObjects = await prisma.completion.findMany({
    where: { turnId: turn.id },
    orderBy: { id: "desc" },
  });
  console.log(completionsObjects);
  const message = messages.join("\n");

  if (interaction.channel instanceof TextChannel) {
    await handleThreads(interaction.channel, completions);
  }

  return await handleInteraction({ interaction, message });
}
