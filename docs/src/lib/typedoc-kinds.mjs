// TypeDoc 0.27+ emits a numeric `kind` (a ReflectionKind value) instead of the
// legacy string `kindString`. Translate the common values back to a readable
// label. Shared by the /api/ pages and the llms.txt generator so they stay in
// sync.
export const KIND_LABELS = {
  1: 'Project',
  2: 'Module',
  4: 'Namespace',
  8: 'Enum',
  16: 'EnumMember',
  32: 'Variable',
  64: 'Function',
  128: 'Class',
  256: 'Interface',
  512: 'Constructor',
  1024: 'Property',
  2048: 'Method',
  4096: 'CallSignature',
  65536: 'TypeAlias',
  2097152: 'TypeAlias',
};

/**
 * Resolve a readable kind label from a TypeDoc reflection, accepting either the
 * legacy `kindString` or the numeric `kind`.
 */
export function kindLabel(entry, fallback = 'Other') {
  if (entry && typeof entry.kindString === 'string') return entry.kindString;
  if (entry && typeof entry.kind === 'number' && KIND_LABELS[entry.kind]) {
    return KIND_LABELS[entry.kind];
  }
  return fallback;
}
