'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const RECORDS_KEY = 'campus-move-history-v1', GOAL_KEY = 'campus-move-goal-v1';
  const SVG = 'http://www.w3.org/2000/svg';
  let records = [], period = 'week', goal = null;

  try { records = JSON.parse(localStorage.getItem(RECORDS_KEY) || '[]'); if (!Array.isArray(records)) records = []; } catch { records = []; }
  try { goal = JSON.parse(localStorage.getItem(GOAL_KEY) || 'null'); } catch { goal = null; }

  const finite = n => typeof n === 'number' && Number.isFinite(n);
  const actualRecords = records.filter(r => r && !r.demo && Number.isFinite(Date.parse(r.date)) && finite(r.meters) && finite(r.seconds));
  const startOfPeriod = (kind, offset = 0) => {
    const now = new Date();
    if (kind === 'week') {
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const mondayOffset = (today.getDay() + 6) % 7;
      today.setDate(today.getDate() - mondayOffset - offset * 7);
      return today;
    }
    return new Date(now.getFullYear(), now.getMonth() - offset, 1);
  };
  const nextPeriod = (date, kind) => kind === 'week' ? new Date(date.getFullYear(), date.getMonth(), date.getDate() + 7) : new Date(date.getFullYear(), date.getMonth() + 1, 1);
  const aggregate = (kind, offset = 0) => {
    const start = startOfPeriod(kind, offset), end = nextPeriod(start, kind);
    const rows = actualRecords.filter(r => { const date = new Date(r.date); return date >= start && date < end; });
    const meters = rows.reduce((sum, r) => sum + Math.max(0, r.meters), 0);
    const seconds = rows.reduce((sum, r) => sum + Math.max(0, r.seconds), 0);
    return { start, end, rows, sessions: rows.length, meters, seconds, pace: meters > 0 ? seconds / meters * 1000 / 60 : null };
  };
  const pad = n => String(n).padStart(2, '0');
  const rangeText = (start, end) => {
    const last = new Date(end.getFullYear(), end.getMonth(), end.getDate() - 1);
    const left = `${start.getFullYear()}/${start.getMonth() + 1}/${start.getDate()}`;
    const right = start.getFullYear() === last.getFullYear() ? `${last.getMonth() + 1}/${last.getDate()}` : `${last.getFullYear()}/${last.getMonth() + 1}/${last.getDate()}`;
    return `${left} – ${right}`;
  };
  const durationText = seconds => {
    const mins = Math.round(seconds / 60), hours = Math.floor(mins / 60), rest = mins % 60;
    return hours ? `${hours} 小時 ${rest} 分` : `${mins} 分`;
  };
  const paceText = pace => { if (pace == null || !Number.isFinite(pace)) return '—'; const total = Math.round(pace * 60); return `${Math.floor(total / 60)}:${pad(total % 60)}`; };
  const svgNode = (tag, attrs = {}) => { const node = document.createElementNS(SVG, tag); for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value)); return node; };

  function trendPeriods() {
    const count = period === 'week' ? 8 : 6;
    return Array.from({ length: count }, (_, reverseIndex) => aggregate(period, count - 1 - reverseIndex));
  }

  function drawTrend() {
    const data = trendPeriods(), metric = $('trendMetric').value, root = $('trendChart');
    root.replaceChildren();
    const labels = data.map(d => period === 'week' ? `${d.start.getMonth() + 1}/${d.start.getDate()}` : `${d.start.getFullYear()}/${d.start.getMonth() + 1}`);
    const values = data.map(d => metric === 'sessions' ? d.sessions : metric === 'duration' ? d.seconds / 3600 : metric === 'pace' ? d.pace : d.meters / 1000);
    const valid = values.map((v, i) => ({ v, i })).filter(d => Number.isFinite(d.v));
    const maxValue = Math.max(1, ...valid.map(d => d.v)) * 1.15, width = 760, height = 245, left = 42, right = 15, top = 23, bottom = 31;
    const chartWidth = width - left - right, chartHeight = height - top - bottom;
    const svg = svgNode('svg', { viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-label': `${period === 'week' ? '最近八週' : '最近六個月'}的${$('trendMetric').selectedOptions[0].textContent}趨勢` });
    for (let line = 0; line <= 3; line++) {
      const y = top + chartHeight * line / 3, value = maxValue * (1 - line / 3);
      svg.append(svgNode('line', { x1: left, x2: width - right, y1: y, y2: y, class: 'chart-grid' }));
      const axis = svgNode('text', { x: left - 7, y: y + 3, 'text-anchor': 'end', class: 'chart-axis' });
      axis.textContent = metric === 'pace' ? (value ? paceText(value) : '0') : (metric === 'sessions' ? Math.round(value) : value.toFixed(1)); svg.append(axis);
    }
    const coords = valid.map(d => ({ x: left + (data.length <= 1 ? 0 : d.i * chartWidth / (data.length - 1)), y: top + chartHeight * (1 - d.v / maxValue), ...d }));
    if (coords.length > 1) svg.append(svgNode('polyline', { points: coords.map(p => `${p.x},${p.y}`).join(' '), class: 'chart-line' }));
    for (let i = 0; i < data.length; i++) {
      const x = left + (data.length <= 1 ? 0 : i * chartWidth / (data.length - 1));
      const label = svgNode('text', { x, y: height - 7, 'text-anchor': 'middle', class: 'chart-axis' }); label.textContent = labels[i]; svg.append(label);
    }
    for (const point of coords) {
      const isCurrent = point.i === data.length - 1;
      svg.append(svgNode('circle', { cx: point.x, cy: point.y, r: isCurrent ? 4.5 : 3.5, class: `chart-dot${isCurrent ? ' current' : ''}` }));
      const text = svgNode('text', { x: point.x, y: point.y - 10, 'text-anchor': 'middle', class: 'chart-value' });
      text.textContent = metric === 'pace' ? paceText(point.v) : metric === 'sessions' ? String(Math.round(point.v)) : point.v.toFixed(1); svg.append(text);
    }
    if (!valid.some(point => point.v > 0)) { const empty = svgNode('text', { x: width / 2, y: height / 2, 'text-anchor': 'middle', class: 'chart-empty' }); empty.textContent = '這段期間還沒有運動紀錄'; svg.append(empty); }
    root.append(svg);
    $('trendCaption').textContent = `顯示最近 ${period === 'week' ? '8 週' : '6 個月'}的${$('trendMetric').selectedOptions[0].textContent}`;
  }

  function renderPeriod() {
    const current = aggregate(period), previous = aggregate(period, 1);
    $('periodRange').textContent = rangeText(current.start, current.end);
    $('statSessions').textContent = current.sessions;
    $('statDistance').textContent = (current.meters / 1000).toFixed(2);
    $('statDuration').textContent = durationText(current.seconds);
    $('statPace').textContent = paceText(current.pace);
    const distanceDelta = current.meters - previous.meters, countDelta = current.sessions - previous.sessions;
    const distanceText = `${distanceDelta >= 0 ? '+' : '−'}${(Math.abs(distanceDelta) / 1000).toFixed(2)} km`;
    const countText = `${countDelta >= 0 ? '+' : '−'}${Math.abs(countDelta)} 次`;
    $('periodTrend').replaceChildren();
    const summary = document.createElement('span'); summary.textContent = `較前${period === 'week' ? '週' : '月'}：`;
    const value = document.createElement('strong'); value.textContent = `${distanceText} · ${countText}`;
    $('periodTrend').append(summary, value);
    drawTrend();
  }

  function renderGoal() {
    if (!goal || !['week', 'month'].includes(goal.period) || !['distance', 'duration'].includes(goal.metric) || !Number.isFinite(goal.target) || goal.target <= 0) {
      goal = null; $('goalSummary').textContent = '設定每週或每月的距離／時間目標，追蹤目前完成進度。'; $('goalPeriodBadge').textContent = '每週'; $('goalCurrent').textContent = '0'; $('goalUnit').textContent = 'km'; $('goalPercent').textContent = '尚未設定'; $('goalProgress').value = 0; $('goalStatus').textContent = '完成一次運動後，這裡會更新進度。'; $('clearGoal').hidden = true; return;
    }
    const stats = aggregate(goal.period), value = goal.metric === 'distance' ? stats.meters / 1000 : stats.seconds / 60;
    const unit = goal.metric === 'distance' ? 'km' : '分', percent = value / goal.target * 100;
    $('goalPeriodBadge').textContent = goal.period === 'week' ? '每週' : '每月';
    $('goalSummary').textContent = `${goal.period === 'week' ? '本週' : '本月'}${goal.metric === 'distance' ? '步行距離' : '運動時間'}目標 ${goal.target} ${unit}`;
    $('goalCurrent').textContent = value.toFixed(goal.metric === 'distance' ? 2 : 0); $('goalUnit').textContent = `/ ${goal.target} ${unit}`;
    $('goalPercent').textContent = `${Math.min(100, Math.floor(percent))}%`;
    $('goalProgress').value = Math.min(100, percent); $('goalStatus').textContent = percent >= 100 ? '目標已完成，繼續保持你的步調。' : `還差 ${(goal.target - value).toFixed(goal.metric === 'distance' ? 2 : 0)} ${unit} 達成目標。`;
    $('clearGoal').hidden = false;
  }

  function updateGoalUnit() {
    const metric = $('goalMetric').value;
    $('goalTargetUnit').textContent = metric === 'distance' ? 'km' : '分鐘';
    $('goalTarget').step = metric === 'distance' ? '0.1' : '5';
    $('goalTarget').value = metric === 'distance' ? '10' : '150';
  }

  document.querySelectorAll('[data-period]').forEach(button => button.addEventListener('click', () => {
    period = button.dataset.period;
    document.querySelectorAll('[data-period]').forEach(item => { item.classList.toggle('selected', item === button); item.setAttribute('aria-pressed', String(item === button)); });
    renderPeriod();
  }));
  $('trendMetric').addEventListener('change', drawTrend);
  $('goalMetric').addEventListener('change', updateGoalUnit);
  $('goalForm').addEventListener('submit', event => {
    event.preventDefault();
    const target = Number($('goalTarget').value);
    if (!Number.isFinite(target) || target <= 0) { $('goalStatus').textContent = '請輸入大於 0 的目標數值。'; return; }
    goal = { period: $('goalPeriod').value, metric: $('goalMetric').value, target, updatedAt: new Date().toISOString() };
    try { localStorage.setItem(GOAL_KEY, JSON.stringify(goal)); $('goalStatus').textContent = '目標已儲存。'; } catch { $('goalStatus').textContent = '裝置儲存空間無法使用，目標只會保留到離開此頁。'; }
    renderGoal();
  });
  $('clearGoal').addEventListener('click', () => { goal = null; try { localStorage.removeItem(GOAL_KEY); } catch {} renderGoal(); });
  if (goal) { $('goalPeriod').value = goal.period || 'week'; $('goalMetric').value = goal.metric || 'distance'; $('goalTarget').value = goal.target || 10; $('goalTargetUnit').textContent = goal.metric === 'duration' ? '分鐘' : 'km'; $('goalTarget').step = goal.metric === 'duration' ? '5' : '0.1'; }
  renderPeriod(); renderGoal();
})();
