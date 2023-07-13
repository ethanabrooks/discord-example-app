import {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  CommandInteraction,
} from "discord.js";
import { ButtonComponents, buttons } from "./buttons.js";
import submit from "./submit.js";
import visualize from "./visualize.js";
import diagram from "./diagram.js";

const BUILT_IN_RESPONSE_LIMIT = 2000;

function splitAtResponseLimit(text: string) {
  return [
    text.slice(0, BUILT_IN_RESPONSE_LIMIT),
    text.slice(BUILT_IN_RESPONSE_LIMIT),
  ];
}

async function handleInteraction({
  firstReply,
  interaction,
  text,
}: {
  firstReply: boolean;
  interaction: CommandInteraction;
  text: string;
}) {
  const [content, excess] = splitAtResponseLimit(text);
  const row = Object.values(buttons)
    .filter(({ id }) => excess.length > 0 || id !== buttons.reveal.id)
    .map(({ id, label, style }: ButtonComponents) =>
      new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style),
    )
    .reduce(
      (row, button) => row.addComponents(button),
      new ActionRowBuilder<ButtonBuilder>(),
    );

  const reply = { content, components: [row] };

  // Update reply
  const response = await (firstReply
    ? interaction.followUp(reply)
    : interaction.channel.send(reply));
  await response
    .awaitMessageComponent()
    .then(async (buttonInteraction) => {
      async function achknowledgeAndremoveButtons() {
        await buttonInteraction.update({ ...reply, components: [] });
      }
      // Send new message
      switch (buttonInteraction.customId) {
        case buttons.reveal.id:
          achknowledgeAndremoveButtons();
          handleInteraction({
            text: excess,
            interaction,
            firstReply,
          });
          break;
        case buttons.submit.id:
          await achknowledgeAndremoveButtons();
          await handleInteraction({
            firstReply: false,
            interaction,
            text: await submit(interaction),
          });
          break;
        case buttons.visualize.id:
          await achknowledgeAndremoveButtons();
          await visualize(interaction);
          break;
        case buttons.diagram.id:
          await achknowledgeAndremoveButtons();
          await diagram(interaction);
          break;
        default:
          console.log("Cannot use button " + buttonInteraction.customId);
      }
    })
    .catch(async (e) => {
      console.log(e);
      await response.edit({
        content: `${e}`,
        components: [],
      });
    });
}

// Create commands
export const Commands = [
  {
    data: new SlashCommandBuilder()
      .setName("g")
      .setDescription("Query GPT with recent chat history"),
    async execute(interaction: CommandInteraction) {
      await interaction.deferReply();
      const text = await submit(interaction);
      await handleInteraction({
        firstReply: true,
        interaction,
        text,
      });
    },
  },
  {
    data: new SlashCommandBuilder()
      .setName("visualize")
      .setDescription("Visualize recent chat history as a scene"),
    async execute(interaction: CommandInteraction) {
      await interaction.deferReply();
      await visualize(interaction);
    },
  },
  {
    data: new SlashCommandBuilder()
      .setName("diagram")
      .setDescription("Create a diagram of the scene"),
    async execute(interaction: CommandInteraction) {
      await interaction.deferReply();
      await diagram(interaction);
    },
  },
];
