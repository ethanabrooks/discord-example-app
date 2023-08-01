import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  SlashCommandSubcommandBuilder,
} from "discord.js";
import handleUpdate from "./commands/play/update.js";
import handleStart from "./commands/play/start.js";
import handleFigma from "./commands/figma.js";
import handleCustomCheck from "./commands/customCheck.js";

const subcommands = {
  // add: "add",
  figma: "figma",
  // replace: "replace",
  start: "start",
  update: "update",
};

function throwIfUndefined<T>(value: T | undefined, name: string) {
  if (value == undefined) {
    throw new Error(`${name} is undefined`);
  }
  if (value == null) {
    throw new Error(`${name} is null`);
  }
}

// function getReplaceOptions(interaction: ChatInputCommandInteraction) {
//   const replace = interaction.options.getString("replace");
//   const newFact = interaction.options.getString("new-facts");
//   throwIfUndefined(newFact, "replace");
//   throwIfUndefined(newFact, "new-fact");
//   return { newFact, replace };
// }

function addFigmaDescriptionOption(builder: SlashCommandSubcommandBuilder) {
  return builder.addStringOption((option) =>
    option
      .setName("figma-description")
      .setDescription("Write a new description of the Figma diagram.")
      .setRequired(false),
  );
}
// Create commands
export default [
  {
    data: new SlashCommandBuilder()
      .setName("custom-check")
      .setDescription(
        `Design a custom check for GPT to use on each proposition`,
      )
      .addStringOption((option) =>
        option
          .setName("check")
          .setDescription(
            "The check. Use <a>, <b>, <c> to refer to target proposition, current fact, new fact respectively.",
          ),
      ),
    async execute(interaction: ChatInputCommandInteraction) {
      return await handleCustomCheck(interaction);
    },
  },
  {
    data: new SlashCommandBuilder()
      .setName("figma")
      .setDescription(`Submit figma data`)
      .addStringOption((option) =>
        option.setName("token").setDescription("Your figma dev token."),
      )
      .addStringOption((option) =>
        option.setName("url").setDescription("The URL for your figma diagram."),
      ),
    async execute(interaction: ChatInputCommandInteraction) {
      return await handleFigma(interaction);
    },
  },
  {
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
                .setDescription(
                  "The target proposition that GPT tries to prove.",
                )
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
  },
];
