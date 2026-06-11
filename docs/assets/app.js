const state = {
  manifest: null,
  loadedKey: null,
  data: { matches: [], appearances: [], samurai: [], teams: [], players: [] },
  filters: {
    competition: null,
    season: null,
    team: 'all',
    position: 'all',
    q: '',
    start: '',
    end: '',
  },
  sort: { key: 'samurai_stats', dir: 'desc' },
  rows: [],
  selectedPlayerKey: null,
};

const els = {
  competitionSelect: document.querySelector('#competitionSelect'),
  seasonSelect: document.querySelector('#seasonSelect'),
  teamSelect: document.querySelector('#teamSelect'),
  positionSelect: document.querySelector('#positionSelect'),
  startDateInput: document.querySelector('#startDateInput'),
  endDateInput: document.querySelector('#endDateInput'),
  searchInput: document.querySelector('#searchInput'),
  resetButton: document.querySelector('#resetButton'),
  statsBody: document.querySelector('#statsBody'),
  statusText: document.querySelector('#statusText'),
  periodSummary: document.querySelector('#periodSummary'),
  matchSummary: document.querySelector('#matchSummary'),
  playerSummary: document.querySelector('#playerSummary'),
  bipSummary: document.querySelector('#bipSummary'),
  playerPanelOverlay: document.querySelector('#playerPanelOverlay'),
  playerPanel: document.querySelector('#playerPanel'),
  panelTitle: document.querySelector('#panelTitle'),
  panelSubtitle: document.querySelector('#panelSubtitle'),
  panelStats: document.querySelector('#panelStats'),
  samuraiChart: document.querySelector('#samuraiChart'),
  matchLogBody: document.querySelector('#matchLogBody'),
  closePanelButton: document.querySelector('#closePanelButton'),
  exportCsvButton: document.querySelector('#exportCsvButton'),
  copyLinkButton: document.querySelector('#copyLinkButton'),
};

const numberFmt = new Intl.NumberFormat('ja-JP');
const decimalFmt = new Intl.NumberFormat('ja-JP', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const samuraiFmt = new Intl.NumberFormat('ja-JP', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const positionNames = new Map();
const playerById = new Map();
const teamById = new Map();
const matchById = new Map();
const samuraiByAppearanceKey = new Map();

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;'
  }[char]));
}

function normalize(value) {
  return String(value ?? '').toLowerCase().normalize('NFKC');
}

function showToast(message) {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2200);
}

async function fetchJson(path) {
  const response = await fetch(path, { cache: 'no-store' });
  if (!response.ok) throw new Error(`${path} の読み込みに失敗しました`);
  return response.json();
}

function readUrlParams() {
  const params = new URLSearchParams(location.search);
  const get = (key, fallback = '') => params.get(key) || fallback;
  state.filters.competition = get('competition', state.filters.competition);
  state.filters.season = get('season', state.filters.season);
  state.filters.team = get('team', 'all');
  state.filters.position = get('position', 'all');
  state.filters.q = get('q', '');
  state.filters.start = get('start', '');
  state.filters.end = get('end', '');
  state.sort.key = get('sort', 'samurai_stats');
  state.sort.dir = get('dir', 'desc') === 'asc' ? 'asc' : 'desc';
}

function syncUrl() {
  const params = new URLSearchParams();
  const f = state.filters;
  if (f.competition) params.set('competition', f.competition);
  if (f.season) params.set('season', f.season);
  if (f.team && f.team !== 'all') params.set('team', f.team);
  if (f.position && f.position !== 'all') params.set('position', f.position);
  if (f.q) params.set('q', f.q);
  if (f.start) params.set('start', f.start);
  if (f.end) params.set('end', f.end);
  if (state.sort.key !== 'samurai_stats') params.set('sort', state.sort.key);
  if (state.sort.dir !== 'desc') params.set('dir', state.sort.dir);
  const next = `${location.pathname}${params.toString() ? `?${params}` : ''}`;
  history.replaceState(null, '', next);
}

function setSelectOptions(select, options, value) {
  select.innerHTML = options.map((opt) => `<option value="${escapeHtml(opt.value)}">${escapeHtml(opt.label)}</option>`).join('');
  select.value = value;
}

function selectedCompetition() {
  const found = state.manifest.competitions.find((c) => c.competition_id === state.filters.competition);
  if (found) return found;
  const fallback = state.manifest.competitions[0];
  if (fallback) state.filters.competition = fallback.competition_id;
  return fallback;
}

function selectedSeasonMeta() {
  const comp = selectedCompetition();
  if (state.filters.season === 'all') return null;
  return comp.seasons.find((s) => s.season_id === state.filters.season) || comp.seasons.at(-1);
}

function populateInitialControls() {
  const competitions = state.manifest.competitions;
  if (!competitions.length) {
    els.statusText.textContent = 'コンペティションが見つかりません。rawデータを追加して再ビルドしてください。';
    return;
  }
  if (!state.filters.competition || !competitions.some((c) => c.competition_id === state.filters.competition)) {
    state.filters.competition = competitions[0].competition_id;
  }
  setSelectOptions(els.competitionSelect, competitions.map((c) => ({ value: c.competition_id, label: c.name })), state.filters.competition);
  populateSeasonSelect();
  state.manifest.positions.forEach((p) => positionNames.set(String(p.position_id), p.ja || p.en));
  const posOptions = [{ value: 'all', label: 'All Positions' }].concat(
    state.manifest.positions.map((p) => ({ value: String(p.position_id), label: `${p.position_id}. ${p.ja || p.en}` }))
  );
  setSelectOptions(els.positionSelect, posOptions, state.filters.position || 'all');
}

function populateSeasonSelect() {
  const comp = selectedCompetition();
  const seasons = [...(comp?.seasons || [])].sort((a, b) => a.season_id.localeCompare(b.season_id));
  if (!seasons.length) {
    setSelectOptions(els.seasonSelect, [], '');
    state.filters.season = '';
    return;
  }
  const validSeason = state.filters.season === 'all' || seasons.some((s) => s.season_id === state.filters.season);
  if (!state.filters.season || !validSeason) state.filters.season = seasons.at(-1).season_id;
  const opts = [{ value: 'all', label: '全シーズン' }].concat(seasons.map((s) => ({
    value: s.season_id,
    label: `${s.label} (${s.date_min}〜${s.date_max})`,
  })));
  setSelectOptions(els.seasonSelect, opts, state.filters.season);
}

async function loadSelectedData() {
  const comp = selectedCompetition();
  if (!comp || !comp.seasons?.length) {
    state.data.matches = [];
    state.data.appearances = [];
    state.data.samurai = [];
    state.data.teams = [];
    state.data.players = [];
    els.statusText.textContent = '読み込めるコンペティションデータがありません。';
    return;
  }
  const key = `${comp.competition_id}:${state.filters.season}`;
  if (state.loadedKey === key) return;
  els.statusText.textContent = 'データを読み込んでいます。';
  const seasons = state.filters.season === 'all'
    ? comp.seasons
    : [selectedSeasonMeta()];
  const chunks = await Promise.all(seasons.map(async (s) => {
    const base = `./data/${comp.competition_id}/${s.season_id}`;
    const [matches, appearances, samurai, teams, players] = await Promise.all([
      fetchJson(`${base}/matches.json`),
      fetchJson(`${base}/appearances.json`),
      fetchJson(`${base}/samurai_match_stats.json`),
      fetchJson(`${base}/teams.json`),
      fetchJson(`${base}/players.json`),
    ]);
    return { matches, appearances, samurai, teams, players };
  }));
  state.data.matches = chunks.flatMap((c) => c.matches);
  state.data.appearances = chunks.flatMap((c) => c.appearances);
  state.data.samurai = chunks.flatMap((c) => c.samurai);
  state.data.teams = uniqueBy(chunks.flatMap((c) => c.teams), 'team_id').sort((a, b) => a.name.localeCompare(b.name));
  state.data.players = uniqueBy(chunks.flatMap((c) => c.players), 'player_id').sort((a, b) => a.display_name.localeCompare(b.display_name));
  rebuildIndexes();
  populateTeamSelect();
  applyDefaultDatesIfNeeded();
  state.loadedKey = key;
}

function uniqueBy(items, key) {
  const map = new Map();
  items.forEach((item) => map.set(item[key], item));
  return [...map.values()];
}

function samuraiKey(matchId, teamId, playerId) {
  return `${matchId}|${teamId}|${playerId}`;
}

function rebuildIndexes() {
  playerById.clear();
  teamById.clear();
  matchById.clear();
  samuraiByAppearanceKey.clear();
  state.data.players.forEach((p) => playerById.set(p.player_id, p));
  state.data.teams.forEach((t) => teamById.set(t.team_id, t));
  state.data.matches.forEach((m) => matchById.set(m.match_id, m));
  state.data.samurai.forEach((s) => samuraiByAppearanceKey.set(samuraiKey(s.match_id, s.team_id, s.player_id), s));
}

function populateTeamSelect() {
  const options = [{ value: 'all', label: 'All Teams' }].concat(
    state.data.teams.map((t) => ({ value: t.team_id, label: t.name }))
  );
  const valid = options.some((o) => o.value === state.filters.team);
  if (!valid) state.filters.team = 'all';
  setSelectOptions(els.teamSelect, options, state.filters.team);
}

function datasetDateRange() {
  const dates = state.data.matches.map((m) => m.date).sort();
  return { min: dates[0] || '', max: dates.at(-1) || '' };
}

function applyDefaultDatesIfNeeded() {
  const { min, max } = datasetDateRange();
  els.startDateInput.min = min;
  els.startDateInput.max = max;
  els.endDateInput.min = min;
  els.endDateInput.max = max;
  if (!state.filters.start || state.filters.start < min || state.filters.start > max) state.filters.start = min;
  if (!state.filters.end || state.filters.end < min || state.filters.end > max) state.filters.end = max;
  if (state.filters.start > state.filters.end) [state.filters.start, state.filters.end] = [state.filters.end, state.filters.start];
  syncControlsFromState();
}

function syncControlsFromState() {
  els.competitionSelect.value = state.filters.competition;
  els.seasonSelect.value = state.filters.season;
  els.teamSelect.value = state.filters.team;
  els.positionSelect.value = state.filters.position;
  els.startDateInput.value = state.filters.start;
  els.endDateInput.value = state.filters.end;
  els.searchInput.value = state.filters.q;
}

function appearancesForDateAndTeam() {
  const f = state.filters;
  return state.data.appearances.filter((a) => {
    if (f.start && a.date < f.start) return false;
    if (f.end && a.date > f.end) return false;
    if (f.team !== 'all' && a.team_id !== f.team) return false;
    return true;
  });
}

function currentFilteredAppearances() {
  const q = normalize(state.filters.q);
  return appearancesForDateAndTeam().filter((a) => {
    if (state.filters.position !== 'all' && String(a.position_id) !== state.filters.position) return false;
    if (q) {
      const player = playerById.get(a.player_id);
      const haystack = normalize(`${player?.display_name || a.player_name} ${a.player_name}`);
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
}

function samuraiForDateAndTeam() {
  const f = state.filters;
  return state.data.samurai.filter((s) => {
    if (f.start && s.date < f.start) return false;
    if (f.end && s.date > f.end) return false;
    if (f.team !== 'all' && s.team_id !== f.team) return false;
    return true;
  });
}

function displayDivisor(row) {
  if (state.filters.displayMode === 'per-game') return row.appearances || 0;
  if (state.filters.displayMode === 'per80') return row.minutes > 0 ? row.minutes / 80 : 0;
  return 1;
}

function displayActionValue(row, rawValue) {
  const divisor = displayDivisor(row);
  if (!divisor) return 0;
  return rawValue / divisor;
}

function playingBipMinutes(record) {
  return record.playing_ball_in_play_minutes ?? record.ball_in_play_minutes ?? 0;
}

function aggregateRows() {
  const appearances = currentFilteredAppearances();
  const groups = new Map();

  appearances.forEach((a) => {
    const key = `${a.player_id}|${a.team_id}`;
    if (!groups.has(key)) {
      const player = playerById.get(a.player_id) || { display_name: a.player_name };
      const team = teamById.get(a.team_id) || { name: a.team_name };
      groups.set(key, {
        key,
        player_id: a.player_id,
        player_name: player.display_name || a.player_name,
        team_id: a.team_id,
        team_name: team.name || a.team_name,
        team_color: team.primary_color || '#94a3b8',
        positions: new Map(),
        position_label: '',
        minutes: 0,
        playing_ball_in_play_minutes: 0,
        ball_in_play_minutes: 0,
        appearances: 0,
        starts: 0,
        reserve_selections: 0,
        bench_appearances: 0,
        unused_reserve: 0,
        positive_actions: 0,
        negative_actions: 0,
        net_actions: 0,
        positive_display: 0,
        negative_display: 0,
        net_display: 0,
        samurai_stats: 0,
        match_ids: new Set(),
      });
    }
    const row = groups.get(key);
    row.minutes += a.minutes || 0;
    const playingBip = playingBipMinutes(a);
    row.playing_ball_in_play_minutes += playingBip;
    row.ball_in_play_minutes += playingBip; // backward-compatible alias for sorting/export
    if (a.played) row.appearances += 1;
    if (a.started) row.starts += 1;
    if (a.reserve_selected) row.reserve_selections += 1;
    if (a.bench_appearance) row.bench_appearances += 1;
    if (a.reserve_selected && !a.played) row.unused_reserve += 1;
    if (a.position_id) row.positions.set(String(a.position_id), (row.positions.get(String(a.position_id)) || 0) + 1);
    row.match_ids.add(a.match_id);
  });

  samuraiForDateAndTeam().forEach((s) => {
    const key = `${s.player_id}|${s.team_id}`;
    const row = groups.get(key);
    if (!row) return;
    row.positive_actions += s.positive_actions || 0;
    row.negative_actions += s.negative_actions || 0;
    row.net_actions += s.net_actions || 0;
  });

  const rows = [...groups.values()].map((row) => {
    const sortedPositions = [...row.positions.entries()].sort((a, b) => b[1] - a[1]);
    row.position_label = sortedPositions.length
      ? sortedPositions.slice(0, 2).map(([id]) => positionNames.get(id) || id).join(' / ')
      : '-';
    row.samurai_stats = row.playing_ball_in_play_minutes > 0 ? row.net_actions / row.playing_ball_in_play_minutes : 0;
    row.positive_display = displayActionValue(row, row.positive_actions);
    row.negative_display = displayActionValue(row, row.negative_actions);
    row.net_display = displayActionValue(row, row.net_actions);
    return row;
  });
  sortRows(rows);
  state.rows = rows;
}

function sortRows(rows) {
  const { key, dir } = state.sort;
  const sign = dir === 'asc' ? 1 : -1;
  rows.sort((a, b) => {
    const va = a[key];
    const vb = b[key];
    if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * sign;
    return String(va ?? '').localeCompare(String(vb ?? ''), 'ja') * sign;
  });
}

function ensureDateOrder() {
  if (state.filters.start && state.filters.end && state.filters.start > state.filters.end) {
    [state.filters.start, state.filters.end] = [state.filters.end, state.filters.start];
    syncControlsFromState();
  }
}

function render() {
  ensureDateOrder();
  aggregateRows();
  renderTable();
  renderSummary();
  renderSortIndicators();
  syncUrl();
  if (state.selectedPlayerKey) renderPlayerPanel(state.selectedPlayerKey);
}

function renderSummary() {
  const baseAppearances = appearancesForDateAndTeam();
  const matchIds = new Set(baseAppearances.map((a) => a.match_id));
  const totalBip = state.rows.reduce((sum, row) => sum + row.playing_ball_in_play_minutes, 0);
  els.periodSummary.textContent = `${state.filters.start || '-'} 〜 ${state.filters.end || '-'}`;
  els.matchSummary.textContent = `${numberFmt.format(matchIds.size)} 試合`;
  els.playerSummary.textContent = `${numberFmt.format(state.rows.length)} 選手`;
  els.bipSummary.textContent = `${numberFmt.format(totalBip)} 分`;
  els.statusText.textContent = `${numberFmt.format(state.rows.length)}件を表示中`;
}

function formatActionDisplay(value) {
  return state.filters.displayMode === 'total' ? numberFmt.format(Math.round(value)) : decimalFmt.format(value);
}

function renderTable() {
  if (!state.rows.length) {
    els.statsBody.innerHTML = `<tr><td colspan="8" class="empty-state">条件に一致する選手がいません。</td></tr>`;
    return;
  }
  els.statsBody.innerHTML = state.rows.map((row) => `
    <tr class="clickable" data-player-key="${escapeHtml(row.key)}">
      <td><span class="player-name">${escapeHtml(row.player_name)}</span></td>
      <td><span class="team-chip" style="--team-color:${escapeHtml(row.team_color)}">${escapeHtml(row.team_name)}</span></td>
      <td>${escapeHtml(row.position_label)}</td>
      <td class="numeric">${numberFmt.format(row.minutes)}</td>
      <td class="numeric">${numberFmt.format(row.appearances)}</td>
      <td class="numeric">${numberFmt.format(row.starts)}</td>
      <td class="numeric">${numberFmt.format(row.reserve_selections)}</td>
      <td class="numeric primary-metric">${samuraiFmt.format(row.samurai_stats)}</td>
    </tr>
  `).join('');
}

function renderSortIndicators() {
  document.querySelectorAll('th[data-sort]').forEach((th) => {
    th.classList.remove('sorted-asc', 'sorted-desc');
    if (th.dataset.sort === state.sort.key) th.classList.add(state.sort.dir === 'asc' ? 'sorted-asc' : 'sorted-desc');
  });
}

function playerMatchLogRecords(playerKey) {
  return appearancesForDateAndTeam()
    .filter((a) => `${a.player_id}|${a.team_id}` === playerKey)
    .map((a) => {
      const match = matchById.get(a.match_id);
      const team = teamById.get(a.team_id) || { name: a.team_name };
      const stat = samuraiByAppearanceKey.get(samuraiKey(a.match_id, a.team_id, a.player_id)) || { positive_actions: 0, negative_actions: 0, net_actions: 0 };
      const bip = playingBipMinutes(a) || playingBipMinutes(stat);
      const samurai = bip > 0 ? (stat.net_actions || 0) / bip : 0;
      let opponent = '-';
      if (match) {
        opponent = a.team_id === match.home_team_id ? match.away_team_name : match.home_team_name;
        const side = a.team_id === match.home_team_id ? 'H' : 'A';
        const score = match.home_score != null && match.away_score != null ? ` ${match.home_score}-${match.away_score}` : '';
        opponent = `${opponent} (${side}${score})`;
      }
      const role = a.started ? '先発' : a.reserve_selected ? (a.played ? '途中出場' : 'リザーブ未出場') : '不明';
      return { appearance: a, match, team, bip, samurai, opponent, role };
    });
}

function renderSamuraiChart(logs) {
  const ordered = [...logs].sort((a, b) => `${a.appearance.date}${a.appearance.match_id}`.localeCompare(`${b.appearance.date}${b.appearance.match_id}`));
  if (!ordered.length) {
    els.samuraiChart.innerHTML = '<div class="empty-state">グラフ化できる試合ログがありません。</div>';
    return;
  }

  const pointGap = 64;
  const width = Math.max(760, 86 + Math.max(ordered.length - 1, 1) * pointGap);
  const height = 300;
  const margin = { top: 28, right: 28, bottom: 86, left: 58 };
  const plotW = width - margin.left - margin.right;
  const plotH = height - margin.top - margin.bottom;
  const values = ordered.map((d) => d.samurai);
  let yMin = Math.min(0, ...values);
  let yMax = Math.max(0, ...values);
  if (yMin === yMax) {
    yMin -= 0.1;
    yMax += 0.1;
  }
  const padding = (yMax - yMin) * 0.12;
  yMin -= padding;
  yMax += padding;
  const x = (index) => margin.left + (ordered.length === 1 ? plotW / 2 : (plotW * index) / (ordered.length - 1));
  const y = (value) => margin.top + ((yMax - value) / (yMax - yMin)) * plotH;
  const points = ordered.map((d, i) => `${x(i)},${y(d.samurai)}`).join(' ');
  const zeroY = y(0);
  const yTicks = [yMin, (yMin + yMax) / 2, yMax];
  const xLabels = ordered.map((d, i) => {
    const label = d.appearance.date.slice(5);
    return `
      <text
        x="${x(i)}"
        y="${height - 44}"
        text-anchor="end"
        class="chart-label chart-date-label"
        transform="rotate(-45 ${x(i)} ${height - 44})"
      >${escapeHtml(label)}</text>
    `;
  }).join('');
  const circles = ordered.map((d, i) => {
    const tooltip = [
      d.appearance.date,
      d.opponent,
      `Samurai Stats ${samuraiFmt.format(d.samurai)}`,
      `Playing BIP ${numberFmt.format(d.bip)}分`,
    ].join(' / ');
    return `
      <g
        class="chart-hit"
        tabindex="0"
        role="button"
        aria-label="${escapeHtml(tooltip)}"
        data-tooltip="${escapeHtml(tooltip)}"
      >
        <circle cx="${x(i)}" cy="${y(d.samurai)}" r="4" class="chart-point" />
        <circle cx="${x(i)}" cy="${y(d.samurai)}" r="14" class="chart-hover-target" />
      </g>
    `;
  }).join('');

  els.samuraiChart.innerHTML = `
    <div class="chart-scroll">
      <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="試合ごとのSamurai Stats推移">
        <line x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${height - margin.bottom}" class="chart-axis" />
        <line x1="${margin.left}" y1="${height - margin.bottom}" x2="${width - margin.right}" y2="${height - margin.bottom}" class="chart-axis" />
        <line x1="${margin.left}" y1="${zeroY}" x2="${width - margin.right}" y2="${zeroY}" class="chart-zero" />
        ${yTicks.map((tick) => `
          <line x1="${margin.left}" y1="${y(tick)}" x2="${width - margin.right}" y2="${y(tick)}" class="chart-grid" />
          <text x="${margin.left - 10}" y="${y(tick) + 4}" text-anchor="end" class="chart-label">${samuraiFmt.format(tick)}</text>
        `).join('')}
        <polyline points="${points}" class="chart-line" />
        ${circles}
        ${xLabels}
      </svg>
    </div>
    <div class="chart-tooltip" role="status" aria-live="polite" hidden></div>
  `;

  const tooltip = els.samuraiChart.querySelector('.chart-tooltip');
  const hideTooltip = () => {
    tooltip.hidden = true;
  };
  const showTooltip = (event, target) => {
    tooltip.textContent = target.dataset.tooltip || '';
    tooltip.hidden = false;
    const chartRect = els.samuraiChart.getBoundingClientRect();
    const xPos = event.clientX - chartRect.left + 12;
    const yPos = event.clientY - chartRect.top - 12;
    tooltip.style.left = `${Math.min(Math.max(8, xPos), Math.max(8, chartRect.width - 220))}px`;
    tooltip.style.top = `${Math.max(8, yPos)}px`;
  };

  els.samuraiChart.querySelectorAll('.chart-hit').forEach((target) => {
    target.addEventListener('mousemove', (event) => showTooltip(event, target));
    target.addEventListener('mouseenter', (event) => showTooltip(event, target));
    target.addEventListener('mouseleave', hideTooltip);
    target.addEventListener('focus', (event) => {
      const rect = target.getBoundingClientRect();
      showTooltip({ clientX: rect.left + rect.width / 2, clientY: rect.top }, target);
    });
    target.addEventListener('blur', hideTooltip);
  });
}

function renderPlayerPanel(playerKey) {
  const row = state.rows.find((r) => r.key === playerKey);
  if (!row) {
    els.playerPanelOverlay.hidden = true;
    state.selectedPlayerKey = null;
    return;
  }
  state.selectedPlayerKey = playerKey;
  els.playerPanelOverlay.hidden = false;
  els.panelTitle.textContent = row.player_name;
  els.panelSubtitle.textContent = `${row.team_name} / ${row.position_label}`;
  els.panelStats.innerHTML = [
    `出場時間 ${numberFmt.format(row.minutes)}分`,
    `出場数 ${numberFmt.format(row.appearances)}`,
    `スターティング ${numberFmt.format(row.starts)}`,
    `リザーブ ${numberFmt.format(row.reserve_selections)}`,
    `Samurai Stats ${samuraiFmt.format(row.samurai_stats)}`,
  ].map((text) => `<span>${escapeHtml(text)}</span>`).join('');

  const logs = playerMatchLogRecords(playerKey);
  renderSamuraiChart(logs);

  const tableLogs = [...logs].sort((a, b) => `${b.appearance.date}${b.appearance.match_id}`.localeCompare(`${a.appearance.date}${a.appearance.match_id}`));
  els.matchLogBody.innerHTML = tableLogs.map(({ appearance: a, team, bip, samurai, opponent, role }) => `
      <tr>
        <td>${escapeHtml(a.date)}</td>
        <td>${escapeHtml(a.season_id)}</td>
        <td>${escapeHtml(team.name)}</td>
        <td>${escapeHtml(opponent)}</td>
        <td class="numeric">${escapeHtml(a.shirt_no ?? '-')}</td>
        <td><span class="role-pill">${escapeHtml(role)}</span></td>
        <td class="numeric">${numberFmt.format(a.minutes || 0)}</td>
        <td class="numeric">${numberFmt.format(bip)}</td>
        <td class="numeric primary-metric">${samuraiFmt.format(samurai)}</td>
      </tr>
    `).join('');
}

function presetDateList() {
  const dates = state.data.matches
    .filter((m) => state.filters.team === 'all' || m.home_team_id === state.filters.team || m.away_team_id === state.filters.team)
    .map((m) => m.date);
  return [...new Set(dates)].sort();
}

function applyPreset(preset) {
  const dates = presetDateList();
  if (!dates.length) return;
  if (preset === 'all') {
    state.filters.start = dates[0];
    state.filters.end = dates.at(-1);
  }
  if (preset === 'latest-30-days') {
    const end = new Date(`${dates.at(-1)}T00:00:00`);
    const start = new Date(end);
    start.setDate(start.getDate() - 29);
    const minDate = dates[0];
    const proposedStart = start.toISOString().slice(0, 10);
    state.filters.start = proposedStart < minDate ? minDate : proposedStart;
    state.filters.end = dates.at(-1);
  }
  if (preset === 'latest-5-matchdays' || preset === 'latest-10-matchdays') {
    const count = preset === 'latest-5-matchdays' ? 5 : 10;
    const selected = dates.slice(-count);
    state.filters.start = selected[0];
    state.filters.end = selected.at(-1);
  }
  syncControlsFromState();
  render();
}

function exportCsv() {
  if (!state.rows.length) {
    showToast('出力できる行がありません');
    return;
  }
  const header = [
    'competition_id','season_filter','player_id','player_name','team_id','team_name','position',
    'minutes','appearances','starts','reserve_selections','samurai_stats','playing_ball_in_play_minutes','start_date','end_date'
  ];
  const rows = state.rows.map((r) => [
    state.filters.competition, state.filters.season, r.player_id, r.player_name, r.team_id, r.team_name, r.position_label,
    r.minutes, r.appearances, r.starts, r.reserve_selections, r.samurai_stats, r.playing_ball_in_play_minutes,
    state.filters.start, state.filters.end,
  ]);
  const csv = [header, ...rows].map((row) => row.map((v) => `"${String(v ?? '').replaceAll('"', '""')}"`).join(',')).join('\n');
  const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `samurai-stats-${state.filters.competition}-${state.filters.season}-${state.filters.start}_${state.filters.end}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function bindEvents() {
  els.competitionSelect.addEventListener('change', async () => {
    state.filters.competition = els.competitionSelect.value;
    state.filters.season = '';
    state.filters.team = 'all';
    state.filters.position = 'all';
    state.filters.start = '';
    state.filters.end = '';
    state.loadedKey = null;
    populateSeasonSelect();
    await loadSelectedData();
    syncControlsFromState();
    render();
  });
  els.seasonSelect.addEventListener('change', async () => {
    state.filters.season = els.seasonSelect.value;
    state.filters.team = 'all';
    state.filters.start = '';
    state.filters.end = '';
    state.loadedKey = null;
    await loadSelectedData();
    syncControlsFromState();
    render();
  });
  els.teamSelect.addEventListener('change', () => { state.filters.team = els.teamSelect.value; render(); });
  els.positionSelect.addEventListener('change', () => { state.filters.position = els.positionSelect.value; render(); });
  els.startDateInput.addEventListener('change', () => { state.filters.start = els.startDateInput.value; render(); });
  els.endDateInput.addEventListener('change', () => { state.filters.end = els.endDateInput.value; render(); });
  els.searchInput.addEventListener('input', () => { state.filters.q = els.searchInput.value.trim(); render(); });
  document.querySelectorAll('[data-preset]').forEach((button) => button.addEventListener('click', () => applyPreset(button.dataset.preset)));
  els.resetButton.addEventListener('click', () => {
    state.filters.team = 'all';
    state.filters.position = 'all';
    state.filters.q = '';
    applyPreset('all');
  });
  document.querySelectorAll('th[data-sort]').forEach((th) => {
    th.addEventListener('click', () => {
      const key = th.dataset.sort;
      if (state.sort.key === key) state.sort.dir = state.sort.dir === 'asc' ? 'desc' : 'asc';
      else { state.sort.key = key; state.sort.dir = ['player_name','team_name','position_label'].includes(key) ? 'asc' : 'desc'; }
      render();
    });
  });
  els.statsBody.addEventListener('click', (event) => {
    const tr = event.target.closest('tr[data-player-key]');
    if (tr) renderPlayerPanel(tr.dataset.playerKey);
  });
  els.closePanelButton.addEventListener('click', () => { els.playerPanelOverlay.hidden = true; state.selectedPlayerKey = null; });
  els.playerPanelOverlay.addEventListener('click', (event) => {
    if (event.target === els.playerPanelOverlay) {
      els.playerPanelOverlay.hidden = true;
      state.selectedPlayerKey = null;
    }
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !els.playerPanelOverlay.hidden) {
      els.playerPanelOverlay.hidden = true;
      state.selectedPlayerKey = null;
    }
  });
  els.exportCsvButton.addEventListener('click', exportCsv);
  els.copyLinkButton.addEventListener('click', async () => {
    syncUrl();
    try {
      await navigator.clipboard.writeText(location.href);
      showToast('現在の条件URLをコピーしました');
    } catch {
      showToast('URLをコピーできませんでした');
    }
  });
}

async function init() {
  try {
    state.manifest = await fetchJson('./data/manifest.json');
    populateInitialControls();
    readUrlParams();
    populateInitialControls();
    await loadSelectedData();
    syncControlsFromState();
    bindEvents();
    render();
  } catch (error) {
    console.error(error);
    els.statusText.textContent = error.message || '初期化に失敗しました。';
  }
}

init();
