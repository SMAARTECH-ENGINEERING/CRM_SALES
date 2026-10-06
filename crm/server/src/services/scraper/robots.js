// robots.txt: what a site allows automated visitors to fetch.
//
// The rules of the group naming our robot are used, or those for "*"; within
// them the longest matching rule wins, and Allow wins a tie. "*" and "$" in
// paths work as in the standard. Crawl-delay is honoured.

const groupsOf = (text) => {
  const groups = [];
  let current = null;
  let lastWasAgent = false;
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim();
    const match = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!match) continue;
    const field = match[1].toLowerCase();
    const value = match[2].trim();
    if (field === 'user-agent') {
      if (!lastWasAgent || !current) {
        current = { agents: [], rules: [], crawlDelay: null };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!current) continue;
    if (field === 'allow' || field === 'disallow') current.rules.push({ allow: field === 'allow', path: value });
    else if (field === 'crawl-delay' && Number.isFinite(Number(value))) current.crawlDelay = Number(value);
  }
  return groups;
};

// "*" matches anything; a final "$" anchors the end; everything else is literal.
const toRegex = (path) => {
  const anchored = path.endsWith('$');
  const body = (anchored ? path.slice(0, -1) : path).replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${body}${anchored ? '$' : ''}`);
};

// -> { allowed(pathWithQuery), crawlDelayMs }
export function parseRobots(text, userAgent) {
  const token = String(userAgent).split('/')[0].toLowerCase();
  const groups = groupsOf(text);
  const own = groups.filter((g) => g.agents.some((a) => a !== '*' && token.includes(a)));
  const chosen = own.length ? own : groups.filter((g) => g.agents.includes('*'));
  const rules = chosen.flatMap((g) => g.rules).filter((r) => r.path !== '' || !r.allow);
  const crawlDelay = chosen.map((g) => g.crawlDelay).find((d) => d !== null) ?? null;
  return {
    allowed(path) {
      let best = null;
      for (const rule of rules) {
        // "Disallow:" with nothing means everything is allowed.
        if (!rule.path) continue;
        if (!toRegex(rule.path).test(path)) continue;
        if (!best || rule.path.length > best.path.length || (rule.path.length === best.path.length && rule.allow)) best = rule;
      }
      return !best || best.allow;
    },
    crawlDelayMs: crawlDelay === null ? null : Math.min(crawlDelay, 60) * 1000,
  };
}

export const ALLOW_ALL = Object.freeze({ allowed: () => true, crawlDelayMs: null });
export const DENY_ALL = Object.freeze({ allowed: () => false, crawlDelayMs: null });
