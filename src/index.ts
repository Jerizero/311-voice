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

I can help you file these types of complaints:
• Illegal Parking
• No Heat or Hot Water
• Traffic Signal Issues
• Snow/Ice on Sidewalk
• Missed Garbage Collection
• Blocked Sidewalk

Just describe your issue in plain English.
Type "history" to see past complaints, "quit" to exit.
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

      if (trimmed.toLowerCase() === 'quit' || trimmed.toLowerCase() === 'exit') {
        console.log('\nGoodbye!\n');
        rl.close();
        process.exit(0);
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
