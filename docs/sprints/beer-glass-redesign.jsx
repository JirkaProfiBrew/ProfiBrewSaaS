import { useState } from "react";

// EBC to color mapping with smooth interpolation (16 reference points)
const EBC_COLORS = [
  { ebc: 2, color: [248, 231, 114] },
  { ebc: 4, color: [244, 214, 68] },
  { ebc: 6, color: [243, 195, 41] },
  { ebc: 8, color: [234, 170, 22] },
  { ebc: 12, color: [215, 135, 15] },
  { ebc: 16, color: [195, 105, 12] },
  { ebc: 20, color: [175, 80, 10] },
  { ebc: 25, color: [155, 60, 8] },
  { ebc: 30, color: [135, 42, 6] },
  { ebc: 35, color: [115, 30, 5] },
  { ebc: 40, color: [95, 20, 4] },
  { ebc: 50, color: [72, 12, 3] },
  { ebc: 60, color: [52, 8, 2] },
  { ebc: 70, color: [35, 5, 2] },
  { ebc: 80, color: [22, 3, 1] },
  { ebc: 100, color: [10, 1, 0] },
];

function ebcToColor(ebc) {
  if (ebc <= 0) return "rgb(200,200,200)";
  if (ebc <= EBC_COLORS[0].ebc) {
    const c = EBC_COLORS[0].color;
    return `rgb(${c[0]},${c[1]},${c[2]})`;
  }
  if (ebc >= EBC_COLORS[EBC_COLORS.length - 1].ebc) {
    const c = EBC_COLORS[EBC_COLORS.length - 1].color;
    return `rgb(${c[0]},${c[1]},${c[2]})`;
  }
  for (let i = 0; i < EBC_COLORS.length - 1; i++) {
    if (ebc >= EBC_COLORS[i].ebc && ebc <= EBC_COLORS[i + 1].ebc) {
      const t = (ebc - EBC_COLORS[i].ebc) / (EBC_COLORS[i + 1].ebc - EBC_COLORS[i].ebc);
      const c1 = EBC_COLORS[i].color;
      const c2 = EBC_COLORS[i + 1].color;
      const r = Math.round(c1[0] + (c2[0] - c1[0]) * t);
      const g = Math.round(c1[1] + (c2[1] - c1[1]) * t);
      const b = Math.round(c1[2] + (c2[2] - c1[2]) * t);
      return `rgb(${r},${g},${b})`;
    }
  }
  return "rgb(200,200,200)";
}

function ebcToColorLight(ebc, opacity = 0.3) {
  if (ebc <= 0) return "rgba(200,200,200,0.3)";
  const base = ebcToColor(ebc);
  const match = base.match(/rgb\((\d+),(\d+),(\d+)\)/);
  if (!match) return base;
  return `rgba(${match[1]},${match[2]},${match[3]},${opacity})`;
}

// ─── NEW DESIGN: Czech Pint (Tuplák) ───
function BeerGlassPint({ ebc, size = 64, placeholder = false }) {
  const beerColor = ebcToColor(ebc);
  const beerColorLight = ebcToColorLight(ebc, 0.15);
  const scale = size / 64;
  const w = 64 * scale;
  const h = 80 * scale;
  const id = `pint-${ebc}-${size}-${Math.random().toString(36).slice(2, 6)}`;

  return (
    <svg width={w} height={h} viewBox="0 0 64 80" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        {/* Glass transparency gradient */}
        <linearGradient id={`${id}-glass`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="white" stopOpacity="0.15" />
          <stop offset="40%" stopColor="white" stopOpacity="0.25" />
          <stop offset="60%" stopColor="white" stopOpacity="0.05" />
          <stop offset="100%" stopColor="white" stopOpacity="0.12" />
        </linearGradient>
        {/* Beer body gradient (subtle depth) */}
        <linearGradient id={`${id}-beer`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={beerColor} stopOpacity="0.9" />
          <stop offset="100%" stopColor={beerColor} stopOpacity="1" />
        </linearGradient>
        {/* Foam gradient */}
        <linearGradient id={`${id}-foam`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FFFEF5" />
          <stop offset="100%" stopColor="#F5EDD6" />
        </linearGradient>
        {/* Placeholder pattern */}
        <pattern id={`${id}-dots`} x="0" y="0" width="6" height="6" patternUnits="userSpaceOnUse">
          <circle cx="3" cy="3" r="0.8" fill="#999" opacity="0.4" />
        </pattern>
        {/* Clip for glass body */}
        <clipPath id={`${id}-clip`}>
          <path d="M12 8 L10 70 Q10 76 16 76 L48 76 Q54 76 54 70 L52 8 Z" />
        </clipPath>
      </defs>

      {/* Glass body outline */}
      <path
        d="M12 8 L10 70 Q10 76 16 76 L48 76 Q54 76 54 70 L52 8 Z"
        fill="white"
        fillOpacity="0.08"
        stroke="#C0B8A8"
        strokeWidth="1.5"
      />

      {/* Beer fill (clipped to glass) */}
      <g clipPath={`url(#${id}-clip)`}>
        {placeholder ? (
          <rect x="10" y="14" width="44" height="62" fill={`url(#${id}-dots)`} />
        ) : (
          <>
            {/* Beer body */}
            <rect x="10" y="18" width="44" height="58" fill={`url(#${id}-beer)`} />
            {/* Glass transparency overlay */}
            <rect x="10" y="18" width="44" height="58" fill={`url(#${id}-glass)`} />
            {/* Highlight streak (glass reflection) */}
            <rect x="16" y="22" width="3" height="48" rx="1.5" fill="white" opacity="0.18" />
          </>
        )}

        {/* Foam */}
        {!placeholder && (
          <>
            <path
              d="M10 18 Q18 21 24 17 Q30 14 38 18 Q44 21 54 17 L54 8 L10 8 Z"
              fill={`url(#${id}-foam)`}
            />
            {/* Foam bubbles */}
            <circle cx="20" cy="14" r="1.5" fill="white" opacity="0.5" />
            <circle cx="32" cy="12" r="1.2" fill="white" opacity="0.4" />
            <circle cx="42" cy="14" r="1" fill="white" opacity="0.45" />
            <circle cx="26" cy="16" r="0.8" fill="white" opacity="0.35" />
          </>
        )}
      </g>

      {/* Handle */}
      <path
        d="M52 24 Q62 24 62 38 Q62 52 52 52"
        fill="none"
        stroke="#C0B8A8"
        strokeWidth="2.5"
        strokeLinecap="round"
      />

      {/* Rim highlight */}
      <line x1="14" y1="8" x2="50" y2="8" stroke="white" strokeWidth="0.5" opacity="0.5" />
    </svg>
  );
}

// ─── OLD DESIGN (for comparison) ───
function BeerGlassOld({ ebc, size = 64 }) {
  const color = ebcToColor(ebc);
  const scale = size / 64;
  const w = 64 * scale;
  const h = 80 * scale;
  return (
    <svg width={w} height={h} viewBox="0 0 64 80" fill="none">
      {/* Simple rectangle = "pot" look */}
      <rect x="10" y="8" width="44" height="68" rx="4" fill={color} opacity="0.85" stroke="#aaa" strokeWidth="1.5" />
      {/* Flat foam */}
      <rect x="10" y="8" width="44" height="14" rx="4" fill="#F5EDD6" stroke="#aaa" strokeWidth="1.5" />
      {/* Handle */}
      <path d="M54 22 Q66 22 66 40 Q66 58 54 58" fill="none" stroke="#aaa" strokeWidth="2.5" />
    </svg>
  );
}

// ─── DEMO ───
export default function BeerGlassDemo() {
  const [ebc, setEbc] = useState(12);
  const styles = [
    { name: "American Light Lager", group: "Světlé ležáky", ebcMin: 3.9, ebcMax: 5.9, ibu: "8–12", abv: "2.8–4.2", og: "7.1–10" },
    { name: "Czech Premium Pale Lager", group: "Světlé ležáky", ebcMin: 6.9, ebcMax: 11.8, ibu: "30–45", abv: "4.2–5.8", og: "10.9–14.7" },
    { name: "International Amber Lager", group: "Polotmavé ležáky", ebcMin: 13.8, ebcMax: 27.6, ibu: "8–25", abv: "4.6–6", og: "10.4–13.5" },
    { name: "International Dark Lager", group: "Tmavé ležáky", ebcMin: 27.6, ebcMax: 43.3, ibu: "8–20", abv: "4.2–6", og: "10.9–13.7" },
  ];

  return (
    <div className="bg-gray-50 min-h-screen p-8">
      <h1 className="text-2xl font-bold mb-2">BeerGlass Redesign</h1>
      <p className="text-gray-500 mb-8">Nový design české sklenice (tuplák) vs. starý "hrnec"</p>

      {/* Comparison */}
      <div className="mb-10">
        <h2 className="text-lg font-semibold mb-4">Porovnání: Starý vs. Nový design</h2>
        <div className="flex items-end gap-8 mb-4">
          <div className="flex flex-col items-center gap-2">
            <BeerGlassOld ebc={ebc} size={80} />
            <span className="text-xs text-gray-400">Starý (hrnec)</span>
          </div>
          <div className="flex flex-col items-center gap-2">
            <BeerGlassPint ebc={ebc} size={80} />
            <span className="text-xs text-gray-500 font-medium">Nový (tuplák)</span>
          </div>
          <div className="flex flex-col items-center gap-2">
            <BeerGlassPint ebc={0} size={80} placeholder />
            <span className="text-xs text-gray-400">Placeholder</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium">EBC: {ebc}</label>
          <input
            type="range" min="2" max="80" value={ebc}
            onChange={e => setEbc(Number(e.target.value))}
            className="w-64"
          />
        </div>
      </div>

      {/* Size variants */}
      <div className="mb-10">
        <h2 className="text-lg font-semibold mb-4">Velikosti</h2>
        <div className="flex items-end gap-6">
          {[32, 48, 64, 80].map(s => (
            <div key={s} className="flex flex-col items-center gap-1">
              <BeerGlassPint ebc={ebc} size={s} />
              <span className="text-xs text-gray-400">{s}px</span>
            </div>
          ))}
        </div>
      </div>

      {/* EBC spectrum */}
      <div className="mb-10">
        <h2 className="text-lg font-semibold mb-4">Barevné spektrum</h2>
        <div className="flex items-end gap-2 flex-wrap">
          {[2, 4, 6, 8, 12, 16, 20, 25, 30, 35, 40, 50, 60, 70, 80].map(e => (
            <div key={e} className="flex flex-col items-center gap-1">
              <BeerGlassPint ebc={e} size={48} />
              <span className="text-xs text-gray-400">{e}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Beer Style Cards with dual BeerGlass */}
      <div className="mb-10">
        <h2 className="text-lg font-semibold mb-4">Pivní styly — dual BeerGlass (min → max EBC)</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {styles.map(s => (
            <div key={s.name} className="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-md transition-shadow">
              {/* Dual BeerGlass */}
              <div className="flex items-center justify-center gap-3 py-4 mb-3">
                <div className="flex flex-col items-center">
                  <BeerGlassPint ebc={s.ebcMin} size={48} />
                  <span className="text-xs text-gray-400 mt-1">{s.ebcMin}</span>
                </div>
                <div className="text-gray-300 text-lg">→</div>
                <div className="flex flex-col items-center">
                  <BeerGlassPint ebc={s.ebcMax} size={48} />
                  <span className="text-xs text-gray-400 mt-1">{s.ebcMax}</span>
                </div>
              </div>

              {/* Info */}
              <h3 className="font-semibold text-sm">{s.name}</h3>
              <p className="text-xs text-gray-400 mb-3">{s.group}</p>

              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-gray-400">ABV %</span>
                  <span className="font-medium">{s.abv}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">IBU</span>
                  <span className="font-medium">{s.ibu}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">EBC</span>
                  <span className="font-medium">{s.ebcMin}–{s.ebcMax}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">OG (°P)</span>
                  <span className="font-medium">{s.og}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Recipe card with EBC border */}
      <div className="mb-10">
        <h2 className="text-lg font-semibold mb-4">Recipe karta — levý EBC border (UX-09)</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { name: "Světlý ležák 12°P", style: "Czech Premium Pale Lager", og: 12.5, ibu: 38, ebc: 9, vol: 1000 },
            { name: "Tmavý ležák 12°P", style: "Czech Dark Lager", og: 12.5, ibu: 19, ebc: 45, vol: 108 },
            { name: "Vídeňák", style: "Vienna Lager", og: 12.7, ibu: 22, ebc: 18, vol: 1000 },
            { name: "IPA 14", style: "American IPA", og: 14.2, ibu: 58, ebc: 16, vol: 200 },
          ].map(r => (
            <div
              key={r.name}
              className="bg-white rounded-lg border border-gray-200 overflow-hidden hover:shadow-md transition-shadow"
              style={{ borderLeftWidth: '5px', borderLeftColor: ebcToColor(r.ebc) }}
            >
              <div className="flex justify-center py-4 bg-gray-50">
                <BeerGlassPint ebc={r.ebc} size={64} />
              </div>
              <div className="p-3">
                <h3 className="font-semibold text-sm">{r.name}</h3>
                <p className="text-xs text-gray-400 mb-2">{r.style}</p>
                <div className="grid grid-cols-2 gap-1 text-xs">
                  <div><span className="text-gray-400">OG</span> <span className="font-medium">{r.og}</span></div>
                  <div><span className="text-gray-400">IBU</span> <span className="font-medium">{r.ibu}</span></div>
                  <div><span className="text-gray-400">EBC</span> <span className="font-medium">{r.ebc}</span></div>
                  <div><span className="text-gray-400">Objem</span> <span className="font-medium">{r.vol} L</span></div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
