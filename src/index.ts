#!/usr/bin/env node

import { createInterface } from 'readline';
import { Command } from 'commander';
import { ConversationManager } from './conversation/manager.js';
import { getAllTemplates, getTemplate } from './complaints/templates/index.js';
import type { ConversationState } from './complaints/types.js';

const program = new Command();

program
  .name('311-voice')
  .description('NYC 311 Complaints via Natural Language')
  .option('--no-browser', 'Disable browser submission (save locally only)')
  .option('--verbose', 'Enable debug logging')
  .parse();

const options = program.opts<{ browser: boolean; verbose: boolean }>();

if (options.verbose) {
  process.env.LOG_LEVEL = 'debug';
}

const TYPE_LIST = getAllTemplates().map((t) => t.displayName).join(', ');

const WELCOME = `
NYC 311, in plain English.

Say what's wrong and where. I'll gather the rest, open the right city form in
your browser, and wait while you pin the map and submit. Paste the SR number
back and I can check its status later.

I file: ${TYPE_LIST}

history  track  help  cancel  quit
`;

const HELP = `
How this works:
1. Describe the problem and the place (example: snow on the sidewalk at 123 Main St).
2. I'll confirm, then open the NYC 311 form with a copy-paste description and the pin spot.
3. You pin the map and Submit. NYC has no filing API, so that last click is yours.
4. Paste the SR number here. A day or two later, type track to see the live city status.

The prompt tells you what I'm waiting for. Mid-complaint, history and track wait
until you finish or type cancel.

Commands:
  history   your complaints and their status
  track     refresh filed ones from NYC Open Data
  cancel    drop the complaint in progress
  help      show this
  quit      exit (drafts already handed off stay saved)
`;

function inFlight(state: ConversationState): boolean {
  return (
    state.currentComplaint !== null ||
    state.awaitingConfirmation ||
    state.awaitingSubmissionNumber
  );
}

function promptLabel(state: ConversationState): string {
  if (state.awaitingSubmissionNumber) return 'paste SR (or skip)> ';
  if (state.awaitingConfirmation) return 'look right? (yes / edit / cancel)> ';
  const type = state.currentComplaint?.type;
  if (type) {
    const template = getTemplate(type);
    const missing = template.requiredFields.find((f) => state.gatheredFields[f.name] == null);
    if (missing) return `${template.displayName}, still need ${missing.label}> `;
    return `${template.displayName}> `;
  }
  return '> ';
}

function fail(error: unknown): void {
  const msg = error instanceof Error ? error.message : 'unexpected error';
  console.error('\nError:', msg);
}

async function main() {
  if (!process.env.GEMINI_API_KEY && !process.env.GOOGLE_API_KEY) {
    console.error('\nGEMINI_API_KEY is not set.');
    console.error('  export GEMINI_API_KEY=your_key_here\n');
    process.exit(1);
  }

  console.log(WELCOME);

  if (!options.browser) {
    console.log('(Browser off: drafts save locally, no city form opens)\n');
  }

  const manager = new ConversationManager(undefined, options.browser);

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const prompt = () => {
    rl.question('\n' + promptLabel(manager.getState()), async (input) => {
      const trimmed = input.trim();
      const state = manager.getState();
      const busy = inFlight(state);

      if (!trimmed) {
        if (busy) {
          console.log('(still on this complaint; add the missing piece, or type cancel)');
        }
        prompt();
        return;
      }

      const cmd = trimmed.toLowerCase();

      if (cmd === 'quit' || cmd === 'exit') {
        if (state.awaitingSubmissionNumber) {
          console.log('\nDraft is saved. Goodbye.\n');
        } else if (busy) {
          console.log('\nUnfinished answers were not saved. Goodbye.\n');
        } else {
          console.log('\nGoodbye.\n');
        }
        rl.close();
        process.exit(0);
      }

      if (cmd === 'help' || cmd === '?') {
        console.log(HELP);
        prompt();
        return;
      }

      if (cmd === 'cancel' || cmd === 'nevermind' || cmd === 'never mind') {
        if (!busy) {
          console.log('\nNothing in progress.');
        } else {
          manager.reset();
          console.log('\nDropped. What would you like to report?');
        }
        prompt();
        return;
      }

      if (cmd === 'track' || cmd === 'history') {
        if (busy) {
          console.log(
            `\nFinish this complaint or type cancel first. (${promptLabel(state).trim()})`,
          );
          prompt();
          return;
        }
        try {
          console.log('\n' + (cmd === 'track' ? await manager.trackComplaints() : manager.showHistory()));
        } catch (error) {
          fail(error);
        }
        prompt();
        return;
      }

      if (false) {
      if (!midComplaint && cmd === 'track') {
        try {
          console.log('\n' + (await manager.trackComplaints()));
        } catch (error) {
          console.error('\n❌ Error:', error instanceof Error ? error.message : 'unknown');
        }
        prompt();
        return;
      }
      try {
        const response = await manager.processMessage(trimmed);
        console.log('\n' + response);
      } catch (error) {
        fail(error);
      }

      prompt();
    });
  };

  prompt();
}

main();
