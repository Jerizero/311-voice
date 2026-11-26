#!/usr/bin/env node

import { createInterface } from 'readline';
import { Command } from 'commander';
import { ConversationManager } from './conversation/manager.js';
import { getAllTemplates } from './complaints/templates/index.js';
import { promptLabel } from './conversation/prompt-label.js';

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

function wrap(text: string, width: number): string {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    if (line && line.length + word.length + 1 > width) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  return [...lines, line].join('\n');
}

const WELCOME = `
╔══════════════════════════════════════════════════════════╗
║                     311-voice                             ║
║        NYC 311 Complaints via Natural Language           ║
╚══════════════════════════════════════════════════════════╝

Describe your issue in plain English. I'll gather the details, geocode the
location, open the right NYC 311 form in your browser, and hand you the final
click. Paste back the SR number and I'll track its status for you.

${wrap('Types: ' + getAllTemplates().map((t) => t.displayName.toLowerCase()).join(' · '), 76)}

Commands: "history" · "track" · "help" · "cancel" · "quit"
`;

const HELP = `
How this works:
1. Tell me what's wrong and where (e.g. "snow on the sidewalk at 123 Main St").
2. I confirm the details, then open the NYC 311 form in your browser with a
   copy-paste description and the exact spot to pin.
3. You do the final map-pin + Submit (NYC has no submission API, so this step
   is yours), then paste the SR number back to me.
4. Run "track" a day or two later to check the live status via NYC Open Data.

Commands:
  history   list your complaints and their status
  track     check filed complaints against NYC Open Data
  cancel    drop the complaint in progress
  help      show this (works any time)
  quit      exit
`;

async function main() {
  // Check for API key
  if (!process.env.GEMINI_API_KEY && !process.env.GOOGLE_API_KEY) {
    console.error('\n❌ GEMINI_API_KEY environment variable not set.');
    console.error('   Set it with: export GEMINI_API_KEY=your_key_here\n');
    process.exit(1);
  }

  console.log(WELCOME);

  if (!options.browser) {
    console.log('(Browser submission disabled - complaints will be saved locally)\n');
  }

  const manager = new ConversationManager(undefined, options.browser);

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const prompt = () => {
    rl.question('\n' + promptLabel(manager.getState()), async (input) => {
      const trimmed = input.trim();

      if (!trimmed) {
        prompt();
        return;
      }

      const cmd = trimmed.toLowerCase();

      if (cmd === 'quit' || cmd === 'exit') {
        console.log('\nGoodbye!\n');
        rl.close();
        process.exit(0);
      }

      // Direct commands bypass the LLM for speed and reliability. Only exact one-word
      // inputs count, so a description that mentions "help" still reaches the LLM.
      const state = manager.getState();
      const gathering =
        state.currentComplaint !== null && !state.awaitingConfirmation && !state.awaitingSubmissionNumber;
      const midComplaint = gathering || state.awaitingConfirmation || state.awaitingSubmissionNumber;

      if (cmd === 'help' || cmd === '?') {
        console.log(HELP);
        prompt();
        return;
      }

      // Confirmation and SR-number steps already handle "cancel" (the SR step keeps
      // the draft), so only the gathering step needs it here.
      if (gathering && cmd === 'cancel') {
        manager.reset();
        console.log('\nDropped. What would you like to report?');
        prompt();
        return;
      }

      if (midComplaint && (cmd === 'track' || cmd === 'history')) {
        console.log(`\nFinish this complaint first, or type cancel. (${promptLabel(state).slice(0, -2)})`);
        prompt();
        return;
      }

      if (cmd === 'track') {
        try {
          console.log('\n' + (await manager.trackComplaints()));
        } catch (error) {
          console.error('\n❌ Error:', error instanceof Error ? error.message : 'unknown');
        }
        prompt();
        return;
      }

      if (cmd === 'history') {
        console.log('\n' + manager.showHistory());
        prompt();
        return;
      }

      try {
        const response = await manager.processMessage(trimmed);
        console.log('\n' + response);
      } catch (error) {
        if (error instanceof Error) {
          console.error('\n❌ Error:', error.message);
        } else {
          console.error('\n❌ An unexpected error occurred');
        }
      }

      prompt();
    });
  };

  prompt();
}

main().catch((error) => {
  console.error('\n❌', error instanceof Error ? error.message : 'unexpected error');
  process.exit(1);
});
