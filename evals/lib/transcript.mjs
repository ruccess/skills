/**
 * Transcript helpers shared by run.mjs, score.mjs, and behavior.mjs.
 */

import { existsSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, relative, resolve } from 'node:path';

/** Claude Code's transcript root. Read lazily so a test can move HOME. */
const projectsDir = () => join(homedir(), '.claude', 'projects');

/** <slug> is the absolute cwd with every non-alphanumeric character replaced by a dash. */
const slugOf = (path) => path.replace(/[^a-zA-Z0-9]/g, '-');

/**
 * Claude Code stores transcripts at ~/.claude/projects/<slug>/<session-id>.jsonl.
 * The slug follows the process cwd, which is the resolved path: on macOS a tmpdir
 * under /var/... runs as /private/var/..., so both spellings are tried. The slug
 * rule is an undocumented implementation detail, so a session-id scan stays as
 * the fallback.
 */
export function findTranscript(workDir, sessionId) {
  if (!sessionId) return null;
  const root = projectsDir();
  const slugs = new Set([slugOf(workDir)]);
  try {
    slugs.add(slugOf(realpathSync(workDir)));
  } catch {
    // A vanished work dir still gets the literal slug and the scan below.
  }
  for (const slug of slugs) {
    const direct = join(root, slug, `${sessionId}.jsonl`);
    if (existsSync(direct)) return direct;
  }

  if (!existsSync(root)) return null;
  for (const entry of readdirSync(root)) {
    const candidate = join(root, entry, `${sessionId}.jsonl`);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/** Parse a transcript leniently: unreadable files give [], malformed lines are skipped. */
export function readTranscriptEntries(path) {
  if (!path || !existsSync(path)) return [];
  let content;
  try {
    content = readFileSync(path, 'utf8');
  } catch {
    return [];
  }
  const entries = [];
  for (const line of content.split('\n')) {
    if (!line.trim()) continue;
    try {
      const entry = JSON.parse(line);
      if (entry !== null && typeof entry === 'object' && !Array.isArray(entry)) entries.push(entry);
    } catch {
      // Skip the line; skill extraction does not need every event.
    }
  }
  return entries;
}

/** Every assistant message as content blocks, in transcript order. */
export function assistantContents(entries) {
  return entries
    .filter((entry) => entry?.type === 'assistant')
    .map((entry) => {
      const content = entry.message?.content;
      if (typeof content === 'string') return [{ type: 'text', text: content }];
      return Array.isArray(content) ? content : [];
    });
}

/**
 * Skill names loaded during the run, in first-seen order.
 *
 * The Skill tool records its target as `input.skill`, e.g. "ruccess:dev-ship".
 * The plugin prefix is stripped so the control arm (which cannot load plugin
 * skills at all) and the treatment arm print comparable names.
 *
 * An external executor has no Skill tool and reads `<skillsDir>/<name>/SKILL.md`
 * instead. Pass `skillsDir` for such a run and those Reads count as loads too.
 */
export function skillInvocations(entries, { skillsDir = null } = {}) {
  const seen = [];
  const add = (name) => {
    if (name && !seen.includes(name)) seen.push(name);
  };
  for (const content of assistantContents(entries)) {
    for (const block of content) {
      if (block?.type !== 'tool_use') continue;
      if (block.name === 'Skill') {
        const raw = block.input?.skill ?? block.input?.command ?? block.input?.name;
        if (raw) add(String(raw).replace(/^ruccess:/, ''));
      } else if (block.name === 'Read' && skillsDir) {
        add(skillReadName(block.input?.file_path, skillsDir));
      }
    }
  }
  return seen;
}

/** macOS reports /var/... as /private/var/...; compare both spellings as one. */
const canonicalPath = (path) => resolve(path).replace(/^\/private(?=\/)/, '');

/** The skill name when `filePath` is exactly `<skillsDir>/<name>/SKILL.md`, else null. */
function skillReadName(filePath, skillsDir) {
  if (!filePath) return null;
  const rel = relative(canonicalPath(String(skillsDir)), canonicalPath(String(filePath)));
  const match = /^([^/\\]+)[/\\]SKILL\.md$/.exec(rel);
  return match && match[1] !== '..' ? match[1] : null;
}
