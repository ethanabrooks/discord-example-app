import {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Message,
  AttachmentBuilder,
  EmbedBuilder,
} from "discord.js";
import createChatCompletionWithBackoff from "./gpt.js";

const clientId = process.env.APP_ID;

// Create commands
const gptCommandName = "gpt";
export const Commands = [
  {
    data: new SlashCommandBuilder()
      .setName(gptCommandName)
      .setDescription("Query GPT with recent chat history"),
    async execute(interaction, counter = 0, speak = true) {
      const messages = await interaction.channel.messages
        .fetch({
          limit: 100,
          cache: false,
        })
        .then((messages) =>
          messages.reverse().map((message) => ({
            role:
              // message.interaction != null &&
              // Just check if author id matches bot id
              message.author.id === clientId ? "system" : "user",
            content: message.content,
          })),
        )
        .catch(console.error);
      console.log(messages);

      // Buttons
      const continueButton = new ButtonBuilder()
        .setCustomId("continue")
        .setLabel("Continue")
        .setStyle(ButtonStyle.Primary);

      const visButton = new ButtonBuilder()
        .setCustomId("visualize")
        .setLabel("Visualize")
        .setStyle(ButtonStyle.Secondary);

      const row = new ActionRowBuilder()
        .addComponents(continueButton)
        .addComponents(visButton);

      if (counter == 0) {
        await interaction.deferReply();
      }

      // Query GPT
      let content: string;
      if (speak === true) {
        console.log(messages);
        const completion = await createChatCompletionWithBackoff(messages);
        content =
          completion === undefined
            ? "Error: GPT response was undefined."
            : completion;
      } else {
        content = "The visualization is above.";
      }
      console.log(content);

      // Update reply
      let response: Message; // Better way to do it?
      if (counter == 0) {
        response = await interaction.followUp({
          content: content.slice(0, 2000),
          components: [row],
        });
      } else {
        response = await interaction.channel.send({
          content: content.slice(0, 2000),
          components: [row],
        });
      }

      // Button interaction
      try {
        const confirmation = await response.awaitMessageComponent();

        // Send new message
        if (confirmation.customId === "continue") {
          await confirmation.update({
            content: content.slice(0, 2000),
            components: [],
          });
          await this.execute(interaction, counter + 1);
        } else if (confirmation.customId === "visualize") {
          // Add attached image
          const file = new AttachmentBuilder("test.png");
          const exampleEmbed = new EmbedBuilder()
            .setTitle("Test Image")
            .setImage("attachment://test.png");

          // Send image
          await interaction.channel.send({
            embeds: [exampleEmbed],
            files: [file],
          });

          // Clear
          await confirmation.update({
            content: content.slice(0, 2000),
            components: [],
          });
          await this.execute(interaction, counter + 1, false);
        } else {
          console.log("Cannot use button " + confirmation.customId);
        }

        // Timeout
      } catch (e) {
        console.log(e);
        await response.edit({
          content: `${e}`,
          components: [],
        });
      }
    },
  },
];
