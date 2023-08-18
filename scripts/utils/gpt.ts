import {
  ChatCompletionRequestMessage,
  ChatCompletionRequestMessageRoleEnum,
  Configuration,
  OpenAIApi,
} from "openai";
import { encode } from "gpt-3-encoder";

import { Logger } from "pino";
import catchError from "./errors.js";

// const MODEL = "gpt-3.5-turbo-0301";
const MODEL = "gpt-4";
export const DEBUG = false;

export type Completion = {
  input: string;
  output: string;
};

export const gpt = {
  three: "gpt-3.5-turbo",
  four: "gpt-4",
};

type IndexedMessage = {
  role: ChatCompletionRequestMessageRoleEnum;
  content: string | undefined;
  index: number;
};

function numTokensFromMessages(
  messages: ChatCompletionRequestMessage[],
): number {
  return encode(JSON.stringify(messages)).length;
}

function getMaxTokens(model: string): number {
  switch (model) {
    case "gpt-3.5-turbo":
    case "gpt-3.5-turbo-0301":
      return 2 ** 12 - 2 ** 10 - 2 ** 9 - 2 ** 8;
    case "gpt-4":
    case "gpt-4-0314":
      return 2 ** 12; //3 + 2 ** 12;
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
          `Case not covered: characterCount: ${characterCount}, numCharacters: ${numCharacters}, newCount: ${newCount}`,
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
  model: string;
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

export async function complete({
  input,
  stopWord = undefined,
  delay = 1,
  model = MODEL,
  logger = null,
}: {
  input: string;
  stopWord?: string | undefined;
  delay?: number;
  model?: string;
  logger?: Logger | null;
}) {
  console.log("input");
  console.log(input);
  const messages: ChatCompletionRequestMessage[] = [
    { role: "user", content: input },
  ];
  return createChatCompletionWithBackoff({
    messages,
    stopWord,
    delay,
    model,
    logger,
  });
}

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
  model?: string;
  logger?: Logger | null;
}): Promise<Completion | undefined> {
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
  console.log(inputMessages);
  const numTokens = numTokensFromMessages(inputMessages);
  const numCharacters = messagesLength(inputMessages);
  if (logger != null) {
    logger.debug({ inputMessages });
  }
  const input = messages.map(({ content }) => content).join("");
  console.log("Messages tokens:", numTokens);
  console.log("Messages characters:", numCharacters);
  console.log("Model:", model);
  const content: string | undefined = await openai
    .createChatCompletion({
      model,
      messages: inputMessages,
      stop: stopWord,
      temperature: 0,
      max_tokens: 1000,
      top_p: 0.5,
    })
    .then((completion) => {
      const [choice] = completion.data.choices;
      return choice.message?.content;
    })
    .catch(async (error) => {
      catchError(error);
      console.error(`Attempt failed. Retrying in ${delay}ms...`);

      // Wait for the delay period and then retry
      await new Promise((resolve) => setTimeout(resolve, delay));

      // Retry the operation, with a longer delay
      const retry = await createChatCompletionWithBackoff({
        messages,
        stopWord,
        delay: delay * 2,
        model,
        logger,
      });
      return retry.output;
    });
  if (content == null) {
    return {
      input,
      output: `GPT-3 returned no content in reponse to ${numCharacters} characters of input.`,
    };
  } else if (content.length == 0) {
    return {
      input,
      output: `GPT-3 returned empty content in reponse to ${numCharacters} characters of input.`,
    };
  }
  console.log("completion");
  console.log(content);
  if (logger != null) {
    logger.debug({
      messages: inputMessages,
      completion: content,
    });
  }
  return { output: content, input };
}
