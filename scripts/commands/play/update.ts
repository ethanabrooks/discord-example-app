import { ChatInputCommandInteraction, TextChannel } from "discord.js";
import { prisma } from "../../utils/prismaClient.js";
import { goToNextTurn, step, getDifficulty } from "../../step.js";
import { Completion } from "../../utils/gpt.js";
import { handleThreads } from "../../threads.js";
import { handleInteraction } from "../../interaction.js";
import { encrypt } from "../../utils/encryption.js";

function getUpdateOptions(interaction: ChatInputCommandInteraction) {
  const newFact = interaction.options.getString("new-facts");
  const figmaDescription = interaction.options.getString("figma-description");
  return { newFact, figmaDescription };
}

export default async function handleUpdate(
  interaction: ChatInputCommandInteraction,
) {
  let { newFact: playerInput } = getUpdateOptions(interaction);

  const game = await prisma.game.findFirst({
    where: { channel: interaction.channelId },
    orderBy: { id: "desc" },
  });
  const turns = await prisma.turn.findMany({
    include: {
      fact: true,
      game: true,
    },
    where: { game },
  });
  const facts = turns.flatMap((t) => t.fact);
  const currentFact = facts[facts.length - 1];
  const oldFacts = facts.slice(1, facts.length - 1);
  const [proposition] = facts;
  const currentTurnNumber = turns.length - 1;
  const turn = turns[currentTurnNumber];
  const firstTurn = currentTurnNumber == 0;
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
  const difficulty = getDifficulty(game.difficulty);
  const { completions, messages, status } = await step({
    difficulty,
    currentFact,
    newFact: { text: playerInput },
    oldFacts,
    proposition,
    firstTurn,
  });

  const completionsArray: Completion[] = Object.values(completions).flatMap(
    (c) => c ?? [],
  );

  const { iv: playerIv, content: playerEnc } = encrypt(
    interaction.user.username,
  );
  const data = {
    status,
    playerInput,
    playerIv,
    playerEnc,
    completions: {
      create: completionsArray,
    },
    game: {
      connect: { id: game.id },
    },
  };
  if (goToNextTurn(status)) {
    data["fact"] = { create: { text: playerInput } };
  }
  console.log(completionsArray);

  const newTurn = await prisma.turn.create({ data });
  console.log(newTurn);
  const message = messages.join("\n");

  if (interaction.channel instanceof TextChannel) {
    await handleThreads(interaction.channel, completions);
  }

  return await handleInteraction({ interaction, message });
}
