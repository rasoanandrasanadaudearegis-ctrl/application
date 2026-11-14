export function plusUnAn(iso) {
  if (!iso) return '';
  const [a, m, j] = iso.split('-').map(Number);
  const t = new Date(Date.UTC(a + 1, m - 1, j));
  if (t.getUTCMonth() !== m - 1) t.setUTCDate(0);
  return t.toISOString().slice(0, 10);
}

export function lignesInitiales(mode, ops) {
  const utiles = ops.filter((o) => (o.deb !== 0 || o.cre !== 0) && (mode === 'releve' || o.deb > 0));
  return utiles.map((o) => ({
    pc: o.pc || '',
    p: o.p || '',
    q: o.q && o.q !== '-' ? o.q : '',
    l: o.l || '',
    date: o.d || '',
    e: o.e || '',
    fin: o.ec || plusUnAn(o.e),
    mention: '',
    observation: '',
    deb: o.deb,
    cre: o.cre,
    sel: mode === 'releve' || utiles.length === 1,
  }));
}

export const policesChoisies = (lignes) => [...new Set(lignes.filter((l) => l.sel).map((l) => l.p))];

export function verifier({ numero, agence, lignes, des }) {
  const err = [];
  const choisies = lignes.filter((l) => l.sel);
  if (!String(numero).trim()) err.push('Le numéro du document est vide.');
  if (!String(agence).trim()) err.push("Le numéro d'agence est vide.");
  if (choisies.length === 0) err.push('Aucune ligne cochée.');
  for (const l of choisies) {
    const nom = `${l.p || '(sans police)'}${l.q ? ` / quittance ${l.q}` : ''}`;
    if (!l.e || !l.fin) err.push(`Période incomplète : ${nom}.`);
    else if (l.fin < l.e) err.push(`La fin de période est avant le début : ${nom}.`);
  }
  for (const p of policesChoisies(lignes)) {
    if (!String((des || {})[p] || '').trim()) err.push(`Désignation manquante pour la police ${p || '(sans police)'}.`);
  }
  return err;
}

export function construireDonnees({ numero, agence, signataire, adresse, lignes, des }, compte, date = new Date()) {
  return {
    numero: String(numero).trim(),
    agence: String(agence).trim(),
    signataire,
    date,
    client: {
      compte: compte.compte_client,
      nom: (compte.nom_client || '').trim(),
      adresse: String(adresse || '').split('\n').map((s) => s.trim()).filter(Boolean),
    },
    lignes: lignes.filter((l) => l.sel).map((l) => ({
      police: l.p,
      quittance: l.q,
      effet: l.e,
      fin: l.fin,
      designation: String(des[l.p] || '').trim(),
      mention: String(l.mention || '').trim(),
      observation: l.cre > 0 ? String(l.observation || '').trim() : '',
      deb: l.deb,
      cre: l.cre,
    })),
  };
}
