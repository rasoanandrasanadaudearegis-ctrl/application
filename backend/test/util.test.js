import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normNom, levenshtein, similarPct, parseYmd, estNumerique, serialExcelVersYmd, valeurModele, lg, sous, libelleDate,
} from '../src/util.js';

test('normNom : sans accents, majuscules, ponctuation remplacée par un espace', () => {
  assert.equal(normNom('Société  Murex, S.A.'), 'SOCIETE MUREX S A');
  assert.equal(normNom("  l'Élan  "), 'L ELAN');
  assert.equal(normNom(null), '');
});

test('levenshtein : nombre de modifications entre deux textes', () => {
  assert.equal(levenshtein('4132181246', '4132181246'), 0);
  assert.equal(levenshtein('4132181246', '4132181264'), 2);
  assert.equal(levenshtein('', 'abc'), 3);
});

test('similarPct : identique = 100 %, sans rapport = faible', () => {
  assert.equal(similarPct('MUREX', 'MUREX'), 100);
  assert.ok(similarPct('SOCIETE MUREX', 'A D E S') < 50);
});

test('parseYmd : refuse les dates impossibles', () => {
  assert.ok(parseYmd('2024-02-29'));
  assert.equal(parseYmd('2023-02-29'), null);
  assert.equal(parseYmd('31/12/2025'), null);
});

test('estNumerique et dates Excel', () => {
  assert.ok(estNumerique('12.5'));
  assert.ok(estNumerique(3));
  assert.ok(!estNumerique('abc'));
  assert.ok(!estNumerique(''));
  assert.equal(serialExcelVersYmd(45658), '2025-01-01');
});

test('valeurModele : nombre sauf zéro de tête', () => {
  assert.equal(valeurModele('4132190449'), 4132190449);
  assert.equal(valeurModele('0023'), '0023');
  assert.equal(valeurModele(''), null);
});

test('lg et sous comptent les caractères, pas les octets', () => {
  assert.equal(lg('été'), 3);
  assert.equal(sous('Échéance', 3), 'Éch');
});

test('libelleDate', () => {
  assert.equal(libelleDate('2026-11-02'), '2 NOVEMBRE 2026');
  assert.equal(libelleDate('2026-08-15', false), '15 Août 2026');
});
