import { Collection, CommandInteraction, Message } from "discord.js";
import { createChatCompletionWithBackoff, gpt } from "./utils/gpt.js";
import { ChatCompletionRequestMessage } from "openai";
import get, { all } from "axios";

const clientId = process.env.APP_ID;

function getRole(id: string | undefined) {
  return id === clientId ? "system" : "user";
}

function isCCRMessage(obj: any): obj is ChatCompletionRequestMessage {
  if (!obj) {
    return false;
  }

  switch (typeof obj.content) {
    case "string":
    case "undefined":
      break;
    default:
      return false;
  }

  switch (obj.role) {
    case "system":
    case "user":
    case "assistant":
    case "function":
      return true;
    default:
      return false;
  }
}

async function getAttachmentCCRMessages(
  attachment,
  message,
): Promise<ChatCompletionRequestMessage[]> {
  const contents: Promise<ChatCompletionRequestMessage[]> = get(
    attachment.url,
  ).then((response): ChatCompletionRequestMessage[] => {
    if (attachment.contentType?.startsWith("text")) {
      const data = response.data;

      if (Array.isArray(data) && data.every(isCCRMessage)) {
        return data;
      }
      const ccrMessage: ChatCompletionRequestMessage = {
        role: getRole(message.author?.id),
        content: data instanceof Object ? JSON.stringify(data) : data,
      };

      return [ccrMessage];
    } else {
      return [];
    }
  });
  return await contents;
}

async function getCCRMessages(
  message: Message<true>,
): Promise<ChatCompletionRequestMessage[]> {
  const attachmentMessagePromises: Promise<ChatCompletionRequestMessage[]>[] =
    Array.from(message.attachments.values()).map(getAttachmentCCRMessages);
  const attachmentMessages: ChatCompletionRequestMessage[] = (
    await Promise.all(attachmentMessagePromises)
  ).flat();

  const content = `${message.author.username}: ${message.content}`;
  const mainMessage: ChatCompletionRequestMessage = {
    role: getRole(message.author?.id),
    content,
  };
  return attachmentMessages.concat([mainMessage]);
}

export async function interactionToCCRMessages({
  interaction,
  since = null,
}: {
  interaction: CommandInteraction;
  since?: string | null;
}): Promise<ChatCompletionRequestMessage[]> {
  const messages: Message<true>[] = await interactionToMessages({
    interaction,
    since,
  });

  return (await Promise.all(messages.flatMap(getCCRMessages))).flat();
}

async function interactionToMessages({
  interaction,
  since,
}: {
  interaction: CommandInteraction;
  since: string | null;
}): Promise<Message<true>[]> {
  const channel = interaction.channel;
  if (channel == null) {
    return [];
  }
  return await channel.messages
    .fetch({
      limit: 100,
      cache: false,
    })
    .then(async (messagesCollection: Collection<string, Message<true>>) => {
      const allMessages: Message<true>[] = Array.from(
        messagesCollection.values(),
      ).reverse();
      const { filtered } = allMessages.reduce(
        (
          {
            reachedId,
            filtered,
          }: { reachedId: boolean; filtered: Message<true>[] },
          message: Message<true>,
        ) => {
          reachedId = reachedId || message.id === since;
          if (reachedId) {
            filtered.push(message);
          }
          return { reachedId, filtered };
        },
        { reachedId: since == null, filtered: [] },
      );
      return filtered;
    });
}

export async function messagesToContent(
  messages: void | ChatCompletionRequestMessage[],
) {
  if (messages instanceof Object) {
    // Query GPT
    const content = await createChatCompletionWithBackoff({
      messages,
      model: gpt.four,
    });
    return content === undefined
      ? "Error: GPT-3 API call failed"
      : content.output;
  } else {
    return "Error: Failed to fetch messages";
  }
}
