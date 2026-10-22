type Messages = { [key: string]: string | Messages };

/**
 * Deep-merges the per-stream message files. Two files defining the same message is a bug
 * (the later one would silently win), so it throws with the key path.
 */
export function mergeMessages(files: Record<string, Messages>): Messages {
  const out: Messages = {};
  const owner = new Map<string, string>();
  const walk = (target: Messages, source: Messages, file: string, path: string) => {
    for (const [key, value] of Object.entries(source)) {
      const at = path ? `${path}.${key}` : key;
      const existing = target[key];
      if (typeof value === 'object' && (existing === undefined || typeof existing === 'object')) {
        walk((target[key] ??= {}) as Messages, value, file, at);
      } else if (existing !== undefined) {
        throw new Error(`Message "${at}" is defined in both ${owner.get(at)} and ${file}.json`);
      } else {
        target[key] = value;
        owner.set(at, `${file}.json`);
      }
    }
  };
  for (const [file, messages] of Object.entries(files)) walk(out, messages, file, '');
  return out;
}
