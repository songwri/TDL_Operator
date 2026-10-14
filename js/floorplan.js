/* TDL LAB 도면 (원본 레이아웃을 보고 다시 그린 벡터 도면, 좌표계 780×900) + 동선/핀 렌더러 */
(function () {
  const W = 780, H = 900;

  function grid(x, y, w, h, step, cls) {
    let s = '';
    for (let gx = x + step; gx < x + w; gx += step) s += `M${gx} ${y}V${y + h}`;
    for (let gy = y + step; gy < y + h; gy += step) s += `M${x} ${gy}H${x + w}`;
    return `<path class="${cls || 'fp-grid'}" d="${s}"/>`;
  }
  function rack(x, y, w, h, step) {
    let s = `<rect class="fp-equip" x="${x}" y="${y}" width="${w}" height="${h}"/>`;
    let d = '';
    for (let gy = y + step; gy < y + h; gy += step) d += `M${x} ${gy}H${x + w}`;
    return s + `<path class="fp-grid" d="${d}"/>`;
  }
  function arc(cx, cy, r, a0, a1) {
    const p = (a) => [cx + r * Math.cos(a * Math.PI / 180), cy - r * Math.sin(a * Math.PI / 180)];
    const [x0, y0] = p(a0), [x1, y1] = p(a1);
    return `M${x0.toFixed(1)} ${y0.toFixed(1)}A${r} ${r} 0 0 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`;
  }
  function label(x, y, text, cls, rot) {
    return `<text class="${cls || 'fp-label'}" x="${x}" y="${y}"${rot ? ` transform="rotate(${rot} ${x} ${y})"` : ''}>${text}</text>`;
  }

  function base() {
    let s = '';
    // 건물 외곽 + 입구
    s += `<rect class="fp-floor" x="12" y="12" width="750" height="813"/>`;
    s += `<rect class="fp-wall" x="12" y="12" width="750" height="813"/>`;
    s += `<rect class="fp-wall" x="425" y="825" width="100" height="50"/><rect class="fp-wall" x="525" y="825" width="225" height="50"/>`;
    s += label(637, 856, '비전홀 입구', 'fp-label fp-small');
    // 계단/EV
    s += `<rect class="fp-wall" x="430" y="14" width="40" height="38"/><path class="fp-grid" d="M430 24H470M430 34H470M430 44H470M450 14V52"/>`;

    // 8 AMR 랙 (좌상단)
    s += rack(38, 45, 24, 175, 22) + rack(105, 45, 17, 175, 22) + rack(122, 45, 17, 175, 22);
    // 7 스마트글라스 / AMR 스테이션 (좌측 벽)
    s += `<rect class="fp-equip" x="17" y="252" width="35" height="42"/>` + label(35, 273, 'SMART GLASS', 'fp-label fp-tiny', 90);
    s += `<rect class="fp-equip" x="17" y="388" width="35" height="104"/>` + label(35, 440, 'AMR', 'fp-label fp-tiny', 90);

    // 9 HAIPick Climb
    s += `<rect class="fp-equip" x="238" y="22" width="78" height="46"/>`;
    s += `<rect class="fp-equip" x="245" y="70" width="165" height="262"/>` + grid(245, 70, 165, 262, 16.5);
    s += `<path class="fp-aisle" d="M245 160H410M245 250H410"/>`;
    s += `<rect class="fp-equip" x="300" y="355" width="12" height="35"/><rect class="fp-equip" x="345" y="355" width="12" height="35"/>`;

    // 10 4Way 셔틀 (L자 랙)
    s += `<path class="fp-equip" d="M430 80H565V35H760V405H430Z"/>`;
    s += grid(430, 80, 330, 325, 25) + grid(565, 35, 195, 45, 25);
    s += `<rect class="fp-dark" x="468" y="80" width="20" height="300"/><rect class="fp-dark" x="567" y="35" width="22" height="345"/><rect class="fp-dark" x="690" y="35" width="22" height="345"/>`;
    s += `<rect class="fp-equip" x="610" y="410" width="22" height="34" rx="3"/>`;

    // 11 3D Sorter
    s += `<rect class="fp-equip" x="255" y="460" width="175" height="42"/>` + grid(255, 460, 175, 42, 14.5);
    let st = '';
    for (let i = 0; i < 6; i++) st += `<rect class="fp-equip" x="${268 + i * 24}" y="506" width="16" height="30"/>`;
    s += st;

    // 6 하차/팔레타이저 (좌하단)
    s += `<rect class="fp-equip" x="38" y="598" width="86" height="225"/>`;
    s += `<rect class="fp-equip" x="52" y="610" width="58" height="66"/>` + grid(52, 610, 58, 66, 22);
    s += `<rect class="fp-dark" x="66" y="690" width="16" height="125"/>`;

    // 비전홀 (하단)
    s += `<path class="fp-room" d="${arc(335, 825, 228, 180, 0)}"/>`;
    s += `<path class="fp-wall-thin" d="${arc(335, 825, 180, 172, 8)}"/>`;
    s += `<path class="fp-wall-thin" d="${arc(335, 825, 112, 180, 0)}"/>`;
    let seats = '';
    for (let r = 50; r <= 95; r += 22) for (let a = 20; a <= 160; a += 18) {
      const x = 335 + r * Math.cos(a * Math.PI / 180), y = 805 - r * Math.sin(a * Math.PI / 180) * 0.8;
      seats += `<circle class="fp-seat" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="5"/>`;
    }
    s += seats;
    s += `<path class="fp-wall" d="M470 690H745V825"/>`;
    s += `<rect class="fp-room" x="452" y="742" width="68" height="80" rx="16"/>`;
    s += label(486, 790, '회의실', 'fp-label fp-tiny');
    s += `<path class="fp-room" d="M528 825V700A108 108 0 0 1 744 700V825"/>`;
    let fan = '';
    for (let a = 30; a <= 150; a += 24) {
      fan += `M636 790L${(636 + 105 * Math.cos(a * Math.PI / 180)).toFixed(1)} ${(790 - 95 * Math.sin(a * Math.PI / 180)).toFixed(1)}`;
    }
    s += `<path class="fp-wall-thin" d="${fan}"/>`;
    s += `<path class="fp-wall" d="M745 700Q768 760 750 825"/>`;

    // 구역 라벨
    s += label(104, 236, 'AMR 협업 피킹', 'fp-label fp-small');
    s += label(272, 346, 'HAIPick Climb', 'fp-label fp-small');
    s += label(700, 425, '4Way Shuttle', 'fp-label fp-small');
    s += label(342, 552, '3D Sorter', 'fp-label fp-small');
    s += label(90, 588, '하차 · 팔레타이징', 'fp-label fp-small');
    s += label(335, 640, '비전홀 (2F)', 'fp-label fp-zone');
    s += label(610, 560, '이노베이션필드 (1F)', 'fp-label fp-zone');
    return s;
  }

  // Catmull-Rom → 베지어 곡선
  function smoothPath(pts) {
    if (pts.length < 2) return '';
    let d = `M${pts[0].x} ${pts[0].y}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
      const t = 0.18 * 1;
      const c1x = p1.x + (p2.x - p0.x) * t, c1y = p1.y + (p2.y - p0.y) * t;
      const c2x = p2.x - (p3.x - p1.x) * t, c2y = p2.y - (p3.y - p1.y) * t;
      d += `C${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${p2.x} ${p2.y}`;
    }
    return d;
  }

  /**
   * opts: { stations, points, activeId, stopOrder(맵: stationId→순번), editPoints(bool), animate(bool), dimOthers(bool) }
   */
  function render(opts) {
    const o = Object.assign({ stations: [], points: [], activeId: '', editPoints: false, animate: false }, opts);
    const route = o.points.length > 1 ? `
      <path class="fp-route-shadow" d="${smoothPath(o.points)}"/>
      <path class="fp-route${o.animate ? ' fp-route-anim' : ''}" d="${smoothPath(o.points)}" marker-end="url(#fp-arrow)"/>` : '';
    const stopsOnRoute = new Set(o.points.filter((p) => p.stop).map((p) => p.stop));
    const pins = o.stations.map((s) => {
      const active = s.id === o.activeId;
      const off = o.dimOthers && o.points.length && !stopsOnRoute.has(s.id);
      const seq = o.stopOrder && o.stopOrder[s.id];
      const r = active ? 21 : 16;
      return `<g class="fp-pin${active ? ' is-active' : ''}${off ? ' is-off' : ''}${s.optional ? ' is-optional' : ''}" data-station="${s.id}" tabindex="0" role="button" aria-label="${s.no} ${s.name}">
        ${active ? `<circle class="fp-pulse" cx="${s.x}" cy="${s.y}" r="${r}"/>` : ''}
        <circle class="fp-pin-hit" cx="${s.x}" cy="${s.y}" r="26"/>
        <circle class="fp-pin-dot" cx="${s.x}" cy="${s.y}" r="${r}"/>
        <text class="fp-pin-no${String(s.no).length > 2 ? ' is-long' : ''}" x="${s.x}" y="${s.y}">${s.no}</text>
        ${seq ? `<g class="fp-seq"><circle cx="${s.x + 15}" cy="${s.y - 15}" r="9"/><text x="${s.x + 15}" y="${s.y - 15}">${seq}</text></g>` : ''}
      </g>`;
    }).join('');
    const handles = o.editPoints ? o.points.map((p, i) => p.stop ? '' :
      `<circle class="fp-handle" data-point="${i}" cx="${p.x}" cy="${p.y}" r="8"/>`).join('') : '';
    return `<svg class="floorplan" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="TDL LAB 도면">
      <defs><marker id="fp-arrow" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path class="fp-arrowhead" d="M0 0L10 5L0 10z"/></marker></defs>
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
