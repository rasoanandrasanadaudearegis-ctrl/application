import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { EVENT_TOAST } from './notifier';

const DUREE = 5000;
const ICONES = { ok: '✓', erreur: '!', info: 'i' };

export default function Toasts() {
  const [liste, setListe] = useState([]);
  const suivant = useRef(0);

  useEffect(() => {
    const minuteurs = new Set();
    const recu = (e) => {
      const id = ++suivant.current;
      setListe((l) => [...l.slice(-3), { id, ...e.detail }]);
      const t = setTimeout(() => { minuteurs.delete(t); setListe((l) => l.filter((x) => x.id !== id)); }, DUREE);
      minuteurs.add(t);
    };
    window.addEventListener(EVENT_TOAST, recu);
    return () => {
      window.removeEventListener(EVENT_TOAST, recu);
      minuteurs.forEach(clearTimeout);
    };
  }, []);

  if (!liste.length) return null;
  return createPortal(
    <div className="toasts" role="status" aria-live="polite">
      {liste.map((t) => (
        <div key={t.id} className={`toast ${t.type}`} onClick={() => setListe((l) => l.filter((x) => x.id !== t.id))}>
          <span aria-hidden="true">{ICONES[t.type] || ICONES.info}</span>{t.texte}
        </div>
      ))}
    </div>,
    document.body,
  );
}
