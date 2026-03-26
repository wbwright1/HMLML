export type LabelTone = 'positive' | 'sting' | 'neutral';

export interface SnarkyLabel {
  readonly key: string;
  readonly displayText: string;
  readonly description: string;
  readonly tone: LabelTone;
}

export const SNARKY_LABELS: Readonly<Record<string, SnarkyLabel>> = Object.freeze({
  POINT_MACHINE: {
    key: 'POINT_MACHINE',
    displayText: 'Point Machine',
    description: 'Franchise with the most points scored in the season (Most PF)',
    tone: 'positive',
  },
  IRON_CURTAIN: {
    key: 'IRON_CURTAIN',
    displayText: 'Iron Curtain',
    description: 'Franchise that allowed the fewest points against in the season (Least PA)',
    tone: 'positive',
  },
  ALPHA_DOG: {
    key: 'ALPHA_DOG',
    displayText: 'Alpha Dog',
    description: 'Franchise with the best win-loss record in the season',
    tone: 'positive',
  },
  LEAGUE_DOORMAT: {
    key: 'LEAGUE_DOORMAT',
    displayText: 'League Doormat',
    description: 'Franchise with the worst win-loss record in the season',
    tone: 'sting',
  },
  GLASS_CANNON: {
    key: 'GLASS_CANNON',
    displayText: 'Glass Cannon',
    description: 'Franchise with high points scored but a poor win total (high PF, low wins)',
    tone: 'sting',
  },
  PAPER_TIGER: {
    key: 'PAPER_TIGER',
    displayText: 'Paper Tiger',
    description: 'Franchise that allowed the most points against in the season (high PA)',
    tone: 'sting',
  },
  DRAFT_DAY_GENIUS: {
    key: 'DRAFT_DAY_GENIUS',
    displayText: 'Draft Day Genius',
    description: 'Franchise with the best draft return on investment',
    tone: 'positive',
  },
  WASTED_PICKS: {
    key: 'WASTED_PICKS',
    displayText: 'Wasted Picks',
    description: 'Franchise with the worst draft return on investment',
    tone: 'sting',
  },
  ON_FIRE: {
    key: 'ON_FIRE',
    displayText: 'On Fire',
    description: 'Franchise with the longest win streak',
    tone: 'positive',
  },
  ROCK_BOTTOM: {
    key: 'ROCK_BOTTOM',
    displayText: 'Rock Bottom',
    description: 'Franchise with the longest losing streak',
    tone: 'sting',
  },
  MERCY_RULE: {
    key: 'MERCY_RULE',
    displayText: 'Mercy Rule',
    description: 'Franchise that won by the biggest margin in a single matchup (biggest blowout win)',
    tone: 'positive',
  },
  CARDIAC_CREW: {
    key: 'CARDIAC_CREW',
    displayText: 'Cardiac Crew',
    description: 'Franchise that won by the smallest margin in a single matchup (closest win)',
    tone: 'neutral',
  },
  WHAT_COULDVE_BEEN: {
    key: 'WHAT_COULDVE_BEEN',
    displayText: "What Could've Been",
    description: 'Franchise with the highest best-possible roster score vs actual lineup (best possible roster)',
    tone: 'neutral',
  },
  COACHING_MALPRACTICE: {
    key: 'COACHING_MALPRACTICE',
    displayText: 'Coaching Malpractice',
    description: 'Franchise with the largest gap between optimal lineup and actual lineup score (biggest underperformer)',
    tone: 'sting',
  },
} as const);
