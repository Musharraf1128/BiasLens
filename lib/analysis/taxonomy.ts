import {
  ENTITY_ROLES,
  MFC_FRAMES,
  PERSUASION_TECHNIQUES,
} from "@/lib/analysis/schemas";

/**
 * The closed label sets shown to the model. Keep the wording identical to the
 * labels in `schemas.ts`: the Zod enums are the gate, this is the explanation.
 */

const MFC_GUIDE: Record<(typeof MFC_FRAMES)[number], string> = {
  Economic: "costs, benefits, markets, jobs, economic impact",
  "Capacity and Resources": "infrastructure, staffing, funding, availability",
  Morality: "ethics, religious or moral judgement, right and wrong",
  "Fairness and Equality": "equity, discrimination, rights, unequal treatment",
  "Legality, Constitutionality, Jurisprudence":
    "laws, courts, legal procedure, constitutional questions",
  "Policy Prescription and Evaluation":
    "a proposed or implemented policy and whether it works",
  "Crime and Punishment": "offences, policing, trials, sentencing",
  "Security and Defense": "national security, military, borders, terrorism",
  "Health and Safety": "public health, risk, safety, medical care",
  "Quality of Life": "living standards, community well-being, lifestyle",
  "Cultural Identity": "identity, demographics, tradition, language",
  "Public Opinion": "polls, sentiment, protests, public reaction",
  Political: "elections, parties, governance, power, strategy",
  "External Regulation and Reputation":
    "international image, foreign pressure, outside regulation",
  Other: "none of the above fits without distortion",
};

const PERSUASION_DEFINITIONS: Record<
  (typeof PERSUASION_TECHNIQUES)[number],
  string
> =
  {
    "Name calling / labeling": "attach a negative label to a person, group, or idea",
    "Guilt by association": "discredit someone through a disliked association",
    "Casting doubt": "question motives or claims without evidence",
    "Appeal to hypocrisy": "deflect criticism by accusing the critic of the same fault",
    "Questioning the reputation": "attack character or credibility instead of the argument",
    "Flag waving": "appeal to patriotism, national pride, or group loyalty",
    "Appeal to authority": "endorse a claim by citing an authority figure",
    "Appeal to popularity": "argue a claim is true because many people believe it",
    "Appeal to values": "frame a claim as defending a shared moral value",
    "Appeal to fear / prejudice": "use fear, threat, or stereotypes to persuade",
    "Straw man": "replace an opponent's position with a distorted version",
    "Red herring": "introduce an irrelevant issue to divert attention",
    Whataboutism: "deflect criticism with a counter-accusation",
    "Causal oversimplification": "attribute a complex outcome to a single cause",
    "False dilemma / no choice": "present only two options when more exist",
    "Consequential oversimplification": "ignore or distort the consequences of a claim",
    Slogans: "use a catchy, repeated phrase instead of an argument",
    "Conversation killer": "shut down debate with a final, unquestionable statement",
    "Appeal to time": "argue urgency, now or never, or that time proves the claim",
    "Loaded language": "use emotionally charged words to steer judgement",
    "Obfuscation / vagueness / confusion": "make a claim deliberately unclear",
    "Exaggeration / minimisation": "overstate or understate facts or impact",
    Repetition: "repeat a claim until it feels established",
  };

const ENTITY_DEFINITIONS: Record<(typeof ENTITY_ROLES)[number], string> = {
  Victim: "bears harm",
  Exploited: "is used by others",
  Scapegoat: "is blamed for a problem",
  Villain: "causes harm",
  Instigator: "incites or provokes the action",
  Guardian: "protects a group or value",
  Hero: "resolves the problem through action",
  Peacemaker: "mediates or calms the conflict",
};

function render(entries: Array<[string, string]>): string {
  return entries.map(([label, meaning]) => `- ${label}: ${meaning}`).join("\n");
}

export const FRAME_GUIDE = render(
  MFC_FRAMES.map((frame) => [frame, MFC_GUIDE[frame]]),
);

export const PERSUASION_GUIDE = render(
  PERSUASION_TECHNIQUES.map((technique) => [
    technique,
    PERSUASION_DEFINITIONS[technique],
  ]),
);

export const ENTITY_GUIDE = render(
  ENTITY_ROLES.map((role) => [role, ENTITY_DEFINITIONS[role]]),
);

export const FRAMING_TAXONOMY = `DOMINANT FRAME (choose exactly one)
${FRAME_GUIDE}

PERSUASION TECHNIQUES (choose at most 5)
${PERSUASION_GUIDE}

ENTITY ROLES (top 3-5 named entities)
${ENTITY_GUIDE}`;
