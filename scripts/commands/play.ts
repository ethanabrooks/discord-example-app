import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import { addFigmaDescriptionOption } from "../utils/figma.js";
import handleStart from "./play/start.js";
import handleUpdate from "./play/update.js";

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
      addFigmaDescriptionOption(
        subcommand
          .setName(subcommands.start)
          .setDescription("Start a new game.")
          .addStringOption((option) =>
            option
              .setName("proposition")
              .setDescription("The target proposition that GPT tries to prove.")
              .setRequired(false),
          )
          .addBooleanOption((option) =>
            option
              .setName("coherence-check")
              .setDescription("Whether to check for coherence.")
              .setRequired(false),
          )
          .addBooleanOption((option) =>
            option
              .setName("custom-check")
              .setDescription("Whether to use the current custom check.")
              .setRequired(false),
          )
          .addBooleanOption((option) =>
            option
              .setName("use-figma")
              .setDescription(
                "Whether to incorporate Figma diagram into prompts.",
              )
              .setRequired(false),
          ),
      ),
    )
    .addSubcommand((subcommand) =>
      addFigmaDescriptionOption(
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
