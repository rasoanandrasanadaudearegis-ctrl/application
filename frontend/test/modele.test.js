import { test } from 'node:test';
import assert from 'node:assert/strict';
import { plusUnAn, lignesInitiales, verifier, construireDonnees } from '../src/pdf/modele.js';

const ops = [
  { pc: 'PN32/1', p: 'A5B090', q: '2332767', l: 'QUIT', d: '2025-01-30', e: '2025-01-30', ec: null, deb: 13583484, cre: 0 },
  { pc: 'C3201/2', p: 'A5B090', q: '-', l: 'ENC', d: '2025-02-10', e: '2025-01-30', ec: null, deb: 0, cre: 5000000 },
  { pc: 'OD32/3', p: 'A5B090', q: '', l: 'VIDE', d: '2025-03-01', e: '2025-01-30', ec: null, deb: 0, cre: 0 },
];

test('plusUnAn : un an plus tard, 29 février -> 28 février', () => {
  assert.equal(plusUnAn('2025-01-30'), '2026-01-30');
  assert.equal(plusUnAn('2024-02-29'), '2025-02-28');
  assert.equal(plusUnAn(''), '');
});

test('facture : seulement les lignes au débit, cochée si elle est seule', () => {
  const l = lignesInitiales('facture', ops);
  assert.equal(l.length, 1);
  assert.equal(l[0].sel, true);
  assert.equal(l[0].fin, '2026-01-30');
});

test('relevé : toutes les lignes avec un montant, toutes cochées, quittance « - » vidée', () => {
  const l = lignesInitiales('releve', ops);
  assert.equal(l.length, 2);
  assert.ok(l.every((x) => x.sel));
  assert.equal(l[1].q, '');
});

test('vérifier : signale ce qui manque', () => {
  const lignes = lignesInitiales('facture', ops);
  const err = verifier({ numero: ' ', agence: '', lignes, des: {} });
  assert.ok(err.includes('Le numéro du document est vide.'));
  assert.ok(err.includes("Le numéro d'agence est vide."));
  assert.ok(err.some((e) => e.startsWith('Désignation manquante pour la police A5B090')));
  assert.deepEqual(verifier({ numero: '114', agence: '32', lignes, des: { A5B090: 'Multirisque' } }), []);
});

test('vérifier : fin de période avant le début', () => {
  const lignes = lignesInitiales('facture', ops).map((x) => ({ ...x, fin: '2024-01-01' }));
  const err = verifier({ numero: '1', agence: '32', lignes, des: { A5B090: 'X' } });
  assert.ok(err.some((e) => e.startsWith('La fin de période est avant le début')));
});

test('construireDonnees : client, adresse et lignes cochées', () => {
  const lignes = lignesInitiales('releve', ops);
  const doc = construireDonnees(
    { numero: ' 114 ', agence: '32', signataire: 'comptable', adresse: 'Lot 12\n\n Toliara ', lignes, des: { A5B090: ' Multirisque ' } },
    { compte_client: '4132190449', nom_client: ' IFVM ' },
    new Date('2026-11-02T00:00:00Z'),
  );
  assert.equal(doc.numero, '114');
  assert.deepEqual(doc.client, { compte: '4132190449', nom: 'IFVM', adresse: ['Lot 12', 'Toliara'] });
  assert.equal(doc.lignes.length, 2);
  assert.equal(doc.lignes[0].designation, 'Multirisque');
});
