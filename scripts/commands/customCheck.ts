import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import { prisma } from "../utils/prismaClient.js";
import { handleInteraction } from "../interaction.js";

export async function getCustomCheckData(username: string) {
  return await prisma.customCheck.findFirst({
    where: { username },
    orderBy: { id: "desc" },
  });
}

async function getCustomCheckOptions(interaction: ChatInputCommandInteraction) {
  let check = interaction.options.getString("check");
  return { check };
}

export function invalidCustomCheck(check: string) {
  return null;
}

export const inferenceText = "# Answer\n";

async function handleCustomCheck(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();
  const username = interaction.user.username;
  const { check } = await getCustomCheckOptions(interaction);
  const invalid = invalidCustomCheck(check);
  if (invalid != null) {
    return await handleInteraction({ interaction, message: invalid });
  }
  const data = { username, check };
  await prisma.customCheck.create({ data });
  const message = `Created figma data:
  ${JSON.stringify(data, null, 2)}
Verify that this check elicits response ending with the following:
> ${inferenceText}> <short statement that includes the word "true" (when the check should pass) or "false" (when it shouldn't)>
Otherwise, the check will always pass`;
  return await handleInteraction({ interaction, message });
}

export default {
  data: new SlashCommandBuilder()
    .setName("custom-check")
    .setDescription(`Design a custom check for GPT to use on each proposition`)
    .addStringOption((option) =>
      option
        .setName("check")
        .setDescription(
          "The check. Use <a>, <b>, <c> to refer to target proposition, current fact, new fact respectively.",
        )
        .setRequired(true),
    ),
  async execute(interaction: ChatInputCommandInteraction) {
    return await handleCustomCheck(interaction);
  },
};
