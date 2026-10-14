/* TDL LAB 도면 + 동선/핀 렌더러.
 * 도면은 담당자가 준 원본 레이아웃 이미지를 벡터로 그대로 옮긴 것(js/floorplan-art.js, 좌표계 780×934).
 * 도면 그림은 문서에 한 번만 넣고(<symbol>), 지도마다 <use>로 재사용한다.
 */
(function () {
  const W = 780, H = 934;

  function ensureSprite() {
    if (document.getElementById('fp-sprite')) return;
    const div = document.createElement('div');
    div.innerHTML = `<svg id="fp-sprite" width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false">
      <defs>
        <symbol id="fp-art" viewBox="0 0 ${W} ${H}"><path d="${window.FP_ART || ''}"/></symbol>
        <marker id="fp-arrow" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="4.5" markerHeight="4.5" orient="auto-start-reverse"><path class="fp-arrowhead" d="M0 0L10 5L0 10z"/></marker>
      </defs></svg>`;
    document.body.appendChild(div.firstChild);
  }

  // 원본에 없는 구역 이름은 빈 공간에 작게만 표시
  const LABELS = [
    [300, 410, 'HAIPick Climb'], [345, 552, '3D Sorter'], [600, 560, '이노베이션필드 1F'], [335, 600, '비전홀 2F'],
  ];

  function base() {
    return `<rect class="fp-floor" x="12" y="12" width="752" height="814"/>
      <use href="#fp-art" class="fp-art" x="0" y="0" width="${W}" height="${H}"/>
      <path class="fp-wall" d="M425 826V875H750V826M525 826V875"/>
      ${LABELS.map(([x, y, t]) => `<text class="fp-label" x="${x}" y="${y}">${t}</text>`).join('')}`;
  }

  // Catmull-Rom → 베지어 곡선
  function smoothPath(pts) {
    if (pts.length < 2) return '';
    let d = `M${pts[0].x} ${pts[0].y}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
      const t = 0.18;
      const c1x = p1.x + (p2.x - p0.x) * t, c1y = p1.y + (p2.y - p0.y) * t;
      const c2x = p2.x - (p3.x - p1.x) * t, c2y = p2.y - (p3.y - p1.y) * t;
      d += `C${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${p2.x} ${p2.y}`;
    }
    return d;
  }

  /**
   * opts: { stations, points, activeId, stopOrder(맵: stationId→순번), editPoints(bool), animate(bool), dimOthers(bool) }
   * 순번 배지는 동선 순서가 핀 번호와 다를 때만(예: VIP 동선) 표시한다.
   */
  function render(opts) {
    ensureSprite();
    const o = Object.assign({ stations: [], points: [], activeId: '', editPoints: false, animate: false }, opts);
    const d = smoothPath(o.points);
    const route = o.points.length > 1 ? `
      <path class="fp-route-shadow" d="${d}"/>
      <path class="fp-route${o.animate ? ' fp-route-anim' : ''}" d="${d}" marker-end="url(#fp-arrow)"/>` : '';
    const stopsOnRoute = new Set(o.points.filter((p) => p.stop).map((p) => p.stop));
    const pins = o.stations.map((s) => {
      const active = s.id === o.activeId;
      const off = o.dimOthers && o.points.length && !stopsOnRoute.has(s.id);
      const seq = o.stopOrder && o.stopOrder[s.id];
      const showSeq = seq && String(seq) !== String(s.no);
      const r = active ? 21 : 17;
      return `<g class="fp-pin${active ? ' is-active' : ''}${off ? ' is-off' : ''}${s.optional ? ' is-optional' : ''}" data-station="${s.id}" tabindex="0" role="button" aria-label="${s.no} ${s.name}">
        ${active ? `<circle class="fp-pulse" cx="${s.x}" cy="${s.y}" r="${r}"/>` : ''}
        <circle class="fp-pin-hit" cx="${s.x}" cy="${s.y}" r="26"/>
        <circle class="fp-pin-dot" cx="${s.x}" cy="${s.y}" r="${r}"/>
        <text class="fp-pin-no${String(s.no).length > 2 ? ' is-long' : ''}" x="${s.x}" y="${s.y}">${s.no}</text>
        ${showSeq ? `<g class="fp-seq"><circle cx="${s.x + 16}" cy="${s.y - 16}" r="9"/><text x="${s.x + 16}" y="${s.y - 16}">${seq}</text></g>` : ''}
      </g>`;
    }).join('');
    const handles = o.editPoints ? o.points.map((p, i) => p.stop ? '' :
      `<circle class="fp-handle" data-point="${i}" cx="${p.x}" cy="${p.y}" r="8"/>`).join('') : '';
    return `<svg class="floorplan" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="TDL LAB 도면">
      <g class="fp-base">${base()}</g>${route}${pins}${handles}</svg>`;
  }

  function toSvgPoint(svg, evt) {
    const pt = svg.createSVGPoint();
    const e = evt.touches ? evt.touches[0] : evt;
    pt.x = e.clientX; pt.y = e.clientY;
    const p = pt.matrixTransform(svg.getScreenCTM().inverse());
    return { x: Math.round(Math.max(0, Math.min(W, p.x))), y: Math.round(Math.max(0, Math.min(H, p.y))) };
  }

  window.FloorPlan = { render, toSvgPoint, smoothPath, W, H };
})();
