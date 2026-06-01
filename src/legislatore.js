/**
 * GOLDBET v1.0 - MODULO 1: IL LEGISLATORE (FINAL PRODUCTION)
 * Funzioni: Gestione Regole, Round Robin Cron, UI OLED Black.
 * Layout: Ultra-Density (32px), Colonna Lv. integrata, Option A Truncation.
 */

export default {
  // --- GESTORE CRON (ROUND ROBIN) ---
  async scheduled(event, env, ctx) {
    ctx.waitUntil(handleRoundRobin(env));
  },

  // --- GESTORE RICHIESTE HTTP ---
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname === "/api/salva") {
      return await handleSave(request, env);
    }

    return await handleRender(env);
  }
};

/**
 * LOGICA ROUND ROBIN: Aggiorna un campionato al minuto
 */
async function handleRoundRobin(env) {
  const ora = new Date();
  const mese = ora.getMonth() + 1;
  const season = (mese >= 7) 
    ? ora.getFullYear().toString().slice(-2) + (ora.getFullYear() + 1).toString().slice(-2)
    : (ora.getFullYear() - 1).toString().slice(-2) + ora.getFullYear().toString().slice(-2);

  const lega = await env.DB.prepare(`
    SELECT r.div FROM regole_leghe r
    INNER JOIN leagues l ON r.div = l.id
    WHERE l.is_active = 1
    ORDER BY r.ultimo_controllo ASC LIMIT 1
  `).first();

  if (!lega) return;

  const code = lega.div;
  const isExtra = ["ARG","AUT","BRA","CHN","DNK","FIN","IRL","JPN","MEX","NOR","POL","ROU","RUS","SWE","SWZ","USA"].includes(code);
  const fileUrl = isExtra 
    ? `https://www.football-data.co.uk/new/${code}.csv`
    : `https://www.football-data.co.uk/mmz4281/${season}/${code}.csv`;

  try {
    const response = await fetch(fileUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!response.ok) throw new Error("Offline");

    const text = await response.text();
    const rows = text.trim().split('\n');
    const lastRow = rows[rows.length - 1].split(',');

    let infoMatch, infoData;
    if (isExtra) {
      infoData = lastRow[3];
      infoMatch = `${lastRow[5]} vs ${lastRow[6]}`;
    } else {
      infoData = lastRow[1];
      infoMatch = `${lastRow[3]} vs ${lastRow[4]}`;
    }

    await env.DB.prepare(`
      UPDATE regole_leghe 
      SET info_match = ?, info_data = ?, ultimo_controllo = ? 
      WHERE div = ?
    `).bind(infoMatch, infoData, Date.now(), code).run();

  } catch (e) {
    await env.DB.prepare(`UPDATE regole_leghe SET ultimo_controllo = ? WHERE div = ?`)
      .bind(Date.now(), code).run();
  }
}

/**
 * LOGICA SALVATAGGIO
 */
async function handleSave(request, env) {
  try {
    const body = await request.json();
    const statements = body.map(row => {
      return env.DB.prepare(`
        UPDATE regole_leghe SET 
          bandiera = ?, num_squadre = ?, giornate_totali = ?, 
          soglia_split = ?, vincitore_playoff = ?, peso_elo = ?, 
          data_regressione = ?, livello = ?, posti_ucl = ?, posti_uel = ?, 
          posti_uecl = ?, posti_promo = ?, posti_retro = ?, 
          playoff = ?, playout = ?
        WHERE div = ?
      `).bind(
        row.bandiera, parseInt(row.num_squadre), parseInt(row.giornate_totali), 
        parseInt(row.soglia_split), parseInt(row.vincitore_playoff),
        parseFloat(row.peso_elo), row.data_regressione, parseInt(row.livello),
        parseInt(row.posti_ucl), parseInt(row.posti_uel), 
        parseInt(row.posti_uecl), parseInt(row.posti_promo), 
        parseInt(row.posti_retro), parseInt(row.playoff), 
        parseInt(row.playout), row.div
      );
    });
    await env.DB.batch(statements);
    return new Response(JSON.stringify({ status: "success" }), { headers: { "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ status: "error", message: err.message }), { status: 500 });
  }
}

/**
 * LOGICA RENDER HTML
 */
async function handleRender(env) {
  const query = `
    SELECT r.* FROM regole_leghe r
    INNER JOIN leagues l ON r.div = l.id
    WHERE l.is_active = 1
    ORDER BY r.div ASC
  `;
  const { results } = await env.DB.prepare(query).all();

  const html = `
  <!DOCTYPE html>
  <html lang="it">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>GOLDBET | Legislatore</title>
    <link href="https://fonts.googleapis.com/css2?family=Montserrat:ital,wght@0,800;1,800&display=swap" rel="stylesheet">
    <style>
      :root {
        --bg: #000; --surface: #0a0a0a; --cyan: #00E5FF; --gold: #ffd700;
        --orange: #ff8c00; --green: #39ff14; --red: #ff003c; --purple: #bc13fe; --text: #fff;
      }
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { background: var(--bg); color: var(--text); font-family: 'Segoe UI', sans-serif; padding-bottom: 80px; overflow-x: hidden; }
      
      .header-container { background: #000; padding: 15px 10px; text-align: center; display: flex; flex-direction: column; align-items: center; border-bottom: 1px solid #111; }
      .logo { font-family: 'Montserrat', sans-serif; font-weight: 800; font-size: 18px; letter-spacing: -1px; display: flex; align-items: center; gap: 8px; }
      .gold { color: white; font-style: italic; }
      .dl { color: var(--cyan); font-style: normal; }
      .status-dot { width: 8px; height: 8px; background: var(--cyan); border-radius: 50%; box-shadow: 0 0 8px var(--cyan); animation: pulse 2s infinite; }
      @keyframes pulse { 0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(0, 229, 255, 0.7); } 70% { transform: scale(1); box-shadow: 0 0 0 8px rgba(0, 229, 255, 0); } 100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(0, 229, 255, 0); } }

      .top-bar { background: var(--surface); padding: 6px; display: flex; gap: 4px; overflow-x: auto; position: sticky; top: 0; z-index: 90; border-bottom: 1px solid #222; }
      .btn-tab { background: #1a1a1a; color: #555; border: none; padding: 6px 12px; border-radius: 15px; font-size: 0.6rem; font-weight: 800; white-space: nowrap; }
      .btn-tab.active { background: var(--cyan); color: #000; }
      .filter-bar { padding: 6px; display: flex; gap: 6px; justify-content: center; }
      .filter-btn { background: transparent; border: 1px solid #222; color: #444; padding: 4px 10px; border-radius: 12px; font-size: 0.6rem; font-weight: bold; }
      .filter-btn.active { border-color: var(--gold); color: var(--gold); }

      .table-container { width: 100%; overflow-x: auto; }
      table { width: 100%; border-collapse: collapse; font-size: 0.7rem; table-layout: fixed; }
      th, td { padding: 2px 4px; text-align: center; border-bottom: 1px solid #111; height: 32px; overflow: hidden; }
      
      th:first-child, td:first-child { position: sticky; left: 0; background: var(--surface); z-index: 100; border-right: 1px solid #222; width: 75px !important; }
      .sticky-content { display: flex; align-items: center; justify-content: center; gap: 4px; }
      .div-label { font-weight: 900; color: var(--gold); font-size: 0.7rem; }
      .flag-input { width: 20px; background: transparent; border: none; text-align: center; font-size: 0.9rem; color: #fff; }

      input { background: transparent; border: none; color: #fff; text-align: center; font-size: 0.75rem; font-weight: bold; outline: none; width: 100%; }
      input:disabled { color: #444; }

      .col-struct, .col-params, .col-goals { display: none; }
      [data-view="struct"] .col-struct { display: table-cell; }
      [data-view="params"] .col-params { display: table-cell; }
      [data-view="goals"] .col-goals { display: table-cell; }

      /* Params View: Ultra-Density with Lv. */
      .params-cell-wrapper { display: flex; align-items: center; justify-content: center; gap: 4px; width: 100%; }
      .peso-input { width: 30px !important; }
      .reset-input { width: 40px !important; }
      .lv-input { width: 20px !important; color: var(--gold) !important; }
      .info-match-line { 
        flex: 1; font-size: 0.6rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-align: left; 
      }
      .date-cyan { color: var(--cyan); font-weight: 800; margin-right: 3px; }
      .match-white { color: #fff; font-weight: 400; }

      /* Struct & Goals View: Ultra-Narrow */
      .col-struct { width: 45px; }
      .col-goals { width: 40px; }
      .col-goals input, .col-struct input { font-size: 0.7rem; }

      .ucl { color: var(--gold); } .uel { color: var(--orange); } .uecl { color: var(--green); }
      .promo { color: var(--cyan); } .retro { color: var(--red); } .play { color: var(--purple); }

      .fab-container { position: fixed; bottom: 15px; right: 15px; display: flex; flex-direction: column; gap: 10px; z-index: 1000; }
      .btn-fab { width: 45px; height: 45px; border-radius: 50%; border: none; display: flex; align-items: center; justify-content: center; font-size: 1rem; box-shadow: 0 4px 12px rgba(0,0,0,0.8); }
      .btn-lock { background: #111; color: var(--gold); border: 1px solid var(--gold); }
      .btn-lock.unlocked { background: var(--gold); color: #000; transform: scale(1.05); }
      .btn-save { background: var(--cyan); color: #000; font-weight: 900; width: 100px; border-radius: 25px; display: none; font-size: 0.7rem; }

      #toast { position: fixed; top: 10px; left: 50%; transform: translateX(-50%); padding: 8px 16px; border-radius: 20px; font-weight: 800; font-size: 0.65rem; z-index: 2000; opacity: 0; transition: 0.3s; }
    </style>
  </head>
  <body data-view="params">
    <div class="header-container">
      <div class="logo">
        <div><span class="gold">GOLDBET</span><span class="dl">LEGISLATORE</span></div>
        <span class="status-dot"></span>
      </div>
    </div>

    <div class="top-bar">
      <button class="btn-tab active" onclick="setView('params', this)">⚖️ PARAMETRI</button>
      <button class="btn-tab" onclick="setView('struct', this)">⚙️ STRUTTURA</button>
      <button class="btn-tab" onclick="setView('goals', this)">🏆 OBIETTIVI</button>
    </div>

    <div class="filter-bar">
      <button class="filter-btn active" onclick="filterLeagues('all', this)">TUTTI</button>
      <button class="filter-btn" onclick="filterLeagues('main', this)">MAIN</button>
      <button class="filter-btn" onclick="filterLeagues('extra', this)">EXTRA</button>
    </div>

    <div class="table-container">
      <table id="mainTable">
        <thead>
          <tr>
            <th style="width:75px">DIV</th>
            <th class="col-params">PESO | RESET | LV | ULTIMO MATCH</th>
            <th class="col-struct">SQD</th>
            <th class="col-struct">G.TOT</th>
            <th class="col-struct">SPLIT</th>
            <th class="col-struct">FINALE</th>
            <th class="col-goals ucl">UCL</th>
            <th class="col-goals uel">UEL</th>
            <th class="col-goals uecl">UECL</th>
            <th class="col-goals promo">PRO</th>
            <th class="col-goals retro">RET</th>
            <th class="col-goals play">P.OFF</th>
            <th class="col-goals play">P.OUT</th>
          </tr>
        </thead>
        <tbody>
          ${results.map(l => {
            const isMain = ["E0","E1","E2","E3","EC","I1","I2","D1","D2","SP1","SP2","F1","F2","N1","P1","T1","G1","SC0"].includes(l.div);
            const dataUI = l.data_regressione ? l.data_regressione.split('-').reverse().join('/') : "";
            return `
            <tr data-div="${l.div}" data-type="${isMain ? 'main' : 'extra'}">
              <td>
                <div class="sticky-content">
                  <input type="text" class="flag-input bandiera" value="${l.bandiera || '🏳️'}" disabled>
                  <span class="div-label">${l.div}</span>
                </div>
              </td>
              <td class="col-params">
                <div class="params-cell-wrapper">
                  <input type="number" step="0.1" class="peso-input peso_elo" value="${l.peso_elo}" disabled>
                  <span style="color: #222;">|</span>
                  <input type="text" class="reset-input data_regressione" value="${dataUI}" placeholder="GG/MM" disabled>
                  <span style="color: #222;">|</span>
                  <input type="number" class="lv-input livello" value="${l.livello || 1}" disabled>
                  <span style="color: #222;">|</span>
                  <div class="info-match-line">
                    <span class="date-cyan">${l.info_data || '--/--'}</span>
                    <span class="match-white">${l.info_match || 'In attesa...'}</span>
                  </div>
                </div>
              </td>
              <td class="col-struct"><input type="number" class="num_squadre" value="${l.num_squadre}" disabled></td>
              <td class="col-struct"><input type="number" class="giornate_totali" value="${l.giornate_totali}" disabled></td>
              <td class="col-struct"><input type="number" class="soglia_split" value="${l.soglia_split}" disabled></td>
              <td class="col-struct"><input type="number" class="vincitore_playoff" value="${l.vincitore_playoff}" disabled></td>
              <td class="col-goals"><input type="number" class="ucl posti_ucl" value="${l.posti_ucl}" disabled></td>
              <td class="col-goals"><input type="number" class="uel posti_uel" value="${l.posti_uel}" disabled></td>
              <td class="col-goals"><input type="number" class="uecl posti_uecl" value="${l.posti_uecl}" disabled></td>
              <td class="col-goals"><input type="number" class="promo posti_promo" value="${l.posti_promo}" disabled></td>
              <td class="col-goals"><input type="number" class="retro posti_retro" value="${l.posti_retro}" disabled></td>
              <td class="col-goals"><input type="number" class="play playoff" value="${l.playoff}" disabled></td>
              <td class="col-goals"><input type="number" class="play playout" value="${l.playout}" disabled></td>
            </tr>`;
          }).join("")}
        </tbody>
      </table>
    </div>

    <div class="fab-container">
      <button class="btn-fab btn-lock" id="lockBtn" onclick="toggleLock()">🔒</button>
      <button class="btn-fab btn-save" id="saveBtn" onclick="saveData()">SALVA</button>
    </div>
    <div id="toast"></div>

    <script>
      let isLocked = true;
      function setView(view, btn) {
        document.body.setAttribute('data-view', view);
        document.querySelectorAll('.btn-tab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      }
      function filterLeagues(type, btn) {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        document.querySelectorAll('#mainTable tbody tr').forEach(tr => {
          tr.style.display = (type === 'all' || tr.getAttribute('data-type') === type) ? 'table-row' : 'none';
        });
      }
      function toggleLock() {
        isLocked = !isLocked;
        const btn = document.getElementById('lockBtn');
        const saveBtn = document.getElementById('saveBtn');
        btn.innerText = isLocked ? "🔒" : "🔓";
        btn.classList.toggle('unlocked', !isLocked);
        saveBtn.style.display = isLocked ? 'none' : 'flex';
        document.querySelectorAll('input').forEach(i => i.disabled = isLocked);
        if(!isLocked) showToast("MODALITÀ MODIFICA ATTIVA", "var(--gold)");
      }
      async function saveData() {
        const btn = document.getElementById('saveBtn');
        btn.innerText = "...";
        const rows = document.querySelectorAll('#mainTable tbody tr');
        const data = Array.from(rows).map(tr => {
          let dRaw = tr.querySelector('.data_regressione').value.trim();
          return {
            div: tr.getAttribute('data-div'),
            bandiera: tr.querySelector('.bandiera').value,
            num_squadre: tr.querySelector('.num_squadre').value,
            giornate_totali: tr.querySelector('.giornate_totali').value,
            soglia_split: tr.querySelector('.soglia_split').value,
            vincitore_playoff: tr.querySelector('.vincitore_playoff').value,
            peso_elo: tr.querySelector('.peso_elo').value,
            data_regressione: (dRaw.length === 5) ? dRaw.split('/').reverse().join('-') : dRaw,
            livello: tr.querySelector('.livello').value,
            posti_ucl: tr.querySelector('.posti_ucl').value,
            posti_uel: tr.querySelector('.posti_uel').value,
            posti_uecl: tr.querySelector('.posti_uecl').value,
            posti_promo: tr.querySelector('.posti_promo').value,
            posti_retro: tr.querySelector('.posti_retro').value,
            playoff: tr.querySelector('.playoff').value,
            playout: tr.querySelector('.playout').value
          };
        });
        try {
          const res = await fetch('/api/salva', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
          if(res.ok) { showToast("DATABASE SINCRONIZZATO", "var(--green)"); toggleLock(); }
          else showToast("ERRORE SALVATAGGIO", "var(--red)");
        } catch (e) { showToast("ERRORE DI RETE", "var(--red)"); }
        btn.innerText = "SALVA";
      }
      function showToast(msg, color) {
        const t = document.getElementById('toast');
        t.innerText = msg; t.style.background = color; t.style.color = "#000"; t.style.opacity = 1;
        setTimeout(() => t.style.opacity = 0, 3000);
      }
    </script>
  </body>
  </html>`;
  return new Response(html, { headers: { "Content-Type": "text/html;charset=UTF-8" } });
}