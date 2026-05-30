/**
 * GOLDBET v1.0 - IL LEGISLATORE (Full Production Suite)
 * Funzioni: Gestione Regole, Monitoraggio Live, Round Robin Cron.
 * Ottimizzato per Samsung A53 (OLED Black / Neon Pulse).
 */

export default {
  // --- GESTORE CRON (ROUND ROBIN) ---
  async scheduled(event, env, ctx) {
    ctx.waitUntil(handleRoundRobin(env));
  },

  // --- GESTORE RICHIESTE HTTP (UI & API) ---
  async fetch(request, env) {
    const url = new URL(request.url);

    // API: Salvataggio Regole
    if (request.method === "POST" && url.pathname === "/api/salva") {
      return await handleSave(request, env);
    }

    // UI: Render Dashboard
    return await handleRender(env);
  }
};

/**
 * Logica Round Robin: aggiorna un campionato al minuto
 */
async function handleRoundRobin(env) {
  // 1. Trova il campionato attivo più "vecchio" da controllare
  const league = await env.DB.prepare(`
    SELECT r.div, r.ultimo_controllo 
    FROM regole_leghe r
    INNER JOIN leagues l ON r.div = l.id
    WHERE l.is_active = 1
    ORDER BY r.ultimo_controllo ASC
    LIMIT 1
  `).first();

  if (!league) return;

  const code = league.div;
  const isExtra = ["ARG","AUT","BRA","CHN","DNK","FIN","IRL","JPN","MEX","NOR","POL","ROU","RUS","SWE","SWZ","USA"].includes(code);
  
  // Calcolo stagione
  const ora = new Date();
  const season = (ora.getMonth() + 1 >= 7) 
    ? ora.getFullYear().toString().slice(-2) + (ora.getFullYear() + 1).toString().slice(-2)
    : (ora.getFullYear() - 1).toString().slice(-2) + ora.getFullYear().toString().slice(-2);

  const fileUrl = isExtra 
    ? `https://www.football-data.co.uk/new/${code}.csv`
    : `https://www.football-data.co.uk/mmz4281/${season}/${code}.csv`;

  try {
    const response = await fetch(fileUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!response.ok) throw new Error("Offline");

    const text = await response.text();
    const rows = text.trim().split('\n');
    const lastRow = rows[rows.length - 1].split(',');

    let dataMatch, home, away;
    if (isExtra) {
      dataMatch = lastRow[3]; home = lastRow[5]; away = lastRow[6];
    } else {
      dataMatch = lastRow[1]; home = lastRow[3]; away = lastRow[4];
    }

    const infoMatch = `${home} vs ${away}`;
    const infoData = dataMatch;

    // Aggiorna D1
    await env.DB.prepare(`
      UPDATE regole_leghe 
      SET info_match = ?, info_data = ?, ultimo_controllo = ? 
      WHERE div = ?
    `).bind(infoMatch, infoData, Date.now(), code).run();

  } catch (e) {
    // In caso di errore, aggiorna solo il timestamp per passare al prossimo al minuto successivo
    await env.DB.prepare(`UPDATE regole_leghe SET ultimo_controllo = ? WHERE div = ?`)
      .bind(Date.now(), code).run();
  }
}

/**
 * Salvataggio dati da interfaccia
 */
async function handleSave(request, env) {
  try {
    const body = await request.json();
    const statements = body.map(row => {
      return env.DB.prepare(`
        UPDATE regole_leghe SET 
          bandiera = ?, num_squadre = ?, giornate_totali = ?, 
          soglia_split = ?, vincitore_playoff = ?, peso_elo = ?, 
          data_regressione = ?, posti_ucl = ?, posti_uel = ?, 
          posti_uecl = ?, posti_promo = ?, posti_retro = ?, 
          playoff = ?, playout = ?
        WHERE div = ?
      `).bind(
        row.bandiera, parseInt(row.num_squadre), parseInt(row.giornate_totali), 
        parseInt(row.soglia_split), parseInt(row.vincitore_playoff),
        parseFloat(row.peso_elo), row.data_regressione,
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
 * Renderizzazione Interfaccia HTML
 */
async function handleRender(env) {
  const query = `
    SELECT r.* 
    FROM regole_leghe r
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
        --bg: #000000; --surface: #0a0a0a; --neon-cyan: #00E5FF;
        --neon-gold: #ffd700; --neon-orange: #ff8c00; --neon-green: #39ff14;
        --neon-red: #ff003c; --neon-purple: #bc13fe; --text: #ffffff;
      }
      * { box-sizing: border-box; margin: 0; padding: 0; -webkit-tap-highlight-color: transparent; }
      body { background-color: var(--bg); color: var(--text); font-family: 'Segoe UI', sans-serif; padding-bottom: 100px; overflow-x: hidden; }
      
      /* Header GOLDBET Style */
      .header-container {
        background-color: black; padding: 25px 15px; text-align: center;
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        border-bottom: 1px solid #111;
      }
      .logo {
        font-family: 'Montserrat', sans-serif; font-weight: 800; font-size: 20px;
        letter-spacing: -1px; display: flex; align-items: center; gap: 10px;
      }
      .gold { color: white; font-style: italic; }
      .dl { color: var(--neon-cyan); font-style: normal; }
      .status-dot {
        width: 10px; height: 10px; background-color: var(--neon-cyan);
        border-radius: 50%; box-shadow: 0 0 10px var(--neon-cyan);
        animation: pulse-animation 2s infinite;
      }
      @keyframes pulse-animation {
        0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(0, 229, 255, 0.7); }
        70% { transform: scale(1); box-shadow: 0 0 0 10px rgba(0, 229, 255, 0); }
        100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(0, 229, 255, 0); }
      }

      /* Navigation & Filters */
      .top-bar { 
        background: var(--surface); padding: 10px; display: flex; gap: 8px; 
        overflow-x: auto; border-bottom: 1px solid #222; position: sticky; top: 0; z-index: 90;
      }
      .btn-tab { 
        background: #1a1a1a; color: #666; border: none; padding: 10px 15px; border-radius: 25px; 
        font-size: 0.65rem; font-weight: 800; white-space: nowrap;
      }
      .btn-tab.active { background: var(--neon-cyan); color: #000; }

      .filter-bar { padding: 10px; display: flex; gap: 8px; justify-content: center; }
      .filter-btn { background: transparent; border: 1px solid #222; color: #555; padding: 5px 12px; border-radius: 15px; font-size: 0.65rem; }
      .filter-btn.active { border-color: var(--neon-gold); color: var(--neon-gold); }

      /* Table */
      .table-container { width: 100%; overflow-x: auto; }
      table { width: 100%; border-collapse: collapse; font-size: 0.75rem; }
      th, td { padding: 12px 6px; text-align: center; border-bottom: 1px solid #111; }
      
      /* Sticky Column: Emoji + Sigla (Same Line) */
      th:first-child, td:first-child { 
        position: sticky; left: 0; background: var(--surface); z-index: 100; 
        border-right: 2px solid #222; min-width: 80px;
      }
      .sticky-content { display: flex; align-items: center; justify-content: center; gap: 6px; }
      .div-label { font-weight: 900; color: var(--neon-gold); }
      .flag-input { width: 25px; background: transparent; border: none; text-align: center; font-size: 1.1rem; color: #fff; }

      /* Inputs */
      input { background: transparent; border: none; color: #fff; text-align: center; width: 100%; font-weight: bold; outline: none; }
      input:disabled { color: #444; }
      .input-error { color: var(--neon-red) !important; animation: error-pulse 1.5s infinite; }
      @keyframes error-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }

      /* View Management */
      .col-struct, .col-params, .col-goals { display: none; }
      [data-view="struct"] .col-struct { display: table-cell; }
      [data-view="params"] .col-params { display: table-cell; }
      [data-view="goals"] .col-goals { display: table-cell; }

      /* Info Match Style */
      .info-match-cell { font-size: 0.6rem; color: var(--neon-cyan); line-height: 1.1; max-width: 100px; overflow: hidden; text-overflow: ellipsis; }

      /* Goal Colors */
      .ucl { color: var(--neon-gold); } .uel { color: var(--neon-orange); } .uecl { color: var(--neon-green); }
      .promo { color: var(--neon-cyan); } .retro { color: var(--neon-red); } .play { color: var(--neon-purple); }

      /* Floating Actions */
      .fab-container { position: fixed; bottom: 25px; right: 20px; display: flex; flex-direction: column; gap: 15px; z-index: 1000; }
      .btn-fab { 
        width: 50px; height: 50px; border-radius: 50%; border: none; 
        display: flex; align-items: center; justify-content: center; font-size: 1.1rem;
        box-shadow: 0 8px 20px rgba(0,0,0,0.8);
      }
      .btn-lock { background: #111; color: var(--neon-gold); border: 1px solid var(--neon-gold); }
      .btn-lock.unlocked { background: var(--neon-gold); color: #000; }
      .btn-save { background: var(--neon-cyan); color: #000; font-weight: 900; width: 120px; border-radius: 30px; display: none; font-size: 0.8rem; }

      #toast {
        position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
        padding: 10px 20px; border-radius: 20px; font-weight: 800; font-size: 0.7rem; z-index: 2000; opacity: 0; transition: 0.3s;
      }
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
            <th>DIV</th>
            <th class="col-params">ELO</th>
            <th class="col-params">RESET</th>
            <th class="col-params">ULTIMO MATCH</th>
            <th class="col-struct">SQD</th>
            <th class="col-struct">G.TOT</th>
            <th class="col-struct">SPLIT</th>
            <th class="col-struct">FIN</th>
            <th class="col-goals ucl">UCL</th>
            <th class="col-goals uel">UEL</th>
            <th class="col-goals uecl">UECL</th>
            <th class="col-goals promo">PRO</th>
            <th class="col-goals retro">RET</th>
            <th class="col-goals play">PO</th>
            <th class="col-goals play">PY</th>
          </tr>
        </thead>
        <tbody>
          ${results.map(l => {
            const isMain = ["E0","E1","E2","E3","EC","I1","I2","D1","D2","SP1","SP2","F1","F2","N1","P1","T1","G1","SC0","SC1","SC2","SC3"].includes(l.div);
            const hasError = !l.num_squadre || !l.giornate_totali;
            const dataUI = l.data_regressione ? l.data_regressione.split('-').reverse().join('/') : "";
            
            return `
            <tr data-div="${l.div}" data-type="${isMain ? 'main' : 'extra'}">
              <td class="${hasError ? 'input-error' : ''}">
                <div class="sticky-content">
                  <input type="text" class="flag-input bandiera" value="${l.bandiera || '🏳️'}" disabled>
                  <span class="div-label">${l.div}</span>
                </div>
              </td>
              
              <td class="col-params"><input type="number" step="0.1" class="peso_elo" value="${l.peso_elo}" disabled></td>
              <td class="col-params"><input type="text" class="data_regressione" value="${dataUI}" placeholder="GG/MM" disabled></td>
              <td class="col-params">
                <div class="info-match-cell">
                  <div style="font-weight:bold">${l.info_data || '--'}</div>
                  <div>${l.info_match || 'In attesa...'}</div>
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
            </tr>
            `;
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
          if(type === 'all' || tr.getAttribute('data-type') === type) {
            tr.style.display = 'table-row';
          } else {
            tr.style.display = 'none';
          }
        });
      }

      function toggleLock() {
        isLocked = !isLocked;
        const btn = document.getElementById('lockBtn');
        const saveBtn = document.getElementById('saveBtn');
        const inputs = document.querySelectorAll('input');
        
        if(isLocked) {
          btn.innerText = "🔒"; btn.classList.remove('unlocked');
          saveBtn.style.display = 'none';
          inputs.forEach(i => i.disabled = true);
        } else {
          btn.innerText = "🔓"; btn.classList.add('unlocked');
          saveBtn.style.display = 'flex';
          inputs.forEach(i => i.disabled = false);
          showToast("MODALITÀ MODIFICA ATTIVA", "var(--neon-gold)");
        }
      }

      async function saveData() {
        const btn = document.getElementById('saveBtn');
        btn.innerText = "...";
        const rows = document.querySelectorAll('#mainTable tbody tr');
        const data = Array.from(rows).map(tr => {
          let dataRaw = tr.querySelector('.data_regressione').value.trim();
          let dataDB = (dataRaw.length === 5) ? dataRaw.split('/').reverse().join('-') : dataRaw;
          return {
            div: tr.getAttribute('data-div'),
            bandiera: tr.querySelector('.bandiera').value,
            num_squadre: tr.querySelector('.num_squadre').value,
            giornate_totali: tr.querySelector('.giornate_totali').value,
            soglia_split: tr.querySelector('.soglia_split').value,
            vincitore_playoff: tr.querySelector('.vincitore_playoff').value,
            peso_elo: tr.querySelector('.peso_elo').value,
            data_regressione: dataDB,
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
          const res = await fetch('/api/salva', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
          });
          if(res.ok) {
            showToast("DATABASE SINCRONIZZATO", "var(--neon-green)");
            toggleLock();
          } else { showToast("ERRORE SALVATAGGIO", "var(--neon-red)"); }
        } catch (e) { showToast("ERRORE DI RETE", "var(--neon-red)"); }
        btn.innerText = "SALVA";
      }

      function showToast(msg, color) {
        const t = document.getElementById('toast');
        t.innerText = msg; t.style.background = color; t.style.color = "#000";
        t.style.opacity = 1; setTimeout(() => t.style.opacity = 0, 3000);
      }
    </script>
  </body>
  </html>
  `;
  return new Response(html, { headers: { "Content-Type": "text/html;charset=UTF-8" } });
}