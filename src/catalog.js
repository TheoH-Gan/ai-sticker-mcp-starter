import { readFile } from "node:fs/promises";

const normalize = (value) => String(value ?? "").trim().toLowerCase();
const words = (value) => normalize(value).split(/[^\p{L}\p{N}_-]+/u).filter(Boolean);

export async function loadCatalog(path) {
  const raw = JSON.parse(await readFile(path, "utf8"));
  if (!Array.isArray(raw)) throw new Error("Sticker catalog must be a JSON array");

  const ids = new Set();
  return raw.map((item, index) => {
    if (!item?.id || !item?.url || !item?.name) {
      throw new Error(`Catalog item ${index} requires id, name and url`);
    }
    if (ids.has(item.id)) throw new Error(`Duplicate sticker id: ${item.id}`);
    ids.add(item.id);
    return {
      aliases: [], tags: [], tone: [], avoid_when: [], cooldown_turns: 10,
      review_status: "unreviewed", enabled: true, animated: false,
      ...item
    };
  });
}

export function publicSticker(item) {
  return {
    id: item.id,
    pack: item.pack,
    name: item.name,
    alt: item.alt,
    url: item.url,
    mime: item.mime,
    animated: Boolean(item.animated),
    tags: item.tags,
    tone: item.tone,
    usage_note: item.usage_note,
    avoid_when: item.avoid_when,
    cooldown_turns: item.cooldown_turns,
    review_status: item.review_status
  };
}

function score(item, queryTokens, tags, tone) {
  const fields = {
    id: words(item.id),
    name: words(item.name),
    aliases: words((item.aliases ?? []).join(" ")),
    alt: words(item.alt),
    tags: words((item.tags ?? []).join(" ")),
    tone: words((item.tone ?? []).join(" ")),
    usage: words(item.usage_note)
  };
  let total = item.review_status === "reviewed" ? 1 : 0;
  for (const token of queryTokens) {
    if (fields.id.includes(token)) total += 8;
    if (fields.name.includes(token)) total += 8;
    if (fields.aliases.includes(token)) total += 7;
    if (fields.tags.includes(token)) total += 6;
    if (fields.tone.includes(token)) total += 4;
    if (fields.alt.includes(token)) total += 3;
    if (fields.usage.includes(token)) total += 2;
  }
  for (const tag of tags.map(normalize)) if (fields.tags.includes(tag)) total += 7;
  for (const value of tone.map(normalize)) if (fields.tone.includes(value)) total += 5;
  return total;
}

export function searchCatalog(catalog, args = {}) {
  const queryTokens = words(args.query);
  const tags = args.tags ?? [];
  const tone = args.tone ?? [];
  const excluded = new Set(args.exclude_ids ?? []);
  const limit = Math.min(Math.max(args.limit ?? 5, 1), 20);

  return catalog
    .filter((item) => item.enabled !== false)
    .filter((item) => !excluded.has(item.id))
    .filter((item) => !args.pack || normalize(item.pack) === normalize(args.pack))
    .map((item) => ({ item, score: score(item, queryTokens, tags, tone) }))
    .filter(({ score }) => queryTokens.length === 0 && tags.length === 0 && tone.length === 0 || score > 0)
    .sort((a, b) => b.score - a.score || a.item.name.localeCompare(b.item.name))
    .slice(0, limit)
    .map(({ item }) => publicSticker(item));
}

export function listPacks(catalog) {
  const map = new Map();
  for (const item of catalog.filter((x) => x.enabled !== false)) {
    const current = map.get(item.pack) ?? { pack: item.pack, count: 0, reviewed: 0 };
    current.count += 1;
    if (item.review_status === "reviewed") current.reviewed += 1;
    map.set(item.pack, current);
  }
  return [...map.values()].sort((a, b) => a.pack.localeCompare(b.pack));
}
