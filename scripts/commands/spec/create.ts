import { CommandInteraction, EmbedBuilder } from "discord.js";
import { interactionToCCRMessages, messagesToContent } from "../../messages.js";
import { ChatCompletionRequestMessage } from "openai";
import * as diagramPrompt from "../../diagramPrompts.js";
import { prisma } from "../../utils/prismaClient.js";
import { createSpec } from "./pull.js";

export default async (interaction: CommandInteraction) => {
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
  await createSpec(interaction, source);

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
};
