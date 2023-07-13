import {
  Attachment,
  Collection,
  CommandInteraction,
  Message,
} from "discord.js";
import { createChatCompletionWithBackoff } from "../gpt.js";
import { ChatCompletionRequestMessage } from "openai";
import { Logger } from "pino";
import get from "axios";

const clientId = process.env.APP_ID;

function getRole(id: string | undefined) {
  return id === clientId ? "system" : "user";
}

function getAttachmentContents(attachment: Attachment) {
  console.log("contentType", attachment.contentType);
  return get(attachment.url)
    .then((response): string[] =>
      attachment.contentType.startsWith("text") ? [response.data] : [],
    )
    .catch((error): string[] => {
      console.error("Error: " + error.message);
      return [];
    });
}

function getCCRMessage(id: string) {
  return (content: string): ChatCompletionRequestMessage => {
    return {
      role: getRole(id),
      content,
    };
  };
}

async function getAttachmentCCRMessages(
  attachment,
  message,
): Promise<ChatCompletionRequestMessage[]> {
  const contents: Promise<string[]> = getAttachmentContents(attachment);
  return (await contents).map(getCCRMessage(message.author?.id));
}

async function getCCRMessages(
  message: Message<true>,
): Promise<ChatCompletionRequestMessage[]> {
  const attachmentMessagePromises: Promise<ChatCompletionRequestMessage[]>[] =
    Array.from(message.attachments.values()).map(getAttachmentCCRMessages);
  const attachmentMessages: ChatCompletionRequestMessage[] = (
    await Promise.all(attachmentMessagePromises)
  ).flat();

  const mainMessage: ChatCompletionRequestMessage = {
    role: getRole(message.author?.id),
    content: message.content,
  };
  return attachmentMessages.concat([mainMessage]);
}

export async function interactionToMessages(
  interaction: CommandInteraction,
): Promise<void | ChatCompletionRequestMessage[]> {
  const channel = interaction.channel;
  if (channel == null) {
    return [];
  }
  return await channel.messages
    .fetch({
      limit: 100,
      cache: false,
    })
    .then(async (messages: Collection<string, Message<true>>) => {
      const messagePromises = Array.from(messages.values())
        .reverse()
        .flatMap(getCCRMessages);
      return (await Promise.all(messagePromises)).flat();
    })
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
