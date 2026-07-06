import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getAllTemplates, getTemplate } from '../../src/complaints/templates/index.js';
import type { ComplaintType } from '../../src/complaints/types.js';

describe('complaint templates', () => {
  const allTemplates = getAllTemplates();

  it('has exactly 6 templates', () => {
    assert.equal(allTemplates.length, 6);
  });

  it('all templates have required structure', () => {
    for (const t of allTemplates) {
      assert.ok(t.type, `template missing type`);
      assert.ok(t.displayName, `${t.type} missing displayName`);
      assert.ok(t.description, `${t.type} missing description`);
      assert.ok(Array.isArray(t.requiredFields), `${t.type} requiredFields not array`);
      assert.ok(Array.isArray(t.optionalFields), `${t.type} optionalFields not array`);
      assert.ok(t.portalCategory, `${t.type} missing portalCategory`);
    }
  });

  it('all fields have name, label, type', () => {
    for (const t of allTemplates) {
      const allFields = [...t.requiredFields, ...t.optionalFields];
      for (const f of allFields) {
        assert.ok(f.name, `${t.type}: field missing name`);
        assert.ok(f.label, `${t.type}.${f.name}: field missing label`);
        assert.ok(['text', 'select', 'boolean'].includes(f.type), `${t.type}.${f.name}: invalid type "${f.type}"`);
      }
    }
  });

  it('no duplicate field names within a template', () => {
    for (const t of allTemplates) {
      const allFields = [...t.requiredFields, ...t.optionalFields];
      const names = allFields.map(f => f.name);
      const uniqueNames = new Set(names);
      assert.equal(names.length, uniqueNames.size, `${t.type} has duplicate field names: ${names}`);
    }
  });

  it('select fields have options', () => {
    for (const t of allTemplates) {
      const allFields = [...t.requiredFields, ...t.optionalFields];
      for (const f of allFields) {
        if (f.type === 'select') {
          assert.ok(f.options && f.options.length > 0, `${t.type}.${f.name}: select field missing options`);
        }
      }
    }
  });

  it('required fields are marked required: true', () => {
    for (const t of allTemplates) {
      for (const f of t.requiredFields) {
        assert.equal(f.required, true, `${t.type}.${f.name}: required field not marked required`);
      }
    }
  });

  it('getTemplate returns correct template for each type', () => {
    const types: ComplaintType[] = ['illegal-parking', 'heat-hot-water', 'traffic-signal', 'snow-ice', 'missed-collection', 'blocked-sidewalk'];
    for (const type of types) {
      const t = getTemplate(type);
      assert.equal(t.type, type);
    }
  });

  it('snow-ice template has address and locationType required fields', () => {
    const t = getTemplate('snow-ice');
    const requiredNames = t.requiredFields.map(f => f.name);
    assert.ok(requiredNames.includes('address'));
    assert.ok(requiredNames.includes('locationType'));
  });

  it('illegal-parking template has location and violationType required fields', () => {
    const t = getTemplate('illegal-parking');
    const requiredNames = t.requiredFields.map(f => f.name);
    assert.ok(requiredNames.includes('location'));
    assert.ok(requiredNames.includes('violationType'));
  });
});
