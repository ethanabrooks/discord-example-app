import { CommandInteraction } from "discord.js";
import { createChatCompletionWithBackoff } from "../gpt.js";
import { ChatCompletionRequestMessage } from "openai";
import { Logger } from "pino";

const clientId = process.env.APP_ID;

export async function interactionToMessages(
  interaction: CommandInteraction,
): Promise<void | ChatCompletionRequestMessage[]> {
  return await interaction.channel.messages
    .fetch({
      limit: 100,
      cache: false,
    })
    .then((messages) =>
      messages.reverse().map(
        (message): ChatCompletionRequestMessage => ({
          role:
            // message.interaction != null &&
            // Just check if author id matches bot id
            message.author.id === clientId ? "system" : "user",
          content: message.content,
        }),
      ),
    )
    .catch(console.error);
}

export async function messagesToContent(
  messages: void | ChatCompletionRequestMessage[],
  logger: Logger,
) {
  if (messages instanceof Object) {
    // Query GPT
    const content = await createChatCompletionWithBackoff({
      messages,
      logger,
    });
    return content === undefined ? "Error: GPT-3 API call failed" : content;
  } else {
    return "Error: Failed to fetch messages";
  }
}
