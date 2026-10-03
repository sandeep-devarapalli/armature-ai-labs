export interface EcosystemGuideChapter {
  id: 'work-meet' | 'build-source' | 'living';
  title: string;
  intro: string;
  paragraphs: readonly string[];
  sources: readonly { label: string; url: string }[];
}

export const ecosystemCities = [{
  id: 'bangalore',
  name: 'Bangalore',
  title: 'Bangalore starter guide',
  intro: 'Find a place to work, meet other founders and build.',
}] as const;

export const guideChapters: readonly EcosystemGuideChapter[] = [
  {
    id: 'work-meet',
    title: 'Work & meet',
    intro: 'Find a working base, then a few people you can keep learning with.',
    paragraphs: [
      'Start with the journeys you will repeat: home to your bench, bench to a supplier, and the occasional customer visit. Shortlist workspaces around those trips. Visit during a normal working day and check calls, internet, power, storage and how you would receive a bulky delivery.',
      'A café can work for a first conversation or a short laptop session. Ask about laptop use, sockets and busy periods before settling in; keep calls considerate and hardware assembly at a suitable bench. For regular work, compare a coworking desk with a makerspace rather than assuming they offer the same access.',
      'Choose a founder gathering around one useful question: a component recommendation, a manufacturing problem or an introduction to a potential customer. Bring a short demo or a photo, explain what you have already tried, and follow up with the people you can help too. Check the organiser’s current event page for the venue and registration details.',
    ],
    sources: [
      { label: 'HSR Founders Club', url: 'https://www.hsrfounders.club/' },
      { label: 'Community updates on LinkedIn', url: 'https://in.linkedin.com/company/hsrfc' },
      { label: 'HSR Founders Club events', url: 'https://luma.com/hsr-founders-club-events?k=c' },
      { label: 'Big Bean Café’s HSR story', url: 'https://www.bigbeancafe.in/our-story' },
    ],
  },
  {
    id: 'build-source',
    title: 'Build & source',
    intro: 'Turn “we need a prototype” into a brief someone can quote and make.',
    paragraphs: [
      'Split the next build into parts to buy, parts to make and tests to run. For electronics, write down the exact part number, package, voltage and acceptable substitutes. Ask a supplier to confirm stock and lead time against that list before travelling; a catalogue entry is not a reserved component.',
      'Send fabricators a dimensioned drawing alongside the CAD file, with material, quantity, finish and the few dimensions that really must be held tightly. Ask what they would change to make the part easier to produce. Agree how the first part will be checked before ordering the rest.',
      'A shared facility may offer machine access, an operator-led service, or both. Confirm the process and material you need, induction requirements, who operates the equipment, and where unfinished work can be stored. Ask separately about testing and measurement: being able to make a part does not establish that it meets your requirements.',
    ],
    sources: [
      { label: 'IKP EDEN Smart Fab', url: 'https://ikpeden.com/smart-fab/' },
    ],
  },
  {
    id: 'living',
    title: 'Settle in',
    intro: 'Make the everyday routine work before committing to a long-term base.',
    paragraphs: [
      'Try the actual home-to-work trip at the time you expect to travel, including the walk to a bus or metro stop and the last stretch to the workshop. Compare door-to-door time, not just map distance. Group supplier visits by area, and plan separately for trips with a heavy or fragile prototype.',
      'For housing, shortlist around your regular destination before widening the search. Visit in person and check water, mobile reception, internet options, ventilation, noise and a practical route home. Get the full cost breakdown and terms in writing before paying; keep your home address out of public community listings.',
      'Build a routine beyond work: a nearby grocery shop, somewhere to walk, and one interest-based group you genuinely enjoy. Leave room between meetings to learn your neighbourhood. When asking locals for help, give the area and the kind of place you need rather than sharing private residential details.',
    ],
    sources: [
      { label: 'Further reading: Plum’s Bangalore guide', url: 'https://www.plumhq.com/starter-guides/starter-guide-to-bangalore' },
    ],
  },
];
