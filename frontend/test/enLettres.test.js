import { test } from 'node:test';
import assert from 'node:assert/strict';
import { montantEnLettres } from '../src/pdf/enLettres.js';

test('montants simples', () => {
  assert.equal(montantEnLettres(0), 'zéro ariary');
  assert.equal(montantEnLettres(100), 'un ariary');
  assert.equal(montantEnLettres(2100), 'vingt et un ariary');
  assert.equal(montantEnLettres(7100), 'soixante et onze ariary');
  assert.equal(montantEnLettres(8000), 'quatre-vingts ariary');
  assert.equal(montantEnLettres(9100), 'quatre-vingt-onze ariary');
});

test('centaines, milliers, millions', () => {
  assert.equal(montantEnLettres(20000), 'deux cents ariary');
  assert.equal(montantEnLettres(20100), 'deux cent un ariary');
  assert.equal(montantEnLettres(100000), 'mille ariary');
  assert.equal(montantEnLettres(200000000), 'deux millions ariary');
  assert.equal(montantEnLettres(13505484), 'cent trente-cinq mille cinquante-quatre ariary quatre-vingt-quatre');
});

test('les centimes sont écrits après « ariary »', () => {
  assert.equal(montantEnLettres(135834), 'mille trois cent cinquante-huit ariary trente-quatre');
});

test('un montant négatif est écrit en valeur absolue', () => {
  assert.equal(montantEnLettres(-100), 'un ariary');
});
