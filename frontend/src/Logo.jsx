import { useState } from 'react';

export default function Logo() {
  const [absent, setAbsent] = useState(false);
  return (
    <span className={`logo-box${absent ? ' logo-vide' : ''}`}>
      {absent
        ? <span className="logo-place" title="Place ton logo dans public/logo-aro.png">LOGO</span>
        : <img className="logo" src={`${import.meta.env.BASE_URL}logo-aro.png`} alt="Logo ARO Assurance"
               onError={() => setAbsent(true)} />}
    </span>
  );
}
