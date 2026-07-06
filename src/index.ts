#!/usr/bin/env node

import { createInterface } from 'readline';
import { Command } from 'commander';
import { ConversationManager } from './conversation/manager.js';

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

const WELCOME = `
╔══════════════════════════════════════════════════════════╗
║                     311-voice                             ║
║        NYC 311 Complaints via Natural Language           ║
╚══════════════════════════════════════════════════════════╝

Describe your issue in plain English. I'll gather the details, geocode the
location, open the right NYC 311 form in your browser, and hand you the final
click. Paste back the SR number and I'll track its status for you.

Types: illegal parking · no heat/hot water · traffic signal · snow or ice ·
missed collection · blocked sidewalk

Commands: "history" · "track" · "help" · "quit"
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
  help      show this
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
    rl.question('\n> ', async (input) => {
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

      // Direct commands bypass the LLM for speed and reliability. They only fire
      // when not mid-complaint, so words like "help" can't hijack a description.
      const midComplaint =
        manager.getState().currentComplaint !== null ||
        manager.getState().awaitingConfirmation ||
        manager.getState().awaitingSubmissionNumber;

      if (!midComplaint && (cmd === 'help' || cmd === '?')) {
        console.log(HELP);
        prompt();
        return;
      }

      if (!midComplaint && cmd === 'track') {
        try {
          console.log('\n' + (await manager.trackComplaints()));
        } catch (error) {
          console.error('\n❌ Error:', error instanceof Error ? error.message : 'unknown');
        }
        prompt();
        return;
      }

      if (!midComplaint && cmd === 'history') {
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

main();
