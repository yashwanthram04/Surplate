import Fridge from '../src/models/Fridge.js';
import FridgeUpdate from '../src/models/FridgeUpdate.js';
import SpoiledReport from '../src/models/SpoiledReport.js';
import { DEMO_USERS } from '../src/seed.js';

const MIN = 60 * 1000;

/** Same placeholder the demo listings use, so test fridges have a photo. */
function placeholderPhoto(emoji, from, to) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 600 400">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs>
<rect width="600" height="400" fill="url(#g)"/><text x="300" y="250" font-size="170" text-anchor="middle">${emoji}</text></svg>`;
  return { data: Buffer.from(svg), contentType: 'image/svg+xml' };
}

/**
 * Test-only community fridges (the app no longer seeds any): five fridges, a status history for each,
 * and one open spoiled-food report. Needs the demo users to exist already.
 */
export async function seedTestFridges() {
  const t = (offsetMin) => new Date(Date.now() + offsetMin * MIN);
  const U = (n) => DEMO_USERS[n - 1]; // 1 Sunrise, 2 Crumb, 4 Hope Kitchen, 5 Alex, 7 Admin
  const site = (address, postal, lat, lng) => ({ address, postal, location: { type: 'Point', coordinates: [lng, lat] } });
  const defs = [
    { key: 'tiong', name: 'Tiong Bahru Community Fridge', openingHours: '24 hours', owner: U(5), photo: ['🧊', '#bae6fd', '#0369a1'],
      description: 'Beside the void deck notice board. Please label home-cooked food with the date and keep the area tidy.', ...site('30 SENG POH ROAD', '168898', 1.2866, 103.8326) },
    { key: 'bugis', name: 'Bugis Neighbourhood Fridge', openingHours: 'Mon–Sat 9am–8pm', owner: U(4), photo: ['🥫', '#fde68a', '#b45309'],
      description: 'Under the covered walkway, next to the bus stop. Take what you need, leave what you can.', ...site('1 BUGIS STREET', '188868', 1.3, 103.8559) },
    { key: 'tampines', name: 'Tampines Hub Fridge', openingHours: 'Daily 8am–10pm', owner: U(5), photo: ['🥗', '#bbf7d0', '#15803d'],
      description: 'Next to the community kitchen on level 1.', ...site('1 TAMPINES WALK OUR TAMPINES HUB', '528523', 1.3541, 103.9406) },
    { key: 'toapayoh', name: 'Toa Payoh Lorong 4 Fridge', openingHours: '24 hours', owner: U(7), photo: ['🍞', '#fed7aa', '#c2410c'],
      description: 'Bakeries nearby drop bread here in the evening.', ...site('77 LORONG 4 TOA PAYOH', '310077', 1.3396, 103.8478) },
    // No updates yet: shows how an unknown status looks.
    { key: 'jurong', name: 'Jurong West Community Fridge', openingHours: 'Daily 7am–9pm', owner: U(4), photo: ['🍚', '#e9d5ff', '#7e22ce'],
      description: 'Beside the market on the ground floor.', ...site('1 JURONG WEST CENTRAL 2', '648886', 1.3404, 103.7068) },
  ];
  const fridges = await Fridge.insertMany(defs.map(({ key, owner, photo, ...rest }) => ({ ...rest, photo: placeholderPhoto(...photo), createdBy: owner._id, createdByName: owner.name })));
  const byKey = Object.fromEntries(defs.map((d, i) => [d.key, fridges[i]]));

  // [fridge, author, status, minutes ago, note]
  const history = [
    ['tiong', U(1), 'stocked', 26 * 60, "Left 8 sourdough loaves from today's bake."],
    ['tiong', U(5), 'low', 4 * 60, 'Only a few items left this afternoon.'],
    ['tiong', U(1), 'stocked', 75, 'Dropped off 12 croissants and a tray of egg tarts.'],
    ['bugis', U(4), 'low', 9 * 60, 'Running low on sandwiches and drinks. Donations welcome.'],
    ['tampines', U(5), 'empty', 30 * 60, 'Completely empty at lunchtime.'],
    ['toapayoh', U(2), 'stocked', 20, 'Dropped off 15 loaves of vegan banana bread.'],
  ];
  const updates = await FridgeUpdate.insertMany(history.map(([key, author, status, ago, note]) => ({
    fridge: byKey[key]._id, author: author._id, authorName: author.name, authorRole: author.role, status, note, createdAt: t(-ago),
  })));
  // Copy each fridge's newest update onto the fridge, the same way the API does.
  for (const fridge of fridges) {
    const newest = updates.filter((u) => u.fridge.equals(fridge._id)).sort((a, b) => b.createdAt - a.createdAt)[0];
    if (newest) await Fridge.updateOne({ _id: fridge._id }, { latestStatus: newest.status, latestUpdateAt: newest.createdAt, latestNote: newest.note }, { timestamps: false });
  }

  // An open report on Sunrise Bakery's older drop-off, so the bakery's alerts have something to show.
  await SpoiledReport.create({
    fridge: byKey.tiong._id, fridgeName: byKey.tiong.name, update: updates[0]._id, reportedBy: U(5)._id, reportedByName: U(5).name,
    items: 'Sourdough loaves', note: 'Two of the loaves had gone mouldy.', suppliers: [U(1)._id], createdAt: t(-120),
  });
}
