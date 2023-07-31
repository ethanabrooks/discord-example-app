import { kMaxLength } from "buffer";
import { Completion, complete, gpt } from "./gpt.js";
import {
  headerPrefix,
  lowerCaseFirstLetter,
  removeFinalPunctuation,
} from "./text.js";
import { get } from "http";

export type Inferences<Type> = {
  oneStep?: Type;
  coherence?: Type;
  multiStep?: Type;
};
export type Image = {
  svg: string;
  description: string;
};
type Fact = {
  text: string;
  image?: Image;
};
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
\`\`\`svg
${svg}
\`\`\`
Figure ${index}: ${description}
`;
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
  return `In figure ${index}, ${lowerCaseFirstLetter(text)}`;
}

export function getFactText(fact: Fact, index: number = null) {
  console.log("############### fact");
  console.log(fact);
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
${headerPrefix} The facts are${getFactWord(factStatus)}:
${getFactText(fact, 1)}
${headerPrefix} Target Proposition
${getFactText(proposition, 2)}`;
}

async function infer(premises: Fact[], conclusion: Fact) {
  const indexed = addIndexToFigures([...premises, conclusion]);
  const premiseTexts: string[] = getPremiseTexts(indexed.slice(0, -1));
  const proposition = getFactText(conclusion, indexed.length);
  const inConclusion = `In conclusion, the proposition`;
  const conclusionText = `${inConclusion} is probably [true|false|indeterminate]`;
  const input = `\
${getImagesText(premises, conclusion)}\
${headerPrefix} Premise${premiseTexts.length > 1 ? "s" : ""}
${premiseTexts.join("\n")}
${headerPrefix} Question
Assume ${
    premiseTexts.length > 1 ? "these premises are" : "this premise is"
  } true. ${
    premiseTexts.length > 1 ? 'Do these premises"' : "Does this premise"
  } imply the proposition: _${removeFinalPunctuation(
    proposition,
  )}_? Think through it step by step. When you are done, finish with the text: "${conclusionText}"
`;

  const completions: Completion[] = [];
  const completion = await complete({ input, model: gpt.four });
  completions.push(completion);
  let [explanation, inference] = completion.output.split(inConclusion);
  if (inference == undefined) {
    const completion = await retryExtraction(
      input,
      explanation,
      conclusionText,
    );
    completions.push(completion);
    [, inference] = completion.output.split(inConclusion);
  }
  return { inference, completions };
}

async function getInferenceResult({
  premise,
  conclusion,
}: {
  premise: Fact[];
  conclusion: Fact;
}) {
  const { completions, inference } = await infer(premise, conclusion);
  const success = inferenceToBoolean(inference);
  return { completions, success };
}

export async function step({
  coherenceCheck,
  currentFact,
  newFact,
  oldFacts,
  proposition,
  turn,
}: {
  coherenceCheck: boolean;
  currentFact: Fact;
  newFact: Fact;
  oldFacts: Fact[];
  proposition: Fact;
  turn: number;
}): Promise<{
  messages: string[];
  completions: Inferences<Completion[]>;
  status: Status;
  turn: number;
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
    const verb = goToNextTurn(status)
      ? "You replaced"
      : "You failed to replace";
    const whatYouDid = `\
${verb}: _${currentFact.text}_ 
with: "${newFact.text}"`;
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
      turn: turn + +goToNextTurn(status),
    };
  }

  const oneStep = await getInferenceResult({
    premise: [newFact],
    conclusion: currentFact,
  });
  if (!oneStep.success) {
    return turnResult({
      status: "try again",
      completions: { oneStep: oneStep.completions },
      comments: [
        ...commentsIntro,
        "The new facts did not imply the replaced fact.",
      ],
    });
  }

  if (turn == 0) {
    return turnResult({
      status: "continue",
      completions: { oneStep: oneStep.completions },
      comments: [
        ...commentsIntro,
        `The new facts imply _${proposition.text}_`,
        "The first fact was successfully updated.",
      ],
    });
  }
  const oneStepComment = `The new facts _${newFact.text}_`;
  let coherenceCompletions = null;
  if (coherenceCheck) {
    const coherence = await getInferenceResult({
      premise: [...oldFacts, currentFact, newFact],
      conclusion: proposition,
    });
    if (!coherence.success) {
      return turnResult({
        status: "try again",
        completions: {
          oneStep: oneStep.completions,
          coherence: coherence.completions,
        },
        comments: [
          ...commentsIntro,
          `${oneStepComment}. However, taken with all of the existing facts, they do not imply the proposition. The proposed facts were rejected.`,
        ],
      });
    }
    coherenceCompletions = coherence.completions;
  }
  const multiStep = await getInferenceResult({
    premise: [newFact],
    conclusion: proposition,
  });
  const status = multiStep.success ? "continue" : "win";
  return turnResult({
    status,
    completions: {
      oneStep: oneStep.completions,
      coherence: coherenceCompletions,
      multiStep: multiStep.completions,
    },
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
