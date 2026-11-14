import { test } from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { choisirFeuille } from '../src/importRcc.js';

const ENTETES = ['Id', 'Pieces', 'Comptes Client', 'Nom Client', 'Date', 'Journal', 'Libelle', 'Police', 'Effet',
  'Quittance', 'Période', 'Débit', 'Crédit'];

test('feuille trouvée par ses colonnes, quel que soit son nom et l’ordre des colonnes', () => {
  const wb = new ExcelJS.Workbook();
  wb.addWorksheet('Notes').addRow(['Rien ici']);
  wb.addWorksheet('RCC novembre').addRow([...ENTETES].reverse());
  const { conformes } = choisirFeuille(wb);
  assert.equal(conformes.length, 1);
  assert.equal(conformes[0].feuille.name, 'RCC novembre');
  assert.equal(conformes[0].ligne, 1);
  assert.equal(conformes[0].ix.echeance, undefined);
});

test('en-têtes sous un titre (ligne 3)', () => {
  const wb = new ExcelJS.Workbook();
  const f = wb.addWorksheet('Export');
  f.addRow(['RELEVE DE COMPTE CLIENT']);
  f.addRow([]);
  f.addRow([...ENTETES, 'Echeance', 'code_apporteur']);
  const { conformes } = choisirFeuille(wb);
  assert.equal(conformes[0].ligne, 3);
  assert.ok(conformes[0].ix.echeance && conformes[0].ix.apporteur);
});

test('plusieurs feuilles conformes : le premier onglet est retenu', () => {
  const wb = new ExcelJS.Workbook();
  wb.addWorksheet('32').addRow(ENTETES);
  wb.addWorksheet('Trav').addRow(ENTETES);
  const { conformes } = choisirFeuille(wb);
  assert.deepEqual(conformes.map((c) => c.feuille.name), ['32', 'Trav']);
});

test('colonnes obligatoires manquantes : refus avec le détail', () => {
  const wb = new ExcelJS.Workbook();
  wb.addWorksheet('Feuil1').addRow(ENTETES.filter((c) => c !== 'Police' && c !== 'Débit'));
  wb.addWorksheet('Vide');
  const { conformes, meilleurEssai } = choisirFeuille(wb);
  assert.equal(conformes.length, 0);
  assert.deepEqual(meilleurEssai, ['« Feuil1 » : manque Police, Débit', '« Vide » : vide']);
});
