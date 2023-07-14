import { Channel, ChatInputCommandInteraction, TextChannel } from "discord.js";

export default async function submit(interaction: ChatInputCommandInteraction) {
  const channelId = interaction.options.getString("channel");
  if (channelId == null) {
    return "Error: channel option not found";
  }
  const message = interaction.options.getString("message");
  if (message == null) {
    return "Error: message option not found";
  }
  const channel: Channel | null = await interaction.client.channels.fetch(
    channelId,
  );
  if (channel == null) {
    return "Error: Channel not found";
  } else if (channel instanceof TextChannel) {
    return await channel
      .send(message)
      .then(
        () =>
          `Sent message to channel <#${channel.id}>:
> ${message}
`,
      )
      .catch((e) => e);
  } else {
    return `Error: Channel <#${channel.id}> is not a TextChannel`;
  }
}
