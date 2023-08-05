import { ChatInputCommandInteraction } from "discord.js";
import { prisma } from "../../utils/prismaClient.js";
import { randomBoolean, randomChoice } from "../../utils/math.js";
import { negate } from "../../text.js";
import propositions from "../../propositions.js";
import { handleInteraction } from "../../interaction.js";
import { Difficulty, getSetupText, numDifficulties } from "../../step.js";
import { encrypt } from "../../utils/encryption.js";

function getStartOptions(interaction: ChatInputCommandInteraction) {
  let proposition = interaction.options.getString("proposition");
  let difficulty = interaction.options.getInteger("difficulty");
  return { proposition, difficulty };
}

export const difficultyStrings = Object.keys(Difficulty)
  .filter((k) => !isNaN(+k))
  .map((k) => Difficulty[k])
  .map((d, i) => `${i + 1}) ${d.toLowerCase().replace("_", " ")}`);

export default async function handleStart(
  interaction: ChatInputCommandInteraction,
) {
  let { difficulty: difficultyNumber, proposition } =
    getStartOptions(interaction);

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

  const { iv: playerIv, content: playerEnc } = encrypt(
    interaction.user.username,
  );
  const data = {
    channel: interaction.channelId,
    difficulty: difficultyNumber - 1,

    turns: {
      create: {
        status: "initial",
        playerIv,
        playerEnc,
        playerInput: proposition,
        fact: { create: { text: proposition } },
      },
    },
  };

  const game = await prisma.game.create({ data });
  console.log(game);

  const fact = { text: proposition };
  await handleInteraction({
    interaction,
    message: getSetupText({
      fact,
      factStatus: "initial",
      proposition: fact,
    }),
  });
}
