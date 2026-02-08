import { chromium, type Browser, type Page } from 'playwright';
import type { ComplaintType } from '../complaints/types.js';
import { getTemplate } from '../complaints/templates/index.js';
import {
  geocodeNYCLocation,
  suggestNearbyAddresses,
  calculateMapClickPosition,
  type NYCLocation,
  type GeocoderResult,
} from '../geo/nyc-geocoder.js';

export interface SubmissionResult {
  success: boolean;
  confirmationNumber?: string;
  error?: string;
  screenshot?: string;
}

// NYC 311 Snow/Ice form selectors
const SNOW_ICE_SELECTORS = {
  description: '#n311_description',
  addressInput: '#n311_address',
  addressSearchButton: 'fieldset[aria-label="Address"] button, button[aria-label*="search"]',
  additionalLocationDetails: '#n311_describeotherlocation',
  nextButton: '#NextButton, button:has-text("Next")',
  submitButton: 'button:has-text("Submit")',
  errorMessage: '.error-message, .validation-error, [role="alert"], .field-validation-error',
  autocompleteOptions: '[role="listbox"] [role="option"], .address-suggestion, .pac-item',
  stepIndicator: '.step-indicator, [aria-current="step"], .wizard-step.active',
};

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
      slowMo: 100, // Slow down for visibility
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

  async submit(
    type: ComplaintType,
    fields: Record<string, string | boolean | null>
  ): Promise<SubmissionResult> {
    if (!this.page) {
      await this.init();
    }

    try {
      switch (type) {
        case 'illegal-parking':
          return await this.submitIllegalParking(fields);
        case 'heat-hot-water':
          return await this.submitHeatHotWater(fields);
        case 'traffic-signal':
          return await this.submitTrafficSignal(fields);
        case 'snow-ice':
          return await this.submitSnowIce(fields);
        case 'missed-collection':
          return await this.submitMissedCollection(fields);
        default:
          return { success: false, error: `Unknown complaint type: ${type}` };
      }
    } catch (error) {
      const screenshot = await this.takeScreenshot();
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        screenshot,
      };
    }
  }

  private async takeScreenshot(): Promise<string | undefined> {
    if (!this.page) return undefined;
    try {
      const buffer = await this.page.screenshot();
      return buffer.toString('base64');
    } catch {
      return undefined;
    }
  }

  /**
   * Wait for step change by detecting URL hash or step indicator change
   */
  private async waitForStepChange(page: Page, previousStep: string | null, timeoutMs = 5000): Promise<boolean> {
    const startTime = Date.now();
    while (Date.now() - startTime < timeoutMs) {
      const currentUrl = page.url();
      const hashMatch = currentUrl.match(/#step-?(\d+)/i);
      const currentStep = hashMatch?.[1] || null;

      // Check if step changed via URL hash
      if (currentStep && currentStep !== previousStep) {
        return true;
      }

      // Check for step indicator change
      const stepIndicator = page.locator(SNOW_ICE_SELECTORS.stepIndicator).first();
      if (await stepIndicator.isVisible().catch(() => false)) {
        return true;
      }

      await page.waitForTimeout(200);
    }
    return false;
  }

  /**
   * Check for form validation errors
   * Only returns error if we find actual validation error text
   */
  private async checkForErrors(page: Page): Promise<string | null> {
    // Look for specific error indicators
    const errorSelectors = [
      '.error-message',
      '.validation-error',
      '.field-validation-error',
      '[class*="error"]:not([role="alert"])',  // Exclude role="alert" as it's often used for non-errors
    ];

    for (const selector of errorSelectors) {
      const errorLocator = page.locator(selector);
      if (await errorLocator.first().isVisible({ timeout: 300 }).catch(() => false)) {
        const text = await errorLocator.first().textContent();
        // Only return if there's actual error text (not empty)
        if (text && text.trim().length > 0) {
          return text.trim();
        }
      }
    }

    // Also check for specific error patterns in visible text near required fields
    const requiredError = page.locator('text=/required|invalid|please enter|must be/i').first();
    if (await requiredError.isVisible({ timeout: 300 }).catch(() => false)) {
      const parent = requiredError.locator('..');
      // Only treat as error if it's in an error-styled container
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

  /**
   * Detect if address is non-traditional (intersection, bridge, landmark)
   */
  private isNonTraditionalAddress(address: string): boolean {
    const patterns = [
      /\band\b/i,           // "135th and Riverside" (intersection)
      /bridge/i,            // bridges
      /park\b/i,            // parks
      /plaza/i,             // plazas
      /square/i,            // squares
      /circle/i,            // traffic circles
      /\bat\b.*\bat\b/i,    // "at X at Y" pattern
      /corner of/i,         // "corner of X and Y"
      /intersection/i,      // explicit intersection mention
    ];
    return patterns.some(p => p.test(address));
  }

  /**
   * Extract nearby street addresses from an intersection/landmark description
   * For "135th and Riverside Drive", generates alternatives like:
   * - "135 Riverside Drive, New York, NY"
   * - "W 135th Street, New York, NY"
   */
  private extractNearbyAddress(address: string): string[] {
    const alternatives: string[] = [];

    // For intersections like "135th and Riverside Drive"
    const andMatch = address.match(/(\d+)(?:st|nd|rd|th)?\s+(?:street\s+)?and\s+(.+)/i);
    if (andMatch) {
      const streetNum = andMatch[1];
      const crossStreet = andMatch[2].replace(/,?\s*new york.*$/i, '').trim();

      // Try various formats that NYC 311 might accept
      alternatives.push(`${streetNum} ${crossStreet}, New York, NY`);
      alternatives.push(`1 ${crossStreet}, New York, NY`);
      alternatives.push(`W ${streetNum}th Street, New York, NY`);
      alternatives.push(`${streetNum}th Street and ${crossStreet}, New York, NY`);
    }

    // For bridges, try nearby streets
    if (address.toLowerCase().includes('bridge')) {
      const streetMatch = address.match(/(\d+)(?:st|nd|rd|th)/i);
      if (streetMatch) {
        alternatives.push(`W ${streetMatch[1]}th Street, New York, NY`);
      }
    }

    // Try adding "Street" to number patterns
    const withStreet = address.replace(/(\d+(?:st|nd|rd|th))\s+and\s+/i, '$1 Street and ');
    if (withStreet !== address) {
      alternatives.push(`${withStreet}, New York, NY`);
    }

    // Try the original with ", New York, NY" appended
    alternatives.push(`${address}, New York, NY`);

    return alternatives;
  }

  /**
   * Fill address using NYC 311's map-based address picker
   * The picker requires:
   * 1. Click to open the address picker modal
   * 2. Either search for an address OR navigate the map and click a location
   * 3. Confirm the selected location
   *
   * Uses NYC Geocoder skill to:
   * - Detect location type (address, intersection, landmark)
   * - Suggest alternative address formats
   * - Provide coordinates for known landmarks
   */
  private async fillAddressWithAutocomplete(
    page: Page,
    address: string
  ): Promise<{ success: boolean; error?: string; needsManualLocation?: boolean; geocodeResult?: GeocoderResult }> {
    console.log('  → Opening address picker...');

    // Use NYC Geocoder to analyze the address
    console.log('  → Analyzing address with NYC Geocoder...');
    const geocodeResult = await geocodeNYCLocation(address);

    if (geocodeResult.success && geocodeResult.location) {
      const loc = geocodeResult.location;
      console.log(`  → Location type: ${loc.locationType}, confidence: ${loc.confidence}`);
      if (loc.formattedAddress) {
        console.log(`  → Formatted address: ${loc.formattedAddress}`);
      }
      if (loc.latitude && loc.longitude) {
        console.log(`  → Coordinates: ${loc.latitude}, ${loc.longitude}`);
      }
    }

    // Click to open the address picker modal
    const addressPickerTriggers = [
      'button[class*="address"]',
      '.address-picker-input',
      '[class*="address-picker"] button',
      'button:has-text("Select")',
      'button:has-text("Find")',
    ];

    let pickerOpened = false;
    for (const selector of addressPickerTriggers) {
      const trigger = page.locator(selector).first();
      if (await trigger.isVisible({ timeout: 500 }).catch(() => false)) {
        console.log(`  → Clicking address picker trigger: ${selector}`);
        try {
          await trigger.click();
          await page.waitForTimeout(2000);
          pickerOpened = true;
          break;
        } catch (e) {
          console.log(`  → Click failed, trying next...`);
        }
      }
    }

    if (!pickerOpened) {
      console.log('  → Could not open address picker');
      return { success: false, error: 'Could not open address picker', needsManualLocation: true };
    }

    // Wait for the modal/dialog to fully load
    const dialog = page.locator('[role="dialog"], .modal').first();
    if (await dialog.isVisible({ timeout: 3000 }).catch(() => false)) {
      console.log('  → Address picker dialog opened');
    }

    // Try to use the search input if it becomes enabled
    const searchInput = page.locator('#address-search-box-input');
    let searchWorked = false;

    // Wait for search input to become enabled using Playwright's wait mechanism
    console.log('  → Waiting for search input to become enabled...');
    try {
      // Wait for the input to be enabled (not disabled)
      await page.waitForFunction(
        () => {
          const input = document.getElementById('address-search-box-input') as HTMLInputElement;
          return input && !input.disabled && !input.className.includes('loading');
        },
        { timeout: 15000 }
      );
      console.log('  → Search input is now enabled');

      // Small delay to ensure stability
      await page.waitForTimeout(500);

      // Build list of addresses to try using geocoder suggestions
      const addressesToTry: string[] = [];

      // Add geocoder's formatted address first if available
      if (geocodeResult.location?.formattedAddress) {
        addressesToTry.push(geocodeResult.location.formattedAddress);
      }

      // Add original address
      if (!addressesToTry.includes(address)) {
        addressesToTry.push(address);
      }

      // Add geocoder's nearby address suggestions
      if (geocodeResult.location) {
        const suggestions = suggestNearbyAddresses(geocodeResult.location);
        for (const suggestion of suggestions) {
          if (!addressesToTry.includes(suggestion)) {
            addressesToTry.push(suggestion);
          }
        }
      }

      // Add our own extracted alternatives as fallback
      if (this.isNonTraditionalAddress(address)) {
        const extracted = this.extractNearbyAddress(address);
        for (const alt of extracted) {
          if (!addressesToTry.includes(alt)) {
            addressesToTry.push(alt);
          }
        }
      }

      console.log(`  → Will try ${addressesToTry.length} address variants`);

      for (const tryAddress of addressesToTry) {
        console.log(`  → Searching for: "${tryAddress}"`);

        // Use click + type instead of fill for better reliability
        await searchInput.click();
        await page.waitForTimeout(200);

        // Triple-click to select all, then type to replace
        await searchInput.click({ clickCount: 3 });
        await page.waitForTimeout(100);
        await searchInput.type(tryAddress, { delay: 50 });
        await page.waitForTimeout(1500);  // Wait for autocomplete to load

        // Check for search results/suggestions
        const resultSelectors = [
          '.ui-autocomplete li',
          '.ui-menu-item',
          '[role="listbox"] [role="option"]',
          '.address-result',
          '.search-result',
          '.pac-item',
        ];

        for (const sel of resultSelectors) {
          const result = page.locator(sel).first();
          if (await result.isVisible({ timeout: 2000 }).catch(() => false)) {
            console.log(`  → Found search result: ${sel}`);
            await result.click();
            await page.waitForTimeout(1000);
            searchWorked = true;
            break;
          }
        }

        if (searchWorked) break;

        // Clear for next attempt
        await searchInput.click({ clickCount: 3 });
        await page.keyboard.press('Backspace');
        await page.waitForTimeout(300);
      }
    } catch (e) {
      console.log('  → Search input did not become enabled within timeout');
    }

    // If search didn't work, try to use the map
    if (!searchWorked) {
      console.log('  → Search did not find results, checking map interface...');

      // Look for the map element
      const mapElement = page.locator('#map, .map, [class*="map-container"], canvas').first();
      if (await mapElement.isVisible({ timeout: 2000 }).catch(() => false)) {
        console.log('  → Map is visible. For non-standard locations, manual map selection may be required.');

        // We can try clicking somewhere on the map, but without knowing exact coordinates,
        // this is tricky. For now, note that manual intervention may be needed.
        return { success: false, needsManualLocation: true, error: 'Address not found - manual map selection required' };
      }
    }

    // Try to confirm/select the location and close any modals
    if (searchWorked) {
      // There may be one or more modals to close
      // Keep looking for and clicking confirm/close buttons until no dialogs remain
      for (let modalAttempt = 0; modalAttempt < 5; modalAttempt++) {
        await page.waitForTimeout(500);

        // Check for any open modals
        const openModal = page.locator('[role="dialog"]:visible, .modal.in, .modal.show').first();
        if (!await openModal.isVisible({ timeout: 1000 }).catch(() => false)) {
          console.log('  → All modals closed, address should be set');
          return { success: true };
        }

        console.log(`  → Modal still open (attempt ${modalAttempt + 1}), looking for close/confirm buttons...`);

        // The modal contains a map (canvas). We need to click on the map to select the location.
        // After clicking a search result, the map should be centered and may have a marker.
        const mapCanvas = page.locator('[role="dialog"]:visible canvas, .modal.in canvas').first();
        if (await mapCanvas.isVisible({ timeout: 1000 }).catch(() => false)) {
          console.log('  → Map canvas found');

          // First, look for any existing marker or pin to click
          const mapMarkers = [
            '.leaflet-marker-icon',
            '.marker',
            '[class*="marker"]',
            '[class*="pin"]',
            'img[src*="marker"]',
          ];

          let clickedMarker = false;
          let clickedWithCoords = false;

          // If we have coordinates from the geocoder, try to click at the calculated position
          if (geocodeResult.location?.latitude && geocodeResult.location?.longitude) {
            const { latitude, longitude } = geocodeResult.location;
            console.log(`  → Have coordinates: ${latitude}, ${longitude}`);

            const box = await mapCanvas.boundingBox();
            if (box) {
              const mapSize = { width: box.width, height: box.height };

              // Calculate click position (assume map is centered on search result)
              const clickPos = calculateMapClickPosition(
                latitude,
                longitude,
                latitude,  // Assume centered on target after search
                longitude,
                mapSize,
                14  // Assume zoom level 14 (street-level)
              );

              if (clickPos && clickPos.confidence > 0.5) {
                console.log(`  → Calculated click position: (${clickPos.x}, ${clickPos.y}) confidence: ${clickPos.confidence.toFixed(2)}`);
                console.log(`  → Clicking at calculated coordinates...`);

                // Click at the calculated position
                await page.mouse.click(box.x + clickPos.x, box.y + clickPos.y);
                await page.waitForTimeout(2000);
                clickedWithCoords = true;

                // Check if a marker or selection appeared
                const selectionIndicators = [
                  '.leaflet-marker-icon.selected',
                  '[class*="selected"]',
                  '.map-pin',
                  '.location-marker',
                ];

                for (const sel of selectionIndicators) {
                  const indicator = page.locator(sel).first();
                  if (await indicator.isVisible({ timeout: 500 }).catch(() => false)) {
                    console.log(`  → Selection confirmed: ${sel}`);
                    break;
                  }
                }
              } else {
                console.log('  → Coordinate click position not confident enough, trying marker click');
              }
            }
          }

          // Fall back to clicking existing markers
          if (!clickedWithCoords) {
            for (const markerSel of mapMarkers) {
              const marker = page.locator(`[role="dialog"]:visible ${markerSel}, .modal.in ${markerSel}`).first();
              if (await marker.isVisible({ timeout: 500 }).catch(() => false)) {
                console.log(`  → Found map marker: ${markerSel}, clicking...`);
                await marker.click();
                await page.waitForTimeout(2000);  // Longer wait for popup
                clickedMarker = true;

                // Check if clicking marker opened a popup/tooltip with select option
                const popupSelectors = [
                  '.leaflet-popup',
                  '.info-window',
                  '[class*="popup"]',
                  '[class*="tooltip"]',
                  '[class*="infobox"]',
                ];

                for (const popSel of popupSelectors) {
                  const popup = page.locator(popSel).first();
                  if (await popup.isVisible({ timeout: 1000 }).catch(() => false)) {
                    console.log(`  → Found popup: ${popSel}`);
                    // Try clicking a select/use button in the popup
                    const popupBtn = popup.locator('button, a').first();
                    if (await popupBtn.isVisible({ timeout: 500 }).catch(() => false)) {
                      console.log('  → Clicking button in popup');
                      await popupBtn.click();
                      await page.waitForTimeout(1000);
                    }
                    break;
                  }
                }
                break;
              }
            }

            if (!clickedMarker && !clickedWithCoords) {
              // If no marker, click center of map
              console.log('  → No marker found, clicking center of map...');
              const box = await mapCanvas.boundingBox();
              if (box) {
                await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
                await page.waitForTimeout(2000);
              }
            }
          }

          // After clicking the map or marker, look for a confirm button
          // Also check the modal footer specifically
          const confirmAfterMap = [
            '.modal.in .modal-footer button',  // Any button in footer
            '[role="dialog"]:visible .modal-footer button',
            '[role="dialog"]:visible button:has-text("Select")',
            '[role="dialog"]:visible button:has-text("Use this")',
            '[role="dialog"]:visible button:has-text("Use")',
            '[role="dialog"]:visible button:has-text("Confirm")',
            '[role="dialog"]:visible button:has-text("OK")',
            '.modal.in button:has-text("Select")',
            '.modal.in .btn-primary:not(.form-close)',
          ];

          // Log all buttons we can find for debugging
          const allBtns = await page.locator('.modal.in button, [role="dialog"]:visible button').all();
          console.log(`  → Found ${allBtns.length} total buttons in modal after map click`);
          for (let i = 0; i < Math.min(allBtns.length, 8); i++) {
            try {
              const text = await allBtns[i].textContent();
              const cls = await allBtns[i].getAttribute('class');
              console.log(`    Btn ${i}: "${text?.trim().substring(0, 30)}" class="${cls?.substring(0, 40)}"`);
            } catch {}
          }

          for (const sel of confirmAfterMap) {
            const btn = page.locator(sel).first();
            if (await btn.isVisible({ timeout: 500 }).catch(() => false)) {
              const btnText = await btn.textContent();
              if (btnText && !btnText.includes('×') && btnText.trim().length > 0) {  // Skip close buttons and empty
                console.log(`  → Clicking confirm button: ${sel} (text: "${btnText?.trim()}")`);
                await btn.click();
                await page.waitForTimeout(1500);
                break;
              }
            }
          }
          continue;  // Check if modal closed
        }

        // Log all buttons visible in the modal to help debug
        const modalButtons = await page.locator('[role="dialog"]:visible button, .modal.in button').all();
        console.log(`  → Found ${modalButtons.length} buttons in modal`);
        for (let i = 0; i < Math.min(modalButtons.length, 5); i++) {
          const btn = modalButtons[i];
          try {
            const text = await btn.textContent();
            const className = await btn.getAttribute('class');
            console.log(`    Button ${i}: "${text?.trim()}" class="${className}"`);
          } catch { }
        }

        // Look for close/confirm buttons - prioritize specific text matches
        const closeButtons = [
          // Specific text matches first
          '[role="dialog"]:visible button:has-text("Select this location")',
          '[role="dialog"]:visible button:has-text("Use this location")',
          '[role="dialog"]:visible button:has-text("Select Location")',
          '[role="dialog"]:visible button:has-text("Confirm Location")',
          '.modal.in button:has-text("Select this location")',
          '.modal.in button:has-text("Use this location")',
          // Generic matches
          '[role="dialog"]:visible button:has-text("Select")',
          '[role="dialog"]:visible button:has-text("OK")',
          '[role="dialog"]:visible button:has-text("Confirm")',
          '[role="dialog"]:visible button:has-text("Done")',
          '[role="dialog"]:visible button:has-text("Use")',
          '[role="dialog"]:visible button:has-text("Save")',
          '[role="dialog"]:visible button:has-text("Continue")',
          // Modal footer buttons
          '.modal.in .modal-footer button:has-text("Select")',
          '.modal.in .modal-footer .btn-primary',
          '.modal.in .modal-footer button',
        ];

        let clicked = false;
        for (const sel of closeButtons) {
          const btn = page.locator(sel).first();
          if (await btn.isVisible({ timeout: 500 }).catch(() => false)) {
            console.log(`  → Clicking: ${sel}`);
            try {
              await btn.click({ force: true });  // Use force to bypass any overlays
              await page.waitForTimeout(1000);
              clicked = true;
              break;
            } catch (e) {
              console.log(`  → Click failed, trying next button...`);
            }
          }
        }

        if (!clicked) {
          // Try pressing Escape to close the modal
          console.log('  → No close button found, pressing Escape...');
          await page.keyboard.press('Escape');
          await page.waitForTimeout(1000);
        }
      }

      // Check if we managed to close all modals
      const finalCheck = page.locator('[role="dialog"]:visible, .modal.in').first();
      if (!await finalCheck.isVisible({ timeout: 500 }).catch(() => false)) {
        console.log('  → Address picker closed, address should be set');
        return { success: true };
      } else {
        console.log('  → Warning: Modal still open after multiple attempts');
        console.log('  → NYC 311 map interface requires manual location selection for non-standard addresses.');
        console.log('  → This location (intersection/bridge/landmark) cannot be automatically selected.');

        // Force close the modal so we don't leave the browser in a broken state
        await page.evaluate(() => {
          const modals = document.querySelectorAll('.modal.in, .modal.show');
          modals.forEach(modal => {
            // @ts-expect-error Bootstrap modal API
            if (window.$ && window.$(modal).modal) {
              // @ts-expect-error Bootstrap modal API
              window.$(modal).modal('hide');
            }
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

        // Return with a clear error message and geocode info
        return {
          success: false,
          needsManualLocation: true,
          error: 'Non-standard address (intersection/bridge/landmark) requires manual map selection on NYC 311 portal',
          geocodeResult,
        };
      }
    }

    // If we got here, the address selection didn't fully work
    const error = await this.checkForErrors(page);
    if (error) {
      return { success: false, error };
    }

    return { success: false, needsManualLocation: true };
  }

  /**
   * Retry an operation with exponential backoff
   */
  private async withRetry<T>(
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
        console.log(`  → Retry ${attempt + 1}/${maxRetries} after error: ${lastError.message}`);
        await new Promise(resolve => setTimeout(resolve, baseDelayMs * Math.pow(2, attempt)));
      }
    }
    throw lastError || new Error('Operation failed after retries');
  }

  private async submitIllegalParking(
    fields: Record<string, string | boolean | null>
  ): Promise<SubmissionResult> {
    const page = this.page!;

    // Navigate to 311 portal
    await page.goto('https://portal.311.nyc.gov/article/?kanumber=KA-01986');
    await page.waitForLoadState('networkidle');

    // Look for the "Report a Problem" or "File a Complaint" button
    // Note: The exact selectors may need adjustment based on the actual portal structure
    const reportButton = page.getByRole('link', { name: /report|file|submit/i }).first();
    if (await reportButton.isVisible()) {
      await reportButton.click();
      await page.waitForLoadState('networkidle');
    }

    // Fill in location
    const locationInput = page.getByLabel(/location|address|where/i).first();
    if (await locationInput.isVisible()) {
      await locationInput.fill(fields.location as string);
    }

    // Select violation type if there's a dropdown
    const violationSelect = page.getByLabel(/type|violation|problem/i).first();
    if (await violationSelect.isVisible()) {
      await violationSelect.selectOption({ label: fields.violationType as string });
    }

    // Fill optional fields if present
    if (fields.licensePlate) {
      const plateInput = page.getByLabel(/license|plate/i).first();
      if (await plateInput.isVisible()) {
        await plateInput.fill(fields.licensePlate as string);
      }
    }

    if (fields.vehicleDescription) {
      const descInput = page.getByLabel(/description|vehicle|make|model/i).first();
      if (await descInput.isVisible()) {
        await descInput.fill(fields.vehicleDescription as string);
      }
    }

    // Submit the form
    const submitButton = page.getByRole('button', { name: /submit|file|send/i }).first();
    await submitButton.click();
    await page.waitForLoadState('networkidle');

    // Look for confirmation number
    const confirmationText = await page.textContent('body');
    const confirmationMatch = confirmationText?.match(/(?:confirmation|reference|service request)[\s#:]*([A-Z0-9-]+)/i);

    if (confirmationMatch) {
      return {
        success: true,
        confirmationNumber: confirmationMatch[1],
      };
    }

    // Check if there's a success message
    const successMessage = await page.getByText(/success|received|submitted|thank you/i).first();
    if (await successMessage.isVisible()) {
      return {
        success: true,
        confirmationNumber: 'Submitted (confirmation pending)',
      };
    }

    return {
      success: false,
      error: 'Could not confirm submission',
      screenshot: await this.takeScreenshot(),
    };
  }

  // Placeholder implementations for other complaint types
  private async submitHeatHotWater(
    fields: Record<string, string | boolean | null>
  ): Promise<SubmissionResult> {
    // TODO: Implement heat/hot water submission
    return { success: false, error: 'Heat/hot water submission not yet implemented' };
  }

  private async submitTrafficSignal(
    fields: Record<string, string | boolean | null>
  ): Promise<SubmissionResult> {
    // TODO: Implement traffic signal submission
    return { success: false, error: 'Traffic signal submission not yet implemented' };
  }

  private async submitSnowIce(
    fields: Record<string, string | boolean | null>
  ): Promise<SubmissionResult> {
    const page = this.page!;
    const address = fields.address as string;
    const isNonTraditional = this.isNonTraditionalAddress(address);

    // Step 0: Navigate to snow/ice complaint page
    console.log('  → Navigating to snow/ice complaint page...');
    await page.goto('https://portal.311.nyc.gov/article/?kanumber=KA-01397', { timeout: 60000 });
    await page.waitForLoadState('networkidle', { timeout: 30000 });

    // Click the report link for sidewalk complaints
    const reportLink = page.getByText('Report a snowy or icy sidewalk in front of a residence or business');
    if (await reportLink.isVisible({ timeout: 5000 })) {
      await reportLink.click();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1500);
    } else {
      // Try alternative text patterns
      const altReportLink = page.locator('a, button').filter({ hasText: /snowy.*sidewalk|icy.*sidewalk|report.*snow/i }).first();
      if (await altReportLink.isVisible({ timeout: 2000 }).catch(() => false)) {
        await altReportLink.click();
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(1500);
      } else {
        return { success: false, error: 'Could not find report link on snow/ice page' };
      }
    }

    // Get initial URL for step tracking
    const initialUrl = page.url();
    const initialStep = initialUrl.match(/#step-?(\d+)/i)?.[1] || '1';

    // Step 1: What - Problem details
    console.log('  → Step 1: Filling problem details...');

    // Wait for description field to be ready
    const descriptionField = page.locator(SNOW_ICE_SELECTORS.description);
    await descriptionField.waitFor({ state: 'visible', timeout: 10000 }).catch(() => null);

    if (await descriptionField.isVisible()) {
      // Build a detailed description
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
      console.log('  → Warning: Description field not found, trying to continue...');
    }

    // Check for errors before proceeding
    let formError = await this.checkForErrors(page);
    if (formError) {
      return { success: false, error: `Step 1 error: ${formError}`, screenshot: await this.takeScreenshot() };
    }

    // Click Next to go to Where step
    console.log('  → Clicking Next to proceed to Step 2...');
    const nextButton = page.locator(SNOW_ICE_SELECTORS.nextButton).first();
    await this.withRetry(async () => {
      await nextButton.click();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1000);
    });

    // Validate step transition
    formError = await this.checkForErrors(page);
    if (formError) {
      return { success: false, error: `Failed to proceed to Step 2: ${formError}`, screenshot: await this.takeScreenshot() };
    }

    // Step 2: Where - Location
    console.log('  → Step 2: Filling location...');

    // Handle address input with autocomplete
    const addressResult = await this.fillAddressWithAutocomplete(page, address);

    // If address couldn't be validated and needs manual location
    if (addressResult.needsManualLocation || (!addressResult.success && isNonTraditional)) {
      console.log('  → Address requires manual map selection on NYC 311 portal');

      // For non-standard addresses, we cannot proceed automatically
      // Return with a helpful error message
      if (isNonTraditional && addressResult.needsManualLocation) {
        return {
          success: false,
          error: `Cannot automatically submit for non-standard location: "${address}". ` +
            `NYC 311 requires manual map selection for intersections, bridges, and landmarks. ` +
            `Please visit https://portal.311.nyc.gov/article/?kanumber=KA-01397 to submit manually.`,
          screenshot: await this.takeScreenshot(),
        };
      }

      console.log('  → Checking for alternative entry methods...');

      // Look for "Can't find your address?" or "Use map" or "Other location" options
      const altLocationOptions = [
        page.locator('text=/can\'t find|cannot find|not listed|other location|use map|enter manually/i').first(),
        page.locator('a, button').filter({ hasText: /can't find|other|manual/i }).first(),
        page.locator('[data-action*="other"], [data-action*="manual"]').first(),
      ];

      for (const option of altLocationOptions) {
        if (await option.isVisible({ timeout: 1000 }).catch(() => false)) {
          console.log('  → Found alternative location entry option');
          await option.click();
          await page.waitForTimeout(1000);
          break;
        }
      }
    } else if (!addressResult.success) {
      console.log(`  → Address fill failed: ${addressResult.error}`);
      // Don't fail immediately, try additional location details
    }

    // For non-traditional addresses or if autocomplete failed, use Additional Location Details
    // Try multiple selectors to find a textarea for location details
    const textareaSelectors = [
      SNOW_ICE_SELECTORS.additionalLocationDetails,
      'textarea[id*="location"]',
      'textarea[id*="describe"]',
      'textarea[name*="location"]',
      'textarea[name*="describe"]',
      'textarea[placeholder*="location" i]',
      'textarea[placeholder*="describe" i]',
      'textarea',  // Any visible textarea
    ];

    let detailsField = null;
    for (const selector of textareaSelectors) {
      const field = page.locator(selector).first();
      if (await field.isVisible({ timeout: 500 }).catch(() => false)) {
        console.log(`  → Found textarea with selector: ${selector}`);
        detailsField = field;
        break;
      }
    }

    if (detailsField) {
      let locationDescription = '';

      // Always include detailed location info for non-traditional addresses
      if (isNonTraditional || !addressResult.success || addressResult.needsManualLocation) {
        // Build a comprehensive location description
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
        console.log(`  → Filling additional location details: "${locationDescription.substring(0, 80).replace(/\n/g, ' ')}..."`);
        await detailsField.fill(locationDescription);
        await page.waitForTimeout(300);
      }
    } else {
      console.log('  → Warning: No textarea found for additional location details');
    }

    // Check for errors before proceeding
    formError = await this.checkForErrors(page);
    if (formError) {
      return { success: false, error: `Step 2 error: ${formError}`, screenshot: await this.takeScreenshot() };
    }

    // Click Next to go to Who step
    console.log('  → Clicking Next to proceed to Step 3...');
    await this.withRetry(async () => {
      await nextButton.click();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1000);
    });

    // Validate step transition
    formError = await this.checkForErrors(page);
    if (formError) {
      return { success: false, error: `Failed to proceed to Step 3: ${formError}`, screenshot: await this.takeScreenshot() };
    }

    // Step 3: Who - Contact info (optional, skip if possible)
    console.log('  → Step 3: Contact info (skipping if optional)...');

    // Check if we're actually on a contact step or went straight to review
    const emailField = page.locator('input[type="email"], #n311_email').first();
    const isOnContactStep = await emailField.isVisible({ timeout: 2000 }).catch(() => false);

    if (isOnContactStep) {
      console.log('  → Contact step detected, checking if skippable...');
    }

    // Try to click Next without filling contact info
    if (await nextButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await this.withRetry(async () => {
        await nextButton.click();
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(1000);
      });
    }

    // Check if we failed due to required contact info
    formError = await this.checkForErrors(page);
    if (formError && formError.toLowerCase().includes('required')) {
      console.log('  → Contact info appears to be required, filling minimal info...');
      // If required, try anonymous submission or provide minimal info
      const anonymousCheckbox = page.locator('input[type="checkbox"]').filter({ hasText: /anonymous/i }).first();
      if (await anonymousCheckbox.isVisible().catch(() => false)) {
        await anonymousCheckbox.check();
        await nextButton.click();
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(1000);
      }
    }

    // Step 4: Review - Submit
    console.log('  → Step 4: Reviewing and submitting...');

    // Wait for submit button
    const submitButton = page.locator(SNOW_ICE_SELECTORS.submitButton).first();
    const altSubmitButton = page.getByRole('button', { name: /submit/i }).first();

    let submitBtn = submitButton;
    if (!await submitButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      submitBtn = altSubmitButton;
    }

    if (await submitBtn.isVisible({ timeout: 5000 })) {
      console.log('  → Clicking Submit...');
      await submitBtn.click();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(3000);
    } else {
      return {
        success: false,
        error: 'Submit button not found - may be stuck on earlier step',
        screenshot: await this.takeScreenshot(),
      };
    }

    // Look for confirmation
    console.log('  → Checking for confirmation...');
    const bodyText = await page.textContent('body') || '';

    // NYC 311 confirmation patterns (multiple formats observed)
    const confirmationPatterns = [
      // Service Request Number: C1-1-1234567890
      /service request(?:\s+number)?[\s:#]*([A-Z0-9]+-[A-Z0-9]+-[A-Z0-9]+)/i,
      // Confirmation #: 1-1-1234567890
      /confirmation[\s:#]*([A-Z0-9]+-[A-Z0-9]+-[A-Z0-9]+)/i,
      // Reference: C1-1-1234567890
      /reference[\s:#]*([A-Z0-9]+-[A-Z0-9]+-[A-Z0-9]+)/i,
      // Standalone SR number pattern: C1-1-1234567890
      /\b([C][0-9]+-[0-9]+-[0-9]{6,})\b/,
      // Alternative pattern: 1-1-1234567890
      /\b([0-9]+-[0-9]+-[0-9]{6,})\b/,
    ];

    for (const pattern of confirmationPatterns) {
      const match = bodyText.match(pattern);
      if (match) {
        console.log(`  → Found confirmation number: ${match[1]}`);
        return {
          success: true,
          confirmationNumber: match[1],
        };
      }
    }

    // Check for success message even without confirmation number
    const successIndicators = [
      page.getByText(/thank you for your submission/i).first(),
      page.getByText(/your request has been submitted/i).first(),
      page.getByText(/successfully submitted/i).first(),
      page.getByText(/we have received your/i).first(),
    ];

    for (const indicator of successIndicators) {
      if (await indicator.isVisible({ timeout: 1000 }).catch(() => false)) {
        // Try harder to find a reference number
        const allText = await page.locator('body').innerText();
        const refMatch = allText.match(/[A-Z]?[0-9]+-[0-9]+-[0-9]+/);
        return {
          success: true,
          confirmationNumber: refMatch?.[0] || 'Submitted successfully (confirmation pending)',
        };
      }
    }

    // If we're still on the form or got an error, report failure
    const finalError = await this.checkForErrors(page);
    return {
      success: false,
      error: finalError || 'Could not confirm submission - form may not have submitted',
      screenshot: await this.takeScreenshot(),
    };
  }

  private async submitMissedCollection(
    fields: Record<string, string | boolean | null>
  ): Promise<SubmissionResult> {
    // TODO: Implement missed collection submission
    return { success: false, error: 'Missed collection submission not yet implemented' };
  }

  /**
   * Semi-automated submission for locations requiring manual map selection
   *
   * This method:
   * 1. Navigates to the complaint form
   * 2. Fills in all fields except the address
   * 3. Opens the address picker
   * 4. Searches for the location
   * 5. Leaves the browser open for the user to click the correct spot on the map
   *
   * @returns Information about the pre-filled form and instructions
   */
  async submitWithManualMapSelection(
    type: ComplaintType,
    fields: Record<string, string | boolean | null>
  ): Promise<{
    success: boolean;
    browserOpen: boolean;
    instructions: string;
    geocodeInfo?: {
      formattedAddress: string;
      coordinates?: { lat: number; lng: number };
    };
    error?: string;
  }> {
    if (!this.page) {
      await this.init();
    }

    const page = this.page!;

    if (type !== 'snow-ice') {
      return {
        success: false,
        browserOpen: false,
        instructions: '',
        error: 'Semi-automated submission only supported for snow-ice complaints currently',
      };
    }

    const address = fields.address as string;

    try {
      // Geocode the address to get info
      const geocodeResult = await geocodeNYCLocation(address);
      const geocodeInfo = geocodeResult.location ? {
        formattedAddress: geocodeResult.location.formattedAddress || address,
        coordinates: geocodeResult.location.latitude && geocodeResult.location.longitude
          ? { lat: geocodeResult.location.latitude, lng: geocodeResult.location.longitude }
          : undefined,
      } : undefined;

      // Navigate to the form
      console.log('  → Opening NYC 311 snow/ice complaint form...');
      await page.goto('https://portal.311.nyc.gov/article/?kanumber=KA-01397', { timeout: 60000 });
      await page.waitForLoadState('networkidle', { timeout: 30000 });

      // Click the report link
      const reportLink = page.getByText('Report a snowy or icy sidewalk in front of a residence or business');
      if (await reportLink.isVisible({ timeout: 5000 })) {
        await reportLink.click();
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(1500);
      }

      // Fill Step 1: Description
      console.log('  → Filling description...');
      const descriptionField = page.locator('#n311_description');
      if (await descriptionField.isVisible({ timeout: 5000 })) {
        const locationType = (fields.locationType as string) || 'sidewalk';
        let description = `Snow/ice accumulation on ${locationType} at ${address}`;
        if (fields.additionalDetails) {
          description += `. ${fields.additionalDetails}`;
        }
        await descriptionField.fill(description);
      }

      // Click Next to go to location step
      console.log('  → Proceeding to location step...');
      const nextButton = page.locator('#NextButton, button:has-text("Next")').first();
      await nextButton.click();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1500);

      // Open the address picker
      console.log('  → Opening address picker...');
      const addressTrigger = page.locator('button[class*="address"]').first();
      if (await addressTrigger.isVisible({ timeout: 3000 })) {
        await addressTrigger.click();
        await page.waitForTimeout(2000);
      }

      // Wait for search input and fill it
      const searchInput = page.locator('#address-search-box-input');
      try {
        await page.waitForFunction(
          () => {
            const input = document.getElementById('address-search-box-input') as HTMLInputElement;
            return input && !input.disabled;
          },
          { timeout: 15000 }
        );

        // Fill in the search with the geocoded address
        const searchAddress = geocodeInfo?.formattedAddress || address;
        console.log(`  → Searching for: "${searchAddress}"`);

        await searchInput.click();
        await page.waitForTimeout(200);
        await searchInput.type(searchAddress, { delay: 50 });
        await page.waitForTimeout(1500);

        // Click on the first search result if available
        const searchResult = page.locator('.ui-autocomplete li, .ui-menu-item').first();
        if (await searchResult.isVisible({ timeout: 2000 }).catch(() => false)) {
          console.log('  → Clicking search result...');
          await searchResult.click();
          await page.waitForTimeout(2000);
        }
      } catch {
        console.log('  → Search input not available, map may already be open');
      }

      // Build instructions for the user
      let instructions = `
══════════════════════════════════════════════════════════════════
  NYC 311 SNOW/ICE COMPLAINT - MANUAL MAP SELECTION REQUIRED
══════════════════════════════════════════════════════════════════

The form has been pre-filled with your complaint details.

LOCATION: ${address}
`;

      if (geocodeInfo?.coordinates) {
        instructions += `COORDINATES: ${geocodeInfo.coordinates.lat.toFixed(4)}, ${geocodeInfo.coordinates.lng.toFixed(4)}
`;
      }

      instructions += `
TO COMPLETE THE SUBMISSION:

1. Look at the map in the browser window
2. Find the exact location you want to report
3. CLICK on that spot on the map to place a marker
4. A "Select" or "Confirm" button should appear - click it
5. Click "Next" to proceed through the remaining steps
6. Click "Submit" on the final review page

NOTE: The map should already be showing the approximate area.
      You may need to zoom in/out or pan to find the exact spot.

══════════════════════════════════════════════════════════════════
`;

      console.log(instructions);

      return {
        success: true,
        browserOpen: true,
        instructions,
        geocodeInfo,
      };
    } catch (error) {
      return {
        success: false,
        browserOpen: false,
        instructions: '',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}

// Singleton instance
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
