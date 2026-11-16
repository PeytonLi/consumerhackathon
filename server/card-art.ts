export interface ChatCardArt {
  kicker: string;
  title: string;
  sub: string;
  league: string;
  members: string[];
  hue: string;
}

export interface PersonCardArt {
  name: string;
  nickels: number;
  rank: number;
  n: number;
  title: string;
  role: string;
  league: string;
  foot: string;
  image: string;
}

const esc = (text: string) => text.replace(/[&<>"']/g, (c) => "&#" + c.charCodeAt(0) + ";");
const colors = ["#5479d3", "#d88255", "#7b6cc2", "#6c9a85", "#c66b8a"];
const hash = (text: string) => [...text].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 7);
const raster = (src: string) => /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(src) ? src : "";
const shorten = (text: string, limit: number) => text.length > limit ? text.slice(0, limit - 1).trimEnd() + "…" : text;
const text = (x: number, y: number, value: string, size: number, fill = "#20222b", weight = 600, extra = "") => `<text x="${x}" y="${y}" font-family="Inter" font-size="${size}" font-weight="${weight}" fill="${fill}" ${extra}>${esc(value)}</text>`;
const rect = (x: number, y: number, w: number, h: number, r: number, fill: string, extra = "") => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" ${extra}/>`;

function wrap(value: string, limit: number): string[] {
  const words = value.split(/\s+/);
  const lines = [""];
  for (const word of words) {
    const i = lines.length - 1;
    if (lines[i] && (lines[i] + " " + word).length > limit && i === 0) lines.push(word);
    else lines[i] += (lines[i] ? " " : "") + word;
  }
  return lines.map((line) => shorten(line, limit + 4));
}

function face(name: string, x: number, y: number, size: number, photo = "", id = "face"): string {
  const h = hash(name);
  const color = colors[h % colors.length];
  const src = raster(photo);
  return `<g transform="translate(${x} ${y}) scale(${size / 100})">` +
    '<defs><clipPath id="' + id + '"><rect width="100" height="100" rx="34"/></clipPath></defs>' +
    '<g clip-path="url(#' + id + ')">' + rect(0, 0, 100, 100, 34, color) +
    (src ? `<image width="100" height="100" href="${src}" preserveAspectRatio="xMidYMid slice"/>` :
      `<circle cx="50" cy="105" r="37" fill="#fff" fill-opacity=".85"/><ellipse cx="50" cy="48" rx="27" ry="32" fill="${h % 2 ? "#e8b492" : "#b87d5b"}"/><path d="M23 43Q18 9 51 11Q82 12 78 43L69 31Q52 39 35 29L28 45Z" fill="#302a32"/><ellipse cx="40" cy="48" rx="2.8" ry="3.8" fill="#302a32"/><ellipse cx="60" cy="48" rx="2.8" ry="3.8" fill="#302a32"/><path d="M42 62Q50 69 59 61" fill="none" stroke="#583e3e" stroke-width="2.8" stroke-linecap="round"/>`) +
    '</g><rect x="1" y="1" width="98" height="98" rx="33" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width="2"/></g>';
}

function coin(x: number, y: number, size: number, color = "#d8e9bc"): string {
  return `<g transform="translate(${x} ${y}) scale(${size / 100})">` +
    '<ellipse cx="50" cy="57" rx="47" ry="43" fill="#273b33" fill-opacity=".14"/>' +
    `<circle cx="50" cy="49" r="46" fill="${color}" stroke="#fff" stroke-opacity=".7" stroke-width="2"/><circle cx="50" cy="49" r="37" fill="none" stroke="#223c2d" stroke-opacity=".2" stroke-width="1.5"/>` +
    text(50, 69, "5", 55, "#294533", 600, 'text-anchor="middle"') + '</g>';
}

function brand(x: number, y: number, color = "#20222b"): string {
  return rect(x, y - 29, 36, 36, 13, color) + text(x + 18, y - 3, "n", 27, "#fff", 600, 'text-anchor="middle"') + text(x + 49, y, "nickel", 30, color, 600, 'letter-spacing="-1"');
}

export function renderChatCard(card: ChatCardArt, photos: Record<string, string> = {}): string {
  const isWallet = /wallet/i.test(card.kicker);
  const kind = /challenge/i.test(card.kicker) ? "challenge" : /fantasy/i.test(card.kicker) ? "fantasy" : /buy.in|wallet/i.test(card.kicker) ? "money" : /leaderboard/i.test(card.kicker) ? "board" : /player card/i.test(card.kicker) ? "profile" : /hub/i.test(card.kicker) ? "hub" : "game";
  const palette = {
    game: ["#eef2ff", "#4057b4", "Today's game", "Play now"],
    challenge: ["#efebfa", "#7050ac", "The challenge", "Your move"],
    fantasy: ["#e9f1e8", "#38634b", "Your fantasy league", "Open draft"],
    money: ["#e7f0e6", "#355c40", "Better together", isWallet ? "Open wallet" : "See the pot"],
    board: ["#f4eddf", "#8d6030", "The group standings", "See the board"],
    profile: ["#f2ebe6", "#9d5f42", "One of the group", "Make it yours"],
    hub: ["#eaeafa", "#5c54a0", "Your group, closer", "Come on in"],
  }[kind];
  const [bg, ink, label, cta] = palette;
  const people = card.members.slice(0, 5);
  const titleLines = wrap(card.title, 18);
  const titleSize = titleLines.some((line) => line.length > 20) ? 66 : 80;
  const nameA = card.title.match(/^(.+?) vs /)?.[1] ?? people[0] ?? "You";
  const nameB = card.title.match(/ vs (.+)$/)?.[1] ?? people[1] ?? "Friend";
  let art = "";
  if (kind === "challenge") {
    art = '<g transform="rotate(-9 874 250)">' + rect(754, 126, 234, 294, 35, "#d8cdeb") + face(nameA, 769, 144, 204, photos[nameA], "rival-a") + text(871, 389, shorten(nameA, 11), 28, ink, 600, 'text-anchor="middle"') + '</g>' +
      '<g transform="rotate(9 1030 316)">' + rect(915, 206, 222, 284, 35, "#fff") + face(nameB, 930, 222, 192, photos[nameB], "rival-b") + text(1026, 459, shorten(nameB, 11), 28, ink, 600, 'text-anchor="middle"') + '</g>' +
      '<circle cx="944" cy="309" r="38" fill="' + ink + '"/>' + text(944, 319, "vs", 29, "#fff", 600, 'text-anchor="middle"');
  } else if (kind === "fantasy") {
    art = '<g transform="rotate(-12 890 304)">' + rect(778, 148, 230, 320, 30, "#c8dccc") + text(803, 207, "01", 31, ink) + rect(802, 238, 182, 115, 18, "#abc8b4") + text(892, 319, "A", 70, "#fff", 600, 'text-anchor="middle"') + text(804, 408, "YOUR PICK", 22, ink) + '</g>' +
      '<g transform="rotate(9 1009 321)">' + rect(900, 166, 222, 316, 30, "#fff") + text(925, 224, "02", 31, ink) + '<path d="M944 296l30 30 66-70" fill="none" stroke="' + ink + '" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/>' + text(925, 421, "DRAFT DAY", 22, ink) + '</g>';
  } else if (kind === "money") {
    art = '<g transform="rotate(-9 942 328)">' + rect(794, 165, 292, 327, 30, "#fff") + text(825, 220, isWallet ? "YOUR WALLET" : "THE GROUP POT", 23, ink) + '<path d="M822 240h236" stroke="#dce7dc" stroke-width="2"/>' + text(826, 304, isWallet ? "Play ready." : "All in.", isWallet ? 42 : 51, ink) + text(826, 354, isWallet ? "Any time." : "Together.", 40, ink) + '</g>' + coin(945, 317, 185) + coin(808, 361, 139);
  } else if (kind === "board") {
    art = rect(777, 347, 98, 148, 17, "#ddc59f") + rect(891, 266, 98, 229, 17, "#c59a5f") + rect(1005, 389, 98, 106, 17, "#e1cfb4") + face(people[1] ?? "Alex", 773, 234, 106, photos[people[1]], "rank-2") + face(people[0] ?? "Maya", 875, 133, 130, photos[people[0]], "rank-1") + face(people[2] ?? "Dev", 1001, 276, 106, photos[people[2]], "rank-3") + text(940, 364, "1", 57, "#fff", 600, 'text-anchor="middle"') + text(826, 418, "2", 43, ink, 600, 'text-anchor="middle"') + text(1054, 455, "3", 43, ink, 600, 'text-anchor="middle"');
  } else if (kind === "profile") {
    art = '<g transform="rotate(8 950 309)">' + rect(808, 142, 292, 349, 37, "#fff") + face(people[0] ?? "You", 829, 164, 250, photos[people[0]], "profile") + text(954, 459, "THE PLAYER CARD", 21, ink, 600, 'text-anchor="middle"') + '</g>';
  } else if (kind === "hub") {
    art = '<g transform="rotate(-6 950 310)">' + face(people[0] ?? "Maya", 785, 145, 150, photos[people[0]], "hub-a") + rect(949, 145, 150, 150, 42, "#c3bde1") + text(1024, 244, "5", 83, ink, 600, 'text-anchor="middle"') + rect(785, 309, 150, 150, 42, "#fff") + '<path d="M826 408v-31m33 31v-58m33 58v-80" stroke="' + ink + '" stroke-width="14" stroke-linecap="round"/>' + face(people[1] ?? "Dev", 949, 309, 150, photos[people[1]], "hub-b") + '</g>';
  } else if (/word/i.test(card.title)) {
    art = '<g transform="rotate(9 954 314)">' + rect(772, 139, 340, 340, 37, "#d8dff7") + ["N", "I", "C", "K", "E", "L", "", "", ""].map((letter, i) => {
      const x = 791 + (i % 3) * 104, y = 158 + Math.floor(i / 3) * 104;
      const fill = i === 0 || i === 4 ? "#e7b368" : i < 6 ? "#5974c4" : "#e9edfa";
      return rect(x, y + 5, 94, 94, 19, "#293862", 'fill-opacity=".12"') + rect(x, y, 94, 94, 19, fill) + text(x + 47, y + 65, letter, 53, "#fff", 600, 'text-anchor="middle"');
    }).join("") + '</g>';
  } else {
    const accent = /^#[0-9a-f]{6}$/i.test(card.hue) ? card.hue : "#4057b4";
    art = '<g transform="rotate(9 942 310)">' + rect(783, 139, 319, 344, 44, "#fff") + '<circle cx="942" cy="290" r="104" fill="' + accent + '" fill-opacity=".18"/><circle cx="942" cy="290" r="77" fill="' + accent + '"/><path d="M925 258l51 32-51 32z" fill="#fff"/>' + text(942, 445, "ONE QUICK ROUND", 23, ink, 600, 'text-anchor="middle"') + '</g>';
  }
  return '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" role="img" aria-label="' + esc(card.title) + '">' +
    '<defs><linearGradient id="paper" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient><clipPath id="canvas"><rect width="1200" height="630"/></clipPath></defs>' +
    '<g clip-path="url(#canvas)">' + rect(0, 0, 1200, 630, 0, bg) + rect(0, 0, 1200, 470, 0, "url(#paper)", 'opacity=".38"') +
    brand(48, 66, ink) + text(1152, 63, shorten(card.league, 35), 26, ink, 400, 'text-anchor="end"') +
    text(48, 164, card.kicker === "Nickel" ? label.toUpperCase() : shorten(card.kicker.toUpperCase(), 30), 27, ink, 600, 'letter-spacing="2"') +
    titleLines.map((line, i) => text(43, 262 + i * 88, line, titleSize, "#20222b", 600, 'letter-spacing="-3"')).join("") +
    text(48, 428, shorten(card.sub, 48), 29, "#5e6270", 400) + art +
    rect(0, 526, 1200, 104, 0, "#fff") + '<path d="M0 526H1200" stroke="#20222b" stroke-opacity=".07"/>' +
    people.map((name, i) => face(name, 47 + i * 46, 548, 58, photos[name], "member-" + i)).join("") +
    text(people.length ? 65 + people.length * 46 : 48, 585, people.length ? "Made for your group." : "A little friendly competition.", 25, "#6b6f79", 400) +
    text(1096, 587, cta, 31, ink, 600, 'text-anchor="end"') + '<path d="M1121 568l14 13-14 13m-16-13h30" fill="none" stroke="' + ink + '" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>' +
    '</g></svg>';
}

export function renderPersonCard(p: PersonCardArt): string {
  const win = p.role === "winner", lose = p.role === "loser";
  const bg = win ? "#efe6cc" : lose ? "#eae5f1" : "#e4eaf5";
  const ink = win ? "#795926" : lose ? "#6a5681" : "#4e668b";
  const src = raster(p.image);
  const ordinal = p.rank + (p.rank % 100 >= 11 && p.rank % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][p.rank % 10] ?? "th");
  const art = src ? `<image x="64" y="146" width="952" height="565" href="${src}" preserveAspectRatio="xMidYMid slice" clip-path="url(#portrait)"/>` : face(p.name, 270, 147, 540, "", "portrait-fallback");
  return '<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080" viewBox="0 0 1080 1080" role="img" aria-label="' + esc(p.name + ", " + ordinal + " of " + p.n) + '">' +
    '<defs><clipPath id="portrait"><rect x="64" y="146" width="952" height="565" rx="40"/></clipPath></defs>' +
    rect(0, 0, 1080, 1080, 0, bg) + brand(64, 85, ink) + text(1016, 81, "THE GROUP STANDINGS", 24, ink, 600, 'text-anchor="end" letter-spacing="2"') +
    art + rect(88, 170, 208, 55, 27, "#fff") + text(192, 208, ordinal + " of " + p.n, 29, "#20222b", 600, 'text-anchor="middle"') +
    rect(0, 680, 1080, 400, 0, "#fff") +
    text(64, 770, shorten(p.name, 18), 78, "#20222b", 600, 'letter-spacing="-3"') +
    text(64, 821, shorten(p.title, 40), 31, ink, 400) +
    text(1016, 770, (p.nickels > 0 ? "+" : "") + p.nickels, 78, ink, 600, 'text-anchor="end" letter-spacing="-3"') + text(1016, 818, "Nickels", 29, ink, 400, 'text-anchor="end"') +
    '<path d="M64 864H1016" stroke="#e9e9ef" stroke-width="2"/>' +
    text(64, 927, shorten(p.foot === p.title ? "One round can change the order." : p.foot, 53), 29, "#5e6270", 400) +
    text(64, 1016, shorten(p.league, 44), 27, "#6b6f79", 400) + text(1016, 1016, win ? "THE ONE TO BEAT" : lose ? "THE COMEBACK STARTS HERE" : "STILL ANYONE'S GAME", 22, ink, 600, 'text-anchor="end" letter-spacing="1.4"') + '</svg>';
}
