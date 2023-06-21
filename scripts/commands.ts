import "dotenv/config";

import {
  CommandInteraction,
  ChatInputApplicationCommandData,
  Client,
  ApplicationCommandType,
  AttachmentBuilder,
  EmbedBuilder,
  TextChannel,
} from "discord.js";

// OpenAI API
import { Configuration, OpenAIApi } from "openai";
const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

export interface Command extends ChatInputApplicationCommandData {
  run: (client: Client, interaction: CommandInteraction) => void;
}

export const Hello: Command = {
  name: "hello",
  description: "Returns a greeting",
  type: ApplicationCommandType.ChatInput,
  run: async (client: Client, interaction: CommandInteraction) => {
    const content = "Hello there!";
    console.log(client.channels.cache);

    const channel = client.channels.cache.get(
      "1119393916022685759"
    ) as TextChannel;
    channel.messages.fetch({ limit: 100 }).then((messages) => {
      console.log(`Received ${messages.size} messages`);
      //Iterate through the messages here with the variable "messages".
      // messages.forEach((message) => console.log(message.content));
    });

    await interaction.followUp({
      ephemeral: true,
      content,
    });
  },
};

export const AIGreet: Command = {
  name: "ai_greet",
  description: "The AI greets you",
  type: ApplicationCommandType.ChatInput,
  run: async (client: Client, interaction: CommandInteraction) => {
    // Query ChatGPT for a greeting
    const chatCompletion = await openai.createChatCompletion({
      model: "gpt-3.5-turbo",
      messages: [{ role: "user", content: "Write a greeting message." }],
    });
    const content = chatCompletion.data.choices[0].message.content;

    // Attach image with caption
    const file = new AttachmentBuilder("./test.png");
    const exampleEmbed = new EmbedBuilder()
      .setTitle(content)
      .setImage("attachment://test.png");

    // Send response
    await interaction.followUp({
      embeds: [exampleEmbed],
      files: [file],
    });
  },
};

export const Commands: Command[] = [Hello, AIGreet];
