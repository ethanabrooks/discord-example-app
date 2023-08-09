import { CommandInteraction } from "discord.js";
import fetch from "node-fetch";
import { prisma } from "../../utils/prismaClient.js";

export function jsonCodeBlock(json: string) {
  return `\
\`\`\`json
${json}
\`\`\``;
}

export function createSpec(interaction: CommandInteraction, source: string) {
  if (interaction.isCommand()) {
    interaction.followUp(jsonCodeBlock(source)).then(() => {
      // Fetch the reply (interaction's message)
      interaction.fetchReply().then(async (replyMessage) => {
        // You can now access the message ID
        const messageId: string = replyMessage.id;
        const channel = replyMessage.channelId;

        const newSpec = await prisma.spec.create({
          data: { messageId, channel, source },
        });
        console.log(newSpec);
      });
    });
  }
}

export default async (interaction: CommandInteraction) => {
  console.log(process.env.BLENDER_ENDPOINT);
  const response = await fetch(process.env.BLENDER_ENDPOINT)
    .then(async (response) => {
      if (response.status == 200) {
        const source = await response.text();
        createSpec(interaction, source);
        return jsonCodeBlock(source);
      }
      return response.text();
    })
    .catch((error) => {
      console.error("Error:", error);
      return `Error: ${error}`;
    });
  console.log(response);
  await interaction.followUp(response);
};
