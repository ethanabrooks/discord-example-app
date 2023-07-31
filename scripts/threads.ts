import { TextChannel } from "discord.js";
import { Completion } from "./gpt.js";
import { BUILT_IN_RESPONSE_LIMIT, chunkString } from "./text.js";

type Threads<Type> = {
  oneStep?: Type;
  coherence?: Type;
  multiStep?: Type;
};

const threadNames: Threads<string> = {
  oneStep: "Reasoning for replacement inference",
  coherence: "Reasoning for coherence inference",
  multiStep: "Reasoning for chain inference",
};

export async function handleThreads(
  channel: TextChannel,
  completions: Threads<Completion[]>,
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
        return await thread.send(chunk);
      });
    });
}
