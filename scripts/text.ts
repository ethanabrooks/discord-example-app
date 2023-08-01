import { complete, gpt } from "./utils/gpt.js";

export const headerPrefix = "###";
export const BUILT_IN_RESPONSE_LIMIT = 2000;
export function splitAtResponseLimit(text: string) {
  return [
    text.slice(0, BUILT_IN_RESPONSE_LIMIT),
    text.slice(BUILT_IN_RESPONSE_LIMIT),
  ];
}

export async function negate(text: string) {
  return await complete({
    input: `Negate this statement (just return the negated statement, nothing else): ${text}`,
    model: `${gpt.three}`,
  });
}

export function chunkString(input: string, chunkSize: number): string[] {
  return input.length == 0
    ? []
    : [
        input.slice(0, chunkSize),
        ...chunkString(input.slice(chunkSize), chunkSize),
      ];
}

export function lowerCaseFirstLetter(inputString: string): string {
  if (inputString.length === 0) {
    return inputString; // Return the original string if it's empty
  }

  const firstLetter = inputString.charAt(0).toLowerCase();
  const restOfString = inputString.slice(1);

  return firstLetter + restOfString;
}

export function removeFinalPunctuation(inputString: string): string {
  // Define the regular expression pattern to match final punctuation
  const pattern = /[!"#$%&'()*+,-./:;<=>?@[\\\]^_`{|}~]$/;

  // Check if the string ends with punctuation
  if (pattern.test(inputString)) {
    // If yes, remove the final punctuation and return the updated string
    return inputString.slice(0, -1);
  }

  // If the string does not end with punctuation, return the original string as is
  return inputString;
}

export function whitespaceOnly(message: string) {
  let whitespaceRegex = /^\s*$/;
  return whitespaceRegex.test(message);
}
