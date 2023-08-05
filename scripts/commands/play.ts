import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import handleStart, { difficultyStrings } from "./play/start.js";
import handleUpdate from "./play/update.js";
import { Difficulty } from "../step.js";
import { type } from "os";

const subcommands = {
  // add: "add",
  figma: "figma",
  // replace: "replace",
  start: "start",
  update: "update",
};
export default {
  data: new SlashCommandBuilder()
    .setName("play")
    .setDescription(`Play break the chain`)
    .addSubcommand((subcommand) =>
      subcommand
        .setName(subcommands.start)
        .setDescription("Start a new game.")
        .addIntegerOption((option) =>
          option
            .setName("difficulty")
            .setDescription(
              `Difficulty level: ${difficultyStrings.join(", ")}.`,
            )
            .setRequired(true),
        )
        .addStringOption((option) =>
          option
            .setName("proposition")
            .setDescription("The target proposition that GPT tries to prove.")
            .setRequired(false),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName(subcommands.update)
        .setDescription("Choose a new set of facts to replace the old set.")
        .addStringOption((option) =>
          option
            .setName("new-facts")
            .setDescription("The new facts to replace the old ones with.")
            .setRequired(true),
        ),
    ),
  async execute(interaction: ChatInputCommandInteraction) {
    const subcommand = interaction.options.getSubcommand();
    await interaction.deferReply();
    switch (subcommand) {
      case subcommands.start:
        await handleStart(interaction);
        break;
      case subcommands.update:
        await handleUpdate(interaction);
        break;
    }
  },
};
