import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import { handleInteraction } from "../interaction.js";

const instructions = `\
# Break the Chain
_A game where you pit your wits against the world's smartest AI._
## Overview
In this game, you build up a chain of inference that leads to a target proposition. When GPT can no longer infer the beginning of the chain from the end, your win.
## Starting a game
Enter \`/play start\` in the discord chat input. There are several options which you can ignore for now (for an explanation, enter \`/instructions options=true\`). After you enter \`/play start\`, you will be presented **facts** and a **target proposition**, which are initially identical. The **target proposition** is the "beginning of the chain" -- the proposition that you want GPT to fail to infer.
## Playing the game
Each turn, you update the current fact (or set of facts). A new fact is permitted if it implies the replaced fact (more checks are necessary if you use the \`coherence-check\` or \`custom-check\` options during \`/play start\`). To see GPT's reasoning for any inference, click the "Reasoning for ..." thread that gets created under the bot's responses.
## Winning the game
You win if GPT no longer infers the target proposition from the current fact.
`;

const coherenceCheck = `## Coherence Check
To activate this option, set \`coherence-check\` to true during \`/play start\`. This option checks if the target proposition follows from the _totality_ of facts submitted so far. Achieving the winning condition while passing this check is much more difficult and you may find that many of your proposed new facts get rejected. The motivation for this check is mathematical: Suppose
- \`a\` is the target proposition
- \`b\` is the current fact
- \`c\` is the fact you want to submit
Without coherence check, we check if \`P(b|c)\` is high and you win if GPT thinks that \`P(a|c)\` is not high. _With_ coherence check, we also check if \`P(a|b,c)\` is high. But \`P(a|c) ≥ P(a|b,c)P(b|c)\`. So if GPT accepts the new fact (if it passes the \`P(b|c)\` and the \`P(a|b,c)\` checks) but does not infer the target proposition \`P(a|c)\`, we know that GPT has made a mistake! Cases in which GPT makes a mistake are of special interest to us, because there is value in improving GPT's inference ability.
`;

const customCheck = `## Custom Check
This check allows you to design a check of your choosing. For example, suppose you want GPT to check for the plausibility of any new fact \`C\`.
First use \`/custom-check\` to specify your check, using \`<a>\` to refer to the target proposition, \`<b>\` to refer to the current fact, and \`<c>\` to refer to the new fact. For example:
> \`/custom-check Proposition "<c>" is plausible: [true|false|indeterminate]
It is advisable to end a custom check with something that prompts GPT to produce the word "true," "false," or "indeterminate" to ensure that the response gets parsed correctly.
Next, when starting a new game, select \`play start custom-check=true\`. Then, each turn, this custom check will be applied to each new fact, substituting the appropriate values for the terms "<a>", "<b>", and "<c>" in your custom-check text.
`;

const options = {
  null: instructions,
  "coherence-check": coherenceCheck,
  "custom-check": customCheck,
};

export default {
  data: new SlashCommandBuilder()
    .setName("instructions")
    .setDescription(`Submit figma data`)
    .addStringOption((option) =>
      option.setName("options").setDescription("Which option to explain."),
    ),
  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply();
    const option = interaction.options.getString("options");
    const selected = options[option];
    const message =
      selected == undefined
        ? `Invalid option: ${option}. Available options: ${Object.keys(
            options,
          ).join(", ")}
`
        : selected;
    return await handleInteraction({ interaction, message });
  },
};
