// Interleaved 2 of 5: representação gráfica exclusiva da referência demonstrativa.
export default function ConstructionDemonstrationBarcode({ value }: { value: string }) {
  if (!/^\d{44}$/.test(value)) return null;
  const patterns = ["nnwwn", "wnnnw", "nwnnw", "wwnnn", "nnwnw", "wnwnn", "nwwnn", "nnnww", "wnnwn", "nwnwn"];
  const widths = [1, 1, 1, 1];
  for (let index = 0; index < value.length; index += 2) {
    const bars = patterns[Number(value[index])];
    const spaces = patterns[Number(value[index + 1])];
    for (let part = 0; part < 5; part++) widths.push(bars[part] === "w" ? 3 : 1, spaces[part] === "w" ? 3 : 1);
  }
  widths.push(3, 1, 1);
  let x = 10;
  const bars = widths.map((width, index) => { const position = x; x += width; return index % 2 === 0 ? { x: position, width } : null; }).filter((bar) => bar !== null);
  return <svg role="img" aria-label="Código de barras demonstrativo, sem convênio bancário, não utilizar para pagamento" viewBox={`0 0 ${x + 10} 60`} className="h-20 w-full max-w-2xl bg-white"><rect width={x + 10} height="60" fill="white" />{bars.map((bar) => <rect key={bar.x} x={bar.x} y="0" width={bar.width} height="60" fill="black" />)}</svg>;
}
