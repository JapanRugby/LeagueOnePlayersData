const ALL_COMPETITIONS_VALUE = 'all';

const state = {
  manifest: null,
  loadedKey: null,
  data: { matches: [], appearances: [], samurai: [], actionStats: [], teams: [], players: [] },
  filters: {
    competition: null,
    season: null,
    team: 'all',
    position: 'all',
    q: '',
    start: '',
    end: '',
    minMinutes: 0,
  },
  sort: { key: 'samurai_stats', dir: 'desc' },
  rows: [],
  selectedPlayerKey: null,
  playerListFilter: { active: false, filename: '', names: new Set(), source: 'none' },
  playerListDefinitions: [],
};

const els = {
  competitionSelect: document.querySelector('#competitionSelect'),
  seasonSelect: document.querySelector('#seasonSelect'),
  teamSelect: document.querySelector('#teamSelect'),
  positionSelect: document.querySelector('#positionSelect'),
  startDateInput: document.querySelector('#startDateInput'),
  endDateInput: document.querySelector('#endDateInput'),
  searchInput: document.querySelector('#searchInput'),
  minMinutesSlider: document.querySelector('#minMinutesSlider'),
  minMinutesValue: document.querySelector('#minMinutesValue'),
  playerListSelect: document.querySelector('#playerListSelect'),
  playerListCsvInput: document.querySelector('#playerListCsvInput'),
  playerListStatus: document.querySelector('#playerListStatus'),
  downloadPlayerListTemplateButton: document.querySelector('#downloadPlayerListTemplateButton'),
  clearPlayerListButton: document.querySelector('#clearPlayerListButton'),
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
  shirtBreakdownBody: document.querySelector('#shirtBreakdownBody'),
  positionBreakdownBody: document.querySelector('#positionBreakdownBody'),
  matchLogBody: document.querySelector('#matchLogBody'),
  closePanelButton: document.querySelector('#closePanelButton'),
  exportCsvButton: document.querySelector('#exportCsvButton'),
  copyLinkButton: document.querySelector('#copyLinkButton'),
};

const numberFmt = new Intl.NumberFormat('ja-JP');
const decimalFmt = new Intl.NumberFormat('ja-JP', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const samuraiFmt = new Intl.NumberFormat('ja-JP', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
  return String(value ?? '').toLowerCase().normalize('NFKC').trim();
}

function normalizePlayerName(value) {
  // Name-only matching: ignore case, width, whitespace and punctuation.
  return normalize(value).replace(/[^\p{L}\p{N}]+/gu, '');
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
  state.filters.minMinutes = Math.max(0, Number.parseInt(get('minMinutes', '0'), 10) || 0);
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
  if (Number(f.minMinutes) > 0) params.set('minMinutes', String(Math.round(Number(f.minMinutes))));
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
  if (state.filters.competition === ALL_COMPETITIONS_VALUE) return null;
  const found = state.manifest.competitions.find((c) => c.competition_id === state.filters.competition);
  if (found) return found;
  state.filters.competition = ALL_COMPETITIONS_VALUE;
  return null;
}

function allSeasonOptions() {
  const byId = new Map();
  (state.manifest?.competitions || []).forEach((competition) => {
    (competition.seasons || []).forEach((season) => {
      const existing = byId.get(season.season_id);
      if (!existing) {
        byId.set(season.season_id, { ...season });
      } else {
        existing.date_min = [existing.date_min, season.date_min].filter(Boolean).sort()[0] || existing.date_min;
        existing.date_max = [existing.date_max, season.date_max].filter(Boolean).sort().at(-1) || existing.date_max;
      }
    });
  });
  return [...byId.values()].sort((a, b) => a.season_id.localeCompare(b.season_id));
}

function selectedSeasonMeta() {
  const comp = selectedCompetition();
  if (!comp || state.filters.season === 'all') return null;
  return comp.seasons.find((s) => s.season_id === state.filters.season) || comp.seasons.at(-1);
}

function selectedDataTargets() {
  const competitions = state.filters.competition === ALL_COMPETITIONS_VALUE
    ? (state.manifest?.competitions || [])
    : [selectedCompetition()].filter(Boolean);
  return competitions.flatMap((competition) => {
    const seasons = state.filters.season === 'all'
      ? (competition.seasons || [])
      : (competition.seasons || []).filter((season) => season.season_id === state.filters.season);
    return seasons.map((season) => ({ competition, season }));
  });
}

function populateInitialControls() {
  const competitions = state.manifest.competitions;
  if (!competitions.length) {
    els.statusText.textContent = 'コンペティションが見つかりません。rawデータを追加して再ビルドしてください。';
    return;
  }
  if (!state.filters.competition || (state.filters.competition !== ALL_COMPETITIONS_VALUE && !competitions.some((c) => c.competition_id === state.filters.competition))) {
    state.filters.competition = ALL_COMPETITIONS_VALUE;
  }
  const competitionOptions = [{ value: ALL_COMPETITIONS_VALUE, label: '全コンペティション' }]
    .concat(competitions.map((c) => ({ value: c.competition_id, label: c.name })));
  setSelectOptions(els.competitionSelect, competitionOptions, state.filters.competition);
  populateSeasonSelect();
  state.manifest.positions.forEach((p) => positionNames.set(String(p.position_id), p.ja || p.en));
  const posOptions = [{ value: 'all', label: 'All Positions' }].concat(
    state.manifest.positions.map((p) => ({ value: String(p.position_id), label: `${p.position_id}. ${p.ja || p.en}` }))
  );
  setSelectOptions(els.positionSelect, posOptions, state.filters.position || 'all');
}

function populateSeasonSelect() {
  const seasons = state.filters.competition === ALL_COMPETITIONS_VALUE
    ? allSeasonOptions()
    : [...(selectedCompetition()?.seasons || [])].sort((a, b) => a.season_id.localeCompare(b.season_id));
  if (!seasons.length) {
    setSelectOptions(els.seasonSelect, [], '');
    state.filters.season = '';
    return;
  }
  const validSeason = state.filters.season === 'all' || seasons.some((s) => s.season_id === state.filters.season);
  if (!state.filters.season || !validSeason) state.filters.season = seasons.at(-1).season_id;
  const opts = [{ value: 'all', label: '全シーズン' }].concat(seasons.map((s) => ({
    value: s.season_id,
    label: `${s.label || s.season_id} (${s.date_min || '-'}〜${s.date_max || '-'})`,
  })));
  setSelectOptions(els.seasonSelect, opts, state.filters.season);
}

async function loadSelectedData() {
  const targets = selectedDataTargets();
  if (!targets.length) {
    state.data.matches = [];
    state.data.appearances = [];
    state.data.samurai = [];
    state.data.actionStats = [];
    state.data.teams = [];
    state.data.players = [];
    els.statusText.textContent = '読み込めるコンペティションデータがありません。';
    return;
  }
  const key = `${state.filters.competition}:${state.filters.season}`;
  if (state.loadedKey === key) return;
  els.statusText.textContent = 'データを読み込んでいます。';
  const chunks = await Promise.all(targets.map(async ({ competition, season }) => {
    const base = `./data/${competition.competition_id}/${season.season_id}`;
    const [matches, appearances, samurai, actionStats, teams, players] = await Promise.all([
      fetchJson(`${base}/matches.json`),
      fetchJson(`${base}/appearances.json`),
      fetchJson(`${base}/samurai_match_stats.json`),
      fetchJson(`${base}/player_action_stats.json`).catch(() => []),
      fetchJson(`${base}/teams.json`),
      fetchJson(`${base}/players.json`),
    ]);
    return { matches, appearances, samurai, actionStats, teams, players };
  }));
  state.data.matches = chunks.flatMap((c) => c.matches);
  state.data.appearances = chunks.flatMap((c) => c.appearances);
  state.data.samurai = chunks.flatMap((c) => c.samurai);
  state.data.actionStats = chunks.flatMap((c) => c.actionStats || []);
  state.data.teams = uniqueBy(chunks.flatMap((c) => c.teams), (item) => `${item.competition_id || ''}|${item.team_id}`)
    .sort((a, b) => a.name.localeCompare(b.name));
  state.data.players = uniqueBy(chunks.flatMap((c) => c.players), (item) => item.player_id)
    .sort((a, b) => a.display_name.localeCompare(b.display_name));
  rebuildIndexes();
  populateTeamSelect();
  applyDefaultDatesIfNeeded();
  state.loadedKey = key;
}

function uniqueBy(items, key) {
  const map = new Map();
  const getKey = typeof key === 'function' ? key : (item) => item[key];
  items.forEach((item) => map.set(getKey(item), item));
  return [...map.values()];
}

function samuraiKey(matchId, teamId, playerId, competitionId = '') {
  return `${competitionId}|${matchId}|${teamId}|${playerId}`;
}

function matchKey(matchId, competitionId = '') {
  return `${competitionId}|${matchId}`;
}

function rebuildIndexes() {
  playerById.clear();
  teamById.clear();
  matchById.clear();
  samuraiByAppearanceKey.clear();
  state.data.players.forEach((p) => playerById.set(p.player_id, p));
  state.data.teams.forEach((t) => teamById.set(t.team_id, t));
  state.data.matches.forEach((m) => {
    matchById.set(matchKey(m.match_id, m.competition_id), m);
    if (!matchById.has(m.match_id)) matchById.set(m.match_id, m);
  });
  state.data.samurai.forEach((s) => samuraiByAppearanceKey.set(samuraiKey(s.match_id, s.team_id, s.player_id, s.competition_id), s));
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
  if (els.minMinutesSlider) els.minMinutesSlider.value = String(state.filters.minMinutes || 0);
  updateMinMinutesLabel();
}


function updateMinMinutesLabel() {
  if (!els.minMinutesValue) return;
  const value = Math.round(Number(state.filters.minMinutes) || 0);
  els.minMinutesValue.textContent = value > 0 ? `${numberFmt.format(value)}分超` : '0分超';
}

function updateMinutesSliderMax(rowsBeforeFilter) {
  if (!els.minMinutesSlider) return;
  const maxMinutes = Math.max(0, ...rowsBeforeFilter.map((row) => Math.ceil(row.minutes || 0)));
  const current = Math.round(Number(state.filters.minMinutes) || 0);
  els.minMinutesSlider.max = String(maxMinutes);
  if (current > maxMinutes) state.filters.minMinutes = maxMinutes;
  els.minMinutesSlider.value = String(state.filters.minMinutes || 0);
  updateMinMinutesLabel();
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


function parseCsvLine(line) {
  const cells = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];
    if (char === '"' && quoted && next === '"') {
      current += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === ',' && !quoted) {
      cells.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  cells.push(current.trim());
  return cells.map((cell) => cell.replace(/^"|"$/g, '').trim());
}

function getHeaderIndex(headers, names) {
  const normalized = headers.map((header) => normalize(header).replace(/[ _-]/g, ''));
  const candidates = names.map((name) => normalize(name).replace(/[ _-]/g, ''));
  return normalized.findIndex((header) => candidates.includes(header));
}

function parsePlayerListCsv(text) {
  const lines = text
    .replace(/^\ufeff/, '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));
  const names = new Set();
  if (!lines.length) return { names };

  const first = parseCsvLine(lines[0]);
  const nameIndex = getHeaderIndex(first, [
    'player_name', 'display_name', 'PlayerName', 'name', 'player', 'player name', '選手名', '氏名'
  ]);
  const hasHeader = nameIndex >= 0;
  const rows = hasHeader ? lines.slice(1) : lines;

  rows.forEach((line) => {
    const cells = parseCsvLine(line);
    const nameValue = hasHeader ? cells[nameIndex] : cells[0];
    const normalizedName = normalizePlayerName(nameValue);
    if (normalizedName) names.add(normalizedName);
  });
  return { names };
}

function playerMatchesListFilter(playerId, playerName) {
  const filter = state.playerListFilter;
  if (!filter.active) return true;
  const normalizedName = normalizePlayerName(playerName);
  if (!normalizedName) return false;
  if (filter.names.has(normalizedName)) return true;
  for (const listedName of filter.names) {
    if (listedName && (normalizedName.includes(listedName) || listedName.includes(normalizedName))) return true;
  }
  return false;
}

function updatePlayerListStatus() {
  if (!els.playerListStatus) return;
  const filter = state.playerListFilter;
  if (!filter.active) {
    els.playerListStatus.textContent = '対象選手リスト未適用';
    return;
  }
  const count = filter.names.size;
  els.playerListStatus.textContent = `${filter.filename || 'Player list'}: ${numberFmt.format(count)}名`;
}

function clearPlayerListFilter() {
  state.playerListFilter = { active: false, filename: '', names: new Set(), source: 'none' };
  if (els.playerListCsvInput) els.playerListCsvInput.value = '';
  if (els.playerListSelect) els.playerListSelect.value = '';
  updatePlayerListStatus();
  render();
}

function downloadPlayerListTemplate() {
  const csv = 'player_name\nSample Player\nAnother Player\n';
  const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'player-name-list-template.csv';
  a.click();
  URL.revokeObjectURL(a.href);
}

async function loadPlayerListDefinitions() {
  try {
    const data = await fetchJson('./data/player-lists/manifest.json');
    state.playerListDefinitions = Array.isArray(data.lists) ? data.lists : [];
  } catch (error) {
    state.playerListDefinitions = [];
  }
}

function populatePlayerListSelect() {
  if (!els.playerListSelect) return;
  const options = [{ value: '', label: 'リストを選択しない' }].concat(
    state.playerListDefinitions.map((list) => ({ value: list.id, label: list.name || list.id }))
  );
  setSelectOptions(els.playerListSelect, options, '');
}

async function applyPlayerListDefinition(listId) {
  if (!listId) {
    clearPlayerListFilter();
    return;
  }
  const definition = state.playerListDefinitions.find((list) => list.id === listId);
  if (!definition) return;
  const path = definition.path || `./data/player-lists/${definition.id}.csv`;
  const response = await fetch(path, { cache: 'no-store' });
  if (!response.ok) throw new Error(`${definition.name || definition.id} の読み込みに失敗しました`);
  const parsed = parsePlayerListCsv(await response.text());
  state.playerListFilter = {
    active: true,
    filename: definition.name || definition.id,
    names: parsed.names,
    source: 'github',
  };
  if (els.playerListCsvInput) els.playerListCsvInput.value = '';
  updatePlayerListStatus();
  render();
}
function currentFilteredAppearances() {
  const q = normalize(state.filters.q);
  return appearancesForDateAndTeam().filter((a) => {
    if (state.filters.position !== 'all' && String(a.position_id) !== state.filters.position) return false;
    const player = playerById.get(a.player_id);
    const displayName = player?.display_name || a.player_name;
    if (q) {
      const haystack = normalize(`${displayName} ${a.player_name}`);
      if (!haystack.includes(q)) return false;
    }
    if (!playerMatchesListFilter(a.player_id, displayName || a.player_name)) return false;
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

function safePer80(value, minutes) {
  return minutes > 0 ? (Number(value || 0) / minutes) * 80 : 0;
}

function safePct(numerator, denominator) {
  return denominator > 0 ? (Number(numerator || 0) / denominator) * 100 : 0;
}

function actionStatKey(record) {
  return `${record.competition_id || ''}|${record.match_id}|${record.team_id}|${record.player_id}`;
}

function addActionMetricDefaults(row) {
  row.ball_carry_attempts = 0;
  row.dominant_carries = 0;
  row.carry_metres = 0;
  row.post_contact_metres = 0;
  row.tackle_attempts = 0;
  row.tackles_made = 0;
  row.dominant_tackles = 0;
  row.ruck_ooa_attack_attempts = 0;
  row.ruck_ooa_attack_effective = 0;
  row.ball_carry_attempt_per80 = 0;
  row.ball_carry_dominance_pct = 0;
  row.ball_carry_metres_per80 = 0;
  row.post_contact_metres_per80 = 0;
  row.tackle_attempt_per80 = 0;
  row.tackle_made_per80 = 0;
  row.tackle_dominance_pct = 0;
  row.ruck_ooa_attack_attempt_per80 = 0;
  row.ruck_ooa_attack_effectiveness_pct = 0;
}

function formatPer80(value) {
  return decimalFmt.format(value || 0);
}

function formatPct(value) {
  return `${decimalFmt.format(value || 0)}%`;
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
      addActionMetricDefaults(groups.get(key));
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

  const allowedActionKeys = new Set(appearances.map((a) => actionStatKey(a)));
  state.data.actionStats.forEach((stat) => {
    if (!allowedActionKeys.has(actionStatKey(stat))) return;
    const key = `${stat.player_id}|${stat.team_id}`;
    const row = groups.get(key);
    if (!row) return;
    row.ball_carry_attempts += Number(stat.ball_carry_attempts || 0);
    row.dominant_carries += Number(stat.dominant_carries || 0);
    row.carry_metres += Number(stat.carry_metres || 0);
    row.post_contact_metres += Number(stat.post_contact_metres || 0);
    row.tackle_attempts += Number(stat.tackle_attempts || 0);
    row.tackles_made += Number(stat.tackles_made || 0);
    row.dominant_tackles += Number(stat.dominant_tackles || 0);
    row.ruck_ooa_attack_attempts += Number(stat.ruck_ooa_attack_attempts || 0);
    row.ruck_ooa_attack_effective += Number(stat.ruck_ooa_attack_effective || 0);
  });

  const rowsBeforeMinutesFilter = [...groups.values()].map((row) => {
    const sortedPositions = [...row.positions.entries()].sort((a, b) => b[1] - a[1]);
    row.position_label = sortedPositions.length
      ? sortedPositions.slice(0, 2).map(([id]) => positionNames.get(id) || id).join(' / ')
      : '-';
    row.samurai_stats = row.playing_ball_in_play_minutes > 0 ? row.net_actions / row.playing_ball_in_play_minutes : 0;
    row.ball_carry_attempt_per80 = safePer80(row.ball_carry_attempts, row.minutes);
    row.ball_carry_dominance_pct = safePct(row.dominant_carries, row.ball_carry_attempts);
    row.ball_carry_metres_per80 = safePer80(row.carry_metres, row.minutes);
    row.post_contact_metres_per80 = safePer80(row.post_contact_metres, row.minutes);
    row.tackle_attempt_per80 = safePer80(row.tackle_attempts, row.minutes);
    row.tackle_made_per80 = safePer80(row.tackles_made, row.minutes);
    row.tackle_dominance_pct = safePct(row.dominant_tackles, row.tackle_attempts);
    row.ruck_ooa_attack_attempt_per80 = safePer80(row.ruck_ooa_attack_attempts, row.minutes);
    row.ruck_ooa_attack_effectiveness_pct = safePct(row.ruck_ooa_attack_effective, row.ruck_ooa_attack_attempts);
    row.positive_display = displayActionValue(row, row.positive_actions);
    row.negative_display = displayActionValue(row, row.negative_actions);
    row.net_display = displayActionValue(row, row.net_actions);
    return row;
  });
  updateMinutesSliderMax(rowsBeforeMinutesFilter);
  const threshold = Math.max(0, Number(state.filters.minMinutes) || 0);
  const rows = threshold > 0
    ? rowsBeforeMinutesFilter.filter((row) => row.minutes > threshold)
    : rowsBeforeMinutesFilter;
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
  const threshold = Math.max(0, Number(state.filters.minMinutes) || 0);
  const playerListText = state.playerListFilter.active ? ' / 対象選手リスト適用中' : '';
  els.statusText.textContent = threshold > 0
    ? `${numberFmt.format(state.rows.length)}件を表示中（出場時間 ${numberFmt.format(threshold)}分以下を除外${playerListText}）`
    : `${numberFmt.format(state.rows.length)}件を表示中${playerListText}`;
}

function formatActionDisplay(value) {
  return state.filters.displayMode === 'total' ? numberFmt.format(Math.round(value)) : decimalFmt.format(value);
}

function renderTable() {
  if (!state.rows.length) {
    els.statsBody.innerHTML = `<tr><td colspan="17" class="empty-state">条件に一致する選手がいません。</td></tr>`;
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
      <td class="numeric">${formatPer80(row.ball_carry_attempt_per80)}</td>
      <td class="numeric">${formatPct(row.ball_carry_dominance_pct)}</td>
      <td class="numeric">${formatPer80(row.ball_carry_metres_per80)}</td>
      <td class="numeric">${formatPer80(row.post_contact_metres_per80)}</td>
      <td class="numeric">${formatPer80(row.tackle_attempt_per80)}</td>
      <td class="numeric">${formatPer80(row.tackle_made_per80)}</td>
      <td class="numeric">${formatPct(row.tackle_dominance_pct)}</td>
      <td class="numeric">${formatPer80(row.ruck_ooa_attack_attempt_per80)}</td>
      <td class="numeric">${formatPct(row.ruck_ooa_attack_effectiveness_pct)}</td>
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
      const match = matchById.get(matchKey(a.match_id, a.competition_id)) || matchById.get(a.match_id);
      const team = teamById.get(a.team_id) || { name: a.team_name };
      const stat = samuraiByAppearanceKey.get(samuraiKey(a.match_id, a.team_id, a.player_id, a.competition_id)) || { positive_actions: 0, negative_actions: 0, net_actions: 0 };
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


function countPlayedBy(logs, getKey, getLabel) {
  const counts = new Map();
  logs.forEach(({ appearance }) => {
    if (!appearance.played) return;
    const key = getKey(appearance);
    if (key == null || key === '') return;
    const keyText = String(key);
    if (!counts.has(keyText)) counts.set(keyText, { key: keyText, label: getLabel ? getLabel(appearance, keyText) : keyText, count: 0 });
    counts.get(keyText).count += 1;
  });
  return [...counts.values()].sort((a, b) => b.count - a.count || String(a.key).localeCompare(String(b.key), 'ja', { numeric: true }));
}

function renderPlayerBreakdowns(logs) {
  const shirtRows = countPlayedBy(logs, (a) => a.shirt_no ?? '-', null);
  els.shirtBreakdownBody.innerHTML = shirtRows.length
    ? shirtRows.map((row) => `
      <tr>
        <td>${escapeHtml(row.key)}</td>
        <td class="numeric">${numberFmt.format(row.count)}</td>
      </tr>
    `).join('')
    : '<tr><td colspan="2" class="empty-state">出場記録がありません。</td></tr>';

  const positionRows = countPlayedBy(logs, (a) => a.position_id ?? '-', (_a, key) => positionNames.get(String(key)) || '-');
  els.positionBreakdownBody.innerHTML = positionRows.length
    ? positionRows.map((row) => `
      <tr>
        <td>${escapeHtml(row.key)}</td>
        <td>${escapeHtml(row.label)}</td>
        <td class="numeric">${numberFmt.format(row.count)}</td>
      </tr>
    `).join('')
    : '<tr><td colspan="3" class="empty-state">出場記録がありません。</td></tr>';
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
  renderPlayerBreakdowns(logs);

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
  if (['latest-1-matchday', 'latest-5-matchdays', 'latest-10-matchdays'].includes(preset)) {
    const countByPreset = {
      'latest-1-matchday': 1,
      'latest-5-matchdays': 5,
      'latest-10-matchdays': 10,
    };
    const selected = dates.slice(-countByPreset[preset]);
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
    'minutes','appearances','starts','reserve_selections','samurai_stats','ball_carry_attempt_per80',
    'ball_carry_dominance_pct','ball_carry_metres_per80','post_contact_metres_per80','tackle_attempt_per80',
    'tackle_made_per80','tackle_dominance_pct','ruck_ooa_attack_attempt_per80','ruck_ooa_attack_effectiveness_pct',
    'playing_ball_in_play_minutes','start_date','end_date','min_minutes_filter','player_list_filter'
  ];
  const rows = state.rows.map((r) => [
    state.filters.competition, state.filters.season, r.player_id, r.player_name, r.team_id, r.team_name, r.position_label,
    r.minutes, r.appearances, r.starts, r.reserve_selections, r.samurai_stats, r.ball_carry_attempt_per80,
    r.ball_carry_dominance_pct, r.ball_carry_metres_per80, r.post_contact_metres_per80, r.tackle_attempt_per80,
    r.tackle_made_per80, r.tackle_dominance_pct, r.ruck_ooa_attack_attempt_per80, r.ruck_ooa_attack_effectiveness_pct,
    r.playing_ball_in_play_minutes, state.filters.start, state.filters.end, state.filters.minMinutes || 0, state.playerListFilter.active ? state.playerListFilter.filename : '',
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
    state.filters.minMinutes = 0;
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
    state.filters.minMinutes = 0;
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
  els.minMinutesSlider.addEventListener('input', () => {
    state.filters.minMinutes = Math.max(0, Number.parseInt(els.minMinutesSlider.value, 10) || 0);
    updateMinMinutesLabel();
    render();
  });
  document.querySelectorAll('[data-preset]').forEach((button) => button.addEventListener('click', () => applyPreset(button.dataset.preset)));
  els.resetButton.addEventListener('click', () => {
    state.filters.team = 'all';
    state.filters.position = 'all';
    state.filters.q = '';
    state.filters.minMinutes = 0;
    state.playerListFilter = { active: false, filename: '', names: new Set(), source: 'none' };
    if (els.playerListCsvInput) els.playerListCsvInput.value = '';
    if (els.playerListSelect) els.playerListSelect.value = '';
    updatePlayerListStatus();
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
  if (els.playerListSelect) {
    els.playerListSelect.addEventListener('change', async () => {
      try {
        await applyPlayerListDefinition(els.playerListSelect.value);
      } catch (error) {
        console.error(error);
        showToast(error.message || '対象選手リストを読み込めませんでした');
      }
    });
  }
  if (els.playerListCsvInput) {
    els.playerListCsvInput.addEventListener('change', async () => {
      const file = els.playerListCsvInput.files?.[0];
      if (!file) return;
      const text = await file.text();
      const parsed = parsePlayerListCsv(text);
      state.playerListFilter = { active: true, filename: file.name, names: parsed.names, source: 'upload' };
      if (els.playerListSelect) els.playerListSelect.value = '';
      updatePlayerListStatus();
      render();
    });
  }
  if (els.clearPlayerListButton) els.clearPlayerListButton.addEventListener('click', clearPlayerListFilter);
  if (els.downloadPlayerListTemplateButton) els.downloadPlayerListTemplateButton.addEventListener('click', downloadPlayerListTemplate);
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
    await loadPlayerListDefinitions();
    populatePlayerListSelect();
    populateInitialControls();
    readUrlParams();
    populateInitialControls();
    await loadSelectedData();
    syncControlsFromState();
    updatePlayerListStatus();
    bindEvents();
    render();
  } catch (error) {
    console.error(error);
    els.statusText.textContent = error.message || '初期化に失敗しました。';
  }
}

init();
