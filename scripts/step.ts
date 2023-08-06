import { Completion, complete, gpt } from "./utils/gpt.js";
import { headerPrefix, inConclusion, removeFinalPunctuation } from "./text.js";
import { get } from "http";

export type Inferences<Type> = {
  oneStep?: Type;
  coherence?: Type;
  custom?: Type;
  multiStep?: Type;
};
export type Image = {
  svg: string;
  description: string;
};
export type Fact = {
  text: string;
  image?: Image;
};

export enum Difficulty {
  NO_CHECK,
  LIGHT_COHERENCE_CHECK,
  HARD_COHERENCE_CHECK,
}
export function getDifficulty(difficulty: number): Difficulty {
  if (!Object.values(Difficulty).includes(difficulty)) {
    throw new Error(`Invalid difficulty: ${difficulty}`);
  }
  return difficulty;
}

export enum Implication {
  SUGGEST,
  IMPLY,
}

export const numDifficulties = Object.keys(Difficulty).length / 2;
type Status = "win" | "try again" | "continue";
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

function getStatusText(status: Status) {
  switch (status) {
    case "try again":
      return `${headerPrefix} Try again!`;
    case "continue":
      return `${headerPrefix} Keep playing.`;
    case "win":
      return "# You win!";
    default:
      throw new Error(`Invalid status: ${status}`);
  }
}

export function goToNextTurn(status: Status) {
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

function addIndexToFigures(facts: Fact[], index: number = 0) {
  const [head, ...tail] = facts;
  if (head == undefined) {
    return [];
  }
  const hasImage = head.image != null;
  index += +hasImage;
  return [{ fact: head, index }, ...addIndexToFigures(tail, index)];
}

export function getImageText(image: Image, index: number) {
  const { svg, description } = image;
  return `\
Figure ${index}
\`\`\`svg
${svg}
\`\`\``;
}

function getImageTexts(facts: { fact: Fact; index: number }[]) {
  const [head, ...tail] = facts;
  if (head == undefined) {
    return [];
  }
  const { fact, index } = head;
  const { image } = fact;
  const newTail = getImageTexts(tail);
  if (image != null) {
    return [getImageText(image, index), ...newTail];
  }
  return newTail;
}

function getTextReferencingFigure(text: string, index: number) {
  return `${removeFinalPunctuation(text)} in figure ${index}.`;
}

export function getFactText(fact: Fact, index: number = null) {
  if (fact.image == null) {
    return fact.text;
  }
  return getTextReferencingFigure(fact.text, index);
}

export function getPremiseTexts(facts: { fact: Fact; index: number }[]) {
  return facts
    .map(({ fact, index }) =>
      fact.image == null ? fact.text : getFactText(fact, index),
    )
    .map((text) => (facts.length > 2 ? `* ${text}` : text));
}

async function retryExtraction(
  initialInput: string,
  explanation: string,
  conclusionText: string,
) {
  const input = `${initialInput}
${explanation}
Complete this text with "${conclusionText}"`;
  return await complete({ input, model: gpt.four });
}

function getImagesText(premises: Fact[], conclusion: Fact) {
  const indexed = addIndexToFigures([...premises, conclusion]);
  const imageTexts: string[] = getImageTexts(indexed);
  return `\
${imageTexts.length > 1 ? `${headerPrefix} Figures\n` : ""}\
${imageTexts.join("\n")}`;
}

export function getSetupText({
  fact,
  proposition,
  factStatus,
}: {
  fact: Fact;
  factStatus: FactStatus;
  proposition: Fact;
}) {
  return `\
${getImagesText([fact], proposition)}\
${fact.image == null ? "" : "\n" + fact.image.description + "\n"}\
${headerPrefix} The facts are${getFactWord(factStatus)}:
${getFactText(fact, 1)}
${headerPrefix} Target Proposition
${getFactText(proposition, 2)}`;
}

function conclusionText(proposition: string | null = null) {
  proposition = proposition == null ? "" : `_${proposition}_ `;
  return `${inConclusion} ${proposition}is probably [true|false|indeterminate]`;
}

export function inferenceInput(
  premises: Fact[],
  conclusion: Fact,
  implication: Implication,
) {
  const indexed = addIndexToFigures([...premises, conclusion]);
  const premiseTexts: string[] = getPremiseTexts(indexed.slice(0, -1));
  const proposition = getFactText(conclusion, indexed.length);
  const lastPremise = premises[premises.length - 1];

  function getVerb() {
    switch (implication) {
      case Implication.SUGGEST:
        return "suggest";
      case Implication.IMPLY:
        return "imply";
    }
  }
  return `\
${getImagesText(premises, conclusion)}\
${lastPremise.image == null ? "" : "\n" + lastPremise.image.description + "\n"}\
${headerPrefix} Premise${premiseTexts.length > 1 ? "s" : ""}
${premiseTexts.join("\n")}
${headerPrefix} Question
Assume ${
    premiseTexts.length > 1 ? "these premises are" : "this premise is"
  } true. ${
    premiseTexts.length > 1 ? 'Do these premises"' : "Does this premise"
  } ${getVerb()} the proposition: _${removeFinalPunctuation(
    proposition,
  )}_? Think through it step by step. When you are done, finish with the text: "${conclusionText()}"
`;
}

async function infer(
  premises: Fact[],
  conclusion: Fact,
  implication: Implication,
) {
  const input = inferenceInput(premises, conclusion, implication);
  const completions: Completion[] = [];
  const completion = await complete({ input, model: gpt.four });
  completions.push(completion);
  let [explanation, inference] = completion.output.split(inConclusion);
  if (inference == undefined) {
    const completion = await retryExtraction(
      input,
      explanation,
      conclusionText(),
    );
    completions.push(completion);
    [, inference] = completion.output.split(inConclusion);
  }
  return { inference, completions };
}

async function getInferenceResult({
  premise,
  conclusion,
  implication,
}: {
  premise: Fact[];
  conclusion: Fact;
  implication: Implication;
}) {
  const { completions, inference } = await infer(
    premise,
    conclusion,
    implication,
  );
  const success = inferenceToBoolean(inference);
  return { completions, success };
}

export async function step({
  difficulty,
  currentFact,
  newFact,
  oldFacts,
  proposition,
  firstTurn,
}: {
  difficulty: Difficulty;
  currentFact: Fact;
  newFact: Fact;
  oldFacts: Fact[];
  proposition: Fact;
  firstTurn: boolean;
}): Promise<{
  messages: string[];
  completions: Inferences<Completion[]>;
  status: Status;
}> {
  const commentsIntro = [
    `${headerPrefix} Proposed new facts`,
    `_${newFact.text}_`,
    `${headerPrefix} Result`,
  ];

  function turnResult({
    status,
    completions,
    comments,
  }: {
    status: Status;
    completions: Inferences<Completion[]>;
    comments: string[];
  }) {
    const whatYouDid = `Proposed new facts were ${
      goToNextTurn(status) ? "accepted" : "rejected"
    }.`;
    return {
      messages: [
        whatYouDid,
        ...comments,
        getSetupText({
          fact: goToNextTurn(status) ? newFact : currentFact,
          proposition,
          factStatus: goToNextTurn(status) ? "updated" : "unchanged",
        }),
        getStatusText(status),
      ],
      completions,
      status,
    };
  }

  const completions: Inferences<Completion[]> = {};

  const oneStep = await getInferenceResult({
    premise: [newFact],
    conclusion: currentFact,
    implication: Implication.IMPLY,
  });
  completions.oneStep = oneStep.completions;
  if (!oneStep.success) {
    return turnResult({
      status: "try again",
      completions,
      comments: [
        ...commentsIntro,
        "The new facts did not imply the replaced fact.",
      ],
    });
  }

  if (firstTurn) {
    return turnResult({
      status: "continue",
      completions,
      comments: [
        ...commentsIntro,
        `The new facts imply _${proposition.text}_`,
        "The first fact was successfully updated.",
      ],
    });
  }

  const oneStepComment = `The new facts _${newFact.text}_`;
  function getImplication() {
    switch (difficulty) {
      case Difficulty.NO_CHECK:
        return null;
      case Difficulty.LIGHT_COHERENCE_CHECK:
        return Implication.SUGGEST;
      case Difficulty.HARD_COHERENCE_CHECK:
        return Implication.IMPLY;
      default:
        throw new Error(`Invalid difficulty: ${difficulty}`);
    }
  }
  const implication = getImplication();
  if (implication != null) {
    const coherence = await getInferenceResult({
      premise: [...oldFacts, currentFact, newFact],
      conclusion: proposition,
      implication,
    });
    completions.coherence = coherence.completions;
    if (!coherence.success) {
      return turnResult({
        status: "try again",
        completions,
        comments: [
          ...commentsIntro,
          `${oneStepComment}. However, taken with all of the existing facts, they do not imply the proposition. The proposed facts were rejected.`,
        ],
      });
    }
  }

  const multiStep = await getInferenceResult({
    premise: [newFact],
    conclusion: proposition,
    implication: Implication.IMPLY,
  });
  const status = multiStep.success ? "continue" : "win";
  completions.multiStep = multiStep.completions;
  return turnResult({
    status,
    completions,
    comments: [
      ...commentsIntro,
      oneStepComment,
      `Taken with all of the existing facts, they also imply the target proposition: _${proposition.text}_`,
      multiStep.success
        ? `Your new facts were added but the target proposition still follows from updated facts.`
        : "You broke the chain! GPT couldn't infer the target proposition from the updated facts.",
    ],
  });
}
