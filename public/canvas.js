'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const MAX_LAYERS = 10, MAX_BYTES = 5 * 1024 * 1024, REWARD_KEY = 'campus-move-rewards-v1';
  const DEFAULT_PAINTS = [
    { id: 'canvas-default-orange', name: '落日橘', color: '#d95432' },
    { id: 'canvas-default-blue', name: '海灣藍', color: '#2f88b3' },
    { id: 'canvas-default-green', name: '苔蘚綠', color: '#6b8f4e' },
    { id: 'canvas-default-purple', name: '鳶尾紫', color: '#8b6aa8' },
    { id: 'canvas-default-pink', name: '櫻花粉', color: '#d27990' },
    { id: 'canvas-default-amber', name: '琥珀黃', color: '#bd963b' },
    { id: 'canvas-default-gray', name: '石墨灰', color: '#394b47' },
    { id: 'canvas-default-white', name: '雲霧白', color: '#e7e1d2' },
    { id: 'canvas-default-teal', name: '深海青', color: '#264653' },
    { id: 'canvas-default-sunflower', name: '向日葵黃', color: '#e9c46a' },
  ];
  const layers = [];
  let map, renderedLayers = [];
  let paints = [];
  const setStatus = text => { $('status').textContent = text; };
  const safeNumber = n => typeof n === 'number' && Number.isFinite(n);

  function loadPaints() {
    let unlocked = [];
    try {
      const saved = JSON.parse(localStorage.getItem(REWARD_KEY) || 'null');
      unlocked = Array.isArray(saved?.pigments) ? saved.pigments.filter(p => p && typeof p.id === 'string' && typeof p.name === 'string' && /^#[0-9a-f]{6}$/i.test(p.color)) : [];
    } catch {}
    const colors = new Set(DEFAULT_PAINTS.map(paint => paint.color.toLowerCase()));
    paints = [...DEFAULT_PAINTS, ...unlocked.filter(paint => {
      const color = paint.color.toLowerCase();
      if (colors.has(color)) return false;
      colors.add(color);
      return true;
    })];
    $('paintHelp').hidden = false;
  }

  function refreshPaints() {
    const before = paints.map(paint => `${paint.id}:${paint.name}:${paint.color}`).join('|');
    loadPaints();
    if (before !== paints.map(paint => `${paint.id}:${paint.name}:${paint.color}`).join('|')) renderLayers();
  }

  function setupMap() {
    map = L.map('canvasMap', { zoomControl: true }).setView([24.1796, 120.6495], 14);
    addBaseMap(map);
  }

  function validateRecord(value, fileName) {
    if (!value || typeof value !== 'object' || !Array.isArray(value.points) || value.points.length < 1 || value.points.length > 200000) throw new Error('找不到有效的 GPS 軌跡點');
    const points = [];
    for (const p of value.points) {
      if (!p || !safeNumber(p.lat) || !safeNumber(p.lng) || Math.abs(p.lat) > 90 || Math.abs(p.lng) > 180) throw new Error('軌跡座標格式錯誤');
      points.push({ lat: p.lat, lng: p.lng, segment: Number.isFinite(p.segment) ? p.segment : 0 });
    }
    let meters = safeNumber(value.meters) && value.meters >= 0 ? value.meters : 0;
    if (!meters && points.length > 1) for (let i = 1; i < points.length; i++) if (points[i].segment === points[i - 1].segment) meters += MoveCore.distance(points[i - 1], points[i]);
    const initialPaint = paints.find(p => p.id === value.paintId) || paints.find(p => p.color === value.trackColor) || paints[0] || null;
    return { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, name: String(value.alias || value.mode || fileName).slice(0, 90), date: value.date || '', meters, points, paintId: initialPaint?.id || '', color: initialPaint?.color || '#d95432', source: fileName };
  }

  function drawMap(fit = false) {
    for (const group of renderedLayers) group.remove();
    renderedLayers = [];
    for (let i = 0; i < MAX_LAYERS; i++) {
      const paneName = `canvas-track-${i}`;
      let pane = map.getPane(paneName);
      if (!pane) pane = map.createPane(paneName);
      pane.style.zIndex = String(420 + layers.length - i);
    }
    for (const layer of layers) {
      const index = layers.indexOf(layer), pane = `canvas-track-${index}`;
      const group = L.layerGroup().addTo(map); renderedLayers.push(group);
      const segments = new Map();
      for (const point of layer.points) {
        if (!segments.has(point.segment)) segments.set(point.segment, []);
        segments.get(point.segment).push([point.lat, point.lng]);
      }
      for (const points of segments.values()) {
        if (points.length < 2) continue;
        L.polyline(points, { pane, color: '#fff', weight: 8, opacity: .85, lineCap: 'round', lineJoin: 'round' }).addTo(group);
        L.polyline(points, { pane, color: layer.color, weight: 4, opacity: .95, lineCap: 'round', lineJoin: 'round' }).addTo(group);
      }
    }
    if (fit && layers.length) {
      let south = 90, north = -90, west = 180, east = -180;
      for (const layer of layers) for (const point of layer.points) { south = Math.min(south, point.lat); north = Math.max(north, point.lat); west = Math.min(west, point.lng); east = Math.max(east, point.lng); }
      if (south === north && west === east) map.setView([south, west], 17);
      else map.fitBounds([[south, west], [north, east]], { padding: [28, 28], maxZoom: 18 });
    }
    $('mapSummary').textContent = layers.length ? `${layers.length} 筆軌跡 · ${(layers.reduce((sum, l) => sum + l.meters, 0) / 1000).toFixed(2)} km` : '尚未載入軌跡';
  }

  function paintSelect(layer) {
    const label = document.createElement('label'); label.className = 'layer-color';
    const swatch = document.createElement('i'); swatch.style.setProperty('--layer-color', layer.color);
    const text = document.createElement('span'); text.textContent = '顏料';
    const select = document.createElement('select'); select.setAttribute('aria-label', `選擇「${layer.name}」軌跡顏料`);
    if (!paints.length) { const option = document.createElement('option'); option.textContent = '尚未解鎖顏料'; option.value = ''; select.append(option); select.disabled = true; }
    for (const paint of paints) {
      const option = document.createElement('option'); option.value = paint.id; option.textContent = paint.name;
      option.selected = layer.paintId === paint.id; select.append(option);
    }
    select.onchange = () => { const chosen = paints.find(p => p.id === select.value); if (!chosen) return; layer.paintId = chosen.id; layer.color = chosen.color; swatch.style.setProperty('--layer-color', chosen.color); drawMap(); };
    label.append(swatch, text, select); return label;
  }

  function renderLayers(fit = false) {
    const root = $('layerList'); root.replaceChildren();
    $('layerCount').textContent = `${layers.length} / ${MAX_LAYERS}`;
    $('clearAll').disabled = layers.length === 0;
    if (!layers.length) { const empty = document.createElement('div'); empty.className = 'layer-empty'; empty.textContent = '匯入 GPS 紀錄後，軌跡會列在這裡。'; root.append(empty); }
    layers.forEach((layer, index) => {
      const card = document.createElement('article'); card.className = 'layer-card';
      const head = document.createElement('div'); head.className = 'layer-card-head';
      const title = document.createElement('strong'); title.textContent = `${index === 0 ? '最上層 · ' : ''}${layer.name}`; title.title = layer.name;
      const order = document.createElement('div'); order.className = 'layer-order';
      for (const [label, delta, disabled] of [['↑', -1, index === 0], ['↓', 1, index === layers.length - 1]]) {
        const button = document.createElement('button'); button.type = 'button'; button.textContent = label; button.title = delta < 0 ? '上移圖層' : '下移圖層'; button.setAttribute('aria-label', `${button.title}：${layer.name}`); button.disabled = disabled;
        button.onclick = () => { const [item] = layers.splice(index, 1); layers.splice(index + delta, 0, item); renderLayers(); };
        order.append(button);
      }
      const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'layer-remove'; remove.textContent = '×'; remove.title = '移除此軌跡'; remove.setAttribute('aria-label', `移除軌跡：${layer.name}`); remove.onclick = () => { layers.splice(index, 1); renderLayers(); };
      head.append(title, order, remove);
      const meta = document.createElement('div'); meta.className = 'layer-meta';
      const date = layer.date ? new Date(layer.date) : null, dateText = date && !Number.isNaN(date.valueOf()) ? date.toLocaleDateString('zh-TW') : '日期未記錄';
      meta.textContent = `${dateText} · ${(layer.meters / 1000).toFixed(2)} km · ${layer.points.length} 點`;
      card.append(head, meta, paintSelect(layer)); root.append(card);
    });
    drawMap(fit);
  }

  async function importFiles(fileList) {
    const files = [...fileList]; if (!files.length) return;
    let imported = 0; const errors = [];
    for (const file of files) {
      if (layers.length >= MAX_LAYERS) { errors.push(`最多載入 ${MAX_LAYERS} 筆`); break; }
      if (file.size > MAX_BYTES) { errors.push(`${file.name} 超過 5 MB`); continue; }
      try {
        const parsed = JSON.parse((await file.text()).replace(/^\uFEFF/, ''));
        const records = Array.isArray(parsed) ? parsed : [parsed];
        for (const record of records) {
          if (layers.length >= MAX_LAYERS) { errors.push(`已達 ${MAX_LAYERS} 筆上限`); break; }
          layers.push(validateRecord(record, file.name)); imported++;
        }
      } catch (error) { errors.push(`${file.name}：${error.message || '無法讀取 JSON'}`); }
    }
    renderLayers(imported > 0);
    setStatus([imported ? `已載入 ${imported} 筆軌跡` : '', ...errors].filter(Boolean).join('；') || '沒有新軌跡載入。');
    $('files').value = '';
  }

  setupMap(); loadPaints(); renderLayers();
  window.addEventListener('storage', event => { if (event.key === REWARD_KEY || event.key === null) refreshPaints(); });
  window.addEventListener('pageshow', refreshPaints);
  window.addEventListener('focus', refreshPaints);
  $('files').addEventListener('change', event => importFiles(event.target.files));
  $('clearAll').onclick = () => { layers.splice(0); renderLayers(); setStatus('畫布已清空。'); };
  const drop = $('drop');
  ['dragenter', 'dragover'].forEach(type => drop.addEventListener(type, event => { event.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(type => drop.addEventListener(type, event => { event.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', event => importFiles(event.dataTransfer.files));
})();
