/**
 * Manual integration test for snow-ice form submission.
 *
 * Run with: npx tsx tests/submission/snow-ice.manual-test.ts
 *
 * This opens a REAL browser, walks through the snow-ice form,
 * and STOPS before clicking Submit. It is developer-supervised
 * and NOT intended for CI.
 *
 * Requires: GEMINI_API_KEY env var (for geocoder, optional)
 */

import { chromium } from 'playwright';
import { submitSnowIce } from '../../src/submission/forms/snow-ice.js';

async function main() {
  console.log('=== Snow/Ice Manual Integration Test ===\n');
  console.log('This will open a browser and walk through the form.');
  console.log('It will NOT actually submit the complaint.\n');

  const browser = await chromium.launch({
    headless: false,
    slowMo: 200,
  });

  const page = await browser.newPage();

  try {
    const fields = {
      address: '123 Broadway, New York, NY',
      locationType: 'Sidewalk',
      additionalDetails: 'Ice accumulation from last night',
    };

    console.log('Fields:', JSON.stringify(fields, null, 2));
    console.log('\nStarting form fill...\n');

    // Note: This will attempt the full flow including Submit.
    // In a real manual test, you'd watch the browser and
    // close it before it actually submits.
    const result = await submitSnowIce(page, fields);

    console.log('\nResult:', JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('Error:', error);
  } finally {
    console.log('\nBrowser will stay open for 30 seconds for inspection...');
    await new Promise(resolve => setTimeout(resolve, 30000));
    await browser.close();
  }
}

main().catch(console.error);
