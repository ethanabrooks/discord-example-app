import {
  SlashCommandBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, Message
} from "discord.js";

import { 
  ChatCompletionRequestMessage, 
  Configuration, 
  OpenAIApi 
} from "openai";

// OpenAI API configuration
const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

const clientId = process.env.APP_ID;

async function createChatCompletionWithBackoff(
  messages: ChatCompletionRequestMessage[],
  stopWord: string | null = null,
  delay = 1
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
    async execute(interaction, counter = 0) {
      const messages = await interaction.channel.messages
        .fetch({
          limit: 100,
          cache: false,
        })
        .then((messages) =>
          messages.reverse().map((message) => ({
            role:
              // message.interaction != null &&
              message.author.id === clientId
                ? "system"
                : "user",
            content: message.content,
          }))
        )
        .catch(console.error);
      console.log(messages);
      // console.log(clientId);
      // const x = await interaction.channel.messages.fetch({limit: 20, cache: false});
      // console.log(x);

      // Buttons
      const continueButton = new ButtonBuilder()
      .setCustomId('continue')
      .setLabel('Continue')
      .setStyle(ButtonStyle.Primary);

      const visButton = new ButtonBuilder()
      .setCustomId('visualize')
      .setLabel('Visualize')
      .setStyle(ButtonStyle.Secondary);

      const row = new ActionRowBuilder()
        .addComponents(continueButton)
        .addComponents(visButton);
      
      if (counter == 0) {
        await interaction.deferReply();
      }

      // Query GPT
      // const [stopWord1, stopWord2] = stopWords;
      // const concatenated = messages.map(({ content }) => content).join("");
      // const index1 = concatenated.lastIndexOf(stopWord1);
      // const index2 = concatenated.lastIndexOf(stopWord2);

      // let stopWord = null;
      // if (index1 > index2) {
      //   stopWord = stopWord2;
      // } else if (index2 > index1) {
      //   stopWord = stopWord1;
      // }
      // console.log(messages);
      // const chatCompletion = await createChatCompletionWithBackoff(
      //   messages,
      //   stopWord
      // );
      // const content = chatCompletion.data.choices[0].message.content;
      
      const content = 'Test' + counter;
      console.log(content);

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
      const collectorFilter = i => i.user.id === interaction.user.id; // Await click from the same user
      try {
        const confirmation = await response.awaitMessageComponent({ filter: collectorFilter, time: 60000 });

        // Send new message
        if (confirmation.customId === 'continue') {
         await confirmation.update({
          content: content.slice(0, 2000), 
          components: []});
         await this.execute(interaction, counter+1);
        } else {
          console.log('Not the same user for button ' + confirmation.customId);
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
        `This server is ${interaction.guild.name} and has ${interaction.guild.memberCount} members.`
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
        `This command was run by ${interaction.user.username}, who joined on ${interaction.member.joinedAt}.`
      );
    },
  },
];