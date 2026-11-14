export function apparierDebitsCredits(ops) {
  const parMontant = new Map();
  ops.forEach((o, i) => {
    const sens = o.deb > 0 && !o.cre ? 'd' : o.cre > 0 && !o.deb ? 'c' : null;
    if (!sens) return;
    const m = sens === 'd' ? o.deb : o.cre;
    if (!parMontant.has(m)) parMontant.set(m, { d: [], c: [] });
    parMontant.get(m)[sens].push(i);
  });
  const criteres = [
    (a, b) => a.p && a.q && a.p === b.p && a.q === b.q,
    (a, b) => a.p && a.p === b.p,
    () => true,
  ];
  const paires = [];
  parMontant.forEach(({ d, c }) => {
    if (!d.length || !c.length) return;
    const debLibres = new Set(d);
    const creLibres = new Set(c);
    criteres.forEach((ok) => {
      debLibres.forEach((i) => {
        const j = [...creLibres].find((k) => ok(ops[i], ops[k]));
        if (j === undefined) return;
        debLibres.delete(i);
        creLibres.delete(j);
        paires.push([Math.min(i, j), Math.max(i, j)]);
      });
    });
  });
  const num = new Array(ops.length).fill(0);
  paires.sort((a, b) => a[0] - b[0]).forEach(([i, j], n) => { num[i] = n + 1; num[j] = n + 1; });
  return num;
}
