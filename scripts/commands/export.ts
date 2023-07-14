import { interactionToMessages } from "../utils/messages.js";
import axios from "axios";
import { AttachmentBuilder, CommandInteraction } from "discord.js";
import FormData from "form-data";

export default async function exportMessages(interaction: CommandInteraction) {
  const channel = interaction.channel;
  if (channel == null) {
    return { text: "Error: Channel not found", files: [] };
  } else {
    console.log("Collecting messages...");
    const messages = await interactionToMessages(interaction);
    const buffer = Buffer.from(JSON.stringify(messages), "utf8");
    const file = new AttachmentBuilder(buffer, { name: "transcript.json" });
    return {
      text: "Here is a transcript of the current conversation",
      files: [file],
    };
  }
}
