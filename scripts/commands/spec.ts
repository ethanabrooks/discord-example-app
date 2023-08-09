import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import handleCreate from "./spec/create.js";
import handlePull from "./spec/pull.js";
import handlePush from "./spec/push.js";

const subcommands = {
  create: "create",
  pull: "pull",
  push: "push",
};
export default {
  data: new SlashCommandBuilder()
    .setName("spec")
    .setDescription(`Play break the chain`)
    .addSubcommand((subcommand) =>
      subcommand
        .setName(subcommands.create)
        .setDescription("Use GPT3 to generate a new spec."),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName(subcommands.pull)
        .setDescription("Pull updated spec from blender."),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName(subcommands.push)
        .setDescription("Push updated spec to blender."),
    ),
  async execute(interaction: ChatInputCommandInteraction) {
    const subcommand = interaction.options.getSubcommand();
    await interaction.deferReply();
    switch (subcommand) {
      case subcommands.create:
        await handleCreate(interaction);
        break;
      case subcommands.pull:
        await handlePull(interaction);
        break;
      case subcommands.push:
        await handlePush(interaction);
        break;
    }
  },
};
