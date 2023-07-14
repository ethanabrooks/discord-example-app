import {
  ChatCompletionRequestMessage,
  ChatCompletionRequestMessageRoleEnum,
  Configuration,
  OpenAIApi,
} from "openai";
import {
  get_encoding,
  encoding_for_model,
  TiktokenModel,
} from "@dqbd/tiktoken";
import text from "./prompts.js";
import { Logger } from "pino";
import { CommandInteractionOptionResolver } from "discord.js";

const MODEL: TiktokenModel = "gpt-3.5-turbo-0301";
export const DEBUG = false;

type IndexedMessage = {
  role: ChatCompletionRequestMessageRoleEnum;
  content: string | undefined;
  index: number;
};

function numTokensFromMessages(
  messages: ChatCompletionRequestMessage[],
  model: TiktokenModel,
): number {
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

function concatMaybeStrings(...strings: (string | undefined)[]) {
  return strings.reduce((string1, string2) => {
    if (string1 === undefined && string2 === undefined) {
      return undefined;
    } else if (string1 === undefined) {
      return string2;
    } else if (string2 === undefined) {
      return string1;
    } else {
      return string1 + string2;
    }
  }, "");
}

function getIndices(messages: IndexedMessage[]) {
  return messages.map((message) => message.index);
}

// Takes two arrays of messages and concatenates them.
// If the last message of the first array and the first message of the second array have the same role
// merge their contents into a single message.
function concatMessages(
  messages1: IndexedMessage[],
  messages2: IndexedMessage[],
) {
  if (messages1.length === 0) {
    return messages2;
  } else if (messages2.length === 0) {
    return messages1;
  }
  const indices = getIndices(messages1).concat(getIndices(messages2));
  if (!isContiguous(indices)) {
    throw new Error(`Messages are not contiguous: ${indices}`);
  }
  const messages1Last = messages1[messages1.length - 1];
  messages1 = messages1.slice(0, -1);
  const [messages2Head, ...messages2Tail] = messages2;
  let middleMessages: IndexedMessage[];
  if (messages1Last.index === messages2Head.index) {
    middleMessages = [
      {
        role: messages1Last.role,
        content: concatMaybeStrings(
          messages1Last.content,
          messages2Head.content,
        ),
        index: messages1Last.index,
      },
    ];
  } else if (messages1Last.index + 1 === messages2Head.index) {
    middleMessages = [messages1Last, messages2Head];
  } else {
    throw new Error(
      `Messages are not contiguous: ${messages1Last.index} and ${messages2Head.index}`,
    );
  }
  return messages1.concat(middleMessages).concat(messages2Tail);
}

function maybeStringLength(maybeString: string | undefined) {
  return maybeString === undefined ? 0 : maybeString.length;
}

function truncateMessagesAtNumCharacters(
  messages: IndexedMessage[],
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
      } else if (newCount == numCharacters) {
        return {
          half: {
            ...half,
            first: concatMessages(half.first, [
              {
                ...message,
                content: message.content,
              },
            ]),
          },
          characterCount: newCount,
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
        first: [] as IndexedMessage[],
        second: [] as IndexedMessage[],
      },
      characterCount: 0,
    },
  );
  return [half.first, half.second];
}

// Divide a messages list into two halves with equal characters per half.
function bisectMessages(messages: IndexedMessage[]) {
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

function indexedToChatCompletionRequestMessage({
  role,
  content,
}: IndexedMessage): ChatCompletionRequestMessage {
  return { role, content };
}

function isContiguous(arr) {
  // First, sort the array
  arr.sort((a, b) => a - b);
  const [head, ...tail] = arr;
  const { isContiguous } = tail.reduce(
    ({ prev, isContiguous }, next) => ({
      isContiguous: isContiguous && prev <= next && next <= prev + 1,
      prev: next,
    }),
    { prev: head, isContiguous: true },
  );
  return isContiguous;
}

if (!isContiguous([1, 2, 3, 3, 4, 5])) {
  throw new Error("isContiguous failed");
}

// Retain the last portion of messages that has tokens roughly equal to limit.
function truncateMessages({
  messages,
  model,
  limit,
  discard,
}: {
  messages: IndexedMessage[];
  model: TiktokenModel;
  limit: number;
  discard: IndexedMessage[];
}) {
  const indices = getIndices(messages);
  if (!isContiguous(indices)) {
    throw new Error(`Messages are not contiguous: ${indices}`);
  }

  limit = Math.round(limit);
  const numTokens = numTokensFromMessages(
    messages.map(indexedToChatCompletionRequestMessage),
    model,
  );
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
    const truncated = truncateMessages({
      discard: [],
      messages: discard,
      model,
      limit: remainder,
    });
    return concatMessages(truncated, messages);
  } else if (excess > 0) {
    const [firstHalf, secondHalf] = bisectMessages(messages);
    return truncateMessages({
      discard: firstHalf, // discard first half
      messages: secondHalf,
      model,
      limit,
    });
  } else {
    return messages;
  }
}

// OpenAI API configuration
const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});
export const openai = new OpenAIApi(configuration);

export async function createChatCompletionWithBackoff({
  messages,
  stopWord = undefined,
  delay = 1,
  model = MODEL,
  logger = null,
}: {
  messages: ChatCompletionRequestMessage[];
  stopWord?: string | undefined;
  delay?: number;
  model?: TiktokenModel;
  logger?: Logger | null;
}): Promise<string | undefined> {
  const length = messagesLength(messages);
  const indexedMessages = messages.map(
    (message, index): IndexedMessage => ({
      content: message.content,
      role: message.role,
      index,
    }),
  );
  const [discard, truncated] = truncateMessagesAtNumCharacters(
    indexedMessages,
    length - getApproxMessageLength(model),
  );
  const inputMessages = truncateMessages({
    discard,
    messages: truncated,
    model,
    limit: getMaxTokens(model),
  }).map(indexedToChatCompletionRequestMessage);
  console.log("Messages tokens:", numTokensFromMessages(inputMessages, model));
  console.log("Messages characters:", messagesLength(inputMessages));
  try {
    if (logger != null) {
      logger.debug({ inputMessages });
    }
    console.log("messages");
    console.log(messages);
    let content: string | undefined;
    if (DEBUG) {
      content = text;
    } else {
      const completion = await openai.createChatCompletion({
        model: "gpt-3.5-turbo",
        messages: inputMessages,
        stop: stopWord,
        temperature: 1,
        max_tokens: 1000,
        top_p: 0.5,
      });
      const [choice] = completion.data.choices;
      content = choice.message?.content;
    }
    console.log("completion");
    console.log(content);
    if (logger != null) {
      logger.debug({
        messages: inputMessages,
        completion: content,
      });
    }
    return content;
  } catch (error) {
    if (logger != null) {
      logger.error(error);
    }
    console.log(error);
    if (error.response.status == 429) {
      console.error(`Attempt failed. Retrying in ${delay}ms...`);

      // Wait for the delay period and then retry
      await new Promise((resolve) => setTimeout(resolve, delay));

      // Retry the operation, with a longer delay
      return createChatCompletionWithBackoff({
        messages,
        stopWord,
        delay: delay * 2,
        model,
        logger,
      });
    }
  }
}
