import type { Page } from 'playwright';
import { logger } from '../utils/logger.js';

/** Retry an operation with exponential backoff */
export async function withRetry<T>(
  operation: () => Promise<T>,
  maxRetries = 3,
  baseDelayMs = 500
): Promise<T> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      logger.debug(`  → Retry ${attempt + 1}/${maxRetries} after error: ${lastError.message}`);
      await new Promise(resolve => setTimeout(resolve, baseDelayMs * Math.pow(2, attempt)));
    }
  }
  throw lastError || new Error('Operation failed after retries');
}

/** Check for form validation errors. Returns error text or null. */
export async function checkForErrors(page: Page): Promise<string | null> {
  const errorSelectors = [
    '.error-message',
    '.validation-error',
    '.field-validation-error',
    '[class*="error"]:not([role="alert"])',
  ];

  for (const selector of errorSelectors) {
    const errorLocator = page.locator(selector);
    if (await errorLocator.first().isVisible({ timeout: 300 }).catch(() => false)) {
      const text = await errorLocator.first().textContent();
      if (text && text.trim().length > 0) {
        return text.trim();
      }
    }
  }

  const requiredError = page.locator('text=/required|invalid|please enter|must be/i').first();
  if (await requiredError.isVisible({ timeout: 300 }).catch(() => false)) {
    const parent = requiredError.locator('..');
    const hasErrorClass = await parent.evaluate(el => {
      return el.className.toLowerCase().includes('error') ||
             el.className.toLowerCase().includes('invalid');
    }).catch(() => false);
    if (hasErrorClass) {
      return await requiredError.textContent() || 'Validation error';
    }
  }

  return null;
}

/** Wait for step change by detecting URL hash or step indicator change */
export async function waitForStepChange(
  page: Page,
  previousStep: string | null,
  timeoutMs = 5000
): Promise<boolean> {
  const startTime = Date.now();
  while (Date.now() - startTime < timeoutMs) {
    const currentUrl = page.url();
    const hashMatch = currentUrl.match(/#step-?(\d+)/i);
    const currentStep = hashMatch?.[1] || null;

    if (currentStep && currentStep !== previousStep) {
      return true;
    }

    const stepIndicator = page.locator('.step-indicator, [aria-current="step"], .wizard-step.active').first();
    if (await stepIndicator.isVisible().catch(() => false)) {
      return true;
    }

    await page.waitForTimeout(200);
  }
  return false;
}

/** Take a screenshot and return as base64 */
export async function takeScreenshot(page: Page): Promise<string | undefined> {
  try {
    const buffer = await page.screenshot();
    return buffer.toString('base64');
  } catch {
    return undefined;
  }
}

/** Detect if address is non-traditional (intersection, bridge, landmark) */
export function isNonTraditionalAddress(address: string): boolean {
  const patterns = [
    /\band\b/i,
    /bridge/i,
    /park\b/i,
    /plaza/i,
    /square/i,
    /circle/i,
    /\bat\b.*\bat\b/i,
    /corner of/i,
    /intersection/i,
  ];
  return patterns.some(p => p.test(address));
}

/** Extract nearby street addresses from an intersection/landmark description */
export function extractNearbyAddress(address: string): string[] {
  const alternatives: string[] = [];

  const andMatch = address.match(/(\d+)(?:st|nd|rd|th)?\s+(?:street\s+)?and\s+(.+)/i);
  if (andMatch) {
    const streetNum = andMatch[1];
    const crossStreet = andMatch[2].replace(/,?\s*new york.*$/i, '').trim();
    alternatives.push(`${streetNum} ${crossStreet}, New York, NY`);
    alternatives.push(`1 ${crossStreet}, New York, NY`);
    alternatives.push(`W ${streetNum}th Street, New York, NY`);
    alternatives.push(`${streetNum}th Street and ${crossStreet}, New York, NY`);
  }

  if (address.toLowerCase().includes('bridge')) {
    const streetMatch = address.match(/(\d+)(?:st|nd|rd|th)/i);
    if (streetMatch) {
      alternatives.push(`W ${streetMatch[1]}th Street, New York, NY`);
    }
  }

  const withStreet = address.replace(/(\d+(?:st|nd|rd|th))\s+and\s+/i, '$1 Street and ');
  if (withStreet !== address) {
    alternatives.push(`${withStreet}, New York, NY`);
  }

  alternatives.push(`${address}, New York, NY`);
  return alternatives;
}
