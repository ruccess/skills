#!/usr/bin/env node
/**
 * External-execution mode, step 2: attach one externally produced transcript.
 *
 *   node evals/collect.mjs <run-dir> --key <task-arm-rep> --transcript <jsonl> [--force]
 *
 * Copies the transcript into the run's result folder and fills the record fields
 * score.mjs reads (result, exit_code, is_error, transcript, num_turns). Cost is
 * unknown for an external session and stays null. When every record is
 * collected, the manifest is marked complete.
 */

import { cpSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { readTranscriptEntries } from './lib/transcript.mjs';

const USAGE = 'usage: node evals/collect.mjs <run-dir> --key <task-arm-rep> --transcript <jsonl> [--force]';
// Subagent transcripts end with the report inside a tool_use input (e.g.
// SubagentHandback) rather than a text block.
const HANDBACK_TOOL = /handback/i;

/** Parse the positional run dir, `--key`, `--transcript`, and the `--force` switch. */
function parseCollectArgs(argv) {
  const args = { force: false };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--force') args.force = true;
    else if (token === '--key' || token === '--transcript') {
      args[token.slice(2)] = argv[i + 1];
      i += 1;
    } else if (token.startsWith('--')) throw new Error(`unknown option ${token}\n${USAGE}`);
    else if (args.runDir === undefined) args.runDir = token;
    else throw new Error(`unexpected argument ${token}\n${USAGE}`);
  }
  if (!args.runDir || !args.key || !args.transcript) throw new Error(USAGE);
  return args;
}

/** Content blocks of one assistant entry. */
function blocksOf(entry) {
  const content = entry.message?.content;
  if (typeof content === 'string') return [{ type: 'text', text: content }];
  return Array.isArray(content) ? content : [];
}

/** Longest string value among an object's own fields. */
function longestString(input) {
  const strings = Object.values(input ?? {}).filter((value) => typeof value === 'string');
  return strings.reduce((best, value) => (value.length > best.length ? value : best), '') || null;
}

/**
 * The run's final answer. One model response is split over several assistant
 * entries sharing `message.id`; if the last response carries a handback tool_use,
 * its longest string input is the answer, otherwise the last text block wins.
 */
function finalAnswer(entries) {
  const assistants = entries.filter((entry) => entry?.type === 'assistant');
  if (assistants.length === 0) return null;
  const lastId = assistants.at(-1).message?.id;
  const lastResponse = lastId ? assistants.filter((entry) => entry.message?.id === lastId) : [assistants.at(-1)];
  const handback = lastResponse
    .flatMap(blocksOf)
    .filter((block) => block?.type === 'tool_use' && HANDBACK_TOOL.test(block.name ?? ''))
    .at(-1);
  if (handback) return longestString(handback.input);
  const texts = assistants.flatMap(blocksOf).filter((block) => block?.type === 'text' && block.text?.trim());
  return texts.at(-1)?.text ?? null;
}

/** Number of model responses (by message.id) that contain at least one tool_use. */
function countToolTurns(entries) {
  const responses = new Set();
  entries.forEach((entry, index) => {
    if (entry?.type !== 'assistant') return;
    if (!blocksOf(entry).some((block) => block?.type === 'tool_use')) return;
    responses.add(entry.message?.id ?? `entry-${index}`);
  });
  return responses.size;
}

function main() {
  const { runDir, key, transcript, force } = parseCollectArgs(process.argv.slice(2));
  const manifestFile = join(resolve(runDir), 'runs.json');
  if (!existsSync(manifestFile)) throw new Error(`no runs.json in ${resolve(runDir)}`);
  const manifest = JSON.parse(readFileSync(manifestFile, 'utf8'));
  const index = manifest.runs.findIndex((run) => `${run.task}-${run.arm}-${run.rep}` === key);
  if (index === -1) throw new Error(`unknown run key "${key}"`);
  const current = manifest.runs[index];
  if (current.status === 'collected' && !force) {
    throw new Error(`run "${key}" is already collected (use --force to replace it)`);
  }
  const source = resolve(transcript);
  if (!existsSync(source)) throw new Error(`transcript not found: ${source}`);

  const destination = join(current.result_dir, 'transcript.jsonl');
  cpSync(source, destination);
  const entries = readTranscriptEntries(destination);
  const updated = {
    ...current,
    status: 'collected',
    exit_code: 0,
    is_error: false,
    result: finalAnswer(entries),
    transcript: destination,
    transcript_source: source,
    total_cost_usd: null,
    num_turns: countToolTurns(entries),
  };
  const runs = manifest.runs.map((run, i) => (i === index ? updated : run));
  const collected = runs.filter((run) => run.status === 'collected').length;
  const complete = collected === runs.length && runs.length === (manifest.expected_runs ?? runs.length);
  writeFileSync(manifestFile, JSON.stringify({ ...manifest, complete, runs }, null, 2));
  console.log(`collected ${key} (${collected}/${runs.length})${complete ? ' — complete' : ''}`);
}

try {
  main();
} catch (error) {
  console.error(`eval collect failed: ${error.message}`);
  process.exitCode = 1;
}
