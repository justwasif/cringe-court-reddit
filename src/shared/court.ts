/**
 * The charge pool and case assembly.
 *
 * A daily case is derived deterministically from the UTC date, so every
 * player in every subreddit sees the same case on the same day without any
 * shared state. That is what makes a "daily game" work on a platform where
 * each installation has its own isolated Redis namespace.
 */

import type { Charge, DailyCase, Line } from './types.js';

/**
 * Charges are written as templates with an `{exhibit}` slot so the same
 * charge can be grounded in whatever the filer actually did. Kept blunt and
 * specific: vague charges produce vague arguments.
 */
type ChargeTemplate = {
  title: string;
  exhibit: string;
  aggravator: string;
};

const CHARGES: readonly ChargeTemplate[] = [
  {
    title: 'Sent a three-paragraph text to a first date',
    exhibit:
      'He messaged at 2:14am asking whether they had "considered the long-term trajectory of this."',
    aggravator: 'He used the word "trajectory" twice.',
  },
  {
    title: 'Replied "you too" to a waiter who said "enjoy your meal"',
    exhibit:
      'Then, after a four-second pause, added "and also to your family."',
    aggravator: 'The waiter had already walked away.',
  },
  {
    title: 'Brought a printed résumé to a coffee shop meeting',
    exhibit:
      'Two pages, single-sided, with a section headed "Relevant Beverage Experience."',
    aggravator: 'It was laminated.',
  },
  {
    title: 'Posted a gym selfie captioned "no excuses"',
    exhibit:
      'The photo was taken in a mirror at a hotel buffet, holding a plate of pastries.',
    aggravator: 'The gym was visible only as a reflection in the sneeze guard.',
  },
  {
    title: 'Called their own birthday "a networking opportunity"',
    exhibit:
      'Sent a calendar invite with an agenda, a 15-minute "wins share", and a hard stop.',
    aggravator: 'The agenda had a slide deck attached.',
  },
  {
    title: 'Argued with a self-checkout machine for six minutes',
    exhibit:
      'Demanded to speak to a manager, then realised the manager was the machine.',
    aggravator: 'Two people filmed it. Both posted.',
  },
  {
    title: 'Used "per my last email" in a first email',
    exhibit:
      'The "last email" was a calendar notification sent by an automated system.',
    aggravator: 'They CC\'d their own mother.',
  },
  {
    title: 'Wore a blazer to a beach bonfire',
    exhibit:
      'Explained it was "a dinner situation" while holding a burnt marshmallow on a stick.',
    aggravator: 'The blazer was linen. The bonfire was real.',
  },
  {
    title: 'Started a group chat to announce they were leaving a group chat',
    exhibit:
      'The announcement was eleven messages long and included a table of contents.',
    aggravator: 'Three people replied "who are you".',
  },
  {
    title: 'Reviewed a restaurant they had never visited',
    exhibit:
      'Two stars. Reason given: "the concept." They lived 400 miles away.',
    aggravator: 'The review was longer than the menu.',
  },
  {
    title: 'Corrected a tour guide about the tour guide\'s own city',
    exhibit:
      'Cited a blog post. The blog post was about a different city with the same street name.',
    aggravator: 'Continued after being shown the map.',
  },
  {
    title: 'Sent a voice note that was mostly breathing',
    exhibit:
      'Four minutes and six seconds, of which eleven seconds contained words.',
    aggravator: 'Sent a follow-up voice note apologising for the first one.',
  },
  {
    title: 'Described a two-hour walk as "a hike"',
    exhibit:
      'Posted eleven photos, including one of a bench captioned "summit".',
    aggravator: 'The bench was outside a supermarket.',
  },
  {
    title: 'Brought their own hot sauce to a wedding',
    exhibit:
      'Produced it from an inside pocket during the speeches, with a small bow.',
    aggravator: 'It was in a labelled, reusable bottle.',
  },
  {
    title: 'Asked a librarian to "keep it down"',
    exhibit:
      'The librarian had said one sentence, at a normal volume, about a book return.',
    aggravator: 'It was their own book return.',
  },
  {
    title: 'Set a calendar reminder titled "be spontaneous"',
    exhibit:
      'Recurring, weekly, with a 30-minute buffer and a preparatory checklist.',
    aggravator: 'They snoozed it.',
  },
  {
    title: 'Told a barber "I trust you" and then supervised',
    exhibit:
      'Maintained unbroken eye contact with the scissors via the mirror for 25 minutes.',
    aggravator: 'Brought a reference photo. Of themselves. From 2019.',
  },
  {
    title: 'Brought a spreadsheet to a group holiday planning dinner',
    exhibit:
      'Had already allocated rooms, weighted by "morning energy", before anyone arrived.',
    aggravator: 'One column was headed "risk".',
  },
  {
    title: 'Answered "how are you" with a status report',
    exhibit:
      'Included a blocker, a next step, and an offer to "take this offline."',
    aggravator: 'It was a wedding.',
  },
  {
    title: 'Left a five-star review that was actually a complaint',
    exhibit:
      'Five stars, then nine paragraphs, then "would not return."',
    aggravator: 'The owner replied with a single question mark.',
  },
  {
    title: 'Named their sourdough starter',
    exhibit:
      'The name was a pun on a philosopher. They explained the pun unprompted, twice.',
    aggravator: 'The starter died and got an obituary post.',
  },
  {
    title: 'Ran to catch a bus that was not moving',
    exhibit:
      'Sprinted 40 metres, arrived, and read the "not in service" display.',
    aggravator: 'Then stood there for two minutes to seem unbothered.',
  },
  {
    title: 'Introduced themselves to a neighbour of six years',
    exhibit:
      'Full handshake, full name, and "we should really do this more often."',
    aggravator: 'The neighbour had a key to their flat.',
  },
  {
    title: 'Brought a laptop to a wedding reception',
    exhibit:
      'Opened it during the first dance, angled away from the table, "just checking something."',
    aggravator: 'The screen was visible. It was a spreadsheet.',
  },
  {
    title: 'Asked for a doggy bag at a buffet',
    exhibit:
      'Was told it was not that kind of establishment. Asked for "a container, then."',
    aggravator: 'Produced their own container.',
  },
  {
    title: 'Sent a "quick question" that required a research project',
    exhibit:
      'Six bullet points, two attachments, and a deadline of "end of day."',
    aggravator: 'It was a Saturday.',
  },
  {
    title: 'Explained a joke immediately after telling it',
    exhibit:
      'The explanation was longer than the joke and included the word "subtext."',
    aggravator: 'Then asked if it landed.',
  },
  {
    title: 'Clapped when the plane landed',
    exhibit:
      'Loudly, alone, and then looked around as if to lead a round of applause.',
    aggravator: 'It was a smooth landing.',
  },
  {
    title: 'Took a "quick call" during a funeral',
    exhibit:
      'Whispered "I have to take this", then negotiated a contract in the vestibule.',
    aggravator: 'The contract was for a gym membership.',
  },
  {
    title: 'Corrected someone\'s pronunciation of their own name',
    exhibit:
      'Twice. The second time with a phonetic breakdown written on a napkin.',
    aggravator: 'The name was "David".',
  },
  {
    title: 'Arrived an hour early and complained about the wait',
    exhibit:
      'Had been told 7pm. Arrived at 6pm. Asked at 6:40 whether the table was "being held hostage."',
    aggravator: 'The restaurant opened at 6:45.',
  },
  {
    title: 'Used "circle back" in a eulogy',
    exhibit:
      'Followed by "let\'s take the learnings" and a pause for laughter that did not come.',
    aggravator: 'Then offered to "park that."',
  },
];

/** A small deterministic hash so a date always maps to the same charge. */
function hashDate(date: string): number {
  let h = 2166136261;
  for (let i = 0; i < date.length; i++) {
    h ^= date.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Deterministic pick from a list. */
function pick<T>(list: readonly T[], seed: number, salt = 0): T {
  const index = (seed + Math.imul(salt + 1, 2654435761)) % list.length;
  const value = list[index];
  if (value === undefined) {
    throw new Error('pick: empty list');
  }
  return value;
}

/** UTC date string, e.g. "2026-11-12". */
export function utcDate(at: Date = new Date()): string {
  return at.toISOString().slice(0, 10);
}

/** Case number is the date with dashes removed, as a number. */
export function caseNumberFor(date: string): number {
  return Number(date.replaceAll('-', ''));
}

/** Human-friendly case number, e.g. "No. 2026-1112". */
export function caseLabel(date: string): string {
  const [year, month, day] = date.split('-');
  return `No. ${year}-${month}${day}`;
}

/** Build the charge for a date. */
export function chargeFor(date: string): Charge {
  const seed = hashDate(date);
  const template = pick(CHARGES, seed);
  return {
    title: template.title,
    exhibit: template.exhibit,
    aggravator: template.aggravator,
  };
}

/**
 * Prosecution and defence openers. These are short, punchy, and derived from
 * the charge so they never contradict the facts.
 */
const PROSECUTION_OPENERS: readonly string[] = [
  'The record will show that my client is not the problem here. The record is.',
  'Your honour, I have read the exhibit. I would like to enter into evidence my own need for a moment.',
  'Some cases require nuance. This one requires a chair and a glass of water.',
  'I do not relish this. I do, however, have a slide prepared.',
  'The defence will call this "a misunderstanding." I will call it a pattern with a witness.',
];

const DEFENSE_OPENERS: readonly string[] = [
  'My client acted. That is not a crime. That is a Tuesday.',
  'I will concede one thing: the timing. The rest is a matter of framing.',
  'If intent were a defence, we would not be here. Luckily, it is.',
  'Your honour, every person in this room has done worse and simply not been posted about.',
  'The prosecution has described the act. I intend to describe the human being.',
];

const PROSECUTION_CLOSERS: readonly string[] = [
  'That is not confidence. That is a person performing confidence for an audience of one.',
  'You cannot laminate a feeling, your honour. And yet.',
  'The exhibit speaks for itself. It has been speaking for six screens.',
  'I ask only that you imagine being on the other end of that notification.',
  'This is not a mistake. A mistake ends. This had a follow-up.',
];

const DEFENSE_CLOSERS: readonly string[] = [
  'Read it again, slowly. What you will find is somebody trying very hard in the wrong direction.',
  'If earnestness is cringe, then we are all cooked. I ask you to consider the precedent.',
  'My client did not hurt anyone. My client mildly inconvenienced a waiter.',
  'There is a version of this person who is beloved at parties. I have met him. Briefly.',
  'The prosecution has shown you a moment. I am showing you a life.',
];

const JUDGE_CHARGES: readonly string[] = [
  'Members of the jury. You have heard the exhibit, and you have heard it described twice with total confidence by two people who were not there.',
  'You are asked one question, and it is not whether this was wise.',
  'The court reminds you that "cringe" is a feeling, not a finding. Vote your feeling. That is the entire system.',
  'Deliberation is not required. Reflection is optional. Voting closes when the court says it does.',
];

/** Assemble the full daily case for a date. */
export function buildDailyCase(date: string): DailyCase {
  const seed = hashDate(date);
  const charge = chargeFor(date);

  const opening: Line[] = [
    {
      speaker: 'judge',
      text: `Case ${caseLabel(date)}. The charge: ${charge.title.toLowerCase()}.`,
      beat: 'gavel, once',
    },
    {
      speaker: 'prosecutor',
      text: 'The people call the exhibit.',
      beat: 'slides the exhibit across the desk',
    },
  ];

  const prosecution: Line[] = [
    {
      speaker: 'prosecutor',
      text: pick(PROSECUTION_OPENERS, seed, 1),
    },
    {
      speaker: 'prosecutor',
      text: charge.exhibit,
      beat: 'lets it sit',
    },
    {
      speaker: 'prosecutor',
      text: `And then — ${charge.aggravator.toLowerCase()}`,
    },
    {
      speaker: 'prosecutor',
      text: pick(PROSECUTION_CLOSERS, seed, 2),
    },
  ];

  const defense: Line[] = [
    {
      speaker: 'defense',
      text: pick(DEFENSE_OPENERS, seed, 3),
    },
    {
      speaker: 'defense',
      text: `Consider what my client was actually doing: ${charge.exhibit
        .toLowerCase()
        .replace(/\.$/, '')}.`,
      beat: 'gestures broadly at the human condition',
    },
    {
      speaker: 'defense',
      text: 'There is a difference between a bad decision and a bad person. The prosecution has declined to make it.',
    },
    {
      speaker: 'defense',
      text: pick(DEFENSE_CLOSERS, seed, 4),
    },
  ];

  const chargeToJury: Line[] = [
    {
      speaker: 'judge',
      text: pick(JUDGE_CHARGES, seed, 5),
    },
    {
      speaker: 'judge',
      text: 'Vote GUILTY if the cringe was real and earned. Vote NOT COOKED if this was simply a person doing their best with the information available.',
      beat: 'sets down the gavel, does not use it',
    },
    {
      speaker: 'judge',
      text: 'The court will announce the verdict when voting closes. Do not look at me. I do not decide.',
    },
  ];

  return {
    date,
    caseNumber: caseNumberFor(date),
    charge,
    opening,
    prosecution,
    defense,
    chargeToJury,
  };
}
