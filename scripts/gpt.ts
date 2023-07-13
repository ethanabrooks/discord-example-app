import { ChatCompletionRequestMessage, Configuration, OpenAIApi } from "openai";
import {
  get_encoding,
  encoding_for_model,
  TiktokenModel,
} from "@dqbd/tiktoken";
import text from "./prompts.js";

const MODEL = "gpt-3.5-turbo-0301";
const DEBUG = true;

function numTokensFromMessages(messages: any[], model: TiktokenModel): number {
  let encoding: any;
  try {
    encoding = encoding_for_model(model);
  } catch (error) {
    console.warn("Warning: model not found. Using cl100k_base encoding.");
    encoding = get_encoding("cl100k_base");
  }
  let tokensPerMessage: number;
  let tokensPerName: number;

  switch (model) {
    case "gpt-4":
    case "gpt-4-0314":
    case "gpt-4-32k-0314":
    case "gpt-3.5-turbo":
      tokensPerMessage = 3;
      tokensPerName = 1;
      if (model.includes("gpt-3.5-turbo")) {
        console.warn(
          "Warning: gpt-3.5-turbo may update over time. Returning num tokens assuming gpt-3.5-turbo-0613.",
        );
      }
      break;
    case "gpt-3.5-turbo-0301":
      tokensPerMessage = 4;
      tokensPerName = -1;
      break;
    default:
      throw new Error(
        `numTokensFromMessages() is not implemented for model ${model}. See https://github.com/openai/openai-python/blob/main/chatml.md for information on how messages are converted to tokens.`,
      );
  }

  let numTokens: number = 0;
  for (let message of messages) {
    numTokens += tokensPerMessage;
    for (let key in message) {
      numTokens += encoding.encode(message[key]).length;
      if (key == "name") {
        numTokens += tokensPerName;
      }
    }
  }
  numTokens += 3; // every reply is primed with assistant
  return numTokens;
}

function getMaxTokens(model: string): number {
  switch (model) {
    case "gpt-3.5-turbo":
    case "gpt-3.5-turbo-0301":
      return 4096 - 1024 - 512;
    case "gpt-4":
    case "gpt-4-0314":
      return 8192 + 4096;
    default:
      throw new Error(
        `get_max_tokens() is not implemented for model ${model}.`,
      );
  }
}

function getApproxMessageLength(model: string): number {
  switch (model) {
    case "gpt-3.5-turbo":
    case "gpt-3.5-turbo-0301":
      return 12000;
    case "gpt-4":
    case "gpt-4-0314":
      return 24000;
    default:
      throw new Error(
        `get_max_tokens() is not implemented for model ${model}.`,
      );
  }
}

function concatMaybeStrings(
  string1: string | undefined,
  string2: string | undefined,
) {
  if (string1 === undefined && string2 === undefined) {
    return undefined;
  } else if (string1 === undefined) {
    return string2;
  } else if (string2 === undefined) {
    return string1;
  } else {
    return string1 + string2;
  }
}

// Takes two arrays of messages and concatenates them.
// If the last message of the first array and the first message of the second array have the same role
// merge their contents into a single message.
function concatMessages(
  messages1: ChatCompletionRequestMessage[],
  messages2: ChatCompletionRequestMessage[],
) {
  if (messages1.length === 0) {
    return messages2;
  } else if (messages2.length === 0) {
    return messages1;
  }
  const messages1Last = messages1[messages1.length - 1];
  messages1 = messages1.slice(0, -1);
  const [messages2Head, ...messages2Tail] = messages2;
  let middleMessages: ChatCompletionRequestMessage[];
  if (messages1Last.role === messages2Head.role) {
    middleMessages = [
      {
        role: messages1Last.role,
        content: concatMaybeStrings(
          messages1Last.content,
          messages2Head.content,
        ),
      },
    ];
  } else {
    middleMessages = [messages1Last, messages2Head];
  }
  return messages1.concat(middleMessages).concat(messages2Tail);
}

function maybeStringLength(maybeString: string | undefined) {
  return maybeString === undefined ? 0 : maybeString.length;
}

function truncateMessagesAtNumCharacters(
  messages: ChatCompletionRequestMessage[],
  numCharacters: number,
) {
  const { half } = messages.reduce(
    ({ half, characterCount }, message) => {
      const newCount: number =
        characterCount + maybeStringLength(message.content);
      if (characterCount < numCharacters && newCount < numCharacters) {
        return {
          half: { ...half, first: concatMessages(half.first, [message]) },
          characterCount: newCount,
        };
      } else if (characterCount < numCharacters && newCount > numCharacters) {
        const length = numCharacters - characterCount;
        return {
          half: {
            first: concatMessages(half.first, [
              {
                ...message,
                content: message.content?.slice(0, length),
              },
            ]),
            second: [{ ...message, content: message.content?.slice(length) }],
          },
          characterCount: newCount,
        };
      } else if (characterCount < numCharacters && newCount == numCharacters) {
        return {
          half: {
            ...half,
            first: concatMessages(half.first, [
              {
                ...message,
                content: message.content?.slice(0, length),
              },
            ]),
          },
          characterCount: characterCount + length,
        };
      } else if (characterCount === numCharacters) {
        return {
          half,
          characterCount,
        };
      } else if (characterCount > numCharacters) {
        return {
          half: {
            ...half,
            second: concatMessages(half.second, [message]),
          },
          characterCount,
        };
      } else {
        throw new Error(
          `Case not covered: characterCount: ${characterCount}, halfCharacters: ${numCharacters}, newCount: ${newCount}`,
        );
      }
    },
    {
      half: {
        first: [] as ChatCompletionRequestMessage[],
        second: [] as ChatCompletionRequestMessage[],
      },
      characterCount: 0,
    },
  );
  return [half.first, half.second];
}

// Divide a messages list into two halves with equal characters per half.
function bisectMessages(messages: ChatCompletionRequestMessage[]) {
  // Calculate the total number of characters in all messages.
  let totalCharacters = messages.reduce(
    (total, message) => total + maybeStringLength(message.content),
    0,
  );
  let halfCharacters = Math.floor(totalCharacters / 2);

  return truncateMessagesAtNumCharacters(messages, halfCharacters);
}

function messagesLength(messages: ChatCompletionRequestMessage[]) {
  return messages.reduce(
    (total, message) => total + maybeStringLength(message.content),
    0,
  );
}

// Retain the last portion of messages that has tokens roughly equal to limit.
function truncateMessages(
  messages: ChatCompletionRequestMessage[],
  model: TiktokenModel,
  limit: number,
  discard: ChatCompletionRequestMessage[] = [],
) {
  limit = Math.round(limit);
  const numTokens = numTokensFromMessages(messages, model);
  const excess = numTokens - limit;
  console.log(
    "numTokens: " + numTokens,
    "limit: " + limit,
    "Excess: " + excess,
  );

  // If message is down to one character, don't truncate it.
  if (messagesLength(messages) <= 1) {
    return messages;
  }
  if (excess < 0) {
    // If we are below the limit
    const remainder = -excess;
    return concatMessages(
      messages,
      truncateMessages(discard, model, remainder, []), // append truncated discard
    );
  } else if (excess > 0) {
    const [firstHalf, secondHalf] = bisectMessages(messages);
    return truncateMessages(
      secondHalf,
      model,
      limit,
      concatMessages(messages, firstHalf), // discard first half
    );
  } else {
    return messages;
  }
}

// OpenAI API configuration
const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

export default async function createChatCompletionWithBackoff(
  messages: ChatCompletionRequestMessage[],
  stopWord: string | undefined = undefined,
  delay = 1,
  model: TiktokenModel = MODEL,
): Promise<string | undefined> {
  if (DEBUG) {
    return text;
  }
  [messages] = truncateMessagesAtNumCharacters(
    messages,
    getApproxMessageLength(model),
  );
  messages = truncateMessages(messages, model, getMaxTokens(model));
  console.log("Messages length:", messagesLength(messages));
  try {
    const chatCompletion = await openai.createChatCompletion({
      model: "gpt-3.5-turbo",
      messages: messages,
      stop: stopWord,
      temperature: 1,
      max_tokens: 1000,
      top_p: 0.5,
    });
    return chatCompletion.data.choices[0].message?.content;
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
