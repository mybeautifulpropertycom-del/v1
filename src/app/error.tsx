"use client";
export default function Error({ reset }: { reset: () => void }) {
  return (
    <div className="state-screen">
      <span className="eyebrow">O MICĂ PAUZĂ</span>
      <h1>Să încercăm din nou.</h1>
      <p>Nu am putut încărca pagina. Încearcă din nou peste câteva momente.</p>
      <button className="button primary" onClick={reset}>
        Încearcă din nou
      </button>
    </div>
  );
}
