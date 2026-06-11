const MAX_SELECTED_PLAYERS = 10;

const state = {
  manifest: null,
  loadedKey: null,
  data: { matches: [], appearances: [], actionStats: [], teams: [], players: [] },
  filters: {
    competition: null,
    season: null,
    team: 'all',
    position: 'all',
    start: '',
    end: '',
    minMinutes: 0,
    playerSearch: '',
    players: [],
  },
  rows: [],
};

const els = {
  competitionSelect: document.querySelector('#competitionSelect'),
  seasonSelect: document.querySelector('#seasonSelect'),
  teamSelect: document.querySelector('#teamSelect'),
  positionSelect: document.querySelector('#positionSelect'),
  startDateInput: document.querySelector('#startDateInput'),
  endDateInput: document.querySelector('#endDateInput'),
  minMinutesSlider: document.querySelector('#minMinutesSlider'),
  minMinutesValue: document.querySelector('#minMinutesValue'),
  playerSearchInput: document.querySelector('#playerSearchInput'),
  playerSelect: document.querySelector('#playerSelect'),
  addPlayerButton: document.querySelector('#addPlayerButton'),
  resetButton: document.querySelector('#resetButton'),
  periodSummary: document.querySelector('#periodSummary'),
  selectedSummary: document.querySelector('#selectedSummary'),
  candidateSummary: document.querySelector('#candidateSummary'),
  minutesSummary: document.querySelector('#minutesSummary'),
  selectedPlayers: document.querySelector('#selectedPlayers'),
  compareStatusText: document.querySelector('#compareStatusText'),
  comparisonBody: document.querySelector('#comparisonBody'),
  clearPlayersButton: document.querySelector('#clearPlayersButton'),
  copyCompareLinkButton: document.querySelector('#copyCompareLinkButton'),
  exportCompareCsvButton: document.querySelector('#exportCompareCsvButton'),
};

const numberFmt = new Intl.NumberFormat('ja-JP');
const oneDecimalFmt = new Intl.NumberFormat('ja-JP', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const twoDecimalFmt = new Intl.NumberFormat('ja-JP', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const samuraiFmt = new Intl.NumberFormat('ja-JP', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const percentFmt = new Intl.NumberFormat('ja-JP', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

const positionNames = new Map();
const matchById = new Map();
const teamById = new Map();
const playerById = new Map();
const appearanceByKey = new Map();
let candidateRows = [];

const comparisonColumns = [
  { key: 'playing_minutes', kind: 'int' },
  { key: 'samurai_stats', kind: 'samurai' },
  { key: 'carry_attempt_per80', kind: 'one' },
  { key: 'carry_dominance_pct', kind: 'pct' },
  { key: 'carry_metres_per80', kind: 'one' },
  { key: 'post_contact_metres_per80', kind: 'one' },
  { key: 'tackle_attempt_per80', kind: 'one' },
  { key: 'tackle_made_per80', kind: 'one' },
  { key: 'tackle_dominance_pct', kind: 'pct' },
  { key: 'ruck_ooa_attack_attempt_per80', kind: 'one' },
  { key: 'ruck_ooa_attack_effectiveness_pct', kind: 'pct' },
];

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;'
  }[char]));
}

function normalize(value) {
  return String(value ?? '').toLowerCase().normalize('NFKC');
}

async function fetchJson(path) {
  const response = await fetch(path, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Failed to load ${path}`);
  return response.json();
}

function setSelectOptions(select, options, selectedValue) {
  select.innerHTML = options.map((opt) => (
    `<option value="${escapeHtml(opt.value)}">${escapeHtml(opt.label)}</option>`
  )).join('');
  if (selectedValue !== undefined && selectedValue !== null) select.value = selectedValue;
}

function selectedCompetition() {
  return state.manifest?.competitions?.find((c) => c.competition_id === state.filters.competition);
}

function selectedSeasonMeta() {
  return selectedCompetition()?.seasons?.find((s) => s.season_id === state.filters.season);
}

function getQuery() {
  return new URLSearchParams(window.location.search);
}

function readFiltersFromUrl() {
  const params = getQuery();
  state.filters.competition = params.get('competition') || state.filters.competition;
  state.filters.season = params.get('season') || state.filters.season;
  state.filters.team = params.get('team') || 'all';
  state.filters.position = params.get('position') || 'all';
  state.filters.start = params.get('start') || '';
  state.filters.end = params.get('end') || '';
  state.filters.minMinutes = Number(params.get('minMinutes') || 0);
  state.filters.playerSearch = params.get('q') || '';
  state.filters.players = (params.get('players') || '').split(',').map((x) => x.trim()).filter(Boolean).slice(0, MAX_SELECTED_PLAYERS);
}

function updateUrl(replace = true) {
  const params = new URLSearchParams();
  if (state.filters.competition) params.set('competition', state.filters.competition);
  if (state.filters.season) params.set('season', state.filters.season);
  if (state.filters.team && state.filters.team !== 'all') params.set('team', state.filters.team);
  if (state.filters.position && state.filters.position !== 'all') params.set('position', state.filters.position);
  if (state.filters.start) params.set('start', state.filters.start);
  if (state.filters.end) params.set('end', state.filters.end);
  if (state.filters.minMinutes) params.set('minMinutes', String(state.filters.minMinutes));
  if (state.filters.playerSearch) params.set('q', state.filters.playerSearch);
  if (state.filters.players.length) params.set('players', state.filters.players.join(','));
  const next = `${window.location.pathname}?${params.toString()}`;
  window.history[replace ? 'replaceState' : 'pushState']({}, '', next);
}

function safePer80(value, minutes) {
  return minutes > 0 ? (Number(value || 0) / minutes) * 80 : 0;
}

function safePct(numerator, denominator) {
  return denominator > 0 ? (Number(numerator || 0) / denominator) * 100 : 0;
}

function formatValue(value, kind) {
  if (kind === 'int') return numberFmt.format(Math.round(value || 0));
  if (kind === 'samurai') return samuraiFmt.format(value || 0);
  if (kind === 'pct') return `${percentFmt.format(value || 0)}%`;
  return oneDecimalFmt.format(value || 0);
}

function appearanceKey(matchId, teamId, playerId) {
  return `${matchId}|${teamId}|${playerId}`;
}

function rebuildIndexes() {
  matchById.clear();
  teamById.clear();
  playerById.clear();
  appearanceByKey.clear();
  state.data.matches.forEach((m) => matchById.set(m.match_id, m));
  state.data.teams.forEach((t) => teamById.set(t.team_id, t));
  state.data.players.forEach((p) => playerById.set(p.player_id, p));
  state.data.appearances.forEach((a) => appearanceByKey.set(appearanceKey(a.match_id, a.team_id, a.player_id), a));
}

function populateCompetitionSelect() {
  const competitions = [...(state.manifest.competitions || [])];
  if (!state.filters.competition || !competitions.some((c) => c.competition_id === state.filters.competition)) {
    state.filters.competition = competitions[0]?.competition_id || '';
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
  if (!comp) return;
  const key = `${comp.competition_id}:${state.filters.season}`;
  if (state.loadedKey === key) return;
  els.compareStatusText.textContent = 'データを読み込んでいます。';
  const seasons = state.filters.season === 'all' ? comp.seasons : [selectedSeasonMeta()];
  const chunks = await Promise.all(seasons.map(async (s) => {
    const base = `./data/${comp.competition_id}/${s.season_id}`;
    const [matches, appearances, actionStats, teams, players] = await Promise.all([
      fetchJson(`${base}/matches.json`),
      fetchJson(`${base}/appearances.json`),
      fetchJson(`${base}/player_action_stats.json`),
      fetchJson(`${base}/teams.json`),
      fetchJson(`${base}/players.json`),
    ]);
    return { matches, appearances, actionStats, teams, players };
  }));
  state.data.matches = chunks.flatMap((c) => c.matches);
  state.data.appearances = chunks.flatMap((c) => c.appearances);
  state.data.actionStats = chunks.flatMap((c) => c.actionStats);
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

function populateTeamSelect() {
  const opts = [{ value: 'all', label: 'All Teams' }].concat(
    state.data.teams.map((t) => ({ value: t.team_id, label: t.name }))
  );
  if (!opts.some((o) => o.value === state.filters.team)) state.filters.team = 'all';
  setSelectOptions(els.teamSelect, opts, state.filters.team);
}

function applyDefaultDatesIfNeeded() {
  if (state.filters.start && state.filters.end) return;
  const dates = state.data.matches.map((m) => m.date).filter(Boolean).sort();
  if (!dates.length) return;
  state.filters.start = state.filters.start || dates[0];
  state.filters.end = state.filters.end || dates.at(-1);
  els.startDateInput.value = state.filters.start;
  els.endDateInput.value = state.filters.end;
}

function filteredActionStats() {
  const start = state.filters.start;
  const end = state.filters.end;
  return state.data.actionStats.filter((row) => {
    if (start && row.date < start) return false;
    if (end && row.date > end) return false;
    if (state.filters.team !== 'all' && row.team_id !== state.filters.team) return false;
    const appearance = appearanceByKey.get(appearanceKey(row.match_id, row.team_id, row.player_id));
    if (state.filters.position !== 'all' && String(appearance?.position_id ?? '') !== state.filters.position) return false;
    return true;
  });
}

function aggregatePlayers(rows) {
  const map = new Map();
  rows.forEach((row) => {
    const playerId = row.player_id;
    if (!playerId) return;
    if (!map.has(playerId)) {
      const player = playerById.get(playerId) || {};
      map.set(playerId, {
        player_id: playerId,
        player_name: row.player_name || player.display_name || playerId,
        team_names: new Set(),
        minutes: 0,
        playing_ball_in_play_minutes: 0,
        positive_actions: 0,
        negative_actions: 0,
        net_actions: 0,
        ball_carry_attempts: 0,
        dominant_carries: 0,
        carry_metres: 0,
        post_contact_metres: 0,
        tackle_attempts: 0,
        tackles_made: 0,
        dominant_tackles: 0,
        ruck_ooa_attack_attempts: 0,
        ruck_ooa_attack_effective: 0,
      });
    }
    const agg = map.get(playerId);
    if (row.team_name) agg.team_names.add(row.team_name);
    agg.minutes += Number(row.minutes || 0);
    agg.playing_ball_in_play_minutes += Number(row.playing_ball_in_play_minutes || row.ball_in_play_minutes || 0);
    agg.positive_actions += Number(row.positive_actions || 0);
    agg.negative_actions += Number(row.negative_actions || 0);
    agg.net_actions += Number(row.net_actions || 0);
    agg.ball_carry_attempts += Number(row.ball_carry_attempts || 0);
    agg.dominant_carries += Number(row.dominant_carries || 0);
    agg.carry_metres += Number(row.carry_metres || 0);
    agg.post_contact_metres += Number(row.post_contact_metres || 0);
    agg.tackle_attempts += Number(row.tackle_attempts || 0);
    agg.tackles_made += Number(row.tackles_made || 0);
    agg.dominant_tackles += Number(row.dominant_tackles || 0);
    agg.ruck_ooa_attack_attempts += Number(row.ruck_ooa_attack_attempts || 0);
    agg.ruck_ooa_attack_effective += Number(row.ruck_ooa_attack_effective || 0);
  });
  return [...map.values()].map(buildComparisonRow).sort((a, b) => a.player_name.localeCompare(b.player_name));
}

function buildComparisonRow(agg) {
  const minutes = agg.minutes || 0;
  const bip = agg.playing_ball_in_play_minutes || 0;
  return {
    player_id: agg.player_id,
    player_name: agg.player_name,
    team_name: [...agg.team_names].sort().join(' / ') || '-',
    playing_minutes: minutes,
    samurai_stats: bip > 0 ? agg.net_actions / bip : 0,
    carry_attempt_per80: safePer80(agg.ball_carry_attempts, minutes),
    carry_dominance_pct: safePct(agg.dominant_carries, agg.ball_carry_attempts),
    carry_metres_per80: safePer80(agg.carry_metres, minutes),
    post_contact_metres_per80: safePer80(agg.post_contact_metres, minutes),
    tackle_attempt_per80: safePer80(agg.tackle_attempts, minutes),
    tackle_made_per80: safePer80(agg.tackles_made, minutes),
    tackle_dominance_pct: safePct(agg.dominant_tackles, agg.tackle_attempts),
    ruck_ooa_attack_attempt_per80: safePer80(agg.ruck_ooa_attack_attempts, minutes),
    ruck_ooa_attack_effectiveness_pct: safePct(agg.ruck_ooa_attack_effective, agg.ruck_ooa_attack_attempts),
    raw: agg,
  };
}

function refreshCandidates() {
  const allRows = aggregatePlayers(filteredActionStats());
  const minMinutes = Number(state.filters.minMinutes || 0);
  const query = normalize(state.filters.playerSearch);
  candidateRows = allRows.filter((row) => {
    if (row.playing_minutes <= minMinutes) return false;
    if (query && !normalize(`${row.player_name} ${row.team_name}`).includes(query)) return false;
    return true;
  });
  els.candidateSummary.textContent = `${numberFmt.format(candidateRows.length)}名`;
  const options = candidateRows.map((row) => ({
    value: row.player_id,
    label: `${row.player_name} / ${row.team_name} / ${numberFmt.format(row.playing_minutes)}分`,
  }));
  setSelectOptions(els.playerSelect, options.length ? options : [{ value: '', label: '候補選手がいません' }], options[0]?.value || '');
}

function selectedRows() {
  const rowById = new Map(candidateRows.map((row) => [row.player_id, row]));
  return state.filters.players.map((id) => rowById.get(id)).filter(Boolean);
}

function renderSelectedChips() {
  if (!state.filters.players.length) {
    els.selectedPlayers.innerHTML = '<p class="empty-state">比較したい選手を追加してください。</p>';
    return;
  }
  const rowById = new Map(candidateRows.map((row) => [row.player_id, row]));
  els.selectedPlayers.innerHTML = state.filters.players.map((id) => {
    const row = rowById.get(id);
    const label = row ? `${row.player_name} / ${row.team_name}` : `${id} / 現在の条件外`;
    return `<button class="selected-player-chip" type="button" data-remove-player="${escapeHtml(id)}">${escapeHtml(label)} <span>×</span></button>`;
  }).join('');
}

function maxMapForRows(rows) {
  const maxMap = {};
  comparisonColumns.forEach((col) => {
    const values = rows.map((row) => Number(row[col.key] || 0)).filter((v) => Number.isFinite(v));
    const max = values.length ? Math.max(...values) : null;
    maxMap[col.key] = max !== null && max > 0 ? max : null;
  });
  return maxMap;
}

function renderComparisonTable() {
  const rows = selectedRows();
  const maxMap = maxMapForRows(rows);
  state.rows = rows;
  if (!rows.length) {
    els.comparisonBody.innerHTML = '<tr><td colspan="13" class="empty-table-cell">選手を追加すると比較表が表示されます。</td></tr>';
    els.compareStatusText.textContent = '選手を追加してください。';
    return;
  }
  els.compareStatusText.textContent = `${rows.length}名を比較中です。`;
  els.comparisonBody.innerHTML = rows.map((row) => {
    const cells = comparisonColumns.map((col) => {
      const value = Number(row[col.key] || 0);
      const isBest = maxMap[col.key] !== null && Math.abs(value - maxMap[col.key]) < 1e-9;
      return `<td class="numeric ${isBest ? 'cell-best' : ''} ${col.key === 'samurai_stats' ? 'primary-metric' : ''}">${formatValue(value, col.kind)}</td>`;
    }).join('');
    return `<tr>
      <td class="player-name">${escapeHtml(row.player_name)}</td>
      <td>${escapeHtml(row.team_name)}</td>
      ${cells}
    </tr>`;
  }).join('');
}

function updateSummaries() {
  els.periodSummary.textContent = state.filters.start && state.filters.end
    ? `${state.filters.start}〜${state.filters.end}`
    : '-';
  els.selectedSummary.textContent = `${state.filters.players.length} / ${MAX_SELECTED_PLAYERS}`;
  els.minutesSummary.textContent = `${numberFmt.format(state.filters.minMinutes || 0)}分超`;
}

function updateMinuteSliderMax() {
  const allRows = aggregatePlayers(filteredActionStats());
  const maxMinutes = Math.max(0, ...allRows.map((r) => r.playing_minutes || 0));
  els.minMinutesSlider.max = String(Math.ceil(maxMinutes));
  if (state.filters.minMinutes > maxMinutes) state.filters.minMinutes = 0;
  els.minMinutesSlider.value = String(state.filters.minMinutes);
  els.minMinutesValue.textContent = `${numberFmt.format(state.filters.minMinutes)}分超`;
}

function applyPreset(preset) {
  const rows = state.data.matches.filter((m) => state.filters.team === 'all'
    || m.home_team_id === state.filters.team
    || m.away_team_id === state.filters.team);
  const dates = [...new Set(rows.map((m) => m.date))].sort();
  if (!dates.length) return;
  if (preset === 'all') {
    state.filters.start = dates[0];
    state.filters.end = dates.at(-1);
  } else if (preset === 'latest-30-days') {
    const end = new Date(`${dates.at(-1)}T00:00:00`);
    const start = new Date(end);
    start.setDate(start.getDate() - 29);
    state.filters.start = start.toISOString().slice(0, 10);
    state.filters.end = dates.at(-1);
  } else if (preset === 'latest-1-matchday') {
    const selected = dates.slice(-1);
    state.filters.start = selected[0];
    state.filters.end = selected.at(-1);
  } else if (preset === 'latest-5-matchdays') {
    const selected = dates.slice(-5);
    state.filters.start = selected[0];
    state.filters.end = selected.at(-1);
  } else if (preset === 'latest-10-matchdays') {
    const selected = dates.slice(-10);
    state.filters.start = selected[0];
    state.filters.end = selected.at(-1);
  }
  els.startDateInput.value = state.filters.start;
  els.endDateInput.value = state.filters.end;
}

function addSelectedPlayer() {
  const playerId = els.playerSelect.value;
  if (!playerId) return;
  if (state.filters.players.includes(playerId)) return;
  if (state.filters.players.length >= MAX_SELECTED_PLAYERS) {
    alert(`比較できる選手は最大${MAX_SELECTED_PLAYERS}名までです。`);
    return;
  }
  state.filters.players.push(playerId);
  render();
  updateUrl(false);
}

function removeSelectedPlayer(playerId) {
  state.filters.players = state.filters.players.filter((id) => id !== playerId);
  render();
  updateUrl(false);
}

function resetFilters() {
  const comp = selectedCompetition();
  state.filters.team = 'all';
  state.filters.position = 'all';
  state.filters.playerSearch = '';
  state.filters.minMinutes = 0;
  const seasons = comp?.seasons || [];
  if (seasons.length) state.filters.season = seasons.at(-1).season_id;
  state.filters.start = '';
  state.filters.end = '';
  state.filters.players = [];
  state.loadedKey = null;
}

async function render() {
  await loadSelectedData();
  els.competitionSelect.value = state.filters.competition;
  els.seasonSelect.value = state.filters.season;
  els.teamSelect.value = state.filters.team;
  els.positionSelect.value = state.filters.position;
  els.startDateInput.value = state.filters.start;
  els.endDateInput.value = state.filters.end;
  els.playerSearchInput.value = state.filters.playerSearch;
  updateMinuteSliderMax();
  refreshCandidates();
  renderSelectedChips();
  renderComparisonTable();
  updateSummaries();
}

function exportCsv() {
  const rows = selectedRows();
  if (!rows.length) return;
  const headers = [
    'player_name','team_name','playing_minutes','samurai_stats','carry_attempt_per80','carry_dominance_pct',
    'carry_metres_per80','post_contact_metres_per80','tackle_attempt_per80','tackle_made_per80',
    'tackle_dominance_pct','ruck_ooa_attack_attempt_per80','ruck_ooa_attack_effectiveness_pct'
  ];
  const csvRows = [headers.join(',')].concat(rows.map((row) => headers.map((key) => {
    const value = row[key] ?? '';
    return `"${String(value).replaceAll('"', '""')}"`;
  }).join(',')));
  const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `stats-comparison-${state.filters.competition}-${state.filters.season}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

async function copyCurrentLink() {
  updateUrl(false);
  await navigator.clipboard.writeText(window.location.href);
  els.copyCompareLinkButton.textContent = 'コピーしました';
  setTimeout(() => { els.copyCompareLinkButton.textContent = '現在の条件をコピー'; }, 1200);
}

function attachEvents() {
  els.competitionSelect.addEventListener('change', async () => {
    state.filters.competition = els.competitionSelect.value;
    state.filters.season = null;
    state.filters.players = [];
    state.loadedKey = null;
    populateSeasonSelect();
    await render();
    updateUrl(false);
  });
  els.seasonSelect.addEventListener('change', async () => {
    state.filters.season = els.seasonSelect.value;
    state.filters.players = [];
    state.filters.start = '';
    state.filters.end = '';
    state.loadedKey = null;
    await render();
    updateUrl(false);
  });
  els.teamSelect.addEventListener('change', () => {
    state.filters.team = els.teamSelect.value;
    render();
    updateUrl(false);
  });
  els.positionSelect.addEventListener('change', () => {
    state.filters.position = els.positionSelect.value;
    render();
    updateUrl(false);
  });
  els.startDateInput.addEventListener('change', () => {
    state.filters.start = els.startDateInput.value;
    render();
    updateUrl(false);
  });
  els.endDateInput.addEventListener('change', () => {
    state.filters.end = els.endDateInput.value;
    render();
    updateUrl(false);
  });
  els.minMinutesSlider.addEventListener('input', () => {
    state.filters.minMinutes = Number(els.minMinutesSlider.value || 0);
    els.minMinutesValue.textContent = `${numberFmt.format(state.filters.minMinutes)}分超`;
    refreshCandidates();
    renderSelectedChips();
    renderComparisonTable();
    updateSummaries();
  });
  els.minMinutesSlider.addEventListener('change', () => updateUrl(false));
  els.playerSearchInput.addEventListener('input', () => {
    state.filters.playerSearch = els.playerSearchInput.value;
    refreshCandidates();
    updateUrl();
  });
  els.addPlayerButton.addEventListener('click', addSelectedPlayer);
  els.playerSelect.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addSelectedPlayer();
  });
  els.clearPlayersButton.addEventListener('click', () => {
    state.filters.players = [];
    render();
    updateUrl(false);
  });
  els.selectedPlayers.addEventListener('click', (e) => {
    const button = e.target.closest('[data-remove-player]');
    if (button) removeSelectedPlayer(button.dataset.removePlayer);
  });
  document.querySelectorAll('[data-preset]').forEach((button) => {
    button.addEventListener('click', () => {
      applyPreset(button.dataset.preset);
      render();
      updateUrl(false);
    });
  });
  els.resetButton.addEventListener('click', async () => {
    resetFilters();
    populateSeasonSelect();
    await render();
    updateUrl(false);
  });
  els.copyCompareLinkButton.addEventListener('click', copyCurrentLink);
  els.exportCompareCsvButton.addEventListener('click', exportCsv);
}

async function init() {
  try {
    readFiltersFromUrl();
    state.manifest = await fetchJson('./data/manifest.json');
    populateCompetitionSelect();
    attachEvents();
    await render();
    updateUrl();
  } catch (error) {
    console.error(error);
    els.compareStatusText.textContent = `読み込みに失敗しました: ${error.message}`;
  }
}

init();
