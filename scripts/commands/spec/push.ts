import { CommandInteraction } from "discord.js";
import fetch from "node-fetch";
import { prisma } from "../../utils/prismaClient.js";

export default async (interaction: CommandInteraction) => {
  const spec = await prisma.spec.findFirst({
    where: { channel: interaction.channelId },
    orderBy: { id: "desc" },
  });
  console.log(spec.source);
  console.log(typeof spec.source);
  if (spec == null) {
    await interaction.followUp("No spec found.");
    return;
  }
  console.log(process.env.BLENDER_ENDPOINT);
  const response = await fetch(process.env.BLENDER_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: spec.source,
  })
    .then((response) => response.text())
    .then((response) => {
      console.log(response);
      return response;
    })
    .catch((error) => {
      console.error("Error:", error);
      return `Error: ${error}`;
    });
  await interaction.followUp(response);
};
