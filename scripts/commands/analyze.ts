import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChatInputCommandInteraction,
  CommandInteraction,
  SlashCommandBuilder,
} from "discord.js";
import { prisma } from "../utils/prismaClient.js";
import { randomNumber } from "../utils/math.js";
import { encrypt, encryptHMAC } from "../utils/encryption.js";
import { Completion, Game, Turn } from "@prisma/client";
import {
  acknowledgeAndRemoveButtons,
  buildActionRow,
  revealButton,
  sendReply,
} from "../interaction.js";
import catchError from "../utils/errors.js";
import { splitAtResponseLimit } from "../text.js";

type TurnWithCompletion = Turn & {
  completions: Completion[];
};

type GameWithTurns = Game & {
  turns: TurnWithCompletion[];
};

async function getRandomGame(): Promise<GameWithTurns> {
  const numGames = await prisma.game.count();
  const gameId = randomNumber(numGames);
  const game = (await prisma.game.findUnique({
    where: { id: gameId },
    include: { turns: { include: { completions: true } } },
  })) as GameWithTurns;
  if (game == null) {
    return await getRandomGame();
  }
  return game;
}

function getMessage(completion: Completion): string {
  return `\
# Input
${completion.input}
# Output
${completion.output}

### Is this inference correct?`;
}

function getFirstCompletion(
  turns: TurnWithCompletion[],
  minId: number = 0,
): Completion {
  const completions = turns.flatMap((turn) => turn.completions);
  const [completion] = completions.filter(
    (completion) => completion.id >= minId,
  );
  return completion;
}

async function getCompletion(username: string): Promise<Completion> {
  const user = encryptHMAC(username);
  const lastAnalysis = await prisma.analysis.findFirst({
    where: { user },
    include: {
      completion: {
        include: {
          turn: {
            include: {
              game: { include: { turns: { include: { completions: true } } } },
            },
          },
        },
      },
    },
    orderBy: { id: "desc" },
  });
  if (lastAnalysis == null) {
    return await getRandomGame().then(
      (game): Completion => getFirstCompletion(game.turns),
    );
  }
  const turns = lastAnalysis.completion.turn.game.turns;
  const completion = getFirstCompletion(turns, lastAnalysis.completion.id + 1);
  if (completion == null) {
    return await getRandomGame().then((game) => getFirstCompletion(game.turns));
  }
  return completion;
}

export const buttons = {
  reveal: "reveal",
  yes: "yes",
  no: "no",
};

const yesButton = new ButtonBuilder()
  .setCustomId(buttons.yes)
  .setLabel(buttons.yes)
  .setStyle(ButtonStyle.Primary);
const noButton = new ButtonBuilder()
  .setCustomId(buttons.no)
  .setLabel(buttons.no)
  .setStyle(ButtonStyle.Primary);

export default {
  data: new SlashCommandBuilder()
    .setName("analyze")
    .setDescription(`Analyze inferences for a past game`),
  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply();
    return await sendTurn(interaction);
  },
};

export async function handleInteraction({
  interaction,
  message,
  completion,
}: {
  interaction: CommandInteraction;
  message: string;
  completion: Completion;
}) {
  const [content, excess] = splitAtResponseLimit(message);
  const components: ActionRowBuilder<ButtonBuilder>[] = [
    buildActionRow([
      ...(excess.length == 0 ? [] : [revealButton]),
      ...[yesButton, noButton],
    ]),
  ];

  const reply = { content, components };

  // Update reply
  await sendReply(reply, interaction, false).then((response) =>
    response
      .awaitMessageComponent()
      .then(async (buttonInteraction: ButtonInteraction) => {
        // Send new message
        switch (buttonInteraction.customId) {
          case buttons.reveal:
            acknowledgeAndRemoveButtons(buttonInteraction, content);
            handleInteraction({
              interaction,
              message: excess,
              completion,
            });
            break;
          case buttons.yes:
            acknowledgeAndRemoveButtons(buttonInteraction, content);
            await addResponse({
              correct: true,
              interaction,
              completion,
            });
            await sendTurn(interaction);
            break;
          case buttons.no:
            acknowledgeAndRemoveButtons(buttonInteraction, content);
            await addResponse({
              correct: false,
              interaction,
              completion,
            });
            await sendTurn(interaction);
            break;
          default:
            throw Error("Cannot use button " + buttonInteraction.customId);
        }
      })
      .catch(catchError),
  );
}

async function addResponse({
  correct,
  interaction,
  completion,
}: {
  correct: boolean;
  interaction: CommandInteraction;
  completion: Completion;
}) {
  const user = encryptHMAC(interaction.user.username);
  const analysis = await prisma.analysis.create({
    data: {
      user,
      completion: { connect: { id: completion.id } },
      correct,
    },
  });
}

async function sendTurn(interaction: CommandInteraction) {
  const completion = await getCompletion(interaction.user.username);
  const message = getMessage(completion);
  return await handleInteraction({ completion, interaction, message });
}
