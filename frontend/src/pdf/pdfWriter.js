import { LARGEURS_REG, LARGEURS_BOLD } from './fontMetrics.js';

export const PAGE_W = 595.28;
export const PAGE_H = 841.89;

const NOMS = { R: 'Helvetica', B: 'Helvetica-Bold', I: 'Helvetica-Oblique', BI: 'Helvetica-BoldOblique' };
const CLES = { R: 'F1', B: 'F2', I: 'F3', BI: 'F4' };

const WIN = {
  '€': 0x80, '‚': 0x82, 'ƒ': 0x83, '„': 0x84, '…': 0x85, '†': 0x86, '‡': 0x87, 'ˆ': 0x88, '‰': 0x89,
  'Š': 0x8a, '‹': 0x8b, 'Œ': 0x8c, 'Ž': 0x8e, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95,
  '–': 0x96, '—': 0x97, '˜': 0x98, '™': 0x99, 'š': 0x9a, '›': 0x9b, 'œ': 0x9c, 'ž': 0x9e, 'Ÿ': 0x9f,
};

function enWinAnsi(s) {
  let out = '';
  for (const ch of String(s)) {
    let c = ch.codePointAt(0);
    if (c === 0x202f || c === 0x00a0 || c === 0x2009) c = 0x20;
    else if (WIN[ch] !== undefined) c = WIN[ch];
    else if (c > 255) c = 0x3f;
    out += String.fromCharCode(c);
  }
  return out;
}

const echapper = (s) => s.replace(/[\\()]/g, (m) => '\\' + m);
const n2 = (x) => (Math.round(x * 100) / 100).toString();

export class Pdf {
  constructor() {
    this.pages = [];
    this.cur = null;
  }

  addPage() {
    this.cur = [];
    this.pages.push(this.cur);
    return this;
  }

  largeur(s, police = 'R', taille = 10) {
    const t = police === 'B' || police === 'BI' ? LARGEURS_BOLD : LARGEURS_REG;
    let w = 0;
    for (const ch of enWinAnsi(s)) {
      const c = ch.charCodeAt(0);
      w += c >= 32 ? t[c - 32] || 0 : 0;
    }
    return (w * taille) / 1000;
  }

  texte(x, y, s, { police = 'R', taille = 10, align = 'left', souligne = false } = {}) {
    if (s === '' || s === null || s === undefined) return 0;
    const w = this.largeur(s, police, taille);
    const x0 = align === 'right' ? x - w : align === 'center' ? x - w / 2 : x;
    const b = enWinAnsi(s);
    this.cur.push(
      `BT /${CLES[police]} ${n2(taille)} Tf 1 0 0 1 ${n2(x0)} ${n2(PAGE_H - y)} Tm (${echapper(b)}) Tj ET`,
    );
    if (souligne) this.trait(x0, y + 1.1, x0 + w, y + 1.1, 0.6);
    return w;
  }

  riche(x, y, morceaux, { taille = 10 } = {}) {
    let cx = x;
    for (const m of morceaux) {
      cx += this.texte(cx, y, m.t, { police: m.police || 'R', taille, souligne: !!m.souligne });
    }
    return cx;
  }

  trait(x1, y1, x2, y2, epaisseur = 0.75) {
    this.cur.push(`${n2(epaisseur)} w 0 G ${n2(x1)} ${n2(PAGE_H - y1)} m ${n2(x2)} ${n2(PAGE_H - y2)} l S`);
  }

  rect(x, y, w, h, epaisseur = 0.75) {
    this.cur.push(`${n2(epaisseur)} w 0 G ${n2(x)} ${n2(PAGE_H - y - h)} ${n2(w)} ${n2(h)} re S`);
  }

  construire() {
    const objets = [];
    const ajouter = (c) => { objets.push(c); return objets.length; };

    const racine = ajouter('');
    const arbre = ajouter('');
    const polices = {};
    for (const k of Object.keys(NOMS)) {
      polices[k] = ajouter(
        `<< /Type /Font /Subtype /Type1 /BaseFont /${NOMS[k]} /Encoding /WinAnsiEncoding >>`,
      );
    }
    const ressources = `<< /Font << ${Object.keys(NOMS).map((k) => `/${CLES[k]} ${polices[k]} 0 R`).join(' ')} >> >>`;

    const idsPages = [];
    for (const ops of this.pages) {
      const flux = ops.join('\n');
      const idFlux = ajouter(`<< /Length ${flux.length} >>\nstream\n${flux}\nendstream`);
      idsPages.push(
        ajouter(
          `<< /Type /Page /Parent ${arbre} 0 R /MediaBox [0 0 ${n2(PAGE_W)} ${n2(PAGE_H)}] ` +
          `/Resources ${ressources} /Contents ${idFlux} 0 R >>`,
        ),
      );
    }
    objets[racine - 1] = `<< /Type /Catalog /Pages ${arbre} 0 R >>`;
    objets[arbre - 1] = `<< /Type /Pages /Kids [${idsPages.map((i) => `${i} 0 R`).join(' ')}] /Count ${idsPages.length} >>`;

    let pdf = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
    const positions = [];
    objets.forEach((c, i) => {
      positions.push(pdf.length);
      pdf += `${i + 1} 0 obj\n${c}\nendobj\n`;
    });
    const debutXref = pdf.length;
    pdf += `xref\n0 ${objets.length + 1}\n0000000000 65535 f \n`;
    for (const p of positions) pdf += `${String(p).padStart(10, '0')} 00000 n \n`;
    pdf += `trailer\n<< /Size ${objets.length + 1} /Root ${racine} 0 R >>\nstartxref\n${debutXref}\n%%EOF\n`;

    const octets = new Uint8Array(pdf.length);
    for (let i = 0; i < pdf.length; i++) octets[i] = pdf.charCodeAt(i) & 255;
    return octets;
  }
}
