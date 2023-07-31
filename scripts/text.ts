import { complete, gpt } from "./gpt.js";

export const headerPrefix = "###";
export const BUILT_IN_RESPONSE_LIMIT = 2000;
export function splitAtResponseLimit(text: string) {
  return [
    text.slice(0, BUILT_IN_RESPONSE_LIMIT),
    text.slice(BUILT_IN_RESPONSE_LIMIT),
  ];
}

function bold(text: string) {
  return `**${text}**`;
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
