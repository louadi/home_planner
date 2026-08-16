// Default content: people, categories, the weekly rhythm and the starting task library.
// Everything here is only a seed — once the app has run, the user's saved state wins
// and all of it is editable from the Setup tab.

export const SCHEMA_VERSION = 3;

export const CATEGORY_DEFS = {
  cooking: {
    label: 'Cooking',
    desc: 'Dinner prep and cooking effort',
    icon: '🍳',
    defaults: { heavy: 75, balanced: 55 },
  },
  kitchen: {
    label: 'Kitchen reset',
    desc: 'Cleaning up after meals, dishwasher flow',
    icon: '🧽',
    auto: 'anti-cook', // always goes to whoever did not cook that day
    defaults: { heavy: 65, balanced: 50 },
  },
  bathroom: {
    label: 'Bathroom',
    desc: 'Shower and toilet deep clean',
    icon: '🛁',
    defaults: { heavy: 90, balanced: 75 },
  },
  cleaning: {
    label: 'General cleaning',
    desc: 'Vacuum, dusting, mopping, tidying, surfaces',
    icon: '🧹',
    defaults: { heavy: 45, balanced: 50 },
  },
  laundry: {
    label: 'Laundry',
    desc: 'Loads, drying, folding, towels, bed linen',
    icon: '🧺',
    defaults: { heavy: 60, balanced: 50 },
  },
  groceries: {
    label: 'Groceries',
    desc: 'Shopping, carrying, fridge checks, planning',
    icon: '🛒',
    defaults: { heavy: 70, balanced: 55 },
  },
  admin: {
    label: 'Admin & life',
    desc: 'Bills, appointments, post, planning',
    icon: '🗂️',
    defaults: { heavy: 70, balanced: 50 },
  },
};

export const CATEGORY_KEYS = Object.keys(CATEGORY_DEFS);

export const DEFAULT_PROGRAM = [
  { day: 'Monday', focus: 'Small grocery + light reset', notes: 'Cook dinner, kitchen reset, small weekday top-up, keep it light.' },
  { day: 'Tuesday', focus: 'Laundry day 1', notes: 'Cook dinner, kitchen reset, first of two weekly laundry blocks.' },
  { day: 'Wednesday', focus: 'Midweek maintenance', notes: 'Cook dinner, vacuum once as extra weekday floor clean, bins out.' },
  { day: 'Thursday', focus: 'Small grocery + simple evening', notes: 'Cook dinner, kitchen reset, second small weekday top-up.' },
  { day: 'Friday', focus: 'Weekend prep', notes: 'Cook dinner, kitchen reset, get the flat ready for Saturday.' },
  { day: 'Saturday', focus: 'Weekend deep clean (together)', notes: 'The one weekly deep clean, done together. Simple dinner after.' },
  { day: 'Sunday', focus: 'Big groceries + laundry day 2', notes: 'Main weekly shop, second laundry block, cook dinner.' },
];

/**
 * Task library. `shared: true` means both people do it together (it shows in both
 * columns and one tap completes it for both).
 * `pts` is a rough effort weight used to keep the split fair.
 */
export const DEFAULT_TASKS = [
  { id: 'mon-cook', day: 'Monday', cat: 'cooking', pts: 3, text: 'Cook dinner' },
  { id: 'mon-kitchen', day: 'Monday', cat: 'kitchen', pts: 2, text: 'Kitchen reset after dinner' },
  { id: 'mon-shop', day: 'Monday', cat: 'groceries', pts: 2, text: 'Small weekday grocery top-up' },
  { id: 'mon-tidy', day: 'Monday', cat: 'cleaning', pts: 1, text: '5-min living area tidy' },

  { id: 'tue-cook', day: 'Tuesday', cat: 'cooking', pts: 3, text: 'Cook dinner' },
  { id: 'tue-kitchen', day: 'Tuesday', cat: 'kitchen', pts: 2, text: 'Kitchen reset after dinner' },
  { id: 'tue-laundry', day: 'Tuesday', cat: 'laundry', pts: 2, text: 'Start and move one laundry load' },
  { id: 'tue-fold', day: 'Tuesday', cat: 'laundry', pts: 1, text: 'Fold and put away dry clothes' },

  { id: 'wed-cook', day: 'Wednesday', cat: 'cooking', pts: 3, text: 'Cook dinner' },
  { id: 'wed-kitchen', day: 'Wednesday', cat: 'kitchen', pts: 2, text: 'Kitchen reset after dinner' },
  { id: 'wed-vacuum', day: 'Wednesday', cat: 'cleaning', pts: 3, text: 'Vacuum the apartment' },
  { id: 'wed-bins', day: 'Wednesday', cat: 'cleaning', pts: 1, text: 'Take out trash and recycling' },

  { id: 'thu-cook', day: 'Thursday', cat: 'cooking', pts: 3, text: 'Cook dinner' },
  { id: 'thu-kitchen', day: 'Thursday', cat: 'kitchen', pts: 2, text: 'Kitchen reset after dinner' },
  { id: 'thu-shop', day: 'Thursday', cat: 'groceries', pts: 2, text: 'Small weekday grocery top-up' },
  { id: 'thu-tidy', day: 'Thursday', cat: 'cleaning', pts: 1, text: 'Light living room reset if needed' },

  { id: 'fri-cook', day: 'Friday', cat: 'cooking', pts: 3, text: 'Cook dinner' },
  { id: 'fri-kitchen', day: 'Friday', cat: 'kitchen', pts: 2, text: 'Kitchen reset after dinner' },
  { id: 'fri-supplies', day: 'Friday', cat: 'cleaning', pts: 1, text: 'Gather cleaning supplies' },
  { id: 'fri-declutter', day: 'Friday', cat: 'cleaning', pts: 1, text: 'Declutter surfaces before the weekend' },

  { id: 'sat-cook', day: 'Saturday', cat: 'cooking', pts: 2, text: 'Cook a simple dinner after the deep clean' },
  { id: 'sat-kitchen', day: 'Saturday', cat: 'kitchen', pts: 2, text: 'Kitchen reset after dinner' },
  // Bathroom jobs are one-person jobs, so the Bathroom slider can actually steer them.
  { id: 'sat-shower', day: 'Saturday', cat: 'bathroom', pts: 2, text: 'Deep clean the shower' },
  { id: 'sat-toilet', day: 'Saturday', cat: 'bathroom', pts: 2, text: 'Deep clean the toilet' },
  { id: 'sat-sink', day: 'Saturday', cat: 'bathroom', pts: 1, text: 'Sink, mirror and bathroom floor' },
  // These are genuinely nicer done together, so they show for both and one tap completes them.
  { id: 'sat-vacuum', day: 'Saturday', cat: 'cleaning', pts: 2, text: 'Vacuum — weekend deep clean', shared: true },
  { id: 'sat-dust', day: 'Saturday', cat: 'cleaning', pts: 2, text: 'Dust living area and bedroom', shared: true },
  { id: 'sat-kitchen-deep', day: 'Saturday', cat: 'cleaning', pts: 2, text: 'Deep clean kitchen surfaces, hob, fronts', shared: true },
  { id: 'sat-mop', day: 'Saturday', cat: 'cleaning', pts: 2, text: 'Mop kitchen, bathroom, traffic paths' },

  { id: 'sun-shop', day: 'Sunday', cat: 'groceries', pts: 3, text: 'Main weekly grocery run', shared: true },
  { id: 'sun-putaway', day: 'Sunday', cat: 'groceries', pts: 1, text: 'Carry in and put away groceries', shared: true },
  { id: 'sun-cook', day: 'Sunday', cat: 'cooking', pts: 2, text: 'Cook dinner after shopping' },
  { id: 'sun-kitchen', day: 'Sunday', cat: 'kitchen', pts: 2, text: 'Kitchen reset after dinner and food prep' },
  { id: 'sun-laundry', day: 'Sunday', cat: 'laundry', pts: 3, text: 'Second laundry block: towels, sheets, catch-up' },
  { id: 'sun-plan', day: 'Sunday', cat: 'admin', pts: 1, text: 'Review next week and adjust the plan' },
];

export const DEFAULT_GROCERIES = [
  'Vegetables / salad',
  'Fruit',
  'Protein for dinners',
  'Breakfast basics',
  'Rice / pasta / bread',
  'Dishwasher tablets',
  'Laundry detergent',
  'Bathroom cleaner / bin bags',
];

export const DEFAULT_PEOPLE = [
  { id: 'p1', name: 'Z', color: '#3a5a8a' },
  { id: 'p2', name: 'R', color: '#8a3a5a' },
];

// The percentages in CATEGORY_DEFS describe the share going to the first person, so the
// "heavy" set is person-A-heavy. Flipping it (100 - value) gives the person-B-heavy set.
export const MODE_LABELS = {
  aHeavy: 'A-heavy',
  bHeavy: 'B-heavy',
  balanced: 'Balanced',
  custom: 'Custom',
};
