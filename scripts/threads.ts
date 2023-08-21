import { TextChannel } from "discord.js";
import { Completion } from "./utils/gpt.js";
import {
  BUILT_IN_RESPONSE_LIMIT,
  chunkString,
  whitespaceOnly,
} from "./text.js";
// import { Inferences } from "./commands/tictactoe.js";

type Inferences<Type> = {
  rowFwd?: Type;
  rowBwd?: Type;
  colFwd?: Type;
  colBwd?: Type;
  mainDiagFwd?: Type;
  mainDiagBwd?: Type;
  antiDiagFwd?: Type;
  antiDiagBwd?: Type;
};

const threadNames: Inferences<string> = {
  rowFwd: "Reasoning for row inference",
  rowBwd: "Reasoning for backwards row inference",
  colFwd: "Reasoning for column inference",
  colBwd: "Reasoning for backwards column inference",
  mainDiagFwd: "Reasoning for diagonal inference",
  mainDiagBwd: "Reasoning for backwards diagonal inference",
  antiDiagFwd: "Reasoning for anti-diagonal inference",
  antiDiagBwd: "Reasoning for backwards anti-diagonal inference",
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
