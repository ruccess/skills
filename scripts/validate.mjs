#!/usr/bin/env node
/**
 * Marketplace validator for the ruccess skills suite.
 *
 * Zero dependencies on purpose: this runs in CI with nothing but a Node runtime.
 * Frontmatter is parsed by hand (see parseFrontmatter) rather than pulling in a
 * YAML library, because SKILL.md frontmatter here is a flat key/value block.
 *
 * Exit 0 = all checks passed (warnings may still be printed).
 * Exit 1 = at least one error; every error is printed as `path: message`.
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SKILLS_DIR = join(REPO_ROOT, 'skills');
const PLUGIN_JSON = join(REPO_ROOT, '.claude-plugin', 'plugin.json');
const MARKETPLACE_JSON = join(REPO_ROOT, '.claude-plugin', 'marketplace.json');

const DESCRIPTION_MAX_CHARS = 1024;
const DESCRIPTION_PREFIX = 'Use ';
const BODY_LINE_BUDGET = 120;
const PLUGIN_NAME = 'ruccess';

const errors = [];
const warnings = [];

/** Record an error against a repo-relative path. */
const fail = (path, message) => errors.push(`${rel(path)}: ${message}`);
/** Record a non-fatal warning against a repo-relative path. */
const warn = (path, message) => warnings.push(`${rel(path)}: ${message}`);
const rel = (path) => relative(REPO_ROOT, path) || path;

/**
 * Parse a leading `---` fenced frontmatter block into a flat object.
 *
 * Supports `key: value`, single/double quoted values, and YAML-style
 * continuation lines (an indented line continues the previous key's value).
 * Returns { ok: false, reason } when no well-formed block is present.
 */
function parseFrontmatter(raw) {
  const lines = raw.split(/\r?\n/);
  if (lines[0]?.trim() !== '---') {
    return { ok: false, reason: 'missing YAML frontmatter (file must start with ---)' };
  }

  const closingIndex = lines.findIndex((line, i) => i > 0 && line.trim() === '---');
  if (closingIndex === -1) {
    return { ok: false, reason: 'unterminated YAML frontmatter (no closing ---)' };
  }

  const data = {};
  let lastKey = null;

  for (const line of lines.slice(1, closingIndex)) {
    if (line.trim() === '' || line.trimStart().startsWith('#')) continue;

    const isContinuation = /^\s/.test(line) && lastKey !== null;
    if (isContinuation) {
      data[lastKey] = `${data[lastKey]} ${line.trim()}`.trim();
      continue;
    }

    const separator = line.indexOf(':');
    if (separator === -1) {
      return { ok: false, reason: `malformed frontmatter line: ${JSON.stringify(line)}` };
    }

    const key = line.slice(0, separator).trim();
    lastKey = key;
    data[key] = unquote(line.slice(separator + 1).trim());
  }

  return { ok: true, data, bodyLineCount: lines.length - (closingIndex + 1) };
}

/** Strip one layer of matching single or double quotes. */
function unquote(value) {
  const isQuoted =
    value.length >= 2 &&
    ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'")));
  return isQuoted ? value.slice(1, -1) : value;
}

/** Read and JSON.parse a file, recording an error instead of throwing. */
function readJson(path) {
  if (!existsSync(path)) {
    fail(path, 'file not found');
    return null;
  }
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    fail(path, `invalid JSON — ${error.message}`);
    return null;
  }
}

/** Validate every skills/<dir>/SKILL.md. */
function validateSkills() {
  if (!existsSync(SKILLS_DIR)) {
    fail(SKILLS_DIR, 'skills directory not found');
    return;
  }

  const entries = readdirSync(SKILLS_DIR).filter((name) => !name.startsWith('.'));
  if (entries.length === 0) {
    fail(SKILLS_DIR, 'no skills found');
    return;
  }

  for (const entry of entries) {
    const entryPath = join(SKILLS_DIR, entry);
    if (!statSync(entryPath).isDirectory()) {
      fail(entryPath, 'unexpected file in skills/ — every entry must be a skill directory');
      continue;
    }

    const skillPath = join(entryPath, 'SKILL.md');
    if (!existsSync(skillPath)) {
      fail(skillPath, 'skill directory has no SKILL.md');
      continue;
    }

    validateSkillFile(skillPath, entry);
  }
}

/** Validate one SKILL.md against its owning directory name. */
function validateSkillFile(skillPath, dirName) {
  const parsed = parseFrontmatter(readFileSync(skillPath, 'utf8'));
  if (!parsed.ok) {
    fail(skillPath, parsed.reason);
    return;
  }

  const { name, description } = parsed.data;

  if (!name) {
    fail(skillPath, 'frontmatter is missing required field `name`');
  } else if (name !== dirName) {
    fail(skillPath, `frontmatter name "${name}" does not match directory name "${dirName}"`);
  }

  if (!description) {
    fail(skillPath, 'frontmatter is missing required field `description`');
  } else {
    if (description.length > DESCRIPTION_MAX_CHARS) {
      fail(
        skillPath,
        `description is ${description.length} chars, exceeds the ${DESCRIPTION_MAX_CHARS} char limit`,
      );
    }
    if (!description.startsWith(DESCRIPTION_PREFIX)) {
      fail(
        skillPath,
        `description must start with "${DESCRIPTION_PREFIX}" (trigger-only convention), got ${JSON.stringify(
          description.slice(0, 40),
        )}`,
      );
    }
  }

  if (parsed.bodyLineCount > BODY_LINE_BUDGET) {
    warn(
      skillPath,
      `body is ${parsed.bodyLineCount} lines, over the ${BODY_LINE_BUDGET} line lean budget`,
    );
  }
}

/** Validate plugin.json / marketplace.json parse and agree on version. */
function validateManifests() {
  const plugin = readJson(PLUGIN_JSON);
  const marketplace = readJson(MARKETPLACE_JSON);
  if (!plugin || !marketplace) return;

  const pluginVersion = plugin.version;
  if (!pluginVersion) {
    fail(PLUGIN_JSON, 'missing required field `version`');
    return;
  }

  const metadataVersion = marketplace.metadata?.version;
  if (!metadataVersion) {
    fail(MARKETPLACE_JSON, 'missing required field `metadata.version`');
  } else if (metadataVersion !== pluginVersion) {
    fail(
      MARKETPLACE_JSON,
      `metadata.version "${metadataVersion}" does not match plugin.json version "${pluginVersion}"`,
    );
  }

  const entry = (marketplace.plugins ?? []).find((p) => p?.name === PLUGIN_NAME);
  if (!entry) {
    fail(MARKETPLACE_JSON, `plugins[] has no entry named "${PLUGIN_NAME}"`);
  } else if (entry.version !== pluginVersion) {
    fail(
      MARKETPLACE_JSON,
      `plugins["${PLUGIN_NAME}"].version "${entry.version}" does not match plugin.json version "${pluginVersion}"`,
    );
  }
}

validateSkills();
validateManifests();

for (const message of warnings) console.warn(`warning: ${message}`);

if (errors.length > 0) {
  console.error(`\n${errors.length} error(s):`);
  for (const message of errors) console.error(`  error: ${message}`);
  process.exit(1);
}

console.log(`ok: validated ${readdirSync(SKILLS_DIR).filter((n) => !n.startsWith('.')).length} skills and 2 manifests`);
