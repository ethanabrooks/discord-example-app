import { Collection, CommandInteraction, Message } from "discord.js";
import { createChatCompletionWithBackoff, gpt, complete } from "./utils/gpt.js";
import { ChatCompletionRequestMessage } from "openai";
import { Logger } from "pino";
import get from "axios";
import { Completion } from "./utils/gpt.js"

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
): Promise<Completion[][]> {
    // let responses: string[][] = [];
    let completions: Completion[][] = [];

    const n_queries: number = inferences.length; 
    for (let q = 0; q < n_queries; q++) {
      const n_statements: number = inferences[q].length;
      let q_compl: Completion[] = [];
      for (let s = 0; s < n_statements-1; s++) {
        const query: string = 
` 
Evaluate whether the conclusion can be inferred from the premise with certainty.
Premise: ${inferences[q][s]}
Conclusion: ${inferences[q][s+1]}

Think about it step by step and write an explanation regarding whether the conclusion can be inferred from the premise and why.
After that, in a new line, write a single "Yes" or "No" as the response to the question 'Can the conclusion be inferred from the premise?.
`;

        // Query GPT
        const content = await complete({
          "input": query
        });
        // console.log("Response", content)
        const res: string = content === undefined
            ? "Error: GPT API call failed"
            : content.output;
        // responses.push(res);
        const compl: Completion = ({
          "input": query,
          "output": content.output
        })
        q_compl.push(compl);

      //   // Regex check
      //   const lines = res.split('\n');
      //   const lastLine = lines[lines.length - 1];

      //   // Check whether yes or no was in the last line
      //   const yes_regex = /^yes/i;
      //   const no_regex = /^no/i;
      //   if (yes_regex.test(lastLine)) {
      //     // console.log("The string contains 'yes'.");
      //     q_responses.push("yes");
      //   } else if (no_regex.test(lastLine))  {
      //     // console.log("The string contains 'no'.");
      //     q_responses.push("no");
      //   } else {
      //     q_responses.push("undef");
      //   }
      // }
      // responses.push(q_responses);
    }
    completions.push(q_compl);
  }

    // return responses;
    return completions;
}