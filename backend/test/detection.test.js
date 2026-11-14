import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyserGroupes, analyserDoublons, quittanceValide } from '../src/detection.js';

const types = (res) => res.map((r) => `${r[0]}:${r[1]}`).sort();

test('même nom sur deux comptes proches : seul le compte minoritaire est signalé', () => {
  const res = analyserGroupes([
    ['4132181246', 'RAKOTO JEAN', 20],
    ['4132181264', 'RAKOTO JEAN', 2],
  ]);
  assert.deepEqual(types(res), ['meme_nom_comptes_proches:4132181264']);
  assert.match(res[0][3], /probablement mal saisi/);
});

test('même nom, comptes proches à égalité : les deux sont signalés', () => {
  const res = analyserGroupes([
    ['4132181246', 'RAKOTO JEAN', 5],
    ['4132181247', 'RAKOTO JEAN', 5],
  ]);
  assert.deepEqual(types(res), ['meme_nom_comptes_proches:4132181246', 'meme_nom_comptes_proches:4132181247']);
});

test('comptes trop différents : rien à signaler', () => {
  const res = analyserGroupes([
    ['4132181246', 'RAKOTO JEAN', 5],
    ['4132199999', 'RAKOTO JEAN', 5],
  ]);
  assert.deepEqual(res, []);
});

test('même compte, nom vraiment différent : signalé', () => {
  const res = analyserGroupes([
    ['4132100001', 'SOCIETE MUREX', 10],
    ['4132100001', 'A D E S', 3],
  ]);
  assert.deepEqual(types(res), ['compte_noms_differents:4132100001']);
  assert.deepEqual(res[0][2], ['A D E S']);
  assert.match(res[0][3], /SOCIETE MUREX/);
});

test('même compte, variante du nom (abrégé ou complété) : non signalé', () => {
  const res = analyserGroupes([
    ['4132100001', 'SOCIETE MUREX INTERNATIONAL', 10],
    ['4132100001', 'SOCIETE MUREX', 3],
    ['4132100001', 'Société Murex', 1],
  ]);
  assert.deepEqual(res, []);
});

test('noms ignorés : chiffres seuls ou contenant le numéro de compte', () => {
  const res = analyserGroupes([
    ['4132100001', 'SOCIETE MUREX', 10],
    ['4132100001', '4132190261', 2],
    ['4132100001', 'CLIENT 4132100001', 2],
  ]);
  assert.deepEqual(res, []);
});

test('quittanceValide : vide, « - », 0 et 1 ne comptent pas', () => {
  assert.equal(quittanceValide(''), null);
  assert.equal(quittanceValide('-'), null);
  assert.equal(quittanceValide('0'), null);
  assert.equal(quittanceValide('1'), null);
  assert.equal(quittanceValide(' 2332767 '), '2332767');
});

test('doublons : même nom et mêmes références sur deux comptes', () => {
  const lignes = [
    [1, '4132100001', 'RAKOTO JEAN', 'A5B090', '2025-01-30', '2332767', '1000.00', '0.00'],
    [2, '4132100002', 'Rakoto Jean', 'a5b090', '2025-01-30', '2332767', '1000.00', '0.00'],
  ];
  const soldes = new Map([['4132100001', '1000.00'], ['4132100002', '1000.00']]);
  const res = analyserDoublons(lignes, soldes);
  const parType = new Set(res.map((r) => r[0]));
  assert.ok(parType.has('doublon_nom_police_effet_quittance'));
  assert.ok(parType.has('doublon_nom_police_effet_quittance_montant'));
  assert.ok(parType.has('doublon_nom_police_quittance_solde'));
  assert.ok(!parType.has('doublon_nom_police_effet_quittance_montant_solde_diff'));
  const ref = res.find((r) => r[0] === 'doublon_nom_police_effet_quittance' && r[1] === 1);
  assert.deepEqual(ref[3], ['4132100002']);
});

test('doublons : soldes différents détectés seulement si les soldes diffèrent', () => {
  const lignes = [
    [1, '4132100001', 'RAKOTO JEAN', 'A5B090', '2025-01-30', '2332767', '1000.00', '0.00'],
    [2, '4132100002', 'RAKOTO JEAN', 'A5B090', '2025-01-30', '2332767', '1000.00', '0.00'],
  ];
  const soldes = new Map([['4132100001', '1000.00'], ['4132100002', '0.00']]);
  const res = analyserDoublons(lignes, soldes, 'doublon_nom_police_effet_quittance_montant_solde_diff');
  assert.equal(res.length, 2);
  assert.match(res[0][2], /soldes différents/);
});

test('doublons : un seul compte = pas de doublon', () => {
  const lignes = [
    [1, '4132100001', 'RAKOTO JEAN', 'A5B090', '2025-01-30', '2332767', '1000.00', '0.00'],
    [2, '4132100001', 'RAKOTO JEAN', 'A5B090', '2025-01-30', '2332767', '1000.00', '0.00'],
  ];
  assert.deepEqual(analyserDoublons(lignes, new Map([['4132100001', '2000.00']])), []);
});
