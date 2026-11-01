# Taxonomies

Use these lists verbatim in prompts and validate returned labels against them.
Every label needs a verbatim evidence span of at most 25 words.

## Media Frames Corpus (15 frames)

Source: Card et al. (2015). Built around US policy issues; generalization to
Indian coverage is unvalidated. Allow `Other` rather than forcing a label.

| Frame | Use when the article centers on… |
| --- | --- |
| Economic | Costs, benefits, markets, jobs, economic impact |
| Capacity and Resources | Infrastructure, staffing, funding, availability of resources |
| Morality | Ethics, religious or moral judgments, right/wrong |
| Fairness and Equality | Equity, discrimination, rights, unequal treatment |
| Legality, Constitutionality, Jurisprudence | Laws, courts, legal procedure, constitutional questions |
| Policy Prescription and Evaluation | A proposed or implemented policy and whether it works |
| Crime and Punishment | Offenses, policing, trials, sentencing |
| Security and Defense | National security, military, terrorism, borders |
| Health and Safety | Public health, risks, safety, medical care |
| Quality of Life | Living standards, community well-being, lifestyle |
| Cultural Identity | Identity, demographics, tradition, language, religion as identity |
| Public Opinion | Polls, sentiment, protests, public reaction |
| Political | Elections, parties, governance, power, political strategy |
| External Regulation and Reputation | International image, foreign pressure, outside regulation |
| Other | None of the above fits without distortion |

Return exactly one dominant frame, plus `frame_evidence`.

## Persuasion techniques (23)

Source: SemEval-2023 Task 3 taxonomy. The spec's list was reconstructed from
memory; verify canonical names against the official task guidelines before
freezing prompts. Keep the parent group for UI grouping.

### Attack on reputation

| Technique | Definition |
| --- | --- |
| Name calling / labeling | Attach a negative label to a person, group, or idea |
| Guilt by association | Discredit someone through a disliked association |
| Casting doubt | Question motives or claims without evidence |
| Appeal to hypocrisy | Deflect criticism by accusing the critic of the same fault |
| Questioning the reputation | Attack character or credibility instead of the argument |

### Justification

| Technique | Definition |
| --- | --- |
| Flag waving | Appeal to patriotism, national pride, or group loyalty |
| Appeal to authority | Endorse a claim by citing an authority figure |
| Appeal to popularity | Argue a claim is true because many people believe it |
| Appeal to values | Frame a claim as defending a shared moral value |
| Appeal to fear / prejudice | Use fear, threat, or stereotypes to persuade |

### Distraction

| Technique | Definition |
| --- | --- |
| Straw man | Replace an opponent's position with a distorted version |
| Red herring | Introduce an irrelevant issue to divert attention |
| Whataboutism | Deflect criticism with a counter-accusation |

### Simplification

| Technique | Definition |
| --- | --- |
| Causal oversimplification | Attribute a complex outcome to a single cause |
| False dilemma / no choice | Present only two options when more exist |
| Consequential oversimplification | Ignore or distort the consequences of a claim |

### Call

| Technique | Definition |
| --- | --- |
| Slogans | Use a catchy, repeated phrase instead of an argument |
| Conversation killer | Shut down debate with a final, unquestionable statement |
| Appeal to time | Argue urgency, "now or never", or that time proves the claim |

### Manipulative wording

| Technique | Definition |
| --- | --- |
| Loaded language | Use emotionally charged words to steer judgment |
| Obfuscation / vagueness / confusion | Make a claim deliberately unclear |
| Exaggeration / minimisation | Overstate or understate facts or impact |
| Repetition | Repeat a claim until it feels established |

Return at most 5 hits per article, strongest first. A hit without a verbatim
span is invalid.

## Entity roles

| Role family | Roles | Meaning |
| --- | --- | --- |
| Suffering | Victim, Exploited, Scapegoat | Bears harm, is used, or is blamed |
| Causing | Villain, Instigator | Causes harm or incites action |
| Protecting | Guardian, Hero, Peacemaker | Protects, rescues, or resolves conflict |

Assign roles only to the top 3-5 named entities. Include the evidence span. The
same entity can have different roles in different outlets; surface the contrast
rather than averaging it away.

## Slant direction

| Score | Label |
| --- | --- |
| -1.0 to -0.35 | Government-critical |
| -0.35 to +0.35 | Mixed / neutral |
| +0.35 to +1.0 | Government-aligned |

These cut points are presentation defaults, not ground truth. Put them in
config. Score with the outlet name, domain, and byline masked.
