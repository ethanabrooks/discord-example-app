import {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Message,
  AttachmentBuilder,
  EmbedBuilder,
} from "discord.js";

import { ChatCompletionRequestMessage, Configuration, OpenAIApi } from "openai";

// OpenAI API configuration
const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

const clientId = process.env.APP_ID;

async function createChatCompletionWithBackoff(
  messages: ChatCompletionRequestMessage[],
  stopWord: string | null = null,
  delay = 1,
): Promise<any> {
  try {
    const chatCompletion = await openai.createChatCompletion({
      model: "gpt-3.5-turbo",
      messages: messages,
      stop: stopWord,
      temperature: 1,
      max_tokens: 1000,
      top_p: 0.5,
    });

    return chatCompletion;
  } catch (error) {
    if (error.response.status == 429) {
      console.error(`Attempt failed. Retrying in ${delay}ms...`);

      // Wait for the delay period and then retry
      await new Promise((resolve) => setTimeout(resolve, delay));

      // Retry the operation, with a longer delay
      return createChatCompletionWithBackoff(messages, stopWord, delay * 2);
    }
  }
}

// Create commands
const gptCommandName = "gpt";
const stopWords = ["Player:", "Game:"];
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
        const [stopWord1, stopWord2] = stopWords;
        const concatenated = messages.map(({ content }) => content).join("");
        const index1 = concatenated.lastIndexOf(stopWord1);
        const index2 = concatenated.lastIndexOf(stopWord2);

        let stopWord = null;
        if (index1 > index2) {
          stopWord = stopWord2;
        } else if (index2 > index1) {
          stopWord = stopWord1;
        }
        console.log(messages);
        const chatCompletion = await createChatCompletionWithBackoff(
          messages,
          stopWord,
        );
        content = chatCompletion.data.choices[0].message.content;
        // content = 'Test' + counter; // Debug
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
        //console.log(e)
        await response.edit({
          content: content.slice(0, 2000),
          components: [],
        });
      }
    },
  },
  {
    data: new SlashCommandBuilder()
      .setName("server")
      .setDescription("Provides information about the server."),
    async execute(interaction) {
      // interaction.guild is the object representing the Guild in which the command was run
      await interaction.reply(
        `This server is ${interaction.guild.name} and has ${interaction.guild.memberCount} members.`,
      );
    },
  },
  {
    data: new SlashCommandBuilder()
      .setName("user")
      .setDescription("Provides information about the user."),
    async execute(interaction) {
      // interaction.user is the object representing the User who ran the command
      // interaction.member is the GuildMember object, which represents the user in the specific guild
      await interaction.reply(
        `This command was run by ${interaction.user.username}, who joined on ${interaction.member.joinedAt}.`,
      );
    },
  },
];
