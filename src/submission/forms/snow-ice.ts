import type { Page } from 'playwright';
import type { SubmissionResult } from '../types.js';
import { COMMON, SNOW_ICE } from '../selectors.js';
import {
  withRetry,
  checkForErrors,
  takeScreenshot,
  isNonTraditionalAddress,
  extractNearbyAddress,
} from '../portal-helpers.js';
import {
  geocodeNYCLocation,
  suggestNearbyAddresses,
  calculateMapClickPosition,
  type GeocoderResult,
} from '../../geo/nyc-geocoder.js';
import { logger } from '../../utils/logger.js';

export async function submitSnowIce(
  page: Page,
  fields: Record<string, string | boolean | null>
): Promise<SubmissionResult> {
  const address = fields.address as string;
  const isNonTraditional = isNonTraditionalAddress(address);

  // Step 0: Navigate
  logger.debug('  → Navigating to snow/ice complaint page...');
  await page.goto(SNOW_ICE.url, { timeout: 60000 });
  await page.waitForLoadState('networkidle', { timeout: 30000 });

  // Click the report link
  const reportLink = page.getByText(SNOW_ICE.reportLink);
  if (await reportLink.isVisible({ timeout: 5000 })) {
    await reportLink.click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);
  } else {
    const altReportLink = page.locator('a, button').filter({ hasText: /snowy.*sidewalk|icy.*sidewalk|report.*snow/i }).first();
    if (await altReportLink.isVisible({ timeout: 2000 }).catch(() => false)) {
      await altReportLink.click();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1500);
    } else {
      return { success: false, error: 'Could not find report link on snow/ice page' };
    }
  }

  // Step 1: What - Problem details
  logger.debug('  → Step 1: Filling problem details...');
  const descriptionField = page.locator(SNOW_ICE.description);
  await descriptionField.waitFor({ state: 'visible', timeout: 10000 }).catch(() => null);

  if (await descriptionField.isVisible()) {
    const locationType = (fields.locationType as string) || 'sidewalk';
    let description = `Snow/ice accumulation on ${locationType}`;
    if (isNonTraditional) {
      description += ` near ${address}`;
      if (address.toLowerCase().includes('bridge')) {
        description += '. This is a pedestrian bridge/walkway.';
      }
    } else {
      description += ` at ${address}`;
    }
    if (fields.additionalDetails) {
      description += `. ${fields.additionalDetails}`;
    }
    await descriptionField.clear();
    await descriptionField.fill(description);
    await page.waitForTimeout(300);
  } else {
    logger.debug('  → Warning: Description field not found, trying to continue...');
  }

  let formError = await checkForErrors(page);
  if (formError) {
    return { success: false, error: `Step 1 error: ${formError}`, screenshot: await takeScreenshot(page) };
  }

  // Click Next
  logger.debug('  → Clicking Next to proceed to Step 2...');
  const nextButton = page.locator(COMMON.nextButton).first();
  await withRetry(async () => {
    await nextButton.click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
  });

  formError = await checkForErrors(page);
  if (formError) {
    return { success: false, error: `Failed to proceed to Step 2: ${formError}`, screenshot: await takeScreenshot(page) };
  }

  // Step 2: Where - Location
  logger.debug('  → Step 2: Filling location...');
  const addressResult = await fillAddressWithAutocomplete(page, address);

  if (addressResult.needsManualLocation || (!addressResult.success && isNonTraditional)) {
    logger.debug('  → Address requires manual map selection on NYC 311 portal');
    if (isNonTraditional && addressResult.needsManualLocation) {
      return {
        success: false,
        error: `Cannot automatically submit for non-standard location: "${address}". ` +
          `NYC 311 requires manual map selection for intersections, bridges, and landmarks. ` +
          `Please visit ${SNOW_ICE.url} to submit manually.`,
        screenshot: await takeScreenshot(page),
      };
    }

    logger.debug('  → Checking for alternative entry methods...');
    const altLocationOptions = [
      page.locator('text=/can\'t find|cannot find|not listed|other location|use map|enter manually/i').first(),
      page.locator('a, button').filter({ hasText: /can't find|other|manual/i }).first(),
      page.locator('[data-action*="other"], [data-action*="manual"]').first(),
    ];
    for (const option of altLocationOptions) {
      if (await option.isVisible({ timeout: 1000 }).catch(() => false)) {
        logger.debug('  → Found alternative location entry option');
        await option.click();
        await page.waitForTimeout(1000);
        break;
      }
    }
  } else if (!addressResult.success) {
    logger.debug(`  → Address fill failed: ${addressResult.error}`);
  }

  // Additional Location Details textarea
  const textareaSelectors = [
    SNOW_ICE.additionalLocationDetails,
    'textarea[id*="location"]',
    'textarea[id*="describe"]',
    'textarea[name*="location"]',
    'textarea[name*="describe"]',
    'textarea[placeholder*="location" i]',
    'textarea[placeholder*="describe" i]',
    'textarea',
  ];

  let detailsField = null;
  for (const selector of textareaSelectors) {
    const field = page.locator(selector).first();
    if (await field.isVisible({ timeout: 500 }).catch(() => false)) {
      logger.debug(`  → Found textarea with selector: ${selector}`);
      detailsField = field;
      break;
    }
  }

  if (detailsField) {
    let locationDescription = '';
    if (isNonTraditional || !addressResult.success || addressResult.needsManualLocation) {
      locationDescription = `EXACT LOCATION: ${address}`;
      if (address.toLowerCase().includes('bridge')) {
        locationDescription += '\nThis is a PEDESTRIAN BRIDGE/WALKWAY that requires city maintenance.';
      }
      if (address.toLowerCase().includes(' and ')) {
        locationDescription += '\nThis is an INTERSECTION AREA.';
      }
    }
    if (fields.extendedArea) {
      locationDescription += locationDescription ? `\n\n${fields.extendedArea}` : (fields.extendedArea as string);
    }
    if (fields.additionalDetails) {
      locationDescription += `\n\n${fields.additionalDetails}`;
    }
    if (locationDescription) {
      logger.debug(`  → Filling additional location details: "${locationDescription.substring(0, 80).replace(/\n/g, ' ')}..."`);
      await detailsField.fill(locationDescription);
      await page.waitForTimeout(300);
    }
  } else {
    logger.debug('  → Warning: No textarea found for additional location details');
  }

  formError = await checkForErrors(page);
  if (formError) {
    return { success: false, error: `Step 2 error: ${formError}`, screenshot: await takeScreenshot(page) };
  }

  // Click Next to Who step
  logger.debug('  → Clicking Next to proceed to Step 3...');
  await withRetry(async () => {
    await nextButton.click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
  });

  formError = await checkForErrors(page);
  if (formError) {
    return { success: false, error: `Failed to proceed to Step 3: ${formError}`, screenshot: await takeScreenshot(page) };
  }

  // Step 3: Who - Contact info (skip if optional)
  logger.debug('  → Step 3: Contact info (skipping if optional)...');
  const emailField = page.locator('input[type="email"], #n311_email').first();
  const isOnContactStep = await emailField.isVisible({ timeout: 2000 }).catch(() => false);
  if (isOnContactStep) {
    logger.debug('  → Contact step detected, checking if skippable...');
  }

  if (await nextButton.isVisible({ timeout: 2000 }).catch(() => false)) {
    await withRetry(async () => {
      await nextButton.click();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1000);
    });
  }

  formError = await checkForErrors(page);
  if (formError && formError.toLowerCase().includes('required')) {
    logger.debug('  → Contact info appears to be required, filling minimal info...');
    const anonymousCheckbox = page.locator('input[type="checkbox"]').filter({ hasText: /anonymous/i }).first();
    if (await anonymousCheckbox.isVisible().catch(() => false)) {
      await anonymousCheckbox.check();
      await nextButton.click();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1000);
    }
  }

  // Step 4: Review - Submit
  logger.debug('  → Step 4: Reviewing and submitting...');
  const submitButton = page.locator(COMMON.submitButton).first();
  const altSubmitButton = page.getByRole('button', { name: /submit/i }).first();

  let submitBtn = submitButton;
  if (!await submitButton.isVisible({ timeout: 3000 }).catch(() => false)) {
    submitBtn = altSubmitButton;
  }

  if (await submitBtn.isVisible({ timeout: 5000 })) {
    logger.debug('  → Clicking Submit...');
    await submitBtn.click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);
  } else {
    return {
      success: false,
      error: 'Submit button not found - may be stuck on earlier step',
      screenshot: await takeScreenshot(page),
    };
  }

  // Check for confirmation
  logger.debug('  → Checking for confirmation...');
  const bodyText = await page.textContent('body') || '';

  for (const pattern of SNOW_ICE.confirmationPatterns) {
    const match = bodyText.match(pattern);
    if (match) {
      logger.info(`  → Found confirmation number: ${match[1]}`);
      return { success: true, confirmationNumber: match[1] };
    }
  }

  const successIndicators = [
    page.getByText(/thank you for your submission/i).first(),
    page.getByText(/your request has been submitted/i).first(),
    page.getByText(/successfully submitted/i).first(),
    page.getByText(/we have received your/i).first(),
  ];

  for (const indicator of successIndicators) {
    if (await indicator.isVisible({ timeout: 1000 }).catch(() => false)) {
      const allText = await page.locator('body').innerText();
      const refMatch = allText.match(/[A-Z]?[0-9]+-[0-9]+-[0-9]+/);
      return {
        success: true,
        confirmationNumber: refMatch?.[0] || 'Submitted successfully (confirmation pending)',
      };
    }
  }

  const finalError = await checkForErrors(page);
  return {
    success: false,
    error: finalError || 'Could not confirm submission - form may not have submitted',
    screenshot: await takeScreenshot(page),
  };
}

// ── Address Picker (kept local to snow-ice to avoid extraction risk) ──

async function fillAddressWithAutocomplete(
  page: Page,
  address: string
): Promise<{ success: boolean; error?: string; needsManualLocation?: boolean; geocodeResult?: GeocoderResult }> {
  logger.debug('  → Opening address picker...');

  // Geocode
  logger.debug('  → Analyzing address with NYC Geocoder...');
  const geocodeResult = await geocodeNYCLocation(address);

  if (geocodeResult.success && geocodeResult.location) {
    const loc = geocodeResult.location;
    logger.debug(`  → Location type: ${loc.locationType}, confidence: ${loc.confidence}`);
    if (loc.formattedAddress) logger.debug(`  → Formatted address: ${loc.formattedAddress}`);
    if (loc.latitude && loc.longitude) logger.debug(`  → Coordinates: ${loc.latitude}, ${loc.longitude}`);
  }

  // Open address picker modal
  let pickerOpened = false;
  for (const selector of SNOW_ICE.addressPickerTriggers) {
    const trigger = page.locator(selector).first();
    if (await trigger.isVisible({ timeout: 500 }).catch(() => false)) {
      logger.debug(`  → Clicking address picker trigger: ${selector}`);
      try {
        await trigger.click();
        await page.waitForTimeout(2000);
        pickerOpened = true;
        break;
      } catch {
        logger.debug('  → Click failed, trying next...');
      }
    }
  }

  if (!pickerOpened) {
    logger.debug('  → Could not open address picker');
    return { success: false, error: 'Could not open address picker', needsManualLocation: true };
  }

  // Wait for modal
  const dialog = page.locator('[role="dialog"], .modal').first();
  if (await dialog.isVisible({ timeout: 3000 }).catch(() => false)) {
    logger.debug('  → Address picker dialog opened');
  }

  // Search for address
  const searchInput = page.locator(SNOW_ICE.addressSearchInput);
  let searchWorked = false;

  logger.debug('  → Waiting for search input to become enabled...');
  try {
    await page.waitForFunction(
      () => {
        const input = document.getElementById('address-search-box-input') as HTMLInputElement;
        return input && !input.disabled && !input.className.includes('loading');
      },
      { timeout: 15000 }
    );
    logger.debug('  → Search input is now enabled');
    await page.waitForTimeout(500);

    // Build address variants
    const addressesToTry: string[] = [];
    if (geocodeResult.location?.formattedAddress) {
      addressesToTry.push(geocodeResult.location.formattedAddress);
    }
    if (!addressesToTry.includes(address)) {
      addressesToTry.push(address);
    }
    if (geocodeResult.location) {
      for (const suggestion of suggestNearbyAddresses(geocodeResult.location)) {
        if (!addressesToTry.includes(suggestion)) addressesToTry.push(suggestion);
      }
    }
    if (isNonTraditionalAddress(address)) {
      for (const alt of extractNearbyAddress(address)) {
        if (!addressesToTry.includes(alt)) addressesToTry.push(alt);
      }
    }

    logger.debug(`  → Will try ${addressesToTry.length} address variants`);

    for (const tryAddress of addressesToTry) {
      logger.debug(`  → Searching for: "${tryAddress}"`);
      await searchInput.click();
      await page.waitForTimeout(200);
      await searchInput.click({ clickCount: 3 });
      await page.waitForTimeout(100);
      await searchInput.type(tryAddress, { delay: 50 });
      await page.waitForTimeout(1500);

      for (const sel of SNOW_ICE.autocompleteResults) {
        const result = page.locator(sel).first();
        if (await result.isVisible({ timeout: 2000 }).catch(() => false)) {
          logger.debug(`  → Found search result: ${sel}`);
          await result.click();
          await page.waitForTimeout(1000);
          searchWorked = true;
          break;
        }
      }
      if (searchWorked) break;

      await searchInput.click({ clickCount: 3 });
      await page.keyboard.press('Backspace');
      await page.waitForTimeout(300);
    }
  } catch {
    logger.debug('  → Search input did not become enabled within timeout');
  }

  // If search didn't work, try the map
  if (!searchWorked) {
    logger.debug('  → Search did not find results, checking map interface...');
    const mapElement = page.locator('#map, .map, [class*="map-container"], canvas').first();
    if (await mapElement.isVisible({ timeout: 2000 }).catch(() => false)) {
      logger.debug('  → Map is visible. For non-standard locations, manual map selection may be required.');
      return { success: false, needsManualLocation: true, error: 'Address not found - manual map selection required' };
    }
  }

  // Confirm/close modals
  if (searchWorked) {
    for (let modalAttempt = 0; modalAttempt < 5; modalAttempt++) {
      await page.waitForTimeout(500);

      const openModal = page.locator('[role="dialog"]:visible, .modal.in, .modal.show').first();
      if (!await openModal.isVisible({ timeout: 1000 }).catch(() => false)) {
        logger.debug('  → All modals closed, address should be set');
        return { success: true };
      }

      logger.debug(`  → Modal still open (attempt ${modalAttempt + 1}), looking for close/confirm buttons...`);

      const mapCanvas = page.locator(SNOW_ICE.mapCanvas).first();
      if (await mapCanvas.isVisible({ timeout: 1000 }).catch(() => false)) {
        logger.debug('  → Map canvas found');

        let clickedWithCoords = false;

        if (geocodeResult.location?.latitude && geocodeResult.location?.longitude) {
          const { latitude, longitude } = geocodeResult.location;
          logger.debug(`  → Have coordinates: ${latitude}, ${longitude}`);
          const box = await mapCanvas.boundingBox();
          if (box) {
            const clickPos = calculateMapClickPosition(
              latitude, longitude, latitude, longitude,
              { width: box.width, height: box.height }, 14
            );
            if (clickPos && clickPos.confidence > 0.5) {
              logger.debug(`  → Clicking at calculated coordinates (${clickPos.x}, ${clickPos.y})...`);
              await page.mouse.click(box.x + clickPos.x, box.y + clickPos.y);
              await page.waitForTimeout(2000);
              clickedWithCoords = true;
            }
          }
        }

        if (!clickedWithCoords) {
          let clickedMarker = false;
          for (const markerSel of SNOW_ICE.mapMarkers) {
            const marker = page.locator(`[role="dialog"]:visible ${markerSel}, .modal.in ${markerSel}`).first();
            if (await marker.isVisible({ timeout: 500 }).catch(() => false)) {
              logger.debug(`  → Found map marker: ${markerSel}, clicking...`);
              await marker.click();
              await page.waitForTimeout(2000);
              clickedMarker = true;
              break;
            }
          }
          if (!clickedMarker) {
            logger.debug('  → No marker found, clicking center of map...');
            const box = await mapCanvas.boundingBox();
            if (box) {
              await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
              await page.waitForTimeout(2000);
            }
          }
        }

        // Click confirm after map
        for (const sel of SNOW_ICE.confirmAfterMap) {
          const btn = page.locator(sel).first();
          if (await btn.isVisible({ timeout: 500 }).catch(() => false)) {
            const btnText = await btn.textContent();
            if (btnText && !btnText.includes('×') && btnText.trim().length > 0) {
              logger.debug(`  → Clicking confirm button: ${sel} (text: "${btnText?.trim()}")`);
              await btn.click();
              await page.waitForTimeout(1500);
              break;
            }
          }
        }
        continue;
      }

      // Try close/confirm buttons
      let clicked = false;
      for (const sel of SNOW_ICE.confirmButtons) {
        const btn = page.locator(sel).first();
        if (await btn.isVisible({ timeout: 500 }).catch(() => false)) {
          logger.debug(`  → Clicking: ${sel}`);
          try {
            await btn.click({ force: true });
            await page.waitForTimeout(1000);
            clicked = true;
            break;
          } catch {
            logger.debug('  → Click failed, trying next button...');
          }
        }
      }

      if (!clicked) {
        logger.debug('  → No close button found, pressing Escape...');
        await page.keyboard.press('Escape');
        await page.waitForTimeout(1000);
      }
    }

    // Final modal check
    const finalCheck = page.locator('[role="dialog"]:visible, .modal.in').first();
    if (!await finalCheck.isVisible({ timeout: 500 }).catch(() => false)) {
      logger.debug('  → Address picker closed, address should be set');
      return { success: true };
    } else {
      logger.debug('  → Warning: Modal still open after multiple attempts');
      // Force close the modal
      await page.evaluate(() => {
        const modals = document.querySelectorAll('.modal.in, .modal.show');
        modals.forEach(modal => {
          modal.classList.remove('in', 'show');
          modal.setAttribute('aria-hidden', 'true');
          (modal as HTMLElement).style.display = 'none';
        });
        const backdrops = document.querySelectorAll('.modal-backdrop');
        backdrops.forEach(b => b.remove());
        document.body.classList.remove('modal-open');
        document.body.style.overflow = '';
      });
      await page.waitForTimeout(500);

      return {
        success: false,
        needsManualLocation: true,
        error: 'Non-standard address (intersection/bridge/landmark) requires manual map selection on NYC 311 portal',
        geocodeResult,
      };
    }
  }

  const error = await checkForErrors(page);
  if (error) return { success: false, error };

  return { success: false, needsManualLocation: true };
}
