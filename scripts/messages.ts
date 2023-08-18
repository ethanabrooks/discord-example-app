import { Collection, CommandInteraction, Message } from "discord.js";
import { createChatCompletionWithBackoff, gpt, complete } from "./utils/gpt.js";
import { ChatCompletionRequestMessage } from "openai";
import { Logger } from "pino";
import get from "axios";

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
  const contents: Promise<ChatCompletionRequestMessage[]> = get(attachment.url)
    .then((response): ChatCompletionRequestMessage[] => {
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
    })
    .catch((error): ChatCompletionRequestMessage[] => {
      console.error("Error: " + error.message);
      return [];
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

export async function queryInferences(
  inferences: string[][],
): Promise<string[]> {
    let responses: string[] = [];

    const n_queries: number = inferences.length; 
    for (let q = 0; q < n_queries; q++) {
      const n_statements: number = inferences[q].length;
      let query: string = 
`
The following is a numbered list of ${n_statements} statements. 
You need to figure out whether the chain of inference holds.
This means that from statement 1 you should be able to infer statement 2. Then from statement 2 to infer statement 3 and so on until statement ${n_statements}. 
The chain is only true when all single-step inferences can be made with certainty.
The statements are the following:
`;

      for (let p = 0; p < n_statements; p++) {
        query += (p+1) + ". " + inferences[q][p] + "\n";
      }
      query += 
`Think about it step by step and write an explanation regarding whether the full chain is true or false. 
Then in a new line say either 'Yes' or 'No' as a response to the question "Is the above true?".
`

      // Query GPT
      const content = await complete({
        "input": query
      });
      // console.log("Response", content)
      const res: string = content === undefined
          ? "Error: GPT API call failed"
          : content.output;
      responses.push(res);
    }

    return responses;
}