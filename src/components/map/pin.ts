export function pinHtml(label: string, color: string, selected: boolean, small = false) {
  const size = small ? 26 : 36;
  return `<div style="width:${size}px;height:${size}px;border-radius:50% 50% 50% 0;transform:rotate(-45deg) scale(${selected ? 1.2 : 1});background:${color};border:3px solid #fff;box-shadow:0 3px 10px rgba(0,0,0,.3);display:flex;align-items:center;justify-content:center;transition:transform .15s">
    <span style="transform:rotate(45deg);color:#fff;font-weight:700;font-size:${small ? 12 : 15}px">${label}</span></div>`;
}
