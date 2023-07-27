import {
  SlashCommandBuilder,
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
  GuildMember,
  Collection,
  ThreadMemberManager,
  ChatInputCommandInteraction,
  ButtonStyle,
  TextChannel,
} from "discord.js";
import { buttons } from "./buttons.js";
import { Stream } from "form-data";
import catchError from "./utils/errors.js";
import { complete } from "./gpt.js";
import propositions from "./propositions.js";

import pl from "tau-prolog";
const session = pl.create();
session.consult(
  `\
a.
b :- a.
b.
`,
  {
    success: function () {
      /* Program parsed correctly */
      session.query("b.", {
        success: function (goal) {
          session.answer({
            success: function (answer) {
              console.log("ANSWER", pl.format_answer(answer));
            },
            error: function (err) {
              console.log(err);
              /* Uncaught error */
            },
            fail: function () {
              /* No more answers */
            },
            limit: function () {
              /* Limit exceeded */
            },
          });
        },
        error: function (err) {
          console.log(err);
          /* Error parsing goal */
        },
      });
    },
    error: function (err) {
      /* Error parsing program */
    },
  },
);

const BUILT_IN_RESPONSE_LIMIT = 2000;
const COHERENCE_VALIDATION = true;
const REMOVE_FACTS_WITH_GPT = false;
const headerPrefix = "###";
const tryAgainText = `${headerPrefix} Try again!`;
const keepPlayingText = `${headerPrefix} Keep playing.`;
const winText = "# You win!";
const concludingText = (proposition: string) =>
  `In conclusion, the proposition _${proposition}_ is probably [true|false|indeterminate]`;

type Inferences<Type> = {
  priorKnowledge?: Type;
  coherence?: Type;
  multiStep?: Type;
};

interface Proposition {
  prolog: string;
  text: string;
}
interface Knowledge extends Proposition {
  implied: boolean;
}

const threadNames: Inferences<string> = {
  priorKnowledge: "Reasoning for replacement inference",
  coherence: "Reasoning for coherence inference",
  multiStep: "Reasoning for chain inference",
};

type Status = "win" | "try again" | "continue";

function splitAtResponseLimit(text: string) {
  return [
    text.slice(0, BUILT_IN_RESPONSE_LIMIT),
    text.slice(BUILT_IN_RESPONSE_LIMIT),
  ];
}

async function handleInteraction({
  interaction,
  firstReply = true,
  files = [],
  message,
}: {
  firstReply?: boolean;
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
  const button = new ButtonBuilder()
    .setCustomId(buttons.reveal.id)
    .setLabel("Response cut off. Click to reveal")
    .setStyle(ButtonStyle.Primary);
  const components: ActionRowBuilder<ButtonBuilder>[] =
    excess.length == 0
      ? []
      : [new ActionRowBuilder<ButtonBuilder>().addComponents(button)];

  const reply = { content, components, files };
  const channel = interaction.channel;
  // Update reply
  await (firstReply ? interaction.followUp(reply) : channel.send(reply)).then(
    (response) =>
      response
        .awaitMessageComponent()
        .then(async (buttonInteraction: ButtonInteraction) => {
          async function acknowledgeAndremoveButtons() {
            const content =
              reply.content.length > 0 ? reply.content : "Content was empty"; // this is necessary because of an annoying error that gets thrown when you try to update a message with no content
            await buttonInteraction.update({
              content,
              components: [],
            });
          }
          // Send new message
          switch (buttonInteraction.customId) {
            case buttons.reveal.id:
              acknowledgeAndremoveButtons();
              handleInteraction({
                message: excess,
                interaction,
                firstReply,
              });
              break;
            default:
              throw Error("Cannot use button " + buttonInteraction.customId);
          }
        })
        .catch(async (e) => {
          catchError(e);
          return await (!firstReply
            ? interaction.followUp(reply)
            : channel.send(reply).catch((e) => {
                catchError(e);
                return;
              }));
        }),
  );
}
const gpt = {
  three: "gpt-3.5-turbo",
  four: "gpt-4",
};
const subcommands = {
  start: "start",
  update: "update",
};

function factsToStrings(facts: string[]) {
  return facts.map((fact, index) => `${index + 1}. ${fact}`);
}

function inferenceToBoolean(inference: string) {
  inference = inference.toLowerCase();
  const containsTrue = inference.includes("true");
  const containsFalse = inference.includes("false");
  if (
    inference.includes("true than false") ||
    (containsTrue && !containsFalse)
  ) {
    return true;
  } else if (
    inference.includes("false than true") ||
    (!containsTrue && containsFalse)
  ) {
    return false;
  }
  return null;
}

function extractCodeBlock(text: string) {
  const [beforeBackticks, afterBackticks] = text.split(/```.*\n/);
  return (afterBackticks ?? beforeBackticks).trim();
}

function getUsernames(members: Collection<string, GuildMember>) {
  return Array.from(members.values())
    .filter(({ user }) => !user.bot)
    .map(({ user }) => user.username);
}

function randomChoice<Type>(array: Type[]) {
  return array[Math.floor(Math.random() * array.length)];
}

function randomBoolean() {
  return Math.random() < 0.5;
}

async function negate(text: string) {
  return await complete({
    input: `Negate this statement (just return the negated statement, nothing else): ${text}`,
    model: `${gpt.three}`,
  });
}

function getStatusText(status: Status) {
  switch (status) {
    case "try again":
      return tryAgainText;
    case "continue":
      return keepPlayingText;
    case "win":
      return winText;
    default:
      throw new Error(`Invalid status: ${status}`);
  }
}

function goToNextTurn(status: Status) {
  switch (status) {
    case "try again":
      return false;
    case "continue":
    case "win":
      return true;
    default:
      throw new Error(`Invalid status: ${status}`);
  }
}

async function checkPriorKnowledge(userInput: string) {
  const input = `Is the following statement true? Think through it step by step. When you are done, finish with the text: "${concludingText(
    userInput,
  )}"`;
  const completion = await complete({ input, model: gpt.four });
  let [explanation, inference] = completion.split(
    "In conclusion, the proposition",
  );
  if (inference == undefined) {
    inference = await complete({
      input: `${input}
  ${explanation}

  ${concludingText(userInput)}`,
      model: gpt.four,
    });
  }
  const check = inferenceToBoolean(inference);
  const paragraphs = [input, completion];
  return { check, explanation, inference, paragraphs };
}

function getProlog(knowledgeBase: Knowledge[]) {
  return knowledgeBase
    .map(({ prolog, text }) => `% ${text}\n${prolog}`)
    .join("\n\n");
}

async function addUserInputToProlog(prolog: string, userInput: string) {
  const input = `
  I have the following prolog script:
  \`\`\`
  ${prolog}
\`\`\`
I wish to add the following logic:

> ${userInput}

What new facts or rules should I add? Please supply a single code block.`;
  const completion = await complete({ input, model: gpt.four });
  return extractCodeBlock(completion);
}

async function getNewProlog(knowledgeBase: Knowledge[], userInput: string) {
  const oldProlog = getProlog(knowledgeBase);
  const newProlog = await addUserInputToProlog(oldProlog, userInput);

  return newProlog
    .split("\n\n")
    .filter((line) => !oldProlog.includes(line))
    .join("\n\n");
}

function isEntailed(program: string, query: string): boolean | null {
  return session.consult(program, {
    success: function () {
      console.log("##### program");
      console.log(program);
      console.log("###################");
      /* Program parsed correctly */
      session.query(query, {
        success: function () {
          console.log("##### program");
          console.log(program);
          console.log("##### query");
          console.log(query);
          console.log("###################");
          session.answer({
            success: function (answer) {
              console.log("Answer:", pl.format_answer(answer));
              return answer;
            },
            error: function (err) {
              console.log("Uncaught error");
              throw err;
            },
            fail: function () {
              /* No more answers */
              return false;
            },
            limit: function () {
              /* Limit exceeded */
              throw Error("Limit exceeded");
            },
          });
        },
        error: function (err) {
          /* Error parsing goal */
          console.log("Error parsing goal");
          return false;
        },
      });
    },
    error: function (err) {
      /* Error parsing program */
      console.log("Error parsing program");
      return false;
    },
  });
}

function reviseKnowledgeBase(knowledgeBase: Knowledge[]): Knowledge[] {
  if (knowledgeBase.length == 1) {
    return knowledgeBase;
  }
  const [head, ...tail] = knowledgeBase;
  const implied: boolean | null = isEntailed(getProlog(tail), head.prolog);
  return (implied == null ? [] : [{ ...head, implied }]).concat(
    reviseKnowledgeBase(tail),
  );
}

function inferencePrompt(facts: string[], proposition: string) {
  const factString = factsToStrings(facts);
  return `Consider the following fact${facts.length == 1 ? "" : "s"}:
  ${factString}
  ${
    facts.length == 1 ? "Does this fact" : "Do these facts"
  } imply _${proposition}_? Think through it step by step. When you are done, finish with the text: "${concludingText(
    proposition,
  )}"`;
}

async function infer(facts: string[], proposition: string) {
  const input = inferencePrompt(facts, proposition);
  const completion = await complete({ input, model: gpt.four });
  let [explanation, inference] = completion.split(
    "In conclusion, the proposition",
  );
  if (inference == undefined) {
    inference = await complete({
      input: `${input}
  ${explanation}

  ${concludingText}`,
      model: gpt.four,
    });
  }
  return { explanation, inference };
}

async function getInferenceResult({
  facts,
  proposition,
}: {
  facts: string[];
  proposition: string;
}) {
  const { explanation, inference } = await infer(facts, proposition);
  const paragraphs = [
    inferencePrompt(facts, proposition),
    getInferenceText({ explanation, inference }),
  ];
  const success = inferenceToBoolean(inference);
  return { paragraphs, success };
}

async function handleUpdateSubcommand({
  knowledgeBase,
  turn,
  userInput,
}: {
  knowledgeBase: Knowledge[];
  turn: number;
  userInput: string;
}): Promise<{
  messages: string[];
  knowledgeBase: Knowledge[];
  reasons: Inferences<string[]>;
  turn: number;
}> {
  const commentsIntro = [
    `${headerPrefix} Proposed new facts`,
    "_" + userInput + "_",
    `${headerPrefix} Result`,
  ];

  const priorKnowledge = await checkPriorKnowledge(userInput);
  const prolog = await getNewProlog(knowledgeBase, userInput);
  const knowledge = { text: userInput, prolog, implied: priorKnowledge.check };
  const revisedKnowledgeBase = reviseKnowledgeBase([
    ...knowledgeBase,
    knowledge,
  ]);

  console.log(revisedKnowledgeBase);

  function turnResult({
    status,
    reasons,
    comments,
  }: {
    status: Status;
    reasons: Inferences<string[]>;
    comments: string[];
  }) {
    const verb = goToNextTurn(status)
      ? "You substituted"
      : "You failed to substitute";
    const whatYouDid = `\
  ${verb} new facts: _${userInput}_`;
    const [head, ...tail] = goToNextTurn(status)
      ? revisedKnowledgeBase
      : knowledgeBase;
    const facts = tail
      .filter(({ implied }) => !implied)
      .map(({ text }) => text);
    const proposition = head.text;
    return {
      knowledgeBase, // TODO
      messages: [
        whatYouDid,
        ...comments,
        getInferenceSetupText({
          facts,
          factStatus: goToNextTurn(status) ? "updated" : "unchanged",
          proposition,
        }),
        getStatusText(status),
      ],
      reasons,
      turn: turn + +goToNextTurn(status),
    };
  }

  if (turn == 0) {
    return turnResult({
      status: "continue",
      reasons: { priorKnowledge: [priorKnowledge.explanation] },
      comments: [
        ...commentsIntro,
        // `The new facts imply _${proposition}_`, // TODO
        "The first fact was successfully updated.",
      ],
    });
  }
  const oneStepComment = `The new facts `;
  const [head, ...tail]: Knowledge[] = knowledgeBase;
  const proposition = head.text;
  let coherenceParagraphs = null;
  if (COHERENCE_VALIDATION) {
    const coherence = await getInferenceResult({
      facts: tail.map(({ text }) => text),
      proposition,
    });
    if (!coherence.success) {
      return turnResult({
        status: "try again",
        reasons: {
          priorKnowledge: priorKnowledge.paragraphs,
          coherence: coherence.paragraphs,
        },
        comments: [
          ...commentsIntro,
          `${oneStepComment}. However, taken with all of the existing facts, they do not imply the proposition. The proposed facts were rejected.`,
        ],
      });
    }
    coherenceParagraphs = coherence.paragraphs;
  }
  const multiStep = await getInferenceResult({
    facts: tail.filter(({ implied }) => !implied).map(({ text }) => text),
    proposition,
  });
  const status = multiStep.success ? "continue" : "win";
  return turnResult({
    status,
    reasons: {
      priorKnowledge: priorKnowledge.paragraphs,
      coherence: coherenceParagraphs,
      multiStep: multiStep.paragraphs,
    },
    comments: [
      ...commentsIntro,
      oneStepComment,
      `Taken with all of the existing facts, they also imply the target proposition: _${proposition}_`,
      multiStep.success
        ? `Your new facts were added but the target proposition still follows from updated facts.`
        : "You broke the chain! GPT couldn't infer the target proposition from the updated facts.",
    ],
  });
}

function bold(text: string) {
  return `**${text}**`;
}

type FactStatus = "initial" | "updated" | "unchanged";

function getFactWord(status: FactStatus) {
  switch (status) {
    case "initial":
      return "";
    case "updated":
      return " now";
    case "unchanged":
      return " still";
  }
}

function getInferenceSetupText({
  facts,
  factStatus,
  proposition,
}: {
  facts: string[];
  factStatus: FactStatus;
  proposition;
}) {
  const factStrings = factsToStrings(facts);
  return `\
${headerPrefix} The fact${factStrings.length == 1 ? "" : "s"} are${getFactWord(
    factStatus,
  )}:
${factStrings.join("\n")}
${headerPrefix} Target Proposition
_${proposition}_`;
}

function getInferenceText({
  explanation,
  inference,
}: {
  explanation: string;
  inference: string;
}) {
  return `\
Inference: ${bold(inference)}
${headerPrefix} Explanation
${explanation}`;
}

function getOptions(interaction: ChatInputCommandInteraction) {
  const userInput = interaction.options.getString("new-facts");
  if (userInput == undefined) {
    throw new Error("User input is undefined");
  }
  if (userInput == null) {
    throw new Error("User input is null");
  }
  return { userInput };
}

function chunkString(input: string, chunkSize: number): string[] {
  return input.length == 0
    ? []
    : [
        input.slice(0, chunkSize),
        ...chunkString(input.slice(chunkSize), chunkSize),
      ];
}

async function handleThreads(
  channel: TextChannel,
  reasons: Inferences<string[]>,
) {
  return await Object.entries(reasons)
    .filter(([, texts]) => texts != null)
    .map(([key, texts]) => ({
      name: threadNames[key],
      text: texts.join("\n"),
    }))
    .forEach(async ({ name, text }) => {
      const thread = await channel.threads.create({
        name,
        autoArchiveDuration: 60,
      });
      chunkString(text, BUILT_IN_RESPONSE_LIMIT).forEach(async (chunk) => {
        return await thread.send(chunk);
      });
    });
}

// Create commands
export const Commands = [
  {
    data: new SlashCommandBuilder()
      .setName("play")
      .setDescription(`Play inference Jenga`)
      .addSubcommand((subcommand) =>
        subcommand
          .setName(subcommands.start)
          .setDescription("Start a new game.")
          .addStringOption((option) =>
            option
              .setName("proposition")
              .setDescription("The target proposition that GPT tries to prove.")
              .setRequired(false),
          ),
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName(subcommands.update)
          .setDescription("Choose a fact to update.")
          .addStringOption((option) =>
            option
              .setName("new-facts")
              .setDescription("The facts to replace it with.")
              .setRequired(true),
          ),
      ),
    knowledgeBase: [],
    players: [],
    turn: 0,
    async execute(interaction: ChatInputCommandInteraction) {
      await interaction.deferReply();
      const subcommand = interaction.options.getSubcommand();
      switch (subcommand) {
        case subcommands.start:
          const members: ThreadMemberManager | Collection<string, GuildMember> =
            interaction.channel.members;
          if (members instanceof ThreadMemberManager) {
            throw Error("Thread Member Manager");
          } else {
            this.players = getUsernames(members);
          }
          const truth = randomBoolean();
          const propositionText: string | undefined =
            interaction.options.getString("proposition");
          let proposition: { text: string; prolog: string };
          if (propositionText == undefined) {
            const positive = randomChoice<Proposition>(propositions);
            proposition = truth
              ? positive
              : {
                  text: await negate(positive.text),
                  prolog: `not_${positive.prolog}`,
                };
          } else {
            proposition = propositions.find(
              ({ text }) => text == propositionText,
            );
            if (proposition == undefined) {
              const completion = await complete({
                input: `Convert the statement, "${propositionText}," into a prolog assertion.`,
                model: gpt.three,
              });
              const prolog = extractCodeBlock(completion);
              proposition = { text: propositionText, prolog };
            }
          }
          this.knowledgeBase = [
            {
              text: proposition.text,
              prolog: proposition.prolog,
              implied: false,
            },
          ];
          const channel = interaction.channel;
          if (channel == null) {
            throw Error("Cannot send message to null channel");
          }

          await handleInteraction({
            interaction,
            message: getInferenceSetupText({
              facts: [proposition.text],
              factStatus: "initial",
              proposition: proposition.text,
            }),
          });
          break;
        case subcommands.update:
          const { userInput } = getOptions(interaction);
          const {
            messages,
            knowledgeBase,
            reasons: threads,
            turn,
          } = await handleUpdateSubcommand({
            knowledgeBase: this.knowledgeBase,
            turn: this.turn,
            userInput,
          });
          const message = messages.join("\n");
          this.knowledgeBase = knowledgeBase;
          this.turn = turn;

          if (interaction.channel instanceof TextChannel) {
            await handleThreads(interaction.channel, threads);
          }

          return await handleInteraction({ interaction, message });

        default:
          break;
      }
    },
  },
];
