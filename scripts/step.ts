import { Completion, complete, gpt } from "./gpt.js";
import { headerPrefix } from "./text.js";

type Inferences<Type> = {
  oneStep?: Type;
  coherence?: Type;
  multiStep?: Type;
};
type Image = {
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

async function infer(premise: Fact[], conclusion: Fact) {
  const completions: Completion[] = [];
  const concludingText = `In conclusion, the proposition is probably [true|false|indeterminate]`;
  const input = `Consider the following facts: _${premise}_
Do these facts imply _${conclusion}_? Think through it step by step. When you are done, finish with the text: "${concludingText}"`;
  const completion = await complete({ input, model: gpt.four });
  completions.push(completion);
  let [explanation, inference] = completion.output.split(
    "In conclusion, the proposition",
  );
  if (inference == undefined) {
    const inferenceCompletion = await complete({
      input: `${input}
${explanation}

${concludingText}`,
      model: gpt.four,
    });
    completions.push(inferenceCompletion);
    inference = inferenceCompletion.output;
  }
  return { inference, completions };
}

export function getInferenceSetupText({
  fact,
  proposition,
  factStatus,
}: {
  fact: Fact;
  factStatus: FactStatus;
  proposition: Fact;
}) {
  return `\
${headerPrefix} The facts are${getFactWord(factStatus)}:
${fact}
${headerPrefix} Target Proposition
_${proposition}_`;
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
    `_${newFact}_`,
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
${verb}: _${currentFact}_ 
with: "${newFact}"`;
    return {
      messages: [
        whatYouDid,
        ...comments,
        getInferenceSetupText({
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
        `The new fact imply _${proposition}_`,
        "The first fact was successfully updated.",
      ],
    });
  }
  const oneStepComment = `The new facts _${newFact}_`;
  let coherenceCompletions = null;
  if (coherenceCheck) {
    const coherence = await getInferenceResult({
      premise: [...oldFacts, newFact],
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
      `Taken with all of the existing facts, they also imply the target proposition: _${proposition}_`,
      multiStep.success
        ? `Your new facts were added but the target proposition still follows from updated facts.`
        : "You broke the chain! GPT couldn't infer the target proposition from the updated facts.",
    ],
  });
}
