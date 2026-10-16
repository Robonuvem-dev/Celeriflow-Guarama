"use client";
/* eslint-disable @next/next/no-img-element -- Map tiles load only after an explicit user request. */
import { useEffect, useRef, useState } from "react";
import type { DigitalService } from "@/lib/portal-cidadao/services-policy";

const pixel = (lat: number, lon: number, zoom: number) => {
  const size = 256 * 2 ** zoom, sin = Math.sin(Math.max(-85, Math.min(85, lat)) * Math.PI / 180);
  return { x: (lon + 180) / 360 * size, y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * size };
};
const coordinate = (x: number, y: number, zoom: number) => {
  const size = 256 * 2 ** zoom;
  return { lon: x / size * 360 - 180, lat: Math.atan(Math.sinh(Math.PI * (1 - 2 * y / size))) * 180 / Math.PI };
};

export function OccurrenceLocation({ serviceId, definition }: { serviceId: string; definition: DigitalService }) {
  const bounds = definition.municipalBounds;
  const [lat, setLat] = useState(""), [lon, setLon] = useState("");
  const [address, setAddress] = useState(""), [loaded, setLoaded] = useState(false), [zoom, setZoom] = useState(14), [width, setWidth] = useState(640), [message, setMessage] = useState("");
  const ref = useRef<HTMLDivElement>(null), lookupSequence = useRef(0);
  useEffect(() => {
    if (!ref.current) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(ref.current); return () => observer.disconnect();
  }, [loaded]);
  const center = pixel(lat ? Number(lat) : bounds ? (bounds.south + bounds.north) / 2 : definition.municipalPolygon?.[0][1] || 0, lon ? Number(lon) : bounds ? (bounds.west + bounds.east) / 2 : definition.municipalPolygon?.[0][0] || 0, zoom);
  const world = 2 ** zoom, tileX = Math.floor(center.x / 256), tileY = Math.floor(center.y / 256);
  const lookup = async (latitude: number, longitude: number) => {
    const sequence = ++lookupSequence.current; setMessage("Buscando endereço…");
    try {
      const result = await fetch(`/api/portal/localizacao?${new URLSearchParams({ serviceId, latitude: String(latitude), longitude: String(longitude) })}`);
      const data = await result.json(); if (!result.ok) throw new Error(data.error);
      if (sequence === lookupSequence.current) { setAddress(data.address); setMessage("Confira o endereço retornado e acrescente a referência do local."); }
    } catch (issue) { if (sequence === lookupSequence.current) setMessage(issue instanceof Error ? issue.message : "Informe o endereço manualmente."); }
  };
  function selectPoint(x: number, y: number, resolveAddress = true) {
    const point = coordinate(center.x + x - width / 2, center.y + y - 160, zoom);
    setLat(point.lat.toFixed(7)); setLon(point.lon.toFixed(7));
    if (resolveAddress) void lookup(point.lat, point.lon);
  }
  return <fieldset className="space-y-3 rounded-lg border p-4">
    <legend className="px-2 text-sm font-semibold">Local da ocorrência</legend>
    <label className="block text-sm">Endereço e referência<input name="location" required value={address} onChange={(event) => { lookupSequence.current++; setAddress(event.target.value); }} maxLength={1000} className="mt-2 w-full rounded-lg border p-3" /></label>
    <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm">Latitude<input name="latitude" type="number" step="any" min={-90} max={90} required={Boolean(bounds || definition.municipalPolygon)} value={lat} onChange={(event) => setLat(event.target.value)} className="mt-2 w-full rounded-lg border p-3" /></label><label className="text-sm">Longitude<input name="longitude" type="number" step="any" min={-180} max={180} required={Boolean(bounds || definition.municipalPolygon)} value={lon} onChange={(event) => setLon(event.target.value)} className="mt-2 w-full rounded-lg border p-3" /></label></div>
    <div className="flex flex-wrap gap-3"><button type="button" disabled={!bounds && !definition.municipalPolygon && (!lat || !lon)} onClick={() => setLoaded(true)} className="rounded border px-3 py-2 text-sm font-semibold text-emerald-800 disabled:opacity-50">Carregar mapa e selecionar local</button><button type="button" onClick={() => navigator.geolocation.getCurrentPosition((position) => { setLat(String(position.coords.latitude)); setLon(String(position.coords.longitude)); void lookup(position.coords.latitude, position.coords.longitude); }, () => setMessage("Localização indisponível. Informe o ponto manualmente."))} className="rounded border px-3 py-2 text-sm">Usar minha localização</button></div>
    {loaded && <>
      <label className="text-sm">Zoom<select value={zoom} onChange={(event) => setZoom(Number(event.target.value))} className="ml-2 rounded border p-2">{[8, 10, 12, 14, 16, 18].map((value) => <option key={value}>{value}</option>)}</select></label>
      <div ref={ref} role="button" tabIndex={0} aria-label="Mapa: clique para selecionar o local; use as setas e Enter pelo teclado" className="relative h-80 w-full overflow-hidden rounded border bg-slate-100 outline-emerald-700" onClick={(event) => { const box = event.currentTarget.getBoundingClientRect(); selectPoint(event.clientX - box.left, event.clientY - box.top); }} onKeyDown={(event) => {
        if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Enter", " "].includes(event.key)) { event.preventDefault(); selectPoint(width / 2 + (event.key === "ArrowRight" ? 20 : event.key === "ArrowLeft" ? -20 : 0), 160 + (event.key === "ArrowDown" ? 20 : event.key === "ArrowUp" ? -20 : 0), ["Enter", " "].includes(event.key)); }
      }}>
        {Array.from({ length: 25 }, (_, index) => {
          const x = tileX + index % 5 - 2, y = tileY + Math.floor(index / 5) - 2;
          return x >= 0 && x < world && y >= 0 && y < world ? <img key={`${zoom}-${x}-${y}`} alt="" draggable={false} width={256} height={256} src={`https://tile.openstreetmap.org/${zoom}/${x}/${y}.png`} style={{ position: "absolute", left: x * 256 - center.x + width / 2, top: y * 256 - center.y + 160, maxWidth: "none" }} /> : null;
        })}
        <span className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-red-600 p-2 shadow" />
      </div>
      <p className="text-xs text-slate-500">Mapa © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" className="underline">OpenStreetMap</a>. Confira o endereço e o ponto selecionados.</p>
    </>}
    {message && <p role="status" className="text-xs leading-6 text-slate-600">{message}</p>}
  </fieldset>;
}
