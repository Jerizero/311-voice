/** Centralized CSS selectors for the NYC 311 portal.
 *  Single file to update when the portal changes its DOM. */

export const COMMON = {
  nextButton: '#NextButton, button:has-text("Next")',
  submitButton: 'button:has-text("Submit")',
  errorMessage: '.error-message, .validation-error, [role="alert"], .field-validation-error',
  stepIndicator: '.step-indicator, [aria-current="step"], .wizard-step.active',
} as const;

export const SNOW_ICE = {
  url: 'https://portal.311.nyc.gov/article/?kanumber=KA-01397',
  reportLink: 'Report a snowy or icy sidewalk in front of a residence or business',
  description: '#n311_description',
  additionalLocationDetails: '#n311_describeotherlocation',
  addressSearchInput: '#address-search-box-input',
  autocompleteResults: [
    '.ui-autocomplete li',
    '.ui-menu-item',
    '[role="listbox"] [role="option"]',
    '.address-result',
    '.search-result',
    '.pac-item',
  ],
  addressPickerTriggers: [
    'button[class*="address"]',
    '.address-picker-input',
    '[class*="address-picker"] button',
    'button:has-text("Select")',
    'button:has-text("Find")',
  ],
  mapCanvas: '[role="dialog"]:visible canvas, .modal.in canvas',
  mapMarkers: [
    '.leaflet-marker-icon',
    '.marker',
    '[class*="marker"]',
    '[class*="pin"]',
    'img[src*="marker"]',
  ],
  confirmButtons: [
    '[role="dialog"]:visible button:has-text("Select this location")',
    '[role="dialog"]:visible button:has-text("Use this location")',
    '[role="dialog"]:visible button:has-text("Select Location")',
    '[role="dialog"]:visible button:has-text("Confirm Location")',
    '.modal.in button:has-text("Select this location")',
    '.modal.in button:has-text("Use this location")',
    '[role="dialog"]:visible button:has-text("Select")',
    '[role="dialog"]:visible button:has-text("OK")',
    '[role="dialog"]:visible button:has-text("Confirm")',
    '[role="dialog"]:visible button:has-text("Done")',
    '[role="dialog"]:visible button:has-text("Use")',
    '[role="dialog"]:visible button:has-text("Save")',
    '[role="dialog"]:visible button:has-text("Continue")',
    '.modal.in .modal-footer button:has-text("Select")',
    '.modal.in .modal-footer .btn-primary',
    '.modal.in .modal-footer button',
  ],
  confirmAfterMap: [
    '.modal.in .modal-footer button',
    '[role="dialog"]:visible .modal-footer button',
    '[role="dialog"]:visible button:has-text("Select")',
    '[role="dialog"]:visible button:has-text("Use this")',
    '[role="dialog"]:visible button:has-text("Use")',
    '[role="dialog"]:visible button:has-text("Confirm")',
    '[role="dialog"]:visible button:has-text("OK")',
    '.modal.in button:has-text("Select")',
    '.modal.in .btn-primary:not(.form-close)',
  ],
  confirmationPatterns: [
    /service request(?:\s+number)?[\s:#]*([A-Z0-9]+-[A-Z0-9]+-[A-Z0-9]+)/i,
    /confirmation[\s:#]*([A-Z0-9]+-[A-Z0-9]+-[A-Z0-9]+)/i,
    /reference[\s:#]*([A-Z0-9]+-[A-Z0-9]+-[A-Z0-9]+)/i,
    /\b([C][0-9]+-[0-9]+-[0-9]{6,})\b/,
    /\b([0-9]+-[0-9]+-[0-9]{6,})\b/,
  ],
} as const;

/** Portal URLs for each complaint type */
export const PORTAL_URLS: Record<string, string> = {
  'snow-ice': 'https://portal.311.nyc.gov/article/?kanumber=KA-01397',
  'illegal-parking': 'https://portal.311.nyc.gov/article/?kanumber=KA-01986',
  'heat-hot-water': 'https://portal.311.nyc.gov/article/?kanumber=KA-01790',
  'traffic-signal': 'https://portal.311.nyc.gov/article/?kanumber=KA-01791',
  'missed-collection': 'https://portal.311.nyc.gov/article/?kanumber=KA-02060',
  'blocked-sidewalk': 'https://portal.311.nyc.gov/article/?kanumber=KA-01980',
};
