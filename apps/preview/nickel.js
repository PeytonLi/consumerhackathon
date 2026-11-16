const params = new URLSearchParams(location.search);
if (params.get("theme")) document.documentElement.dataset.theme = params.get("theme");
const $ = (id) => document.getElementById(id);
const stage = $("stage"), dock = $("dock");

const ICON = {
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.6v.1"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',
  coin: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.8"/>',
  again: '<path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3L4.5 9"/><path d="M4.5 4.5V9H9"/>',
  ended: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/><path d="M4 4l16 16"/>',
  target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  in: '<path d="M17 7L7 17M7 9v8h8"/>',
  out: '<path d="M7 17L17 7M9 7h8v8"/>',
  bank: '<path d="M3.5 9.5L12 4.5l8.5 5"/><path d="M5.5 10v7M10 10v7M14 10v7M18.5 10v7M3.5 19.5h17"/>',
  gauge: '<path d="M4.5 16a7.5 7.5 0 1 1 15 0"/><path d="M12 16l3.5-4.5"/>',
  alert: '<path d="M12 4l9 15.5H3z"/><path d="M12 10v4M12 16.8v.1"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
  shield: '<path d="M12 3.5l7 2.8v5.4c0 4.3-3 7.4-7 8.8-4-1.4-7-4.5-7-8.8V6.3z"/>',
  double: '<path d="M5 18l6-6-6-6M13 18l6-6-6-6"/>',
  gift: '<rect x="4" y="9" width="16" height="11" rx="2"/><path d="M3 9h18M12 9v11"/><path d="M12 9c-1.5-3.5-5.5-4-5.5-1.5S10 9 12 9c2 0 5.5 0 5.5-1.5S13.5 5.5 12 9z"/>',
  hand: '<path d="M8 13V6.5a1.5 1.5 0 0 1 3 0V12M11 11.5V5a1.5 1.5 0 0 1 3 0v6.5M14 11.5V6.5a1.5 1.5 0 0 1 3 0V14c0 3.6-2.4 6.5-6 6.5-2.5 0-4-1.2-5.2-3.2L4 14a1.5 1.5 0 0 1 2.6-1.5L8 14.5"/>',
  back: '<path d="M14.5 5.5L8 12l6.5 6.5"/>',
  chevron: '<path d="M9.5 6l6 6-6 6"/>',
};
const icon = (n) => '<svg class="i" viewBox="0 0 24 24" aria-hidden="true">' + ICON[n] + "</svg>";
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => "&#" + c.charCodeAt(0) + ";");
const cash = (c) => (Math.abs(c) < 100 ? Math.abs(c) + "\u00a2" : "$" + (Math.abs(c) % 100 ? (Math.abs(c) / 100).toFixed(2) : Math.abs(c) / 100));
const signed = (c) => (c < 0 ? "\u2212" : "+") + cash(c);
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const meName = () => (window.ME && window.ME.name) || "";

const HUES = ["#0a84ff", "#ff9f0a", "#30d158", "#bf5af2", "#ff375f", "#40c8e0", "#5e5ce6"];
const hue = (name) => HUES[[...name].reduce((a, c) => a * 31 + c.charCodeAt(0), 7) % HUES.length];
const avatar = (name, cls = "") => '<span class="avatar ' + cls + '" style="--hue:' + hue(name || "?") + '">' + esc((name || "?")[0]) + "</span>";

const haptic = (() => {
  const label = document.createElement("label");
  label.style.cssText = "position:fixed;opacity:0;pointer-events:none;width:1px;height:1px;overflow:hidden";
  label.ariaHidden = "true";
  label.innerHTML = '<input type="checkbox" switch tabindex="-1">';
  document.body.append(label);
  return (times = 1) => { for (let i = 0; i < times; i++) setTimeout(() => label.click(), i * 90); };
})();

function show(stageHtml, dockHtml = "") {
  stage.innerHTML = stageHtml;
  dock.innerHTML = dockHtml;
  dock.hidden = !dockHtml;
}
function toast(text) {
  const t = $("toast");
  t.textContent = text;
  t.classList.add("on");
  clearTimeout(toast.t);
  toast.t = setTimeout(() => t.classList.remove("on"), 1500);
}
function openSheet(html) {
  $("sheet").innerHTML = html;
  $("sheet").classList.add("on");
  $("sheet").ariaHidden = "false";
  $("scrim").classList.add("on");
}
function closeSheet() {
  $("sheet").classList.remove("on");
  $("sheet").ariaHidden = "true";
  $("scrim").classList.remove("on");
}
$("scrim").onclick = closeSheet;
$("sheet").addEventListener("click", (e) => { if (e.target.closest("[data-close]")) closeSheet(); });

async function api(path, body) {
  const res = await fetch(path, body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : undefined);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Try again");
  return data;
}
function setMe() {
  $("me").innerHTML = meName() ? avatar(meName()) : "";
}
function nowhere(title, line) {
  show('<span class="halo">' + icon("ended") + '</span><p class="t-title">' + esc(title) + '</p><p class="t-label">' + esc(line) + "</p>");
}
