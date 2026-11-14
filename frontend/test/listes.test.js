import { test } from 'node:test';
import assert from 'node:assert/strict';
import { paginer } from '../src/paginer.js';
import { apparierDebitsCredits } from '../src/paires.js';

test('paginer : découpe et ramène la page dans les bornes', () => {
  const liste = Array.from({ length: 12 }, (_, i) => i + 1);
  assert.deepEqual(paginer(liste, 0, 5), { page: 0, pages: 3, debut: 0, visibles: [1, 2, 3, 4, 5] });
  assert.deepEqual(paginer(liste, 2, 5).visibles, [11, 12]);
  assert.equal(paginer(liste, 9, 5).page, 2);
  assert.deepEqual(paginer([], 3, 5), { page: 0, pages: 1, debut: 0, visibles: [] });
});

const L = (p, q, deb, cre) => ({ p, q, deb: Math.round(deb * 100), cre: Math.round(cre * 100) });

test('appariement : exemple réel du compte 4132179498', () => {
  const ops = [
    L('548682', '1491799', 482784, 0), L('548682', '9179', 0, 482784), L('548682', '1763611', 482784, 0),
    L('548682', '1763611', 0, 310000), L('548682', '', 0, 173280), L('548682', '1910149', 0, 1923432),
    L('548682', '1910050', 0, 105189.49), L('548682', '1910149', 1923432, 0), L('548682', '2055548', 1923432, 0),
    L('548682', '2055548', 0, 1923432), L('2A6187', '13', 13804060, 0), L('548682', '1910050', 105189.49, 0),
  ];
  assert.deepEqual(apparierDebitsCredits(ops), [1, 1, 0, 0, 0, 2, 3, 2, 4, 4, 0, 3]);
});

test('appariement : priorité à la même quittance', () => {
  const ops = [L('P', 'Q1', 100, 0), L('P', 'Q2', 0, 100), L('P', 'Q1', 0, 100)];
  assert.deepEqual(apparierDebitsCredits(ops), [1, 0, 1]);
});

test('appariement : une ligne débit et crédit à la fois n’est jamais appariée', () => {
  assert.deepEqual(apparierDebitsCredits([L('P', 'Q', 100, 100), L('P', 'Q', 0, 100)]), [0, 0]);
});
