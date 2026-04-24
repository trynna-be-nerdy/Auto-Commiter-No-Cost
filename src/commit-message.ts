interface FileStat {
  path: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed';
}

// --- Diff parsing ---

function parseFiles(diff: string): FileStat[] {
  const files: FileStat[] = [];
  const headerRe = /^diff --git a\/.+ b\/(.+)$/gm;
  let match: RegExpExecArray | null;

  while ((match = headerRe.exec(diff)) !== null) {
    const path = match[1];
    const chunkStart = match.index;
    const nextChunk = diff.indexOf('\ndiff --git', chunkStart + 1);
    const chunk = nextChunk === -1 ? diff.slice(chunkStart) : diff.slice(chunkStart, nextChunk);

    let status: FileStat['status'] = 'modified';
    if (/^new file mode/m.test(chunk)) status = 'added';
    else if (/^deleted file mode/m.test(chunk)) status = 'deleted';
    else if (/^rename to/m.test(chunk)) status = 'renamed';

    files.push({ path, status });
  }

  return files;
}

// --- Type detection ---

const TYPE_RULES: Array<{ test: (files: FileStat[], diff: string) => boolean; type: string }> = [
  {
    // Only test files changed
    test: (files) => files.length > 0 && files.every((f) => /\.(test|spec)\.[tj]sx?$/.test(f.path)),
    type: 'test',
  },
  {
    // Only docs/markdown changed
    test: (files) => files.length > 0 && files.every((f) => /\.(md|mdx|txt|rst)$/.test(f.path)),
    type: 'docs',
  },
  {
    // Only style files changed
    test: (files) =>
      files.length > 0 && files.every((f) => /\.(css|scss|sass|less|styl)$/.test(f.path)),
    type: 'style',
  },
  {
    // Only config/tooling files changed
    test: (files) =>
      files.length > 0 &&
      files.every((f) =>
        /^(\..*|.*\.(json|yaml|yml|toml|ini|env.*|lock|config\.[tj]s))$/.test(f.path)
      ),
    type: 'chore',
  },
  {
    // Any new source file → feat
    test: (files) =>
      files.some((f) => f.status === 'added' && /\.[tj]sx?$/.test(f.path)),
    type: 'feat',
  },
  {
    // Diff lines mention fix/bug/error/patch
    test: (_files, diff) => /\bfix(ed|ing|es)?\b|\bbug\b|\berror\b|\bpatch\b/i.test(diff),
    type: 'fix',
  },
];

function detectType(files: FileStat[], diff: string): string {
  for (const rule of TYPE_RULES) {
    if (rule.test(files, diff)) return rule.type;
  }
  // Mixed or unclassified changes
  const hasNew = files.some((f) => f.status === 'added');
  const hasDeleted = files.some((f) => f.status === 'deleted');
  if (hasNew && !hasDeleted) return 'feat';
  if (!hasNew && hasDeleted) return 'chore';
  return 'chore';
}

// --- Scope detection ---

function detectScope(files: FileStat[]): string | null {
  if (files.length === 0) return null;

  const dirs = files.map((f) => {
    const parts = f.path.split('/');
    return parts.length > 1 ? parts.slice(0, -1).join('/') : '';
  });

  // Find the longest common prefix directory
  const first = dirs[0];
  let common = first;
  for (const d of dirs.slice(1)) {
    while (!d.startsWith(common)) {
      const idx = common.lastIndexOf('/');
      common = idx > 0 ? common.slice(0, idx) : '';
      if (!common) return null;
    }
  }

  return common || null;
}

// --- Description building ---

function buildDescription(files: FileStat[]): string {
  if (files.length === 0) return 'update files';

  const added = files.filter((f) => f.status === 'added').map((f) => basename(f.path));
  const modified = files.filter((f) => f.status === 'modified').map((f) => basename(f.path));
  const deleted = files.filter((f) => f.status === 'deleted').map((f) => basename(f.path));
  const renamed = files.filter((f) => f.status === 'renamed').map((f) => basename(f.path));

  const parts: string[] = [];
  if (added.length) parts.push(`add ${listNames(added)}`);
  if (modified.length) parts.push(`update ${listNames(modified)}`);
  if (deleted.length) parts.push(`remove ${listNames(deleted)}`);
  if (renamed.length) parts.push(`rename ${listNames(renamed)}`);

  return parts.join(', ');
}

function listNames(names: string[]): string {
  if (names.length <= 3) return names.join(', ');
  return `${names.slice(0, 2).join(', ')} +${names.length - 2} more`;
}

function basename(p: string): string {
  return p.split('/').pop() ?? p;
}

// --- Public API ---

export function generateCommitMessage(diff: string): string {
  const files = parseFiles(diff);
  const type = detectType(files, diff);
  const scope = detectScope(files);
  const description = buildDescription(files);

  const scopePart = scope ? `(${scope})` : '';
  const subject = `${type}${scopePart}: ${description}`;

  // Truncate to 72 chars if needed
  return subject.length <= 72 ? subject : subject.slice(0, 69) + '...';
}
