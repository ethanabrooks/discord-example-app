import {
  AttachmentBuilder,
  ChatInputCommandInteraction,
  CommandInteraction,
  EmbedBuilder,
  SlashCommandBuilder,
} from "discord.js";
import { interactionToCCRMessages, messagesToContent } from "../../messages.js";
import { ChatCompletionRequestMessage } from "openai";
import * as diagramPrompt from "../../diagramPrompts.js";
import { prisma } from "../../utils/prismaClient.js";

export async function diagram(interaction: CommandInteraction) {
  const lastSpec = await prisma.spec.findFirst({
    where: { channel: interaction.channelId },
    orderBy: { id: "desc" },
  });
  let messages: ChatCompletionRequestMessage[] = await interactionToCCRMessages(
    {
      interaction,
      since: lastSpec?.messageId,
    },
  );

  const introduction: ChatCompletionRequestMessage = {
    role: "user",
    content: "# Transcript\n",
  };
  const instructions: ChatCompletionRequestMessage = {
    role: "user",
    content: diagramPrompt.instructions,
  };
  messages = [introduction, ...messages, instructions];
  const completion = await messagesToContent(messages);
  const split = completion.split("```json\n");
  const source = split[1] == null ? completion : split[1].split("\n```")[0];

  if (interaction.isCommand()) {
    interaction
      .followUp(
        `\
\`\`\`json
${source}
\`\`\``,
      )
      .then(() => {
        // Fetch the reply (interaction's message)
        interaction.fetchReply().then(async (replyMessage) => {
          // You can now access the message ID
          const messageId: string = replyMessage.id;
          const channel = replyMessage.channelId;

          await prisma.spec.create({ data: { messageId, channel, source } });
        });
      });
  }

  // const spec = canvas.map((obj) => {});

  // Add attached image
  const name = "diagram.png";
  // const file = new AttachmentBuilder(buffer, { name });
  const exampleEmbed = new EmbedBuilder()
    .setTitle("Test Image")
    .setImage(`attachment://${name}`);

  // Send image
  await interaction.followUp({
    embeds: [exampleEmbed],
    // files: [file],
  });
}

export default {
  data: new SlashCommandBuilder()
    .setName("diagram")
    .setDescription(`Generate diagram of scene`),
  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply();
    await diagram(interaction);
  },
};
