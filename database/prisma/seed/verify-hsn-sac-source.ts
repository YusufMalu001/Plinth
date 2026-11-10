import assert from 'node:assert/strict';
import { loadHsnSacDefinitions } from './seed-hsn-sac';

const definitions = loadHsnSacDefinitions();
const hsnCount = definitions.filter((item) => item.kind === 'HSN').length;
const sacCount = definitions.filter((item) => item.kind === 'SAC').length;

assert.equal(hsnCount, 20_486, 'HSN_6_PLUS row count changed; review the source before seeding');
assert.equal(sacCount, 649, 'SAC_6_PLUS row count changed; review the source before seeding');
assert.equal(definitions.length, 21_135);
assert.equal(new Set(definitions.map((item) => item.code)).size, definitions.length, 'HSN/SAC code collision detected');

console.log(`Verified ${definitions.length} rows: ${hsnCount} HSN and ${sacCount} SAC; all codes are unique and descriptions are present.`);
