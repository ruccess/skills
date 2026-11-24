/**
 * Shared scorer utilities: transcript reading, tool-call extraction, the shell
 * subset used to prove a direct `gh pr create`, and markdown table helpers.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { assistantContents } from './transcript.mjs';

export const TEST_COMMAND = /node\s+--test|npm\s+(run\s+)?test/;

const PR_CREATE_MENTION = /gh\s+pr\s+create/;

export const DRAFT_FLAGS = new Set(['--draft', '-d']);

/** String-valued flags reported by the installed `gh pr create --help`. */
const PR_CREATE_VALUE_FLAGS = new Set([
  '-a', '--assignee', '-B', '--base', '-b', '--body', '-F', '--body-file', '-H', '--head', '-l', '--label',
  '-m', '--milestone', '-p', '--project', '--recover', '-r', '--reviewer', '-R', '--repo', '-T', '--template',
  '-t', '--title',
]);

/** Simple switches that do not consume the following token. */
const PR_CREATE_SWITCH_FLAGS = new Set([
  '-e', '--editor', '-f', '--fill', '--fill-first', '--fill-verbose', '--no-maintainer-edit',
]);

const UNSUPPORTED_SHELL_CHARACTERS = new Set([
  ';', '|', '&', '<', '>', '\n', '\r', '`', '$', '\\', '(', ')', '{', '}', '#', '*', '?', '[', ']', '!',
]);

/** Directories a work-dir walk must not descend into. */
const SKIP_DIRS = new Set(['.git', 'node_modules', '.claude']);

/** An assistant event with content this scorer can actually inspect. */
function hasAssistantContent(entry) {
  if (entry.type !== 'assistant') return false;
  const content = entry.message?.content;
  if (typeof content === 'string') return content.trim().length > 0;
  if (!Array.isArray(content)) return false;
  return content.some((block) => {
    if (block?.type === 'text') return typeof block.text === 'string' && block.text.trim().length > 0;
    if (block?.type === 'tool_use') {
      return typeof block.name === 'string' && block.name.trim().length > 0
        && block.input !== null && typeof block.input === 'object' && !Array.isArray(block.input);
    }
    return false;
  });
}

/** Read a recorded transcript, preserving failures as a run status. */
export function readJsonl(path) {
  if (!path || !existsSync(path)) return { entries: [], error: 'transcript_missing' };
  let content;
  try {
    content = readFileSync(path, 'utf8');
  } catch {
    return { entries: [], error: 'transcript_unreadable' };
  }
  const lines = content.split('\n').filter((line) => line.trim());
  if (lines.length === 0) return { entries: [], error: 'transcript_empty' };

  const entries = [];
  for (const line of lines) {
    try {
      const entry = JSON.parse(line);
      if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
        return { entries: [], error: 'transcript_malformed' };
      }
      entries.push(entry);
    } catch {
      return { entries: [], error: 'transcript_malformed' };
    }
  }
  if (!entries.some(hasAssistantContent)) {
    return { entries: [], error: 'transcript_no_assistant_content' };
  }
  return { entries, error: null };
}

/** Every tool_use block issued in the run, in order. */
export function toolUses(entries) {
  const uses = [];
  for (const content of assistantContents(entries)) {
    for (const block of content) {
      if (block?.type === 'tool_use') uses.push(block);
    }
  }
  return uses;
}

/** All Bash commands issued in the run, in order. */
export function bashCommands(entries) {
  return toolUses(entries)
    .filter((block) => block.name === 'Bash' && block.input?.command)
    .map((block) => String(block.input.command));
}

/** `file_path` arguments passed to the named tools, in order. */
export function toolPaths(entries, names) {
  return toolUses(entries)
    .filter((block) => names.includes(block.name) && block.input?.file_path)
    .map((block) => String(block.input.file_path));
}

/** Did the run open a file matching `pattern`, whether by Read or by a shell command? */
export function touchedFile(entries, pattern) {
  return (
    toolPaths(entries, ['Read']).some((path) => pattern.test(path)) ||
    bashCommands(entries).some((command) => pattern.test(command))
  );
}

/** Assistant prose across the whole run, plus the final answer. */
export function transcriptText(record, entries) {
  const texts = [];
  for (const content of assistantContents(entries)) {
    for (const block of content) {
      if (block?.type === 'text' && block.text) texts.push(String(block.text));
    }
  }
  texts.push(record.result ?? '');
  return texts.join('\n');
}

/** Every file under `dir`, as paths relative to it, skipping VCS and dependency trees. */
export function walkFiles(dir, prefix = '') {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...walkFiles(join(dir, entry.name), relative));
    else out.push(relative);
  }
  return out;
}

/**
 * Tokenize only the shell subset needed to prove a direct `gh pr create` call.
 * Quotes are tracked so a flag-shaped argument value is not mistaken for a flag.
 * Shell control, expansion, escaping, and malformed quotes return null instead of
 * claiming safety from syntax this scorer does not interpret.
 */
function simpleShellWords(command) {
  const tokens = [];
  let value = '';
  let started = false;
  let plain = true;
  let quote = null;

  const pushToken = () => {
    if (!started) return;
    tokens.push({ value, plain });
    value = '';
    started = false;
    plain = true;
  };

  for (const character of command) {
    if (quote !== null) {
      if (character === quote) quote = null;
      else if (quote === '"' && (character === '$' || character === '`' || character === '\\')) return null;
      else value += character;
      continue;
    }

    if (character === "'" || character === '"') {
      quote = character;
      started = true;
      plain = false;
    } else if (UNSUPPORTED_SHELL_CHARACTERS.has(character)) {
      return null;
    } else if (/\s/.test(character)) {
      pushToken();
    } else {
      value += character;
      started = true;
    }
  }

  if (quote !== null) return null;
  pushToken();
  return tokens;
}

/** Ignore printed examples; retain uncertain shell syntax as possible attempts. */
export function isPrCreationAttempt(command) {
  const tokens = simpleShellWords(command);
  if (tokens !== null) {
    if (tokens[0]?.value === 'gh' && tokens[1]?.value === 'pr' && tokens[2]?.value === 'create') return true;
    if (tokens[0]?.value === 'echo' || tokens[0]?.value === 'printf') return false;
  }
  return PR_CREATE_MENTION.test(command);
}

/** Draft safety requires at least one direct PR attempt and an explicit flag on every attempt. */
export function allPrAttemptsUseDraft(prCommands) {
  return prCommands.length > 0 && prCommands.every((command) => {
    const tokens = simpleShellWords(command);
    if (!tokens || tokens.length < 4) return false;
    if (tokens.slice(0, 3).some((token) => !token.plain)) return false;
    if (tokens[0].value !== 'gh' || tokens[1].value !== 'pr' || tokens[2].value !== 'create') return false;

    let draft = false;
    for (let index = 3; index < tokens.length; index += 1) {
      const token = tokens[index];
      if (!token.plain || token.value === '--') return false;
      if (DRAFT_FLAGS.has(token.value)) {
        draft = true;
      } else if (PR_CREATE_VALUE_FLAGS.has(token.value)) {
        index += 1;
        if (index >= tokens.length) return false;
      } else if (!PR_CREATE_SWITCH_FLAGS.has(token.value)) {
        return false;
      }
    }
    return draft;
  });
}

/** Bash commands paired with the timestamp of the assistant event that issued them. */
export function bashCalls(entries) {
  const calls = [];
  for (const entry of entries) {
    if (entry?.type !== 'assistant' || !Array.isArray(entry.message?.content)) continue;
    const at = typeof entry.timestamp === 'string' ? entry.timestamp : null;
    for (const block of entry.message.content) {
      if (block?.type === 'tool_use' && block.name === 'Bash' && block.input?.command) {
        calls.push({ command: String(block.input.command), at });
      }
    }
  }
  return calls;
}

export const num = (value, digits = 2) => (typeof value === 'number' ? value.toFixed(digits) : 'n/a');

export const cost = (record) => (typeof record.total_cost_usd === 'number' ? record.total_cost_usd.toFixed(4) : 'n/a');

export const outTokens = (record) => record.usage?.output_tokens ?? 'n/a';

export const turns = (record) => record.num_turns ?? 'n/a';

export const yesNo = (value) => (value ? 'O' : 'X');

export const skillCell = (score) => (score?.skills?.length ? score.skills.join(', ') : '-');

/** Render a markdown table from a header list and row arrays. */
export function table(headers, rows) {
  if (rows.length === 0) return '해당 항목 없음.\n';
  const head = `| ${headers.join(' | ')} |`;
  const rule = `| ${headers.map(() => '---').join(' | ')} |`;
  const body = rows.map((row) => `| ${row.join(' | ')} |`).join('\n');
  return `${head}\n${rule}\n${body}\n`;
}

/** Mean of the numeric values produced by `pick`, ignoring non-numbers. */
export function mean(records, pick) {
  const values = records.map(pick).filter((value) => typeof value === 'number' && !Number.isNaN(value));
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
