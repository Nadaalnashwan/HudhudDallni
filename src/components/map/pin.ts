/** Hudhud-style pin: a round badge with the place type's icon, a short pointer, and the stop number. */
export function pinHtml(iconPath: string, color: string, selected: boolean, number?: number) {
  const s = selected ? 1.15 : 1;
  const badge = number
    ? `<span style="position:absolute;top:-5px;right:-5px;min-width:18px;height:18px;padding:0 4px;border-radius:9px;background:#fff;color:${color};font:700 11px/18px system-ui;text-align:center;box-shadow:0 1px 4px rgba(0,0,0,.3)">${number}</span>`
    : "";
  return `<div style="position:relative;width:36px;height:44px;transform:scale(${s});transform-origin:50% 100%;transition:transform .15s">
    <div style="width:36px;height:36px;border-radius:50%;background:${color};border:2px solid #fff;box-sizing:border-box;box-shadow:0 3px 10px rgba(0,0,0,.3);display:flex;align-items:center;justify-content:center">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="#fff" aria-hidden="true"><path d="${iconPath}"/></svg>
    </div>
    <div style="position:absolute;left:50%;bottom:0;width:4px;height:10px;margin-left:-2px;border-radius:2px;background:${color}"></div>
    ${badge}
  </div>`;
}

/** Other options: a small grey dot. */
export function altPinHtml(selected: boolean) {
  const size = selected ? 18 : 14;
  return `<div style="width:${size}px;height:${size}px;border-radius:50%;background:#94a3b8;border:3px solid #fff;box-shadow:0 1px 5px rgba(0,0,0,.3)"></div>`;
}

export const ROUTE_BLUE = "#2086FF";
