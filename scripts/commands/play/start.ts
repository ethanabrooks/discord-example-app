import { ChatInputCommandInteraction } from "discord.js";
import { prisma } from "../../utils/prismaClient.js";
import { randomBoolean, randomChoice } from "../../utils/math.js";
import { negate } from "../../text.js";
import propositions from "../../propositions.js";
import { handleInteraction } from "../../interaction.js";
import { Difficulty, getSetupText, numDifficulties } from "../../step.js";
import { getFigmaData } from "../figma.js";
import { getSvg, getSvgUrl } from "../../utils/figma.js";
import { getCustomCheckData } from "../customCheck.js";

function getStartOptions(interaction: ChatInputCommandInteraction) {
  let proposition = interaction.options.getString("proposition");
  let figmaDescription = interaction.options.getString("figma-description");
  let useFigma = interaction.options.getBoolean("use-figma");
  if (useFigma == undefined) {
    useFigma = false;
  }
  let useCustomCheck = interaction.options.getBoolean("custom-check");
  if (useCustomCheck == undefined) {
    useCustomCheck = false;
  }
  let difficulty = interaction.options.getInteger("difficulty");
  if (difficulty == undefined) {
    difficulty = 1;
  }
  return {
    proposition,
    difficulty,
    useCustomCheck,
    useFigma,
    figmaDescription,
  };
}

export const difficultyStrings = Object.keys(Difficulty)
  .filter((k) => !isNaN(+k))
  .map((k) => Difficulty[k])
  .map((d, i) => `${i + 1}) ${d.toLowerCase().replace("_", " ")}`);

export default async function handleStart(
  interaction: ChatInputCommandInteraction,
) {
  let {
    difficulty: difficultyNumber,
    useCustomCheck,
    figmaDescription,
    proposition,
    useFigma,
  } = getStartOptions(interaction);

  const difficulty = Difficulty[difficultyNumber - 1];
  if (difficulty == undefined) {
    return handleInteraction({
      interaction,
      message: `Invalid difficulty: ${difficultyNumber}. There are ${numDifficulties} difficulties: 
${difficultyStrings.join("\n")}`,
    });
  }
  const truth = randomBoolean();
  if (proposition == undefined) {
    const positiveFact = `${randomChoice(propositions)}.`;
    proposition = truth ? positiveFact : (await negate(positiveFact)).output;
  }
  const fact = { text: proposition };
  const prismaFact = { text: proposition };

  if (useFigma) {
    const figmaData = await getFigmaData(interaction.user.username);
    if (figmaData == null) {
      return await handleInteraction({
        interaction,
        message: `You need to submit figma data. Run \`/figma\``,
      });
    }
    const svg = await getSvg(figmaData);
    if (typeof svg !== "string") {
      return await handleInteraction({
        interaction,
        message: `Couldn't get svg data from Figma`,
      });
    }
    // Retrieve the description from the most recent turn data
    const oldFact = await prisma.fact.findFirst({
      include: { image: true },
      where: { turn: { game: { channel: interaction.channelId } } },
      orderBy: { id: "desc" },
    });

    // If a turnData was found and it has Image with a description, use it
    // Otherwise, default to an empty string
    const description = figmaDescription ?? oldFact?.image?.description;
    const image = { svg, description };
    prismaFact["image"] = { create: image };
    fact["image"] = image;
  }

  const data = {
    channel: interaction.channelId,
    difficulty: difficultyNumber - 1,
    turns: {
      create: {
        fact: { create: fact },
        player: interaction.user.username,
        status: "initial",
        playerInput: proposition,
      },
    },
  };

  if (useCustomCheck) {
    const customCheckData = await getCustomCheckData(interaction.user.username);
    if (customCheckData == null) {
      return await handleInteraction({
        interaction,
        message: `You need to submit custom check data. Run \`/custom-check\``,
      });
    } else {
      data["customCheck"] = {
        create: {
          check: customCheckData.check,
          username: interaction.user.username,
        },
      };
    }
  }

  const game = await prisma.game.create({ data });
  console.log(game);

  await handleInteraction({
    interaction,
    message: getSetupText({
      fact,
      factStatus: "initial",
      proposition: fact,
    }),
  });
}
