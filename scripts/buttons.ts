import { ButtonStyle } from "discord.js";

// Buttons
export type ButtonComponents = {
  id: string;
  label: string;
  style: ButtonStyle;
};
export const buttons = {
  submit: {
    id: "submit",
    label: "Submit to GPT",
    style: ButtonStyle.Primary,
  },
  visualize: {
    id: "visualize",
    label: "Visualize",
    style: ButtonStyle.Secondary,
  },
  diagram: {
    id: "diagram",
    label: "Diagram",
    style: ButtonStyle.Secondary,
  },
  reveal: {
    id: "reveal",
    label: "Reponse cut off. Click to reveal.",
    style: ButtonStyle.Secondary,
  },
};
