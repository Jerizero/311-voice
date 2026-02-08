import { initTestDb, closeDb, resetDb } from '../../src/storage/db.js';

/** Call before each test suite that touches the DB */
export function setupTestDb() {
  initTestDb();
}

/** Call between tests for isolation */
export function cleanTestDb() {
  resetDb();
}

/** Call after each test suite */
export function teardownTestDb() {
  closeDb();
}
