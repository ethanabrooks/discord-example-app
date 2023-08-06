import {
  ActionRowBuilder,
  ButtonBuilder,
  CommandInteraction,
  ButtonInteraction,
  BufferResolvable,
  JSONEncodable,
  APIAttachment,
  Attachment,
  AttachmentBuilder,
  AttachmentPayload,
  ButtonStyle,
  APIEmbed,
} from "discord.js";
import { Stream } from "form-data";
import catchError from "./utils/errors.js";
import { splitAtResponseLimit, whitespaceOnly } from "./text.js";
export const revealButton = new ButtonBuilder()
  .setCustomId("reveal")
  .setLabel("Response cut off. Click to reveal")
  .setStyle(ButtonStyle.Primary);

export function buildActionRow(buttons) {
  return buttons.reduce(
    (builder: ActionRowBuilder<ButtonBuilder>, button: ButtonBuilder) =>
      builder.addComponents(button),
    new ActionRowBuilder<ButtonBuilder>(),
  );
}

export function sendReply(
  reply,
  interaction: CommandInteraction,
  deferred: boolean,
) {
  const channel = interaction.channel;
  return deferred ? interaction.followUp(reply) : channel.send(reply);
}

export async function acknowledgeAndRemoveButtons(
  buttonInteraction: ButtonInteraction,
  content: string,
) {
  await buttonInteraction.update({
    content: whitespaceOnly(content) ? "Content was empty" : content,
    components: [],
  });
}
export async function handleInteraction({
  interaction,
  embeds = [],
  deferred = true,
  files = [],
  message,
}: {
  embeds?: (APIEmbed | JSONEncodable<APIEmbed>)[];
  deferred?: boolean;
  files?: (
    | BufferResolvable
    | Stream
    | JSONEncodable<APIAttachment>
    | Attachment
    | AttachmentBuilder
    | AttachmentPayload
  )[];
  interaction: CommandInteraction;
  message: string;
}) {
  const [content, excess] = splitAtResponseLimit(message);
  const components: ActionRowBuilder<ButtonBuilder>[] =
    excess.length == 0 ? [] : [buildActionRow([revealButton])];

  const reply = { content, components, embeds, files };

  // Update reply
  await sendReply(reply, interaction, deferred).then((response) =>
    response
      .awaitMessageComponent()
      .then(async (buttonInteraction: ButtonInteraction) => {
        // Send new message
        switch (buttonInteraction.customId) {
          case "reveal":
            acknowledgeAndRemoveButtons(buttonInteraction, content);
            handleInteraction({
              message: excess,
              interaction,
              deferred: deferred,
            });
            break;
          default:
            throw Error("Cannot use button " + buttonInteraction.customId);
        }
      })
      .catch(async (e) => {
        catchError(e);
        return await sendReply(reply, interaction, !deferred).catch(catchError);
      }),
  );
}
