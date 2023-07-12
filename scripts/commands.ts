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
const BUILT_IN_RESPONSE_LIMIT = 2000;

function splitAtResponseLimit(text: string) {
  return [
    text.slice(0, BUILT_IN_RESPONSE_LIMIT),
    text.slice(BUILT_IN_RESPONSE_LIMIT),
  ];
}

// Create commands
export const Commands = [
  {
    data: new SlashCommandBuilder()
      .setName("g")
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
      let excess: string;
      if (speak === true) {
        console.log(messages);
        const completion = await createChatCompletionWithBackoff(messages);
        if (completion === undefined) {
          [content, excess] = ["Error: GPT-3 API call failed", ""];
        } else {
          [content, excess] = splitAtResponseLimit(completion);
        }

        // content = 'Test' + counter; // Debug
      } else {
        content = "The visualization is above.";
      }
      console.log(content);

      // Update reply
      let response: Message; // Better way to do it?
      if (counter == 0) {
        response = await interaction.followUp({
          content,
          components: [row],
        });
      } else {
        response = await interaction.channel.send({
          content,
          components: [row],
        });
      }

      // Button interaction
      try {
        const confirmation = await response.awaitMessageComponent();

        // Send new message
        switch (confirmation.customId) {
          case "continue":
            await confirmation.update({
              content,
              components: [],
            });
            await this.execute(interaction, counter + 1);
            break;
          case "visualize":
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
              content,
              components: [],
            });
            await this.execute(interaction, counter + 1, false);
            break;
          default:
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
