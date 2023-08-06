import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import { handleInteraction } from "../interaction.js";
import { Implication, inferenceInput } from "../step.js";
import { whitespaceOnly } from "../text.js";

const instructions = `\
# Break the Chain
_A game where you pit your wits against the world's smartest AI._
## Overview
In this game, you build up a chain of inference that leads to a target proposition. When GPT can no longer infer the target proposition at the beginning of the chain from the proposition at the end of the chain, your win.
## Starting a game
Enter \`/play start\` in the discord chat input. There are several options which you can ignore for now (for an explanation, enter \`/instructions option-name\`). After you enter \`/play start\`, you will be presented **facts** and a **target proposition**, which are initially identical. The **target proposition** is the "beginning of the chain" -- the proposition that you want GPT to fail to infer.
## Playing the game
Each turn, you update the current set of facts. A new fact is permitted if it implies the replaced fact (more checks are necessary if you use the \`coherence-check\` or \`custom-check\` options during \`/play start\`). To see GPT's reasoning for any inference, click the "Reasoning for ..." thread that gets created under the bot's responses.
## Winning the game
You win if GPT no longer infers the target proposition from the current fact.
### Example game
Here is how one game played out, with numbers referring to the turn and the text indicating the "current fact" at the beginning of each turn:
1. The dog is not barking loudly. (This is also the target proposition.)
2. The dog is sleeping.
3. The dog sleeps when he likes. He likes to sleep after going for his longest walk. He just went for his longest walk.
At this point, GPT became uncertain about the target proposition _The dog is not barking loudly_ and deemed the inference indeterminate resulting in a win! A good strategy is to keep adding layers of implication so that GPT has to take several implicit steps to reach the target proposition.`;

const coherenceCheck = `## Coherence Check
To activate this option, set \`coherence-check\` to true during \`/play start\`. This option checks if the target proposition follows from the _totality_ of facts submitted so far. Achieving the winning condition while passing this check is much more difficult and you may find that many of your proposed new facts get rejected. The motivation for this check is mathematical: Suppose
- \`a\` is the target proposition
- \`b\` is the current fact
- \`c\` is the fact you want to submit
Without coherence check, we check if \`P(b|c)\` is high and you win if GPT thinks that \`P(a|c)\` is not high. _With_ coherence check, we also check if \`P(a|b,c)\` is high. But \`P(a|c) ≥ P(a|b,c)P(b|c)\`. So if GPT accepts the new fact (if it passes the \`P(b|c)\` and the \`P(a|b,c)\` checks) but does not infer the target proposition \`P(a|c)\`, we know that GPT has made a mistake! Cases in which GPT makes a mistake are of special interest to us, because there is value in improving GPT's inference ability.`;

const customCheck = `## Custom Check
This check allows you to design a check of your choosing. For example, suppose you want GPT to check for the plausibility of any new fact \`C\`.  First use \`/custom-check\` to specify your check, using \`<a>\` to refer to the target proposition, \`<b>\` to refer to the current fact, and \`<c>\` to refer to the new fact. For example:
> \`/custom-check Proposition "<c>" is plausible: [true|false|indeterminate]
It is advisable to end a custom check with something that prompts GPT to produce the word "true," "false," or "indeterminate" to ensure that the response gets parsed correctly.  Next, when starting a new game, select \`play start custom-check=true\`. Then, each turn, this custom check will be applied to each new fact, substituting the appropriate values for the terms "<a>", "<b>", and "<c>" in your custom-check text.`;

const exampleFigmaInput = inferenceInput(
  [
    {
      text: "new-fact",
      image: {
        svg: "<svg updated from figma/>",
        description: "figma-description",
      },
    },
  ],
  {
    text: "proposition to be inferred",
    image: {
      svg: "<svg associated with proposition to be inferred/>",
      description: "figma-description",
    },
  },
  Implication.IMPLY,
);

const useFigma = `## Use Figma
Figma (www.figma.com) is a cloud-based design and prototyping tool for creating visual designs. It has a drag-and-drop tools similar to Powerpoint or Google Slides. Break the chain integrates with figma by allowing you to automatically export a Figma drawing into SVG format and include this as input to GPT. 
### Setting up the integration
1. Create a Figma account (free) and create a new design file.
2. Go to https://help.figma.com/hc/en-us/articles/8085703771159-Manage-personal-access-tokens and create a personal access token. Copy this token.
3. Use \`/figma\` to store your token and the url of your design file in the bot (don't worry tokens are encrypted and transmitted over HTTPS).
4. Finally, when starting a new game, select \`/play start use-figma=true\` and set \`figma-description\` to a caption that explains the contents of your drawing.
5. When you enter \`/play update\`, the game will automatically the most recent version of your figma file and include it in the input to GPT.
The final input to GPT will look like this:
${exampleFigmaInput
  .split("\n")
  .filter((l) => !whitespaceOnly(l))
  .map((l) =>
    l.replace(
      /in figure (\d+)/i,
      (_, match) => `(referring to figure ${match})`,
    ),
  )
  .map((l) => "> " + l)
  .join("\n")}
`;

const options = {
  null: instructions,
  "coherence-check": coherenceCheck,
  "custom-check": customCheck,
  "use-figma": useFigma,
  "figma-description": useFigma,
};

export default {
  data: new SlashCommandBuilder()
    .setName("instructions")
    .setDescription(`Submit figma data`)
    .addStringOption((option) =>
      option.setName("option").setDescription("Which option to explain."),
    ),
  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply();
    const option = interaction.options.getString("option");
    const selected = options[option];

    const message =
      selected == undefined
        ? `Invalid argument _${option}_. You can either omit this argument altogether or enter: ${Object.keys(
            options,
          )
            .filter((o) => o != "null")
            .map((o) => `\n- _${o}_`)
            .join("")}
`
        : selected;
    return await handleInteraction({ interaction, message });
  },
};
