import { chromium, type Browser, type Page } from 'playwright';
import type { ComplaintType } from '../complaints/types.js';
import type { SubmissionResult } from './types.js';
import { submitSnowIce } from './forms/snow-ice.js';
import { notImplemented } from './forms/not-implemented.js';
import { takeScreenshot } from './portal-helpers.js';

export type { SubmissionResult } from './types.js';

export class PlaywrightSubmitter {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private headless: boolean;

  constructor(headless = false) {
    this.headless = headless;
  }

  async init(): Promise<void> {
    this.browser = await chromium.launch({
      headless: this.headless,
      slowMo: 100,
    });
    this.page = await this.browser.newPage();
  }

  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
    }
  }

  /** Reset page state between complaints to avoid singleton poisoning */
  private async resetPageState(): Promise<void> {
    if (this.page) {
      await this.page.goto('about:blank');
    }
  }

  async submit(
    type: ComplaintType,
    fields: Record<string, string | boolean | null>
  ): Promise<SubmissionResult> {
    if (!this.page) {
      await this.init();
    }

    try {
      await this.resetPageState();

      switch (type) {
        case 'snow-ice':
          return await submitSnowIce(this.page!, fields);
        case 'illegal-parking':
        case 'heat-hot-water':
        case 'traffic-signal':
        case 'missed-collection':
          return notImplemented(type);
        default:
          return { success: false, error: `Unknown complaint type: ${type}` };
      }
    } catch (error) {
      const screenshot = await takeScreenshot(this.page!);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        screenshot,
      };
    }
  }
}

// Singleton management
let submitter: PlaywrightSubmitter | null = null;

export async function getSubmitter(headless = false): Promise<PlaywrightSubmitter> {
  if (!submitter) {
    submitter = new PlaywrightSubmitter(headless);
    await submitter.init();
  }
  return submitter;
}

export async function closeSubmitter(): Promise<void> {
  if (submitter) {
    await submitter.close();
    submitter = null;
  }
}
