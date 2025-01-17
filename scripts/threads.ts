import { TextChannel } from "discord.js";
import { Completion } from "./utils/gpt.js";
import {
  BUILT_IN_RESPONSE_LIMIT,
  chunkString,
  whitespaceOnly,
} from "./text.js";
import { Inferences } from "./step.js";

const threadNames: Inferences<string> = {
  coherence: "Reasoning for coherence inference",
  custom: "Reasoning for custom check",
  multiStep: "Reasoning for chain inference",
  oneStep: "Reasoning for replacement inference",
};

export async function handleThreads(
  channel: TextChannel,
  completions: Inferences<Completion[]>,
) {
  return Object.entries(completions)
    .filter(([, completions]: [string, Completion[]]) => completions != null)
    .map(([key, completions]: [string, Completion[]]) => ({
      name: threadNames[key],
      text: completions
        .map(
          ({ input, output }) => `
# Input
${input}
# Output
${output}
`,
        )
        .join("\n"),
    }))
    .forEach(async ({ name, text }) => {
      const thread = await channel.threads.create({
        name,
        autoArchiveDuration: 60,
      });
      chunkString(text, BUILT_IN_RESPONSE_LIMIT).forEach(async (chunk) => {
        if (!whitespaceOnly(chunk)) return await thread.send(chunk);
      });
    });
}
