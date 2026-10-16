"use client";

/* eslint-disable @next/next/no-img-element -- Map tiles use provider raster coordinates and fixed native dimensions. */

import { useState } from "react";

const latitudeLimit = 85.05112878;
function worldPoint(latitude: number, longitude: number, zoom: number) {
  const scale = 256 * 2 ** zoom; const radians = Math.max(-latitudeLimit, Math.min(latitudeLimit, latitude)) * Math.PI / 180;
  return { x: (longitude + 180) / 360 * scale, y: (1 - Math.log(Math.tan(radians) + 1 / Math.cos(radians)) / Math.PI) / 2 * scale };
}
function geographicPoint(x: number, y: number, zoom: number) {
  const scale = 256 * 2 ** zoom;
  return { longitude: ((x / scale * 360) % 360 + 360) % 360 - 180, latitude: Math.atan(Math.sinh(Math.PI * (1 - 2 * Math.max(0, Math.min(scale, y)) / scale))) * 180 / Math.PI };
}

/** Values remain empty until the operator explicitly selects or enters a point. */
export default function GeographicPointPicker({ latitude, longitude, markers = [], initialZoom }: { latitude: number | null; longitude: number | null; markers?: { label: string; latitude: number; longitude: number }[]; initialZoom?: number }) {
  const [point, setPoint] = useState({ latitude: latitude === null ? "" : String(latitude), longitude: longitude === null ? "" : String(longitude) });
  const [center, setCenter] = useState({ latitude: latitude ?? -14, longitude: longitude ?? -52 });
  const [zoom, setZoom] = useState(initialZoom ?? (latitude === null ? 4 : 16));
  const world = worldPoint(center.latitude, center.longitude, zoom);
  const tileX = Math.floor(world.x / 256); const tileY = Math.floor(world.y / 256); const tileCount = 2 ** zoom;
  const marker = point.latitude !== "" && point.longitude !== "" && Number.isFinite(Number(point.latitude)) && Number.isFinite(Number(point.longitude)) ? worldPoint(Number(point.latitude), Number(point.longitude), zoom) : null;
  function move(dx: number, dy: number) { setCenter(geographicPoint(world.x + dx, world.y + dy, zoom)); }
  return <fieldset className="space-y-2 rounded border p-2"><legend className="text-xs font-semibold">Localização geográfica</legend>
    <div className="grid grid-cols-2 gap-2"><label className="text-xs">Latitude<input name="latitude" type="number" min="-90" max="90" step="any" value={point.latitude} onChange={event => setPoint(current => ({ ...current, latitude: event.target.value }))} className="mt-1 w-full rounded border p-1.5"/></label><label className="text-xs">Longitude<input name="longitude" type="number" min="-180" max="180" step="any" value={point.longitude} onChange={event => setPoint(current => ({ ...current, longitude: event.target.value }))} className="mt-1 w-full rounded border p-1.5"/></label></div>
    <div className="flex flex-wrap gap-1 text-xs"><button type="button" className="rounded border px-2 py-1" onClick={() => setZoom(value => Math.min(19, value + 1))}>Ampliar</button><button type="button" className="rounded border px-2 py-1" onClick={() => setZoom(value => Math.max(2, value - 1))}>Reduzir</button>{([["Oeste", -128, 0], ["Leste", 128, 0], ["Norte", 0, -128], ["Sul", 0, 128]] as const).map(([label, x, y]) => <button key={label} type="button" className="rounded border px-2 py-1" onClick={() => move(x, y)}>{label}</button>)}<button type="button" className="rounded border px-2 py-1" onClick={() => { if (point.latitude !== "" && point.longitude !== "" && Math.abs(Number(point.latitude)) <= 90 && Math.abs(Number(point.longitude)) <= 180) { setCenter({ latitude: Number(point.latitude), longitude: Number(point.longitude) }); setZoom(16); } }}>Centralizar coordenadas</button><button type="button" className="rounded border px-2 py-1" onClick={() => setPoint({ latitude: "", longitude: "" })}>Limpar ponto</button></div>
    <div role="button" tabIndex={0} aria-label="Selecionar ponto no mapa; use Enter para selecionar o centro" className="relative h-64 cursor-crosshair overflow-hidden rounded border bg-slate-100" onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setPoint({ latitude: center.latitude.toFixed(7), longitude: center.longitude.toFixed(7) }); } }} onClick={event => { const bounds = event.currentTarget.getBoundingClientRect(); const chosen = geographicPoint(world.x + event.clientX - bounds.left - bounds.width / 2, world.y + event.clientY - bounds.top - bounds.height / 2, zoom); setPoint({ latitude: chosen.latitude.toFixed(7), longitude: chosen.longitude.toFixed(7) }); }}>
      {Array.from({ length: 7 }, (_, x) => Array.from({ length: 3 }, (_, y) => { const column = tileX + x - 3; const row = tileY + y - 1; if (row < 0 || row >= tileCount) return null; return <img key={`${column}:${row}:${zoom}`} alt="" aria-hidden="true" draggable={false} loading="lazy" src={`https://tile.openstreetmap.org/${zoom}/${((column % tileCount) + tileCount) % tileCount}/${row}.png`} width={256} height={256} style={{ position: "absolute", left: `calc(50% + ${column * 256 - world.x}px)`, top: `calc(50% + ${row * 256 - world.y}px)` }}/>; }))}
      {marker && <span aria-hidden="true" className="pointer-events-none absolute size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-red-600 shadow" style={{ left: `calc(50% + ${marker.x - world.x}px)`, top: `calc(50% + ${marker.y - world.y}px)` }}/>}
      {markers.map((item, index) => { const position = worldPoint(item.latitude, item.longitude, zoom); return <span key={index} title={item.label} className="absolute -translate-x-1/2 -translate-y-1/2 rounded border-2 border-white bg-emerald-700 px-1 text-[10px] font-semibold text-white shadow" style={{ left: `calc(50% + ${position.x - world.x}px)`, top: `calc(50% + ${position.y - world.y}px)` }}>{index + 1}</span>; })}
    </div><p className="text-[10px] text-slate-500">Clique no mapa para selecionar. Cartografia © <a className="underline" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>. Disponibilidade cartográfica depende do provedor; as coordenadas também podem ser informadas diretamente.</p>
  </fieldset>;
}
