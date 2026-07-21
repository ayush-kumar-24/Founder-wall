// ~300 founder truths. Short, honest, human. No two notes share an exact hue.

export interface NoteData {
  id: number;
  text: string;
  who: string; // lightweight identity — human, never identifying
  // the hand that wrote it — no two hands are the same
  slant: number; // italic lean of the writing
  inkDark: number; // pressure of the pencil
  fontScale: number; // some write large, some cramped
  caps: boolean; // the ones who were shouting quietly
  tape: boolean; // some notes needed tape to stay
  underline: boolean; // some words had to be underlined
  x: number;
  y: number;
  rot: number; // radians
  scale: number;
  color: string;
  age: number; // 0 fresh → 1 ancient (drives curl + fade)
  readable: boolean; // near eye-level band → gets real text
}

// The palette after six months of indirect sunlight
const PALETTE = [
  // sampled from the reference — the paper drawer of this particular studio
  "#dbc073", // pastel yellow — the wall's main voice
  "#dbc073",
  "#d6ba6b", // warm yellow
  "#c4a452", // deep mustard — rare, older
  "#b4b374", // light sage
  "#b4b374",
  "#a3a361", // mid sage — a green that kept its calm
  "#e9e0cc", // warm ivory
  "#e9e0cc",
  "#d9cfba", // muted beige
  "#cfc5b0", // dusty cream — the oldest
];

const TRUTHS = [
  "My co-founder wants to quit.",
  "Revenue has stopped growing.",
  "Investors stopped replying.",
  "I don't know what to build next.",
  "I'm burning out.",
  "Need first customers.",
  "Co-founder left last month.",
  "Nobody replies to my cold emails.",
  "I'm tired.",
  "Runway ends in March.",
  "I miss my old salary.",
  "My parents think I have a job.",
  "Burned out. Still shipping.",
  "Third pivot this year.",
  "Investors ghosted after the demo.",
  "I don't know what I'm doing.",
  "Everyone else seems faster.",
  "My co-founder is my mom.",
  "Haven't paid myself in 9 months.",
  "The product works. Nobody cares.",
  "I cry in the car sometimes.",
  "Lost my biggest client on my birthday.",
  "Scared to check the bank account.",
  "My best friend stopped asking how it's going.",
  "Building alone is so quiet.",
  "I lied in the pitch. It haunts me.",
  "Two users. Both are my cousins.",
  "The idea was better in my head.",
  "I can't sleep before demo days.",
  "Rejected 47 times. Counting.",
  "My visa depends on this working.",
  "I envy people with weekends.",
  "The competitor raised $20M today.",
  "Still no product-market fit.",
  "I fired my first employee. It broke me.",
  "My spouse believes in me more than I do.",
  "Growth flat for six months.",
  "I answer support tickets at 3am.",
  "Nobody told me it would be this lonely.",
  "I keep saying 'next quarter'.",
  "Imposter syndrome won today.",
  "Sold my bike to make payroll.",
  "The demo crashed. They laughed.",
  "I'm the CEO and the janitor.",
  "Turned 40 building this.",
  "My kid asked why I'm always tired.",
  "Signed my first customer. Then lost them.",
  "The waitlist is fake growth.",
  "I miss writing code. Now I just email.",
  "Accelerator rejected us twice.",
  "My landlord doesn't take equity.",
  "Every 'no' still stings.",
  "I practice smiling before investor calls.",
  "We look successful on LinkedIn.",
  "Cash out in 11 weeks.",
  "The intern quit for a better startup.",
  "I read competitors' job posts at night.",
  "Momentum is a memory.",
  "My therapist knows my cap table.",
  "First hire earns more than me.",
  "I deleted the resignation email again.",
  "The market moved. We didn't.",
  "Ramen isn't a metaphor here.",
  "I celebrate alone.",
  "Users love it. Won't pay for it.",
  "My dad still asks when I'll get serious.",
  "Sleep is my only investor meeting.",
  "The app store rejected us. Again.",
  "One more month. I keep saying it.",
  "I know the metrics by heart. They hurt.",
  "Started to be free. Now I have 3 bosses.",
  "The prototype is held together with hope.",
  "I've become someone who checks Slack at dinner.",
  "Big company offered to buy us for nothing.",
  "My equity is worth less than my laptop.",
  "The vision is clear. The path isn't.",
  "I rehearse quitting in the shower.",
  "Nobody claps for surviving.",
  "Six people believed. Five left.",
  "The bug is somewhere. So is my patience.",
  "I forgot my own launch anniversary.",
  "Revenue: yes. Profit: someday.",
  "My calendar is full. My pipeline isn't.",
  "The award didn't pay rent.",
  "Still here. That's the update.",
  "I want my idea back from reality.",
  "Hired fast. Regretting slowly.",
  "The press wrote about us once. 2023.",
  "I mute the founders' group chat now.",
  "Made payroll. Skipped groceries.",
  "It's working. I'm not.",
  "My mentor stopped replying.",
  "The roadmap is a wish list.",
  "I keep the rejection emails. Fuel.",
  "First revenue: $9. Framed it.",
  "The pivot saved us. Killed the dream.",
  "Wearing the same hoodie as 2021.",
  "I negotiate with myself at 2am.",
  "They copied us. Theirs is better.",
  "Grateful. Terrified. Both.",
  "The wall is the only one I told.",
];

// deterministic pseudo-random from seed — the wall is the same wall every visit
function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function jitterHex(hex: string, rnd: () => number, amount = 0.07): string {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255,
    g = (n >> 8) & 255,
    b = n & 255;
  const j = () => 1 + (rnd() * 2 - 1) * amount;
  r = Math.min(255, Math.max(0, Math.round(r * j())));
  g = Math.min(255, Math.max(0, Math.round(g * j())));
  b = Math.min(255, Math.max(0, Math.round(b * j())));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

// Terrain: dense drifts and sparse clearings, like snow against a fence.
// Density peaks at eye height (y≈1.7) and near two cluster centers.
export function generateNotes(count = 300): NoteData[] {
  const rnd = mulberry32(20241019);
  const notes: NoteData[] = [];
  // authored for the opening frame: a dense left drift, a breath of
  // empty plaster, a dense right drift, and density above that rewards
  // looking up. Tightened so each reads as a drift, not a haze.
  const clusters = [
    { cx: -1.25, cy: 1.72, w: 1.5, h: 0.95, n: Math.floor(count * 0.34) },
    { cx: 1.45, cy: 1.58, w: 1.3, h: 0.9, n: Math.floor(count * 0.3) },
    { cx: -0.1, cy: 2.75, w: 2.8, h: 1.5, n: Math.floor(count * 0.2) },
  ];
  const scattered = count - clusters.reduce((s, c) => s + c.n, 0);

  let id = 0;
  const gauss = () => (rnd() + rnd() + rnd()) / 3 - 0.5; // rough bell, [-0.5, 0.5]

  // identity: human without being identifying. Future versions may let
  // founders choose a first name; the wall never requires one.
  const SECTORS = [
    "SaaS", "Fintech", "D2C", "AI", "Edtech", "Healthtech",
    "Climate", "Gaming", "Hardware", "Marketplace", "Agency", "Creator",
  ];
  const makeWho = () => {
    const r = rnd();
    if (r < 0.4) return `Founder \u2022 ${SECTORS[Math.floor(rnd() * SECTORS.length)]}`;
    if (r < 0.6) return "Anonymous Founder";
    if (r < 0.8) return `Founder #${1000 + Math.floor(rnd() * 9000)}`;
    if (r < 0.9) return "Early-stage Founder";
    return "Solo Founder";
  };

  const place = (x: number, y: number) => {
    // the clearing: a deliberate near-empty region, negative space
    if (x > -0.62 && x < 0.42 && y > 1.3 && y < 2.0 && rnd() > 0.1) return;
    const age = Math.pow(rnd(), 1.6); // most notes are older
    const base = PALETTE[Math.floor(rnd() * PALETTE.length)];
    const readable = y > 1.1 && y < 2.45 && rnd() > 0.35;
    notes.push({
      id: id++,
      text: TRUTHS[Math.floor(rnd() * TRUTHS.length)],
      who: makeWho(),
      slant: (rnd() * 2 - 1) * 0.09,
      inkDark: 0.72 + rnd() * 0.28,
      fontScale: 0.82 + rnd() * 0.42,
      caps: rnd() < 0.09,
      tape: rnd() < 0.15,
      underline: rnd() < 0.12,
      x,
      y,
      rot: (rnd() * 2 - 1) * 0.22 * (0.4 + age), // older notes lean harder
      scale: 0.85 + rnd() * 0.3, // paper from different pads, different years
      color: jitterHex(base, rnd),
      age,
      readable,
    });
  };

  for (const c of clusters) {
    for (let i = 0; i < c.n; i++) {
      place(c.cx + gauss() * c.w * 2, c.cy + gauss() * c.h * 2);
    }
  }
  for (let i = 0; i < scattered; i++) {
    place((rnd() * 2 - 1) * 4.6, 0.55 + rnd() * 3.6);
  }
  return notes;
}

// The wall's concave curve. Edges ~15cm closer to the viewer than center.
export const WALL = {
  width: 11,
  height: 12,
  z: 0,
  curve(x: number): number {
    const t = x / (this.width / 2);
    return 0.15 * t * t; // concave: cupped hands
  },
  normalYaw(x: number): number {
    // small rotation so peripheral notes turn toward the visitor
    const t = x / (this.width / 2);
    return -t * 0.055;
  },
};
