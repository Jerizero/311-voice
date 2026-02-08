import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildClassificationPrompt,
  buildFollowUpPrompt,
  buildExtractionPrompt,
  buildConfirmationSummary,
} from '../../src/conversation/prompts.js';
import { getTemplate, getAllTemplates } from '../../src/complaints/templates/index.js';

describe('buildClassificationPrompt', () => {
  it('includes all complaint types', () => {
    const prompt = buildClassificationPrompt('test', []);
    for (const t of getAllTemplates()) {
      assert.ok(prompt.includes(t.type), `Missing type: ${t.type}`);
    }
  });

  it('includes the user message', () => {
    const prompt = buildClassificationPrompt('ice on my sidewalk', []);
    assert.ok(prompt.includes('ice on my sidewalk'));
  });

  it('includes conversation history when present', () => {
    const history = [
      { role: 'user' as const, content: 'hello' },
      { role: 'assistant' as const, content: 'how can I help?' },
    ];
    const prompt = buildClassificationPrompt('ice on sidewalk', history);
    assert.ok(prompt.includes('hello'));
    assert.ok(prompt.includes('how can I help?'));
  });

  it('requests JSON response format', () => {
    const prompt = buildClassificationPrompt('test', []);
    assert.ok(prompt.includes('JSON'));
    assert.ok(prompt.includes('complaintType'));
  });
});

describe('buildFollowUpPrompt', () => {
  it('lists missing required fields', () => {
    const template = getTemplate('snow-ice');
    const prompt = buildFollowUpPrompt(template, { address: '123 Main' }, []);
    assert.ok(prompt.includes('Location type'), `Should list missing locationType. Prompt: ${prompt.substring(0, 200)}`);
  });

  it('shows gathered fields', () => {
    const template = getTemplate('snow-ice');
    const prompt = buildFollowUpPrompt(template, { address: '123 Main St' }, []);
    assert.ok(prompt.includes('123 Main St'));
  });

  it('lists select field options', () => {
    const template = getTemplate('snow-ice');
    const prompt = buildFollowUpPrompt(template, {}, []);
    assert.ok(prompt.includes('Sidewalk'));
    assert.ok(prompt.includes('Bus stop'));
  });
});

describe('buildExtractionPrompt', () => {
  it('lists all field names and descriptions', () => {
    const template = getTemplate('snow-ice');
    const prompt = buildExtractionPrompt(template, 'it is on the sidewalk', {});
    assert.ok(prompt.includes('address'));
    assert.ok(prompt.includes('locationType'));
  });

  it('includes already gathered fields', () => {
    const template = getTemplate('snow-ice');
    const prompt = buildExtractionPrompt(template, 'sidewalk', { address: '123 Main' });
    assert.ok(prompt.includes('123 Main'));
  });

  it('includes the user message', () => {
    const template = getTemplate('snow-ice');
    const prompt = buildExtractionPrompt(template, 'near the bus stop', {});
    assert.ok(prompt.includes('near the bus stop'));
  });
});

describe('buildConfirmationSummary', () => {
  it('includes template display name', () => {
    const template = getTemplate('snow-ice');
    const summary = buildConfirmationSummary(template, { address: 'X', locationType: 'Sidewalk' });
    assert.ok(summary.includes('Snow or Ice'));
  });

  it('includes all required field values', () => {
    const template = getTemplate('snow-ice');
    const summary = buildConfirmationSummary(template, { address: '123 Main St', locationType: 'Sidewalk' });
    assert.ok(summary.includes('123 Main St'));
    assert.ok(summary.includes('Sidewalk'));
  });

  it('shows (not provided) for missing required fields', () => {
    const template = getTemplate('snow-ice');
    const summary = buildConfirmationSummary(template, {});
    assert.ok(summary.includes('(not provided)'));
  });

  it('includes optional fields when provided', () => {
    const template = getTemplate('snow-ice');
    const summary = buildConfirmationSummary(template, {
      address: 'X',
      locationType: 'Sidewalk',
      extendedArea: 'covers 2 blocks',
    });
    assert.ok(summary.includes('covers 2 blocks'));
  });

  it('includes submit instruction', () => {
    const template = getTemplate('snow-ice');
    const summary = buildConfirmationSummary(template, { address: 'X', locationType: 'Y' });
    assert.ok(summary.includes('submit'));
  });
});
