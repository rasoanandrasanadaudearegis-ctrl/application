import { test } from 'node:test';
import assert from 'node:assert/strict';
import { trancheQuittance, cleQuittance, dateArrete } from '../src/quittances.js';

test('tranches d’ancienneté autour d’un arrêté au 02/11/2026', () => {
  assert.equal(trancheQuittance('2025-11-02', '2026-11-02'), 'an');
  assert.equal(trancheQuittance('2025-11-03', '2026-11-02'), 'm3p');
  assert.equal(trancheQuittance('2026-08-02', '2026-11-02'), 'm3p');
  assert.equal(trancheQuittance('2026-08-03', '2026-11-02'), 'm3m');
});

test('tranches : fin de mois (31 mai moins 3 mois = 28 février)', () => {
  assert.equal(trancheQuittance('2026-02-28', '2026-05-31'), 'm3p');
  assert.equal(trancheQuittance('2026-03-01', '2026-05-31'), 'm3m');
});

test('tranches : arrêté au 29 février', () => {
  assert.equal(trancheQuittance('2023-02-28', '2024-02-29'), 'an');
  assert.equal(trancheQuittance('2023-03-01', '2024-02-29'), 'm3p');
});

test('clé de quittance : insensible à la casse, sensible à l’échéance et au rang', () => {
  const q = { quittance: '2332767', police: 'A5B090', date_effet: '2025-01-30', echeance: null, assure: 'PRO SECURITY' };
  assert.equal(cleQuittance(q), cleQuittance({ ...q, police: 'a5b090', assure: 'pro security' }));
  assert.notEqual(cleQuittance(q), cleQuittance({ ...q, echeance: '2026-10-31' }));
  assert.notEqual(cleQuittance(q, 1), cleQuittance(q, 2));
  assert.match(cleQuittance(q), /^[0-9a-f]{40}$/);
});

test('date d’arrêté invalide remplacée par aujourd’hui', () => {
  assert.equal(dateArrete('2026-11-02'), '2026-11-02');
  assert.match(dateArrete('n’importe quoi'), /^\d{4}-\d{2}-\d{2}$/);
});
