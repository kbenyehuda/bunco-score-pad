"use strict";

/* ============================================================
 * SCORING RULES — tweak these, nothing else, to change how the
 * game is scored.
 * ============================================================ */
const RULES = {
  DEFAULT_TABLES: 2,
  DEFAULT_PLAYERS_PER_TABLE: 4,
  DEFAULT_ROUNDS: 6,

  POINTS_PER_BUZZ: 1,          // each individual die matching the round's target number
  BUNCO_MATCHES_NEEDED: 3,     // three-of-a-kind of the round's target number...
  BUNCO_POINTS: 21,            // ...is worth this many points...
  BUNCO_ENDS_ROUND_EARLY: true,// ...and ends that table's round early.

  WIPEOUT_DICE_VALUE: 1,       // three of THIS number (when it isn't the round's target)...
  WIPEOUT_POINTS: -21,         // ...is a "Wipeout", worth this many (negative) points.
};

/* ============================================================
 * MONETIZATION — fill in the real Stripe Payment Link before
 * launch. This is honor-system; there is no server-side check.
 * ============================================================ */
const MONETIZATION = {
  STRIPE_PAYMENT_LINK: "https://buy.stripe.com/6oU6oJ9hZbxb11Efdv4wM00",
  UNLOCK_CODE: "BUNCOVIP",       // simple fallback unlock code, case-insensitive
  PRICE_DISPLAY: "$1.99",
};

/* ============================================================
 * STORAGE
 * ============================================================ */
const STORAGE_KEY = "buncoScorePad_v1";
const UNLOCK_KEY = "buncoScorePad_unlocked";
const BANNER_DISMISSED_KEY = "buncoScorePad_bannerDismissed";

let state = null;

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    console.error("Failed to load saved game", e);
    return null;
  }
}

function saveState() {
  if (!state) return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function clearState() {
  localStorage.removeItem(STORAGE_KEY);
  state = null;
}

function isUnlocked() {
  return localStorage.getItem(UNLOCK_KEY) === "1";
}

function setUnlocked() {
  localStorage.setItem(UNLOCK_KEY, "1");
  updateMonetizationUI();
  showToast();
}

function isBannerDismissed() {
  return localStorage.getItem(BANNER_DISMISSED_KEY) === "1";
}

/* ============================================================
 * DOM helpers
 * ============================================================ */
const $ = (id) => document.getElementById(id);

const screens = {
  setup: $("screen-setup"),
  round: $("screen-round"),
  final: $("screen-final"),
};

function showScreen(name) {
  Object.entries(screens).forEach(([key, el]) => {
    el.hidden = key !== name;
  });
}

/* ============================================================
 * SCORING
 * ============================================================ */
function calcSeatResult(matches, wipeout, roundTarget) {
  const wipeoutApplicable = roundTarget !== RULES.WIPEOUT_DICE_VALUE;
  if (wipeout && wipeoutApplicable) {
    return { points: RULES.WIPEOUT_POINTS, label: "Wipeout" };
  }
  if (matches >= RULES.BUNCO_MATCHES_NEEDED) {
    return { points: RULES.BUNCO_POINTS, label: "Bunco!" };
  }
  return { points: matches * RULES.POINTS_PER_BUZZ, label: null };
}

function roundTargetFor(roundIndex) {
  // Standard Bunco: round 1 targets 1s, round 2 targets 2s, etc.
  return (roundIndex % 6) + 1;
}

function playerName(playerId) {
  const p = state.roster.find((r) => r.id === playerId);
  return p ? p.name : "?";
}

/** Sums every entered round so far into a map of playerId -> totals. */
function computeTotals() {
  const totals = {};
  state.roster.forEach((p) => {
    totals[p.id] = { playerId: p.id, name: p.name, score: 0, buncos: 0, wipeouts: 0 };
  });

  state.entries.forEach((roundEntries, roundIndex) => {
    const target = roundTargetFor(roundIndex);
    roundEntries.forEach((tableEntries, tableIndex) => {
      tableEntries.forEach((entry, seatIndex) => {
        const playerId = state.seating[roundIndex][tableIndex][seatIndex];
        if (!playerId || !totals[playerId]) return;
        const result = calcSeatResult(entry.matches, entry.wipeout, target);
        totals[playerId].score += result.points;
        if (result.label === "Bunco!") totals[playerId].buncos += 1;
        if (result.label === "Wipeout") totals[playerId].wipeouts += 1;
      });
    });
  });

  return Object.values(totals);
}

/* ============================================================
 * SETUP SCREEN
 * ============================================================ */
function buildRosterInputs() {
  const tables = parseInt($("numTables").value, 10) || RULES.DEFAULT_TABLES;
  const playersPerTable = parseInt($("playersPerTable").value, 10) || RULES.DEFAULT_PLAYERS_PER_TABLE;

  const container = $("rosterTables");
  container.innerHTML = "";

  for (let t = 0; t < tables; t++) {
    const group = document.createElement("div");
    group.className = "roster-table-group";
    const heading = document.createElement("h3");
    heading.textContent = `Table ${t + 1}`;
    group.appendChild(heading);

    for (let s = 0; s < playersPerTable; s++) {
      const index = t * playersPerTable + s;
      const label = document.createElement("label");
      label.textContent = `Player ${index + 1}`;
      const input = document.createElement("input");
      input.type = "text";
      input.id = `rosterName_${index}`;
      input.value = `Player ${index + 1}`;
      input.autocomplete = "off";
      label.appendChild(input);
      group.appendChild(label);
    }
    container.appendChild(group);
  }

  $("setupSection").hidden = true;
  $("rosterSection").hidden = false;
}

function startNewGame() {
  const tables = parseInt($("numTables").value, 10) || RULES.DEFAULT_TABLES;
  const playersPerTable = parseInt($("playersPerTable").value, 10) || RULES.DEFAULT_PLAYERS_PER_TABLE;
  const rounds = parseInt($("numRounds").value, 10) || RULES.DEFAULT_ROUNDS;

  const roster = [];
  for (let t = 0; t < tables; t++) {
    for (let s = 0; s < playersPerTable; s++) {
      const index = t * playersPerTable + s;
      const nameInput = $(`rosterName_${index}`);
      const name = (nameInput && nameInput.value.trim()) || `Player ${index + 1}`;
      roster.push({ id: `p${index}`, name });
    }
  }

  const seatingRound0 = [];
  for (let t = 0; t < tables; t++) {
    const seats = [];
    for (let s = 0; s < playersPerTable; s++) {
      seats.push(roster[t * playersPerTable + s].id);
    }
    seatingRound0.push(seats);
  }

  const entriesRound0 = seatingRound0.map((seats) => seats.map(() => ({ matches: 0, wipeout: false })));

  state = {
    config: { tables, playersPerTable, rounds },
    roster,
    seating: [seatingRound0],
    entries: [entriesRound0],
    currentRound: 0,
    gameStarted: true,
    gameFinished: false,
  };

  saveState();
  showScreen("round");
  renderRound();
}

/* ============================================================
 * ROUND SCREEN
 * ============================================================ */
function ensureRoundInitialized(roundIndex) {
  if (state.entries[roundIndex]) return;
  const prevSeating = state.seating[roundIndex - 1];
  const seats = prevSeating.map((tableSeats) => tableSeats.slice());
  state.seating[roundIndex] = seats;
  state.entries[roundIndex] = seats.map((tableSeats) => tableSeats.map(() => ({ matches: 0, wipeout: false })));
}

function renderRound() {
  const { currentRound, config } = state;
  const target = roundTargetFor(currentRound);
  const wipeoutApplicable = target !== RULES.WIPEOUT_DICE_VALUE;

  $("roundTitle").textContent = `Round ${currentRound + 1} of ${config.rounds} — Target: ${target}`;
  $("roundTargetHint").textContent = wipeoutApplicable
    ? `Three ${target}'s = Bunco (+${RULES.BUNCO_POINTS}). Three ${RULES.WIPEOUT_DICE_VALUE}'s = Wipeout (${RULES.WIPEOUT_POINTS}).`
    : `Three ${target}'s = Bunco (+${RULES.BUNCO_POINTS}).`;

  $("prevRoundBtn").disabled = currentRound === 0;
  $("nextRoundNavBtn").disabled = !(currentRound + 1 < state.entries.length);

  const isLastRound = currentRound === config.rounds - 1;
  $("advanceBtn").textContent = isLastRound ? "Finish Game 🏁" : "Next Round →";

  const container = $("tablesContainer");
  container.innerHTML = "";

  state.seating[currentRound].forEach((tableSeats, tableIndex) => {
    const card = document.createElement("div");
    card.className = "table-card";
    const heading = document.createElement("h3");
    heading.textContent = `Table ${tableIndex + 1}`;
    card.appendChild(heading);

    tableSeats.forEach((playerId, seatIndex) => {
      card.appendChild(renderSeatRow(tableIndex, seatIndex, playerId, target, wipeoutApplicable));
    });

    container.appendChild(card);
  });

  renderLeaderboard();
}

function renderSeatRow(tableIndex, seatIndex, playerId, target, wipeoutApplicable) {
  const entry = state.entries[state.currentRound][tableIndex][seatIndex];

  const row = document.createElement("div");
  row.className = "seat-row";

  const select = document.createElement("select");
  select.className = "seat-player-select";
  state.roster.forEach((p) => {
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = p.name;
    if (p.id === playerId) opt.selected = true;
    select.appendChild(opt);
  });
  select.addEventListener("change", () => {
    state.seating[state.currentRound][tableIndex][seatIndex] = select.value;
    saveState();
    renderLeaderboard();
  });
  row.appendChild(select);

  const stepper = document.createElement("div");
  stepper.className = "matches-stepper";
  const minusBtn = document.createElement("button");
  minusBtn.type = "button";
  minusBtn.className = "step-btn";
  minusBtn.textContent = "−";
  minusBtn.setAttribute("aria-label", "Decrease matches");
  const valueSpan = document.createElement("span");
  valueSpan.className = "matches-value";
  const plusBtn = document.createElement("button");
  plusBtn.type = "button";
  plusBtn.className = "step-btn";
  plusBtn.textContent = "+";
  plusBtn.setAttribute("aria-label", "Increase matches");

  const badge = document.createElement("span");
  badge.className = "seat-score-badge";

  const wipeoutLabel = document.createElement("label");
  wipeoutLabel.className = "wipeout-toggle";
  const wipeoutCheckbox = document.createElement("input");
  wipeoutCheckbox.type = "checkbox";
  wipeoutCheckbox.checked = !!entry.wipeout;
  wipeoutLabel.appendChild(wipeoutCheckbox);
  wipeoutLabel.appendChild(document.createTextNode(`Wipeout (three ${RULES.WIPEOUT_DICE_VALUE}'s)`));
  wipeoutLabel.hidden = !wipeoutApplicable;

  function refreshBadge() {
    const result = calcSeatResult(entry.matches, entry.wipeout, target);
    valueSpan.textContent = String(entry.matches);
    badge.classList.remove("is-bunco", "is-wipeout");
    if (result.label === "Bunco!") {
      badge.textContent = `Bunco! +${result.points}`;
      badge.classList.add("is-bunco");
    } else if (result.label === "Wipeout") {
      badge.textContent = `Wipeout ${result.points}`;
      badge.classList.add("is-wipeout");
    } else {
      badge.textContent = `${result.points} pt${result.points === 1 ? "" : "s"}`;
    }
  }

  minusBtn.addEventListener("click", () => {
    entry.matches = Math.max(0, entry.matches - 1);
    refreshBadge();
    saveState();
    renderLeaderboard();
  });
  plusBtn.addEventListener("click", () => {
    entry.matches = Math.min(RULES.BUNCO_MATCHES_NEEDED, entry.matches + 1);
    refreshBadge();
    saveState();
    renderLeaderboard();
  });
  wipeoutCheckbox.addEventListener("change", () => {
    entry.wipeout = wipeoutCheckbox.checked;
    refreshBadge();
    saveState();
    renderLeaderboard();
  });

  stepper.appendChild(minusBtn);
  stepper.appendChild(valueSpan);
  stepper.appendChild(plusBtn);

  row.appendChild(stepper);
  row.appendChild(badge);
  row.appendChild(wipeoutLabel);

  refreshBadge();
  return row;
}

function renderLeaderboard() {
  const totals = computeTotals().sort((a, b) => b.score - a.score);
  const list = $("leaderboardList");
  list.innerHTML = "";
  totals.forEach((t, i) => {
    const li = document.createElement("li");
    const rank = document.createElement("span");
    rank.className = "leaderboard-rank";
    rank.textContent = `${i + 1}.`;
    const name = document.createElement("span");
    name.className = "leaderboard-name";
    name.textContent = t.name;
    const score = document.createElement("span");
    score.className = "leaderboard-score";
    score.textContent = t.score;
    li.appendChild(rank);
    li.appendChild(name);
    li.appendChild(score);
    list.appendChild(li);
  });
}

function goToPrevRound() {
  if (state.currentRound === 0) return;
  state.currentRound -= 1;
  saveState();
  renderRound();
}

function goToNextRoundNav() {
  if (!(state.currentRound + 1 < state.entries.length)) return;
  state.currentRound += 1;
  saveState();
  renderRound();
}

function advanceRound() {
  const isLastRound = state.currentRound === state.config.rounds - 1;
  if (isLastRound) {
    finishGame();
    return;
  }
  state.currentRound += 1;
  ensureRoundInitialized(state.currentRound);
  saveState();
  renderRound();
}

/* ============================================================
 * FINAL SCREEN
 * ============================================================ */
function finishGame() {
  state.gameFinished = true;
  saveState();
  showScreen("final");
  renderFinal();
}

function renderFinal() {
  const totals = computeTotals().sort((a, b) => b.score - a.score);
  const topScore = totals[0] ? totals[0].score : 0;
  const winners = totals.filter((t) => t.score === topScore);

  const standingsEl = $("finalStandings");
  standingsEl.innerHTML = "<h3>Standings</h3>";
  const list = document.createElement("ol");
  list.className = "standings-list";
  totals.forEach((t) => {
    const li = document.createElement("li");
    const isWinner = t.score === topScore;
    if (isWinner) li.classList.add("is-winner");
    li.innerHTML = `<span>${isWinner ? "👑 " : ""}${escapeHtml(t.name)}</span><span>${t.score}</span>`;
    list.appendChild(li);
  });
  standingsEl.appendChild(list);

  const maxBuncos = Math.max(0, ...totals.map((t) => t.buncos));
  const maxWipeouts = Math.max(0, ...totals.map((t) => t.wipeouts));
  const buncoLeaders = maxBuncos > 0 ? totals.filter((t) => t.buncos === maxBuncos) : [];
  const wipeoutLeaders = maxWipeouts > 0 ? totals.filter((t) => t.wipeouts === maxWipeouts) : [];

  const statsEl = $("finalStats");
  statsEl.innerHTML = "<h3>Awards</h3>";
  statsEl.appendChild(statLine("🏆 Winner", winners.map((w) => w.name).join(" & ")));
  statsEl.appendChild(
    statLine("🎲 Most Buncos", buncoLeaders.length ? `${buncoLeaders.map((w) => w.name).join(" & ")} (${maxBuncos})` : "—")
  );
  statsEl.appendChild(
    statLine("💥 Most Wipeouts", wipeoutLeaders.length ? `${wipeoutLeaders.map((w) => w.name).join(" & ")} (${maxWipeouts})` : "—")
  );

  $("printSummaryBtn").disabled = !isUnlocked();
  $("printLockedNote").hidden = isUnlocked();
}

function statLine(label, value) {
  const div = document.createElement("div");
  div.className = "stat-line";
  div.innerHTML = `<span>${label}</span><strong>${escapeHtml(value)}</strong>`;
  return div;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str == null ? "" : String(str);
  return div.innerHTML;
}

function printSummary() {
  if (!isUnlocked()) return;
  const totals = computeTotals().sort((a, b) => b.score - a.score);
  const topScore = totals[0] ? totals[0].score : 0;
  const winners = totals.filter((t) => t.score === topScore);
  const maxBuncos = Math.max(0, ...totals.map((t) => t.buncos));
  const maxWipeouts = Math.max(0, ...totals.map((t) => t.wipeouts));
  const buncoLeaders = totals.filter((t) => t.buncos === maxBuncos && maxBuncos > 0);
  const wipeoutLeaders = totals.filter((t) => t.wipeouts === maxWipeouts && maxWipeouts > 0);

  const rows = totals
    .map((t) => `<tr><td>${escapeHtml(t.name)}</td><td>${t.score}</td><td>${t.buncos}</td><td>${t.wipeouts}</td></tr>`)
    .join("");

  $("printArea").innerHTML = `
    <h1>🎲 Bunco Score Pad — Final Summary</h1>
    <p>${new Date().toLocaleString()}</p>
    <table>
      <thead><tr><th>Player</th><th>Score</th><th>Buncos</th><th>Wipeouts</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <h2>Winner: ${escapeHtml(winners.map((w) => w.name).join(" & "))}</h2>
    <p>Most Buncos: ${buncoLeaders.length ? escapeHtml(buncoLeaders.map((w) => w.name).join(" & ")) + ` (${maxBuncos})` : "—"}</p>
    <p>Most Wipeouts: ${wipeoutLeaders.length ? escapeHtml(wipeoutLeaders.map((w) => w.name).join(" & ")) + ` (${maxWipeouts})` : "—"}</p>
  `;
  window.print();
}

/* ============================================================
 * MONETIZATION UI
 * ============================================================ */
function updateMonetizationUI() {
  const unlocked = isUnlocked();
  $("supportBanner").hidden = unlocked || isBannerDismissed();
  $("codeEntry").hidden = true;
  $("unlockHeaderBtn").hidden = unlocked || !isBannerDismissed();
  $("bannerPayLink").href = MONETIZATION.STRIPE_PAYMENT_LINK;
  $("bannerPrice").textContent = MONETIZATION.PRICE_DISPLAY;

  if (!screens.final.hidden) {
    $("printSummaryBtn").disabled = !unlocked;
    $("printLockedNote").hidden = unlocked;
  }
}

function showToast() {
  const toast = $("unlockedToast");
  toast.hidden = false;
  setTimeout(() => {
    toast.hidden = true;
  }, 3500);
}

function checkUrlForStripeReturn() {
  const params = new URLSearchParams(window.location.search);
  if (params.has("unlocked") || params.has("session_id")) {
    setUnlocked();
    params.delete("unlocked");
    params.delete("session_id");
    const newQuery = params.toString();
    const newUrl = window.location.pathname + (newQuery ? `?${newQuery}` : "") + window.location.hash;
    window.history.replaceState({}, "", newUrl);
  }
}

/* ============================================================
 * EVENT WIRING
 * ============================================================ */
function wireEvents() {
  $("generateRosterBtn").addEventListener("click", buildRosterInputs);
  $("backToSetupBtn").addEventListener("click", () => {
    $("rosterSection").hidden = true;
    $("setupSection").hidden = false;
  });
  $("startGameBtn").addEventListener("click", startNewGame);

  $("resumeGameBtn").addEventListener("click", () => {
    showScreen(state.gameFinished ? "final" : "round");
    if (state.gameFinished) renderFinal();
    else renderRound();
  });
  $("newGameInsteadBtn").addEventListener("click", () => {
    if (!confirm("Discard the game in progress and start a new one?")) return;
    clearState();
    $("resumeSection").hidden = true;
    $("setupSection").hidden = false;
    showScreen("setup");
  });

  $("prevRoundBtn").addEventListener("click", goToPrevRound);
  $("nextRoundNavBtn").addEventListener("click", goToNextRoundNav);
  $("advanceBtn").addEventListener("click", advanceRound);

  $("toggleLeaderboardBtn").addEventListener("click", () => {
    const panel = $("leaderboardPanel");
    panel.hidden = !panel.hidden;
    $("toggleLeaderboardBtn").textContent = panel.hidden ? "📊 Show Leaderboard" : "📊 Hide Leaderboard";
    if (!panel.hidden) renderLeaderboard();
  });

  $("resetGameBtn").addEventListener("click", () => {
    if (!confirm("End this game and clear all scores?")) return;
    clearState();
    showScreen("setup");
    $("setupSection").hidden = false;
    $("rosterSection").hidden = true;
    $("resumeSection").hidden = true;
  });

  $("newGameFromFinalBtn").addEventListener("click", () => {
    if (!confirm("Start a new game? This clears the current results.")) return;
    clearState();
    showScreen("setup");
    $("setupSection").hidden = false;
    $("rosterSection").hidden = true;
    $("resumeSection").hidden = true;
  });

  $("printSummaryBtn").addEventListener("click", printSummary);

  // Monetization
  $("bannerDismiss").addEventListener("click", () => {
    localStorage.setItem(BANNER_DISMISSED_KEY, "1");
    updateMonetizationUI();
  });
  $("bannerCodeBtn").addEventListener("click", () => {
    $("supportBanner").hidden = true;
    $("codeEntry").hidden = false;
  });
  $("codeEntryCancel").addEventListener("click", () => {
    $("codeEntry").hidden = true;
    updateMonetizationUI();
  });
  $("unlockHeaderBtn").addEventListener("click", () => {
    $("supportBanner").hidden = false;
    $("codeEntry").hidden = true;
  });
  $("unlockCodeSubmit").addEventListener("click", () => {
    const input = $("unlockCodeInput").value.trim().toUpperCase();
    if (input && input === MONETIZATION.UNLOCK_CODE.toUpperCase()) {
      $("unlockCodeError").hidden = true;
      $("unlockCodeInput").value = "";
      $("codeEntry").hidden = true;
      setUnlocked();
    } else {
      $("unlockCodeError").hidden = false;
    }
  });
}

/* ============================================================
 * INIT
 * ============================================================ */
function init() {
  wireEvents();
  checkUrlForStripeReturn();
  updateMonetizationUI();

  state = loadState();
  if (state && state.gameStarted) {
    $("resumeSection").hidden = false;
    $("setupSection").hidden = true;
    showScreen("setup"); // resume prompt lives on the setup screen until they choose
  } else {
    showScreen("setup");
  }
}

document.addEventListener("DOMContentLoaded", init);
