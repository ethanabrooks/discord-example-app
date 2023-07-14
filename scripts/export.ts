import { interactionToMessages } from "./utils/messages.js";
import axios from "axios";
import FormData from "form-data";

export default async function exportMessages(interaction) {
  const channel = interaction.channel;
  if (channel == null) {
    return "Error: Channel not found";
  } else {
    console.log("Collecting messages...");
    const messages = await interactionToMessages(interaction);
    // Create a FormData instance
    const form = new FormData();

    // Append the 'f:1' field with the JSON data
    form.append("f:1", JSON.stringify(messages));

    console.log("Uploading messages...");
    const url: string | Error = await axios
      .post("http://ix.io", form, {
        headers: form.getHeaders(),
      })
      .then((response) => response.data)
      .catch((error) => error);
    console.log(url);

    return await (url instanceof Error
      ? url.message
      : `Messages exported to ${url}`);
  }
}
