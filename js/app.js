/* ===== HIES 2026-2027 Dashboard — app.js ===== */
(async function () {
    'use strict';

    /* ---------- helpers ---------- */
    const STATUS_LABELS = {
        '65': 'Rejected by Supervisor',
        '100': 'Completed',
        '120': 'Approved by Supervisor',
        '125': 'Rejected by HQ',
        '130': 'Approved by HQ'
    };
    const STATUS_COLORS = {
        '65': '#e74c3c',
        '100': '#3498db',
        '120': '#2ecc71',
        '125': '#e67e22',
        '130': '#9b59b6'
    };
    const PROV_COLORS = {
        'Torba': '#e74c3c', 'Sanma': '#3498db', 'Penama': '#2ecc71',
        'Malampa': '#f39c12', 'Shefa': '#9b59b6', 'Tafea': '#1abc9c'
    };
    /** Display order matches survey strata (urban centres split out). */
    const STRATA_ORDER = ['Torba', 'Sanma Rural', 'Penama', 'Malampa', 'Shefa Rural', 'Tafea', 'Port Vila', 'Luganville'];
    const STRATA_COLORS = {
        'Torba': '#e74c3c', 'Sanma Rural': '#3498db', 'Penama': '#2ecc71', 'Malampa': '#f39c12',
        'Shefa Rural': '#9b59b6', 'Tafea': '#1abc9c', 'Port Vila': '#16a085', 'Luganville': '#2980b9',
        'Unknown': '#95a5a6'
    };
    const CHART_PALETTE = ['#3498db', '#2ecc71', '#e67e22', '#e74c3c', '#9b59b6',
        '#1abc9c', '#f39c12', '#34495e', '#d35400', '#2980b9',
        '#27ae60', '#8e44ad', '#c0392b', '#16a085', '#7f8c8d'];

    function el(id) { return document.getElementById(id); }
    function setText(id, v) { const e = el(id); if (e) e.textContent = v; }
    function groupBy(arr, key) {
        return arr.reduce((m, o) => { const k = typeof key === 'function' ? key(o) : o[key]; (m[k] = m[k] || []).push(o); return m; }, {});
    }
    function sortedEntries(obj) {
        return Object.entries(obj).sort((a, b) => b[1] - a[1]);
    }
    function statusLabel(code) { return STATUS_LABELS[String(code)] || 'Unknown'; }

    /* ---------- show error in page ---------- */
    function showError(msg, detail) {
        const content = el('content');
        if (!content) return;
        content.innerHTML = '<div style="padding:60px 32px;text-align:center;">' +
            '<h2 style="color:#e74c3c;margin-bottom:12px;">Error Loading Data</h2>' +
            '<p style="color:#555;margin-bottom:8px;">' + msg + '</p>' +
            (detail ? '<pre style="color:#999;font-size:0.82rem;white-space:pre-wrap;">' + detail + '</pre>' : '') +
            '<p style="color:#777;margin-top:16px;">Make sure the <code>data/</code> folder contains the JSON files.</p></div>';
    }

    /* ---------- data loading ---------- */
    let summary, households, persons, lookup, targets, eaBoundaries, villagePoints, workplan, foodData, listingData, marketData, assetsData;
    const DATA_VERSION = String(Date.now());
    try {
        async function loadJSON(path) {
            const sep = path.includes('?') ? '&' : '?';
            const url = `${path}${sep}v=${DATA_VERSION}`;
            const r = await fetch(url, { cache: 'no-store' });
            if (!r.ok) throw new Error(path + ' → HTTP ' + r.status);
            return r.json();
        }
        [summary, households, persons, lookup, targets, eaBoundaries, villagePoints, workplan, foodData, listingData, marketData, assetsData] = await Promise.all([
            loadJSON('data/summary.json'),
            loadJSON('data/households.json'),
            loadJSON('data/persons.json'),
            loadJSON('data/lookup.json'),
            loadJSON('data/targets.json'),
            loadJSON('data/ea_boundaries.geojson'),
            loadJSON('data/villages.geojson'),
            loadJSON('data/workplan.json'),
            loadJSON('data/food.json'),
            loadJSON('data/listing.json').catch(() => []),
            loadJSON('data/market.json').catch(() => ({ outlets: [], hh_progress: [], categories: [] })),
            loadJSON('data/assets.json').catch(() => [])
        ]);
    } catch (err) {
        showError('Could not load dashboard data.', String(err));
        return;
    }

    /* ---------- enrich households from lookup ---------- */
    const eaLookup = (lookup && lookup.ea) || {};
    const villageLookup = (lookup && lookup.village) || {};
    const acLookup = (lookup && lookup.area_council) || {};
    const foodItemLookup = (lookup && lookup.food_item) || {};

    const eaToStrataRaw = {};
    if (targets && targets.eas) {
        targets.eas.forEach(e => { eaToStrataRaw[String(e.eahies)] = e.strata_name; });
    }
    function mapStrataRawToLabel(raw) {
        if (!raw) return 'Unknown';
        const m = {
            'Torba': 'Torba',
            'Sanma rural': 'Sanma Rural',
            'Sanma urban': 'Luganville',
            'Penama': 'Penama',
            'Malampa': 'Malampa',
            'Shefa rural': 'Shefa Rural',
            'Shefa urban': 'Port Vila',
            'Tafea': 'Tafea'
        };
        return m[raw] || raw;
    }
    function orderedStrataKeys(hhByStrata) {
        const keys = new Set(Object.keys(hhByStrata));
        const out = [];
        STRATA_ORDER.forEach(s => { if (keys.has(s)) out.push(s); });
        keys.forEach(k => {
            if (!STRATA_ORDER.includes(k)) out.push(k);
        });
        return out;
    }
    function strataColor(label) {
        return STRATA_COLORS[label] || CHART_PALETTE[Math.abs(String(label).length) % CHART_PALETTE.length];
    }

    households.forEach(h => {
        h.interview_status = String(h.interview_status);
        const info = eaLookup[h.ea] || {};
        h.island_name = info.island || '';
        h.ac_name = info.ac_name || acLookup[h.area_council] || '';
        h.team_name = info.team_name || '';
        h.village_name = villageLookup[h.village] || '';
        h.strata_label = mapStrataRawToLabel(eaToStrataRaw[String(h.ea)]);
    });
    const hhStrataLookup = {};
    households.forEach(h => { hhStrataLookup[h.interview_key] = h.strata_label; });

    /** null = all Vanuatu; otherwise display strata label (matches STRATA_ORDER). */
    let strataScopeFilter = null;
    let viewHH;
    let hhByStatus, hhByTeam, hhByInterviewer, hhByStrata, hhByDate, dates, personsByHH, statusCodes;
    let viewPersons, viewFoodData, viewListingData, viewMarketData, viewAssetsData;
    let teamNameMap = {};

    function rebuildStrataScope() {
        viewHH = strataScopeFilter ? households.filter(h => h.strata_label === strataScopeFilter) : households;
        const vk = new Set(viewHH.map(h => h.interview_key));
        hhByStatus = groupBy(viewHH, 'interview_status');
        hhByTeam = groupBy(viewHH, 'team_id');
        hhByInterviewer = groupBy(viewHH, 'interviewer_id');
        hhByStrata = groupBy(viewHH, 'strata_label');
        hhByDate = groupBy(viewHH, 'interview_date');
        dates = Object.keys(hhByDate).sort();
        personsByHH = groupBy(persons.filter(p => vk.has(p.interview_key)), 'interview_key');
        viewPersons = persons.filter(p => vk.has(p.interview_key));
        viewFoodData = (foodData || []).filter(r => vk.has(r.interview_key));
        viewListingData = (listingData || []).filter(r => vk.has(r.interview_key));
        const mk = marketData || { outlets: [], hh_progress: [], categories: [] };
        viewMarketData = {
            outlets: (mk.outlets || []).filter(o => vk.has(o.interview_key)),
            hh_progress: (mk.hh_progress || []).filter(h => vk.has(h.interview_key)),
            categories: mk.categories || []
        };
        viewAssetsData = (assetsData || []).filter(a => vk.has(a.interview_key));
        statusCodes = Object.keys(hhByStatus).sort();
        teamNameMap = {};
        Object.keys(hhByTeam).forEach(tid => {
            const rows = hhByTeam[tid];
            const name = rows[0] && rows[0].team_name;
            if (name) teamNameMap[tid] = name;
        });
    }
    rebuildStrataScope();

    function getStrataTargetTotal() {
        if (!targets || !targets.strata_targets) return targets && targets.total_target ? targets.total_target : 0;
        if (!strataScopeFilter) return targets.total_target || 0;
        let sum = 0;
        Object.keys(targets.strata_targets).forEach(k => {
            if (mapStrataRawToLabel(k) === strataScopeFilter) {
                sum += targets.strata_targets[k].target;
            }
        });
        return sum;
    }
    function getStrataEasCount() {
        if (!targets || !targets.eas) return 0;
        if (!strataScopeFilter) return targets.total_eas || targets.eas.length;
        return targets.eas.filter(e => mapStrataRawToLabel(e.strata_name) === strataScopeFilter).length;
    }
    function eaRecordMatchesStrataFilter(e) {
        if (!strataScopeFilter) return true;
        return mapStrataRawToLabel(e.strata_name) === strataScopeFilter;
    }
    function workplanRowMatchesStrata(s) {
        if (!strataScopeFilter) return true;
        // Breaks / training apply to the whole survey — keep visible in every stratum view
        if (s.eaid === null || s.eaid === undefined) return true;
        const rec = targets && targets.eas && targets.eas.find(x => String(x.eahies) === String(s.eaid));
        return !!(rec && eaRecordMatchesStrataFilter(rec));
    }

    function tName(id) { return teamNameMap[id] || ('Team ' + id); }

    /* ---------- chart registry (for cleanup) ---------- */
    const charts = {};
    /** Latest underreporting chart redraw (so dropdown listeners stay in sync after strata filter). */
    let redrawUnderreportCharts = function () {};
    function makeChart(canvasId, config) {
        if (charts[canvasId]) charts[canvasId].destroy();
        const ctx = el(canvasId);
        if (!ctx) return null;
        charts[canvasId] = new Chart(ctx, config);
        return charts[canvasId];
    }

    /* ---------- navigation ---------- */
    const TAB_TITLES = {
        surveys: 'HIES Status',
        teams: 'Teams and Statuses',
        duration: 'Status Duration',
        devices: 'Devices / Interviewers',
        map: 'Map Report',
        cumulative: 'Cumulative Interview Chart',
        quantity: 'Quantity',
        speed: 'Speed',
        statistics: 'Survey Statistics',
        monitoring: 'EA Monitoring',
        foodconsumption: 'Food Consumption',
        workplan: 'Work Plan',
        listing: 'Household Listing',
        market: 'Market Survey',
        assets: 'Household Assets',
        underreporting: 'Underreporting checks'
    };

    const navItems = document.querySelectorAll('.nav-item');
    const tabs = document.querySelectorAll('.tab-content');
    let rendered = {};
    let activeTab = 'surveys';

    function refreshAfterStrataChange() {
        rebuildStrataScope();
        rendered = {};
        renderTab(activeTab, true);
        setText('strataFilterBadge', strataScopeFilter || 'All Vanuatu');
    }

    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const tab = item.dataset.tab;
            activeTab = tab;
            navItems.forEach(n => n.classList.remove('active'));
            item.classList.add('active');
            tabs.forEach(t => t.classList.remove('active'));
            const target = el('tab-' + tab);
            if (target) target.classList.add('active');
            setText('pageTitle', TAB_TITLES[tab] || tab);
            renderTab(tab);
            el('sidebar').classList.remove('open');
        });
    });

    const strataNavItems = document.querySelectorAll('.nav-strata-item');
    strataNavItems.forEach(item => {
        item.addEventListener('click', () => {
            const s = item.dataset.strata;
            strataScopeFilter = (s === '' || s === 'all') ? null : s;
            strataNavItems.forEach(n => n.classList.remove('active'));
            item.classList.add('active');
            refreshAfterStrataChange();
            el('sidebar').classList.remove('open');
        });
    });

    el('menuToggle').addEventListener('click', () => {
        el('sidebar').classList.toggle('open');
    });

    /* ---------- render dispatcher ---------- */
    function renderTab(tab, force) {
        if (!force && rendered[tab]) return;
        rendered[tab] = true;
        switch (tab) {
            case 'surveys': renderSurveys(); break;
            case 'teams': renderTeams(); break;
            case 'duration': renderDuration(); break;
            case 'devices': renderDevices(); break;
            case 'map': renderMap(); break;
            case 'cumulative': renderCumulative(); break;
            case 'quantity': renderQuantity(); break;
            case 'speed': renderSpeed(); break;
            case 'statistics': renderStatistics(); break;
            case 'monitoring': renderMonitoring(); break;
            case 'foodconsumption': renderFoodConsumption(); break;
            case 'workplan': renderWorkplan(); break;
            case 'listing': renderListing(); break;
            case 'market': renderMarket(); break;
            case 'assets': renderAssets(); break;
            case 'underreporting': renderUnderreporting(); break;
        }
    }

    /* ========================================
       1. SURVEYS AND STATUSES
       ======================================== */
    function renderSurveys() {
        // 3-category pipeline: FS Backlog → HQ Backlog → Approved
        const fsBacklogStatuses = ['100', '65', '125']; // Completed + Rejected by SV + Rejected by HQ
        const hqBacklogStatuses = ['120'];               // Approved by SV
        const approvedStatuses = ['130'];                 // Approved by HQ
        const fsBacklog = viewHH.filter(h => fsBacklogStatuses.includes(h.interview_status)).length;
        const hqBacklog = viewHH.filter(h => hqBacklogStatuses.includes(h.interview_status)).length;
        const approved = viewHH.filter(h => approvedStatuses.includes(h.interview_status)).length;

        setText('kpi-total-interviews', viewHH.length);
        setText('kpi-fs-backlog', fsBacklog);
        setText('kpi-hq-backlog', hqBacklog);
        setText('kpi-approved', approved);

        // FS Backlog / HQ Backlog / Approved by team (3-color stacked bar)
        const teamIds = Object.keys(hhByTeam).sort();
        makeChart('chart-backlog-team', {
            type: 'bar',
            data: {
                labels: teamIds.map(tName),
                datasets: [
                    {
                        label: 'Field Supervisor Backlog',
                        data: teamIds.map(t => hhByTeam[t].filter(h => fsBacklogStatuses.includes(h.interview_status)).length),
                        backgroundColor: '#e67e22'
                    },
                    {
                        label: 'Headquarter Backlog',
                        data: teamIds.map(t => hhByTeam[t].filter(h => hqBacklogStatuses.includes(h.interview_status)).length),
                        backgroundColor: '#3498db'
                    },
                    {
                        label: 'Approved',
                        data: teamIds.map(t => hhByTeam[t].filter(h => approvedStatuses.includes(h.interview_status)).length),
                        backgroundColor: '#2ecc71'
                    }
                ]
            },
            options: { responsive: true, scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true } }, plugins: { legend: { position: 'bottom' } } }
        });

        // Pipeline overview doughnut
        makeChart('chart-pipeline-pie', {
            type: 'doughnut',
            data: {
                labels: ['Field Supervisor Backlog', 'Headquarter Backlog', 'Approved'],
                datasets: [{
                    data: [fsBacklog, hqBacklog, approved],
                    backgroundColor: ['#e67e22', '#3498db', '#2ecc71']
                }]
            },
            options: { responsive: true, plugins: { legend: { position: 'bottom' } } }
        });

        // FS Backlog breakdown by team (stacked: Completed / Rejected SV / Rejected HQ)
        makeChart('chart-fs-backlog-detail', {
            type: 'bar',
            data: {
                labels: teamIds.map(tName),
                datasets: fsBacklogStatuses.map(sc => ({
                    label: statusLabel(sc),
                    data: teamIds.map(t => hhByTeam[t].filter(h => h.interview_status === sc).length),
                    backgroundColor: STATUS_COLORS[sc] || '#95a5a6'
                }))
            },
            options: { responsive: true, scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true } }, plugins: { legend: { position: 'bottom' } } }
        });

        // FS Backlog composition doughnut
        makeChart('chart-fs-backlog-pie', {
            type: 'doughnut',
            data: {
                labels: fsBacklogStatuses.map(statusLabel),
                datasets: [{
                    data: fsBacklogStatuses.map(c => (hhByStatus[c] || []).length),
                    backgroundColor: fsBacklogStatuses.map(c => STATUS_COLORS[c] || '#95a5a6')
                }]
            },
            options: { responsive: true, plugins: { legend: { position: 'bottom' } } }
        });

        // table
        const tbody = el('table-surveys').querySelector('tbody');
        tbody.innerHTML = '';
        viewHH.forEach(h => {
            const tr = document.createElement('tr');
            tr.innerHTML = `<td>${esc(h.interview_key)}</td><td>${esc(h.strata_label)}</td><td>${esc(h.island_name)}</td>` +
                `<td>${esc(h.ac_name)}</td><td>${esc(h.ea)}</td><td>${esc(h.village_name)}</td>` +
                `<td>${esc(h.team_name || h.team_id)}</td><td>${esc(h.interviewer_id)}</td><td>${esc(h.interview_date)}</td>` +
                `<td><span class="status-badge status-${h.interview_status}">${statusLabel(h.interview_status)}</span></td>`;
            tbody.appendChild(tr);
        });
    }

    /* ========================================
       2. TEAMS AND STATUSES
       ======================================== */
    function renderTeams() {
        const fsBacklogStatuses = ['100', '65', '125'];
        const hqBacklogStatuses = ['120'];
        const approvedStatuses = ['130'];
        const teamIds = Object.keys(hhByTeam).sort();
        const numTeams = teamIds.length;
        const avgPerTeam = (viewHH.length / numTeams).toFixed(1);

        // Compute per-team backlogs
        const teamFsBacklog = {};
        const teamHqBacklog = {};
        teamIds.forEach(t => {
            teamFsBacklog[t] = hhByTeam[t].filter(h => fsBacklogStatuses.includes(h.interview_status)).length;
            teamHqBacklog[t] = hhByTeam[t].filter(h => hqBacklogStatuses.includes(h.interview_status)).length;
        });
        const totalFsBacklog = Object.values(teamFsBacklog).reduce((a, b) => a + b, 0);
        const totalHqBacklog = Object.values(teamHqBacklog).reduce((a, b) => a + b, 0);

        setText('kpi-num-teams', numTeams);
        setText('kpi-avg-per-team', avgPerTeam);
        setText('kpi-team-fs-backlog', totalFsBacklog);
        setText('kpi-team-hq-backlog', totalHqBacklog);

        // FS Backlog / HQ Backlog / Approved by team (3-color stacked bar)
        makeChart('chart-team-pipeline', {
            type: 'bar',
            data: {
                labels: teamIds.map(tName),
                datasets: [
                    {
                        label: 'Field Supervisor Backlog',
                        data: teamIds.map(t => teamFsBacklog[t]),
                        backgroundColor: '#e67e22'
                    },
                    {
                        label: 'Headquarter Backlog',
                        data: teamIds.map(t => teamHqBacklog[t]),
                        backgroundColor: '#3498db'
                    },
                    {
                        label: 'Approved',
                        data: teamIds.map(t => hhByTeam[t].filter(h => approvedStatuses.includes(h.interview_status)).length),
                        backgroundColor: '#2ecc71'
                    }
                ]
            },
            options: { responsive: true, scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true } }, plugins: { legend: { position: 'bottom' } } }
        });

        // FS Backlog detail by team (Completed / Rejected SV / Rejected HQ)
        makeChart('chart-team-fs-detail', {
            type: 'bar',
            data: {
                labels: teamIds.map(tName),
                datasets: fsBacklogStatuses.map(sc => ({
                    label: statusLabel(sc),
                    data: teamIds.map(t => hhByTeam[t].filter(h => h.interview_status === sc).length),
                    backgroundColor: STATUS_COLORS[sc] || '#95a5a6'
                }))
            },
            options: { responsive: true, scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true } }, plugins: { legend: { position: 'bottom' } } }
        });

        // table
        const tbody = el('table-teams').querySelector('tbody');
        tbody.innerHTML = '';
        teamIds.forEach(t => {
            const rows = hhByTeam[t];
            const intvs = [...new Set(rows.map(r => r.interviewer_id))].length;
            const fs = teamFsBacklog[t];
            const hq = teamHqBacklog[t];
            const appr = rows.filter(r => approvedStatuses.includes(r.interview_status)).length;
            const tr = document.createElement('tr');
            tr.innerHTML = `<td>${esc(tName(t))}</td><td>${intvs}</td><td>${rows.length}</td>` +
                `<td>${fs}</td><td>${hq}</td><td>${appr}</td>`;
            tbody.appendChild(tr);
        });
    }

    /* ========================================
       3. STATUS DURATION
       ======================================== */
    function renderDuration() {
        const days = dates.length;
        const approvedTotal = (hhByStatus['120'] || []).length + (hhByStatus['130'] || []).length;
        const rejTotal = (hhByStatus['65'] || []).length + (hhByStatus['125'] || []).length;
        const approvalRate = ((approvedTotal / viewHH.length) * 100).toFixed(1) + '%';
        const rejRate = ((rejTotal / viewHH.length) * 100).toFixed(1) + '%';
        const pending = (hhByStatus['100'] || []).length;

        setText('kpi-fieldwork-days', days);
        setText('kpi-approval-rate', approvalRate);
        setText('kpi-rejection-rate', rejRate);
        setText('kpi-pending', pending);

        // status over time (stacked area)
        makeChart('chart-status-timeline', {
            type: 'line',
            data: {
                labels: dates,
                datasets: statusCodes.map(sc => ({
                    label: statusLabel(sc),
                    data: dates.map(d => (hhByDate[d] || []).filter(h => h.interview_status === sc).length),
                    borderColor: STATUS_COLORS[sc],
                    backgroundColor: STATUS_COLORS[sc] + '33',
                    fill: true, tension: 0.3
                }))
            },
            options: { responsive: true, scales: { x: { title: { display: true, text: 'Date' } }, y: { stacked: true, beginAtZero: true } }, plugins: { legend: { position: 'bottom' } } }
        });

        // approval funnel (horizontal bar)
        const funnel = [
            { label: 'Total', val: viewHH.length },
            { label: 'Completed', val: (hhByStatus['100'] || []).length },
            { label: 'Approved SV', val: (hhByStatus['120'] || []).length },
            { label: 'Approved HQ', val: (hhByStatus['130'] || []).length }
        ];
        makeChart('chart-approval-funnel', {
            type: 'bar',
            data: {
                labels: funnel.map(f => f.label),
                datasets: [{ data: funnel.map(f => f.val), backgroundColor: ['#3498db', '#2ecc71', '#f39c12', '#9b59b6'] }]
            },
            options: { indexAxis: 'y', responsive: true, plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true } } }
        });

        // daily by status
        makeChart('chart-daily-status', {
            type: 'bar',
            data: {
                labels: dates,
                datasets: statusCodes.map(sc => ({
                    label: statusLabel(sc),
                    data: dates.map(d => (hhByDate[d] || []).filter(h => h.interview_status === sc).length),
                    backgroundColor: STATUS_COLORS[sc]
                }))
            },
            options: { responsive: true, scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true } }, plugins: { legend: { position: 'bottom' } } }
        });

        // rejection vs approval
        makeChart('chart-reject-approve', {
            type: 'doughnut',
            data: {
                labels: ['Approved', 'Rejected', 'Pending'],
                datasets: [{
                    data: [approvedTotal, rejTotal, pending],
                    backgroundColor: ['#2ecc71', '#e74c3c', '#3498db']
                }]
            },
            options: { responsive: true, plugins: { legend: { position: 'bottom' } } }
        });
    }

    /* ========================================
       4. DEVICES / INTERVIEWERS
       ======================================== */
    function renderDevices() {
        const intvIds = Object.keys(hhByInterviewer).sort();
        const numIntv = intvIds.length;
        const avgPerIntv = (viewHH.length / numIntv).toFixed(1);
        const topIntv = sortedEntries(Object.fromEntries(intvIds.map(i => [i, hhByInterviewer[i].length])))[0];
        const provsCovered = [...new Set(viewHH.map(h => h.strata_label))].length;

        setText('kpi-num-interviewers', numIntv);
        setText('kpi-avg-per-intv', avgPerIntv);
        setText('kpi-top-interviewer', topIntv[0]);
        setText('kpi-provinces-covered', provsCovered);

        // bar per interviewer
        makeChart('chart-interviewer-bar', {
            type: 'bar',
            data: {
                labels: intvIds,
                datasets: [{
                    label: 'Interviews',
                    data: intvIds.map(i => hhByInterviewer[i].length),
                    backgroundColor: '#3498db'
                }]
            },
            options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
        });

        // stacked by status per interviewer
        makeChart('chart-interviewer-status', {
            type: 'bar',
            data: {
                labels: intvIds,
                datasets: statusCodes.map(sc => ({
                    label: statusLabel(sc),
                    data: intvIds.map(i => (hhByInterviewer[i] || []).filter(h => h.interview_status === sc).length),
                    backgroundColor: STATUS_COLORS[sc]
                }))
            },
            options: { responsive: true, scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true } }, plugins: { legend: { position: 'bottom' } } }
        });

        // table
        const tbody = el('table-interviewers').querySelector('tbody');
        tbody.innerHTML = '';
        intvIds.forEach(i => {
            const rows = hhByInterviewer[i];
            const team = rows[0].team_id;
            const provs = [...new Set(rows.map(r => r.strata_label))].join(', ');
            const tr = document.createElement('tr');
            const teamLabel = (eaLookup[rows[0].ea] || {}).team_name || ('Team ' + team);
            tr.innerHTML = `<td>${esc(i)}</td><td>${esc(teamLabel)}</td><td>${rows.length}</td>` +
                `<td>${rows.filter(r => r.interview_status === '100').length}</td>` +
                `<td>${rows.filter(r => ['120', '130'].includes(r.interview_status)).length}</td>` +
                `<td>${rows.filter(r => ['65', '125'].includes(r.interview_status)).length}</td>` +
                `<td>${esc(provs)}</td>`;
            tbody.appendChild(tr);
        });
    }

    /* ========================================
       5. MAP REPORT
       ======================================== */
    let surveyMapInstance = null;
    function renderMap() {
        if (surveyMapInstance) {
            surveyMapInstance.remove();
            surveyMapInstance = null;
        }
        const withGPS = viewHH.filter(h => h.latitude && h.longitude && h.latitude !== '' && h.longitude !== '');
        const eas = [...new Set(viewHH.map(h => h.ea))].length;
        const provs = [...new Set(viewHH.map(h => h.strata_label))].length;

        setText('kpi-map-hh', withGPS.length);
        setText('kpi-map-eas', eas);
        setText('kpi-map-provinces', provs);
        setText('kpi-map-gps', withGPS.length);

        // Build actual count per EA
        const actualByEA = {};
        viewHH.forEach(h => {
            const ea = String(h.ea);
            actualByEA[ea] = (actualByEA[ea] || 0) + 1;
        });

        // Build target per EA from targets data
        const targetByEA = {};
        if (targets && targets.eas) {
            targets.eas.forEach(e => {
                targetByEA[String(e.eahies)] = e.target_sample;
            });
        }

        // Leaflet map
        const map = L.map('survey-map').setView([-16.5, 168], 6);
        surveyMapInstance = map;
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors', maxZoom: 18
        }).addTo(map);

        // Layer groups for toggle
        const eaLayer = L.layerGroup().addTo(map);
        const villageLayer = L.layerGroup();
        const hhLayer = L.layerGroup().addTo(map);

        // EA boundary polygons
        if (eaBoundaries && eaBoundaries.features) {
            L.geoJSON(eaBoundaries, {
                style: function (feature) {
                    const eaCode = String(feature.properties.eahies);
                    const actual = actualByEA[eaCode] || 0;
                    const target = targetByEA[eaCode] || 0;
                    var fillColor = '#bdc3c7';
                    if (actual > 0 && actual < target) fillColor = '#f39c12';
                    if (actual >= target && target > 0) fillColor = '#2ecc71';
                    return { color: '#34495e', weight: 1.5, fillColor: fillColor, fillOpacity: 0.35 };
                },
                onEachFeature: function (feature, layer) {
                    var p = feature.properties;
                    var eaCode = String(p.eahies);
                    var actual = actualByEA[eaCode] || 0;
                    var target = targetByEA[eaCode] || 0;
                    var pct = target > 0 ? ((actual / target) * 100).toFixed(1) : '0.0';
                    layer.bindPopup(
                        '<b>EA: ' + esc(eaCode) + '</b><br>' +
                        'Province: ' + esc(p.Pname) + '<br>' +
                        'Area Council: ' + esc(p.ACNAME22) + '<br>' +
                        'Team: ' + esc(p.Team_Name) + '<br>' +
                        'HH in EA: ' + (p.hh_count || 0) + '<br>' +
                        '<hr style="margin:4px 0;">' +
                        'Target: ' + target + ' | Actual: ' + actual + ' | ' + pct + '%'
                    );
                }
            }).addTo(eaLayer);
        }

        // Village point markers
        if (villagePoints && villagePoints.features) {
            L.geoJSON(villagePoints, {
                pointToLayer: function (feature, latlng) {
                    return L.circleMarker(latlng, {
                        radius: 3, fillColor: '#9b59b6', color: '#fff', weight: 0.5, fillOpacity: 0.6
                    });
                },
                onEachFeature: function (feature, layer) {
                    var p = feature.properties;
                    layer.bindPopup('<b>' + esc(p.Village) + '</b><br>Province: ' + esc(p.PNAME) + '<br>AC: ' + esc(p.ACNAME) + '<br>Island: ' + esc(p.Is_Name));
                }
            }).addTo(villageLayer);
        }

        // Household markers
        withGPS.forEach(h => {
            const lat = parseFloat(h.latitude);
            const lng = parseFloat(h.longitude);
            if (isNaN(lat) || isNaN(lng)) return;
            L.circleMarker([lat, lng], {
                radius: 5, fillColor: '#e74c3c', color: '#fff', weight: 1, fillOpacity: 0.85
            }).bindPopup(
                '<b>' + esc(h.interview_key) + '</b><br>' +
                'Strata: ' + esc(h.strata_label) + '<br>Province: ' + esc(h.province_name) + '<br>Island: ' + esc(h.island_name) +
                '<br>AC: ' + esc(h.ac_name) + '<br>Village: ' + esc(h.village_name) +
                '<br>EA: ' + esc(h.ea) + '<br>Team: ' + esc(h.team_name || h.team_id) +
                '<br>Date: ' + esc(h.interview_date) + '<br>Status: ' + statusLabel(h.interview_status)
            ).addTo(hhLayer);
        });

        // Layer control
        L.control.layers(null, {
            'EA Boundaries': eaLayer,
            'Villages': villageLayer,
            'Households': hhLayer
        }).addTo(map);

        // Fit bounds
        if (eaBoundaries && eaBoundaries.features && eaBoundaries.features.length) {
            map.fitBounds(L.geoJSON(eaBoundaries).getBounds(), { padding: [30, 30] });
        } else if (withGPS.length) {
            const coords = withGPS.map(h => [parseFloat(h.latitude), parseFloat(h.longitude)]).filter(c => !isNaN(c[0]) && !isNaN(c[1]));
            if (coords.length) map.fitBounds(coords, { padding: [30, 30] });
        }
    }

    /* ========================================
       6. CUMULATIVE INTERVIEW CHART
       ======================================== */
    function renderCumulative() {
        const total = viewHH.length;
        const firstDate = dates[0] || '-';
        const lastDate = dates[dates.length - 1] || '-';
        const dailyAvg = (total / (dates.length || 1)).toFixed(1);

        setText('kpi-cum-total', total);
        setText('kpi-cum-first', firstDate);
        setText('kpi-cum-last', lastDate);
        setText('kpi-cum-daily-avg', dailyAvg);

        // cumulative line
        let cumulative = 0;
        const cumData = dates.map(d => { cumulative += (hhByDate[d] || []).length; return cumulative; });

        makeChart('chart-cumulative-line', {
            type: 'line',
            data: {
                labels: dates,
                datasets: [{
                    label: 'Cumulative Interviews',
                    data: cumData,
                    borderColor: '#3498db', backgroundColor: '#3498db22',
                    fill: true, tension: 0.3, pointRadius: 5
                }]
            },
            options: { responsive: true, scales: { y: { beginAtZero: true } }, plugins: { legend: { display: false } } }
        });

        // cumulative by strata
        const strataKeys = orderedStrataKeys(hhByStrata);
        makeChart('chart-cumulative-province', {
            type: 'line',
            data: {
                labels: dates,
                datasets: strataKeys.map((p, i) => {
                    let cum = 0;
                    return {
                        label: p,
                        data: dates.map(d => { cum += (hhByDate[d] || []).filter(h => h.strata_label === p).length; return cum; }),
                        borderColor: strataColor(p) || CHART_PALETTE[i],
                        tension: 0.3, fill: false, pointRadius: 4
                    };
                })
            },
            options: { responsive: true, scales: { y: { beginAtZero: true } }, plugins: { legend: { position: 'bottom' } } }
        });

        // daily count bar
        makeChart('chart-daily-count', {
            type: 'bar',
            data: {
                labels: dates,
                datasets: [{
                    label: 'Interviews',
                    data: dates.map(d => (hhByDate[d] || []).length),
                    backgroundColor: '#2ecc71'
                }]
            },
            options: { responsive: true, scales: { y: { beginAtZero: true } }, plugins: { legend: { display: false } } }
        });
    }

    /* ========================================
       7. QUANTITY
       ======================================== */
    function renderQuantity() {
        const totalPersons = viewPersons.length;
        const avgHH = viewHH.length ? (viewPersons.length / viewHH.length).toFixed(1) : '-';
        const peakDay = dates.reduce((mx, d) => Math.max(mx, (hhByDate[d] || []).length), 0);

        setText('kpi-qty-total', viewHH.length);
        setText('kpi-qty-persons', totalPersons);
        setText('kpi-qty-avg-hh', avgHH);
        setText('kpi-qty-peak', peakDay);

        // by strata
        const strataKeysQty = orderedStrataKeys(hhByStrata);
        makeChart('chart-qty-province', {
            type: 'bar',
            data: {
                labels: strataKeysQty,
                datasets: [{
                    label: 'Interviews',
                    data: strataKeysQty.map(p => hhByStrata[p].length),
                    backgroundColor: strataKeysQty.map(p => strataColor(p))
                }]
            },
            options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
        });

        // by team
        const teamIds = Object.keys(hhByTeam).sort();
        makeChart('chart-qty-team', {
            type: 'bar',
            data: {
                labels: teamIds.map(t => tName(t)),
                datasets: [{
                    label: 'Interviews',
                    data: teamIds.map(t => hhByTeam[t].length),
                    backgroundColor: CHART_PALETTE
                }]
            },
            options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
        });

        // per interviewer
        const intvIds = Object.keys(hhByInterviewer).sort();
        makeChart('chart-qty-interviewer', {
            type: 'bar',
            data: {
                labels: intvIds,
                datasets: [{
                    label: 'Interviews',
                    data: intvIds.map(i => hhByInterviewer[i].length),
                    backgroundColor: '#3498db'
                }]
            },
            options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
        });

        // persons by strata
        const strataKeysPersons = orderedStrataKeys(hhByStrata);
        const personsPerStrata = strataKeysPersons.map(s =>
            viewPersons.filter(p => hhStrataLookup[p.interview_key] === s).length);
        makeChart('chart-qty-persons-prov', {
            type: 'doughnut',
            data: {
                labels: strataKeysPersons,
                datasets: [{
                    data: personsPerStrata,
                    backgroundColor: strataKeysPersons.map(s => strataColor(s))
                }]
            },
            options: { responsive: true, plugins: { legend: { position: 'bottom' } } }
        });
    }

    /* ========================================
       8. SPEED
       ======================================== */
    function renderSpeed() {
        const numDays = dates.length || 1;
        const teamIds = Object.keys(hhByTeam);
        const intvIds = Object.keys(hhByInterviewer);
        const dailyAvg = (viewHH.length / numDays).toFixed(1);
        const teamDayAvg = (viewHH.length / numDays / teamIds.length).toFixed(2);
        const intvDayAvg = (viewHH.length / numDays / intvIds.length).toFixed(2);
        const peakDaily = dates.reduce((mx, d) => Math.max(mx, (hhByDate[d] || []).length), 0);

        setText('kpi-speed-daily', dailyAvg);
        setText('kpi-speed-team-day', teamDayAvg);
        setText('kpi-speed-intv-day', intvDayAvg);
        setText('kpi-speed-peak', peakDaily);

        // daily rate
        makeChart('chart-speed-daily', {
            type: 'line',
            data: {
                labels: dates,
                datasets: [{
                    label: 'Interviews / Day',
                    data: dates.map(d => (hhByDate[d] || []).length),
                    borderColor: '#3498db', backgroundColor: '#3498db22',
                    fill: true, tension: 0.3, pointRadius: 5
                }]
            },
            options: { responsive: true, scales: { y: { beginAtZero: true } }, plugins: { legend: { display: false } } }
        });

        // team productivity
        makeChart('chart-speed-team', {
            type: 'bar',
            data: {
                labels: teamIds.sort().map(t => tName(t)),
                datasets: [{
                    label: 'Interviews / Active Day',
                    data: teamIds.sort().map(t => {
                        const teamDates = [...new Set(hhByTeam[t].map(h => h.interview_date))].length || 1;
                        return (hhByTeam[t].length / teamDates).toFixed(1);
                    }),
                    backgroundColor: CHART_PALETTE
                }]
            },
            options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
        });

        // interviewer productivity
        makeChart('chart-speed-interviewer', {
            type: 'bar',
            data: {
                labels: intvIds.sort(),
                datasets: [{
                    label: 'Interviews / Active Day',
                    data: intvIds.sort().map(i => {
                        const intvDates = [...new Set(hhByInterviewer[i].map(h => h.interview_date))].length || 1;
                        return (hhByInterviewer[i].length / intvDates).toFixed(1);
                    }),
                    backgroundColor: '#2ecc71'
                }]
            },
            options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
        });

        // strata speed
        const strataKeysSp = orderedStrataKeys(hhByStrata);
        makeChart('chart-speed-province', {
            type: 'bar',
            data: {
                labels: strataKeysSp,
                datasets: [{
                    label: 'Interviews / Active Day',
                    data: strataKeysSp.map(p => {
                        const rows = hhByStrata[p].filter(Boolean);
                        const provDates = [...new Set(rows.map(h => h.interview_date))].length || 1;
                        return (rows.length / provDates).toFixed(1);
                    }),
                    backgroundColor: strataKeysSp.map(p => strataColor(p))
                }]
            },
            options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
        });
    }

    /* ========================================
       9. SURVEY STATISTICS
       ======================================== */
    function renderStatistics() {
        // Compute all stats from raw data
        const totalHH = viewHH.length;
        const totalP = viewPersons.length;

        // HH sizes from persons grouped by interview_key
        const hhSizes = {};
        viewPersons.forEach(p => { hhSizes[p.interview_key] = (hhSizes[p.interview_key] || 0) + 1; });
        const sizeValues = Object.values(hhSizes);
        const avgHS = sizeValues.length > 0 ? (sizeValues.reduce((a, b) => a + b, 0) / sizeValues.length).toFixed(1) : '-';

        // Sex counts
        const maleC = viewPersons.filter(p => String(p.sex) === '1').length;
        const femaleC = viewPersons.filter(p => String(p.sex) === '2').length;
        const sexRatio = femaleC > 0 ? ((maleC / femaleC) * 100).toFixed(0) : '-';

        // Strata data from households
        const strataHH = groupBy(viewHH, 'strata_label');
        const strataNames = orderedStrataKeys(strataHH);

        setText('kpi-stat-hh', totalHH);
        setText('kpi-stat-hh-sub', strataNames.length + ' strata');
        setText('kpi-stat-persons', totalP);
        setText('kpi-stat-persons-sub', maleC + ' male, ' + femaleC + ' female');
        setText('kpi-stat-hhsize', avgHS);
        setText('kpi-stat-sexratio', sexRatio);

        // Age pyramid from persons
        const ageBins = ['0-4', '5-9', '10-14', '15-19', '20-24', '25-29', '30-34', '35-39', '40-44', '45-49', '50-54', '55-59', '60-64', '65+'];
        function ageBin(age) {
            const a = parseInt(age);
            if (isNaN(a)) return null;
            if (a >= 65) return '65+';
            const idx = Math.floor(a / 5);
            return ageBins[idx] || null;
        }
        const pyramidData = {};
        ageBins.forEach(g => { pyramidData[g] = { male: 0, female: 0 }; });
        viewPersons.forEach(p => {
            const bin = ageBin(p.age);
            if (!bin) return;
            if (String(p.sex) === '1') pyramidData[bin].male++;
            else if (String(p.sex) === '2') pyramidData[bin].female++;
        });
        const pyramidLabels = ageBins;
        const pyramidHasData = Object.values(pyramidData).some(v => v.male > 0 || v.female > 0);

        if (pyramidHasData) {
            makeChart('chart-stat-pyramid', {
                type: 'bar',
                data: {
                    labels: pyramidLabels,
                    datasets: [
                        { label: 'Male', data: pyramidLabels.map(g => -pyramidData[g].male), backgroundColor: '#3498db' },
                        { label: 'Female', data: pyramidLabels.map(g => pyramidData[g].female), backgroundColor: '#e91e8c' }
                    ]
                },
                options: {
                    indexAxis: 'y', responsive: true,
                    scales: {
                        x: { ticks: { callback: v => Math.abs(v) }, title: { display: true, text: 'Population' } },
                        y: { stacked: true }
                    },
                    plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: ctx => ctx.dataset.label + ': ' + Math.abs(ctx.raw) } } }
                }
            });
        }

        // Sex distribution doughnut
        makeChart('chart-stat-sex', {
            type: 'doughnut',
            data: {
                labels: ['Male', 'Female'],
                datasets: [{ data: [maleC, femaleC], backgroundColor: ['#3498db', '#e91e8c'] }]
            },
            options: { responsive: true, plugins: { legend: { position: 'bottom' } } }
        });

        // Households by strata
        const strataData = strataNames.map(n => ({ name: n, households: strataHH[n].length }));
        makeChart('chart-stat-province', {
            type: 'bar',
            data: {
                labels: strataData.map(p => p.name),
                datasets: [{
                    label: 'Households',
                    data: strataData.map(p => p.households),
                    backgroundColor: strataData.map(p => strataColor(p.name))
                }]
            },
            options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
        });

        // Household size distribution
        const sizeDist = {};
        sizeValues.forEach(s => { sizeDist[s] = (sizeDist[s] || 0) + 1; });
        const sizeKeys = Object.keys(sizeDist).map(Number).sort((a, b) => a - b);
        makeChart('chart-stat-hhsize', {
            type: 'bar',
            data: {
                labels: sizeKeys.map(s => s + ' persons'),
                datasets: [{
                    label: 'Households',
                    data: sizeKeys.map(s => sizeDist[s]),
                    backgroundColor: '#2ecc71'
                }]
            },
            options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
        });

        // Strata summary table
        const tbody = el('table-province-summary').querySelector('tbody');
        tbody.innerHTML = '';
        const personsWithStrata = viewPersons.map(p => ({ ...p, strata_label: hhStrataLookup[p.interview_key] || 'Unknown' }));
        const personsByStrata = groupBy(personsWithStrata, 'strata_label');
        strataNames.forEach(name => {
            const hhCount = strataHH[name].length;
            const provPersons = personsByStrata[name] || [];
            const pCount = provPersons.length;
            const male = provPersons.filter(r => String(r.sex) === '1').length;
            const female = provPersons.filter(r => String(r.sex) === '2').length;
            const sr = female > 0 ? ((male / female) * 100).toFixed(0) : '-';
            const avg = hhCount > 0 ? (pCount / hhCount).toFixed(1) : '-';
            const tr = document.createElement('tr');
            tr.innerHTML = '<td>' + esc(name) + '</td><td>' + hhCount + '</td><td>' + pCount + '</td>' +
                '<td>' + avg + '</td><td>' + male + '</td><td>' + female + '</td><td>' + sr + '</td>';
            tbody.appendChild(tr);
        });
    }

    /* ========================================
       10. EA MONITORING
       ======================================== */
    function renderMonitoring() {
        if (!targets || !targets.eas) return;

        // Build actual count per EA from filtered households
        const actualByEA = {};
        viewHH.forEach(h => {
            const ea = String(h.ea);
            actualByEA[ea] = (actualByEA[ea] || 0) + 1;
        });

        const totalTarget = getStrataTargetTotal();
        const totalActual = viewHH.length;
        const pctOverall = totalTarget > 0 ? ((totalActual / totalTarget) * 100).toFixed(1) : '0.0';
        const easStarted = Object.keys(actualByEA).length;
        const easDenom = getStrataEasCount();

        setText('kpi-mon-target', totalTarget.toLocaleString());
        setText('kpi-mon-actual', totalActual);
        setText('kpi-mon-pct', pctOverall + '%');
        setText('kpi-mon-eas-active', easStarted + ' / ' + easDenom);

        // Helper: build progress bar HTML
        function progressHTML(label, actual, target) {
            const pct = target > 0 ? Math.min(100, (actual / target) * 100) : 0;
            const pctText = pct.toFixed(1);
            const barColor = pct >= 100 ? '#2ecc71' : pct >= 50 ? '#f39c12' : '#3498db';
            return '<div class="progress-row">' +
                '<div class="progress-label">' + esc(label) + '</div>' +
                '<div class="progress-bar-wrap">' +
                '<div class="progress-bar-fill" style="width:' + pctText + '%;background:' + barColor + ';"></div>' +
                '</div>' +
                '<div class="progress-stats">' + actual + ' / ' + target + ' (' + pctText + '%)</div>' +
                '</div>';
        }

        // Strata progress (canonical order; targets summed by display label)
        const strataDiv = el('progress-strata');
        if (strataDiv) {
            const strataTargets = targets.strata_targets || {};
            const targetByDisplay = {};
            Object.keys(strataTargets).forEach(k => {
                const label = mapStrataRawToLabel(k);
                targetByDisplay[label] = (targetByDisplay[label] || 0) + strataTargets[k].target;
            });
            const actualByStrataDisplay = {};
            viewHH.forEach(h => {
                const s = h.strata_label;
                actualByStrataDisplay[s] = (actualByStrataDisplay[s] || 0) + 1;
            });
            const keysUnion = new Set([...Object.keys(targetByDisplay), ...Object.keys(actualByStrataDisplay)]);
            const mergedForOrder = {};
            keysUnion.forEach(k => { mergedForOrder[k] = []; });
            const strataKeysMon = orderedStrataKeys(mergedForOrder);
            let html = '';
            strataKeysMon.forEach(label => {
                html += progressHTML(
                    label,
                    actualByStrataDisplay[label] || 0,
                    targetByDisplay[label] || 0
                );
            });
            strataDiv.innerHTML = html;
        }

        // Bar chart: active EAs actual vs target
        const activeEAs = targets.eas.filter(e => actualByEA[String(e.eahies)] && eaRecordMatchesStrataFilter(e));
        if (activeEAs.length > 0) {
            activeEAs.sort((a, b) => String(a.eahies).localeCompare(String(b.eahies)));
            makeChart('chart-mon-ea', {
                type: 'bar',
                data: {
                    labels: activeEAs.map(e => String(e.eahies)),
                    datasets: [
                        {
                            label: 'Target',
                            data: activeEAs.map(e => e.target_sample),
                            backgroundColor: 'rgba(52,152,219,0.3)',
                            borderColor: '#3498db',
                            borderWidth: 1
                        },
                        {
                            label: 'Actual',
                            data: activeEAs.map(e => actualByEA[String(e.eahies)] || 0),
                            backgroundColor: '#2ecc71',
                            borderColor: '#27ae60',
                            borderWidth: 1
                        }
                    ]
                },
                options: {
                    responsive: true,
                    plugins: { legend: { position: 'top' } },
                    scales: { y: { beginAtZero: true } }
                }
            });
        }

        // Doughnut: strata completion (same targets as progress bars)
        const strataTargetsD = targets.strata_targets || {};
        const targetByDisplayD = {};
        Object.keys(strataTargetsD).forEach(k => {
            const label = mapStrataRawToLabel(k);
            targetByDisplayD[label] = (targetByDisplayD[label] || 0) + strataTargetsD[k].target;
        });
        const mergedD = { ...hhByStrata };
        Object.keys(targetByDisplayD).forEach(k => { if (!mergedD[k]) mergedD[k] = []; });
        const strataKeysD = orderedStrataKeys(mergedD);
        const actualD = strataKeysD.map(s => (hhByStrata[s] || []).length);
        const targetD = strataKeysD.map(s => targetByDisplayD[s] || 0);
        makeChart('chart-mon-prov', {
            type: 'doughnut',
            data: {
                labels: strataKeysD,
                datasets: [{
                    data: actualD,
                    backgroundColor: strataKeysD.map(s => strataColor(s))
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: { position: 'bottom' },
                    tooltip: {
                        callbacks: {
                            afterLabel(ctx) {
                                const i = ctx.dataIndex;
                                const t = targetD[i];
                                const a = actualD[i];
                                return t ? (' Target: ' + t + ' | Actual: ' + a) : '';
                            }
                        }
                    }
                }
            }
        });

        // EA detail table — full frame or current stratum
        const tbody = el('table-ea-monitoring').querySelector('tbody');
        tbody.innerHTML = '';
        const easForTable = strataScopeFilter ? targets.eas.filter(eaRecordMatchesStrataFilter) : targets.eas;
        easForTable.forEach(e => {
            const code = String(e.eahies);
            const actual = actualByEA[code] || 0;
            const remaining = Math.max(0, e.target_sample - actual);
            const pct = e.target_sample > 0 ? ((actual / e.target_sample) * 100).toFixed(1) : '0.0';
            const barColor = actual >= e.target_sample ? '#2ecc71' : actual > 0 ? '#f39c12' : '#e0e0e0';
            const tr = document.createElement('tr');
            tr.innerHTML = '<td>' + esc(code) + '</td>' +
                '<td>' + esc(e.province) + '</td>' +
                '<td>' + esc(e.ac_name) + '</td>' +
                '<td>' + esc(mapStrataRawToLabel(e.strata_name)) + '</td>' +
                '<td>' + esc(e.urban_rural) + '</td>' +
                '<td>' + e.target_sample + '</td>' +
                '<td>' + actual + '</td>' +
                '<td>' + remaining + '</td>' +
                '<td><div class="progress-bar-wrap small"><div class="progress-bar-fill" style="width:' +
                Math.min(100, parseFloat(pct)) + '%;background:' + barColor + ';"></div></div> ' + pct + '%</td>';
            tbody.appendChild(tr);
        });
    }

    /* ========================================
       11. WORK PLAN
       ======================================== */
    function renderWorkplan() {
        if (!workplan || !workplan.schedule) return;

        const schedule = workplan.schedule;
        const teamNames = Object.keys(workplan.teams).sort();

        // Only EA assignments (not breaks/training); optional stratum filter
        const scheduleScoped = schedule.filter(workplanRowMatchesStrata);
        const eaEntries = scheduleScoped.filter(s => s.eaid !== null);

        // Unique rounds
        const rounds = [...new Set(eaEntries.map(s => s.round))].sort((a, b) => {
            const na = parseInt(a.replace(/\D/g, '')) || 0;
            const nb = parseInt(b.replace(/\D/g, '')) || 0;
            return na - nb;
        });

        // Build actual count per EA from household data
        const actualByEA = {};
        viewHH.forEach(h => {
            const ea = String(h.ea);
            actualByEA[ea] = (actualByEA[ea] || 0) + 1;
        });

        // Determine current round based on today's date
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        let currentRound = null;
        let currentWeek = null;
        eaEntries.forEach(s => {
            const d = new Date(s.date);
            const weekEnd = new Date(d);
            weekEnd.setDate(weekEnd.getDate() + 6);
            if (today >= d && today <= weekEnd) {
                currentRound = s.round;
                currentWeek = s.week;
            }
        });
        // If no current round, find the closest upcoming
        if (!currentRound) {
            let closest = null;
            eaEntries.forEach(s => {
                const d = new Date(s.date);
                if (d >= today && (!closest || d < closest.d)) {
                    closest = { d, round: s.round, week: s.week };
                }
            });
            if (closest) { currentRound = closest.round; currentWeek = closest.week; }
        }

        // Count EAs behind schedule: planned date is past but EA has no actual data
        let behindCount = 0;
        eaEntries.forEach(s => {
            const d = new Date(s.date);
            const weekEnd = new Date(d);
            weekEnd.setDate(weekEnd.getDate() + 6);
            if (weekEnd < today && (!actualByEA[String(s.eaid)] || actualByEA[String(s.eaid)] === 0)) {
                behindCount++;
            }
        });

        // KPIs
        setText('kpi-wp-rounds', rounds.length);
        setText('kpi-wp-teams', teamNames.length);
        setText('kpi-wp-current', currentRound || 'N/A');
        setText('kpi-wp-behind', behindCount);

        // Round overview badges with tooltips
        var roundOverview = el('round-overview');
        if (roundOverview) {
            // Build per-round summary
            var roundInfo = {};
            rounds.forEach(function (r) {
                var entries = eaEntries.filter(function (s) { return s.round === r; });
                var teams = [...new Set(entries.map(function (s) { return s.team; }))].sort();
                var islands = [...new Set(entries.map(function (s) { return s.island || ''; }).filter(Boolean))].sort();
                var dates = [...new Set(entries.map(function (s) { return s.date; }))].sort();
                var dateStart = dates[0] || '';
                var dateEnd = dates[dates.length - 1] || dateStart;
                var totalEAs = entries.length;
                var completedEAs = entries.filter(function (s) { return actualByEA[String(s.eaid)] > 0; }).length;
                var behindEAs = entries.filter(function (s) {
                    var d = new Date(s.date); var we = new Date(d); we.setDate(we.getDate() + 6);
                    return we < today && !actualByEA[String(s.eaid)];
                }).length;
                roundInfo[r] = { teams: teams, islands: islands, dateStart: dateStart, dateEnd: dateEnd, totalEAs: totalEAs, completedEAs: completedEAs, behindEAs: behindEAs };
            });
            var html = '';
            rounds.forEach(function (r) {
                var info = roundInfo[r];
                var bg = '#bdc3c7'; var fg = '#fff';
                if (r === currentRound) { bg = '#3498db'; }
                else if (info.completedEAs === info.totalEAs && info.totalEAs > 0) { bg = '#2ecc71'; }
                else if (info.behindEAs > 0) { bg = '#e74c3c'; }
                else if (info.completedEAs > 0) { bg = '#f39c12'; }
                var tooltip = r + '\n' +
                    'Date: ' + info.dateStart + (info.dateEnd !== info.dateStart ? ' to ' + info.dateEnd : '') + '\n' +
                    'EAs: ' + info.completedEAs + ' / ' + info.totalEAs + ' completed' +
                    (info.behindEAs > 0 ? ' (' + info.behindEAs + ' behind)' : '') + '\n' +
                    'Teams: ' + info.teams.join(', ') + '\n' +
                    'Islands: ' + info.islands.join(', ');
                html += '<div title="' + esc(tooltip) + '" style="display:inline-flex;align-items:center;justify-content:center;' +
                    'min-width:60px;padding:6px 10px;border-radius:6px;background:' + bg + ';color:' + fg + ';' +
                    'font-size:12px;font-weight:600;cursor:default;text-align:center;">' +
                    esc(r.replace('Round ', 'R')) + '</div>';
            });
            roundOverview.innerHTML = html;
        }

        // Team schedule progress bars
        const teamDiv = el('progress-workplan-teams');
        if (teamDiv) {
            let html = '';
            teamNames.forEach(team => {
                const teamEAs = eaEntries.filter(s => s.team === team);
                const total = teamEAs.length;
                // Count how many past-planned EAs have actual data
                let completed = 0;
                teamEAs.forEach(s => {
                    if (actualByEA[String(s.eaid)] && actualByEA[String(s.eaid)] > 0) {
                        completed++;
                    }
                });
                const pct = total > 0 ? ((completed / total) * 100).toFixed(1) : '0.0';
                const barColor = parseFloat(pct) >= 100 ? '#2ecc71' : parseFloat(pct) >= 25 ? '#f39c12' : '#3498db';
                html += '<div class="progress-row">' +
                    '<div class="progress-label">' + esc(team) + '</div>' +
                    '<div class="progress-bar-wrap">' +
                    '<div class="progress-bar-fill" style="width:' + pct + '%;background:' + barColor + ';"></div>' +
                    '</div>' +
                    '<div class="progress-stats">' + completed + ' / ' + total + ' EAs (' + pct + '%)</div>' +
                    '</div>';
            });
            teamDiv.innerHTML = html;
        }

        // Weekly workload bar chart
        const weekMap = {};
        eaEntries.forEach(s => {
            if (!weekMap[s.week]) weekMap[s.week] = { count: 0, date: s.date, round: s.round };
            weekMap[s.week].count++;
        });
        const weekKeys = Object.keys(weekMap).sort((a, b) => {
            const na = parseInt(a.replace(/\D/g, '')) || 0;
            const nb = parseInt(b.replace(/\D/g, '')) || 0;
            return na - nb;
        });
        const weekColors = weekKeys.map(w => {
            if (weekMap[w].round === currentRound) return '#3498db';
            const d = new Date(weekMap[w].date);
            return d < today ? '#2ecc71' : '#bdc3c7';
        });

        // Build detailed week info for tooltips
        var weekDetail = {};
        eaEntries.forEach(function (s) {
            if (!weekDetail[s.week]) weekDetail[s.week] = { eas: [], teams: new Set(), islands: new Set(), date: s.date, round: s.round };
            weekDetail[s.week].eas.push(s);
            weekDetail[s.week].teams.add(s.team);
            if (s.island) weekDetail[s.week].islands.add(s.island);
        });

        makeChart('chart-wp-weekly', {
            type: 'bar',
            data: {
                labels: weekKeys.map(w => w + (weekMap[w].round ? ' (' + weekMap[w].round + ')' : '')),
                datasets: [{
                    label: 'EAs Scheduled',
                    data: weekKeys.map(w => weekMap[w].count),
                    backgroundColor: weekColors
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            title: function (items) {
                                var w = weekKeys[items[0].dataIndex];
                                var wd = weekDetail[w];
                                return w + ' - ' + (wd ? wd.round : '');
                            },
                            afterTitle: function (items) {
                                var w = weekKeys[items[0].dataIndex];
                                var wd = weekDetail[w];
                                if (!wd) return '';
                                return 'Start: ' + wd.date;
                            },
                            label: function (ctx) {
                                return ctx.raw + ' EAs scheduled';
                            },
                            afterBody: function (items) {
                                var w = weekKeys[items[0].dataIndex];
                                var wd = weekDetail[w];
                                if (!wd) return [];
                                var completed = wd.eas.filter(function (s) { return actualByEA[String(s.eaid)] > 0; }).length;
                                var lines = ['Completed: ' + completed + ' / ' + wd.eas.length];
                                lines.push('Teams: ' + [...wd.teams].sort().join(', '));
                                lines.push('Islands: ' + [...wd.islands].sort().join(', '));
                                return lines;
                            }
                        }
                    }
                },
                scales: { y: { beginAtZero: true, title: { display: true, text: '# EAs' } } }
            }
        });

        // EAs by team doughnut
        makeChart('chart-wp-team-eas', {
            type: 'doughnut',
            data: {
                labels: teamNames,
                datasets: [{
                    data: teamNames.map(t => workplan.teams[t]),
                    backgroundColor: CHART_PALETTE.concat(CHART_PALETTE)
                }]
            },
            options: { responsive: true, plugins: { legend: { position: 'bottom', labels: { font: { size: 10 } } } } }
        });

        // Full schedule table
        const tbody = el('table-workplan').querySelector('tbody');
        tbody.innerHTML = '';
        // Sort: by date, then team
        const sorted = [...scheduleScoped].sort((a, b) => {
            if (a.date !== b.date) return (a.date || '').localeCompare(b.date || '');
            return a.team.localeCompare(b.team);
        });
        sorted.forEach(s => {
            const tr = document.createElement('tr');
            // Determine row status
            let statusBadge = '';
            if (s.eaid === null) {
                // Break or training (national calendar — shown in every stratum filter)
                statusBadge = '<span class="status-badge" style="background:#95a5a6;color:#fff;">' + esc(s.round) + '</span>';
                if (strataScopeFilter) {
                    tr.classList.add('workplan-row-national');
                    tr.title = 'Field calendar entry (not stratum-specific)';
                }
            } else {
                const actual = actualByEA[String(s.eaid)] || 0;
                const d = new Date(s.date);
                const weekEnd = new Date(d);
                weekEnd.setDate(weekEnd.getDate() + 6);
                if (actual > 0) {
                    statusBadge = '<span class="status-badge" style="background:#2ecc71;color:#fff;">Completed (' + actual + ' HH)</span>';
                    tr.style.backgroundColor = '#f0fff0';
                } else if (s.round === currentRound) {
                    statusBadge = '<span class="status-badge" style="background:#3498db;color:#fff;">Current</span>';
                    tr.style.backgroundColor = '#f0f7ff';
                } else if (weekEnd < today) {
                    statusBadge = '<span class="status-badge" style="background:#e74c3c;color:#fff;">Behind</span>';
                    tr.style.backgroundColor = '#fff5f5';
                } else {
                    statusBadge = '<span class="status-badge" style="background:#bdc3c7;color:#fff;">Upcoming</span>';
                }
            }
            tr.innerHTML = '<td>' + esc(s.team) + '</td>' +
                '<td>' + esc(s.date) + '</td>' +
                '<td>' + esc(s.week) + '</td>' +
                '<td>' + esc(s.round) + '</td>' +
                '<td>' + esc(s.strata || '') + '</td>' +
                '<td>' + (s.eaid || '') + '</td>' +
                '<td>' + esc(s.island || '') + '</td>' +
                '<td>' + esc(s.ea_name || '') + '</td>' +
                '<td>' + statusBadge + '</td>';
            tbody.appendChild(tr);
        });
    }

    /* ========================================
       12. FOOD CONSUMPTION
       ======================================== */
    function renderFoodConsumption() {
        // Build household size map from persons
        const hhSizeMap = {};
        viewPersons.forEach(p => {
            hhSizeMap[p.interview_key] = (hhSizeMap[p.interview_key] || 0) + 1;
        });

        // Build food items per household
        const foodPerHH = {};
        const foodIdCounts = {};
        viewFoodData.forEach(r => {
            foodPerHH[r.interview_key] = (foodPerHH[r.interview_key] || 0) + 1;
            foodIdCounts[r.food_id] = (foodIdCounts[r.food_id] || 0) + 1;
        });

        // Cross-tabulate: household size → array of food item counts
        const foodBySize = {};
        const scatterPoints = [];
        const hhKeys = Object.keys(foodPerHH).filter(k => hhSizeMap[k]);
        hhKeys.forEach(k => {
            const size = hhSizeMap[k];
            const count = foodPerHH[k];
            if (!foodBySize[size]) foodBySize[size] = [];
            foodBySize[size].push(count);
            scatterPoints.push({ x: size, y: count });
        });

        // KPIs
        const uniqueFoodIds = Object.keys(foodIdCounts).length;
        setText('kpi-food-hh', hhKeys.length);
        setText('kpi-food-items', viewFoodData.length);
        setText('kpi-food-avg', hhKeys.length ? (viewFoodData.length / hhKeys.length).toFixed(1) : '0');
        setText('kpi-food-unique', uniqueFoodIds);

        // Sizes sorted
        const sizes = Object.keys(foodBySize).map(Number).sort((a, b) => a - b);
        const avgBySize = sizes.map(s => {
            const arr = foodBySize[s];
            return +(arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1);
        });
        const minBySize = sizes.map(s => Math.min(...foodBySize[s]));
        const maxBySize = sizes.map(s => Math.max(...foodBySize[s]));
        const countBySize = sizes.map(s => foodBySize[s].length);
        function median(arr) {
            const s = [...arr].sort((a, b) => a - b);
            const mid = Math.floor(s.length / 2);
            return s.length % 2 ? s[mid] : +((s[mid - 1] + s[mid]) / 2).toFixed(1);
        }
        const medBySize = sizes.map(s => median(foodBySize[s]));

        // Chart 1: Average food items by household size (bar)
        makeChart('chart-food-avg-by-size', {
            type: 'bar',
            data: {
                labels: sizes.map(s => s + ' persons'),
                datasets: [{
                    label: 'Average Food Items',
                    data: avgBySize,
                    backgroundColor: '#3498db',
                    borderRadius: 4
                }, {
                    label: 'Households (n)',
                    data: countBySize,
                    type: 'line',
                    borderColor: '#e67e22',
                    backgroundColor: 'rgba(230,126,34,0.15)',
                    yAxisID: 'y1',
                    pointRadius: 4,
                    tension: 0.3,
                    fill: true
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: { position: 'bottom' },
                    tooltip: {
                        callbacks: {
                            afterLabel: function (ctx) {
                                if (ctx.datasetIndex === 0) {
                                    const i = ctx.dataIndex;
                                    return 'n=' + countBySize[i] + ', min=' + minBySize[i] + ', max=' + maxBySize[i];
                                }
                            }
                        }
                    }
                },
                scales: {
                    y: { beginAtZero: true, title: { display: true, text: 'Avg Food Items' } },
                    y1: { position: 'right', beginAtZero: true, grid: { drawOnChartArea: false }, title: { display: true, text: 'Number of Households' } }
                }
            }
        });

        // Chart 2: Distribution box-style (min/max/median bar chart)
        makeChart('chart-food-dist-by-size', {
            type: 'bar',
            data: {
                labels: sizes.map(s => s + ' pers.'),
                datasets: [{
                    label: 'Minimum',
                    data: minBySize,
                    backgroundColor: '#e74c3c'
                }, {
                    label: 'Median',
                    data: medBySize,
                    backgroundColor: '#f39c12'
                }, {
                    label: 'Maximum',
                    data: maxBySize,
                    backgroundColor: '#2ecc71'
                }]
            },
            options: {
                responsive: true,
                plugins: { legend: { position: 'bottom' } },
                scales: { y: { beginAtZero: true, title: { display: true, text: 'Food Items' } } }
            }
        });

        // Chart 3: Scatter plot — each dot is a household
        makeChart('chart-food-scatter', {
            type: 'scatter',
            data: {
                datasets: [{
                    label: 'Household',
                    data: scatterPoints,
                    backgroundColor: 'rgba(52,152,219,0.5)',
                    pointRadius: 5
                }, {
                    label: 'Average',
                    data: sizes.map((s, i) => ({ x: s, y: avgBySize[i] })),
                    type: 'line',
                    borderColor: '#e74c3c',
                    borderWidth: 2,
                    pointRadius: 6,
                    pointBackgroundColor: '#e74c3c',
                    fill: false,
                    showLine: true,
                    tension: 0.3
                }]
            },
            options: {
                responsive: true,
                plugins: { legend: { position: 'bottom' } },
                scales: {
                    x: {
                        title: { display: true, text: 'Household Size (persons)' },
                        ticks: { stepSize: 1 }
                    },
                    y: { beginAtZero: true, title: { display: true, text: 'Number of Food Items' } }
                }
            }
        });

        // Chart 4: Histogram — distribution of food item counts
        const bins = [0, 10, 15, 20, 25, 30, 35, 40, 45, 50, 100];
        const binLabels = [];
        const binCounts = [];
        for (let i = 0; i < bins.length - 1; i++) {
            binLabels.push(bins[i] + '-' + (bins[i + 1] - 1));
            binCounts.push(0);
        }
        hhKeys.forEach(k => {
            const c = foodPerHH[k];
            for (let i = 0; i < bins.length - 1; i++) {
                if (c >= bins[i] && c < bins[i + 1]) { binCounts[i]++; break; }
            }
        });
        makeChart('chart-food-histogram', {
            type: 'bar',
            data: {
                labels: binLabels,
                datasets: [{
                    label: 'Households',
                    data: binCounts,
                    backgroundColor: '#9b59b6',
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true,
                plugins: { legend: { display: false } },
                scales: {
                    x: { title: { display: true, text: 'Number of Food Items' } },
                    y: { beginAtZero: true, title: { display: true, text: 'Households' } }
                }
            }
        });

        // Chart 5: Top 30 most reported food items (horizontal bar)
        const sorted = Object.entries(foodIdCounts).sort((a, b) => b[1] - a[1]).slice(0, 30);
        makeChart('chart-food-top-items', {
            type: 'bar',
            data: {
                labels: sorted.map(e => foodItemLookup[e[0]] || ('Item ' + e[0])),
                datasets: [{
                    label: 'Households Reporting',
                    data: sorted.map(e => e[1]),
                    backgroundColor: CHART_PALETTE.concat(CHART_PALETTE).slice(0, 30),
                    borderRadius: 3
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                plugins: { legend: { display: false } },
                scales: {
                    x: { beginAtZero: true, title: { display: true, text: 'Number of Households' } }
                }
            }
        });

        // Detail table
        const tbody = el('table-food-detail').querySelector('tbody');
        tbody.innerHTML = '';
        sizes.forEach((s, i) => {
            const tr = document.createElement('tr');
            tr.innerHTML = '<td>' + s + '</td><td>' + countBySize[i] + '</td><td>' +
                avgBySize[i] + '</td><td>' + minBySize[i] + '</td><td>' +
                maxBySize[i] + '</td><td>' + medBySize[i] + '</td>';
            tbody.appendChild(tr);
        });
    }

    /* ========================================
       13. HOUSEHOLD LISTING PROGRESS
       ======================================== */
    function renderListing() {
        if (!viewListingData || !viewListingData.length) {
            setText('kpi-list-total', '0');
            setText('kpi-list-completed', '0');
            setText('kpi-list-pending', '0');
            setText('kpi-list-photos', '0');
            return;
        }

        const total = viewListingData.length;
        const completed = viewListingData.filter(r => r.has_listing).length;
        const pending = total - completed;
        const totalPhotos = viewListingData.reduce((s, r) => s + r.listing_photos, 0);

        setText('kpi-list-total', total);
        setText('kpi-list-completed', completed);
        setText('kpi-list-pending', pending);
        setText('kpi-list-photos', totalPhotos);

        // By team
        const byTeam = groupBy(viewListingData, 'team_id');
        const teamIds = Object.keys(byTeam).sort();
        const teamLabels = teamIds.map(t => tName(t));
        const teamCompleted = teamIds.map(t => byTeam[t].filter(r => r.has_listing).length);
        const teamPending = teamIds.map(t => byTeam[t].filter(r => !r.has_listing).length);

        makeChart('chart-list-team', {
            type: 'bar',
            data: {
                labels: teamLabels,
                datasets: [
                    { label: 'Completed', data: teamCompleted, backgroundColor: '#2ecc71' },
                    { label: 'Pending', data: teamPending, backgroundColor: '#e74c3c' }
                ]
            },
            options: { responsive: true, plugins: { legend: { position: 'bottom' } }, scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true } } }
        });

        // Pie
        makeChart('chart-list-pie', {
            type: 'doughnut',
            data: {
                labels: ['Completed', 'Pending'],
                datasets: [{ data: [completed, pending], backgroundColor: ['#2ecc71', '#e74c3c'] }]
            },
            options: { responsive: true, plugins: { legend: { position: 'bottom' } } }
        });

        // By strata
        const byStrataList = {};
        viewListingData.forEach(r => {
            const s = hhStrataLookup[r.interview_key] || 'Unknown';
            if (!byStrataList[s]) byStrataList[s] = [];
            byStrataList[s].push(r);
        });
        const strataKeysList = orderedStrataKeys(byStrataList);
        makeChart('chart-list-province', {
            type: 'bar',
            data: {
                labels: strataKeysList,
                datasets: [
                    { label: 'Completed', data: strataKeysList.map(p => byStrataList[p].filter(r => r.has_listing).length), backgroundColor: '#2ecc71' },
                    { label: 'Pending', data: strataKeysList.map(p => byStrataList[p].filter(r => !r.has_listing).length), backgroundColor: '#e74c3c' }
                ]
            },
            options: { responsive: true, plugins: { legend: { position: 'bottom' } }, scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true } } }
        });

        // Photos distribution
        const withPhotos = viewListingData.filter(r => r.listing_photos > 0);
        const photoDist = {};
        withPhotos.forEach(r => { photoDist[r.listing_photos] = (photoDist[r.listing_photos] || 0) + 1; });
        const photoKeys = Object.keys(photoDist).map(Number).sort((a, b) => a - b);
        makeChart('chart-list-photos', {
            type: 'bar',
            data: {
                labels: photoKeys.map(k => k + ' photos'),
                datasets: [{ label: 'Households', data: photoKeys.map(k => photoDist[k]), backgroundColor: '#3498db' }]
            },
            options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
        });

        // Team progress bars
        var progDiv = el('progress-listing-teams');
        if (progDiv) {
            var html = '';
            teamIds.forEach(function (t) {
                var rows = byTeam[t];
                var done = rows.filter(function (r) { return r.has_listing; }).length;
                var pct = rows.length > 0 ? ((done / rows.length) * 100).toFixed(1) : '0.0';
                var barColor = parseFloat(pct) >= 100 ? '#2ecc71' : parseFloat(pct) >= 25 ? '#f39c12' : '#3498db';
                html += '<div class="progress-row">' +
                    '<div class="progress-label">' + esc(tName(t)) + '</div>' +
                    '<div class="progress-bar-wrap">' +
                    '<div class="progress-bar-fill" style="width:' + pct + '%;background:' + barColor + ';"></div>' +
                    '</div>' +
                    '<div class="progress-stats">' + done + ' / ' + rows.length + ' (' + pct + '%)</div></div>';
            });
            progDiv.innerHTML = html;
        }

        // Detail table
        var tbody = el('table-listing').querySelector('tbody');
        tbody.innerHTML = '';
        viewListingData.forEach(function (r) {
            var tr = document.createElement('tr');
            var badge = r.has_listing
                ? '<span class="status-badge" style="background:#2ecc71;color:#fff;">Done</span>'
                : '<span class="status-badge" style="background:#e74c3c;color:#fff;">Pending</span>';
            if (r.has_listing) tr.style.backgroundColor = '#f0fff0';
            tr.innerHTML = '<td>' + esc(tName(r.team_id)) + '</td>' +
                '<td>' + esc(hhStrataLookup[r.interview_key] || 'Unknown') + '</td>' +
                '<td>' + esc(r.ea) + '</td>' +
                '<td>' + esc(r.interview_key) + '</td>' +
                '<td>' + r.listing_pages + '</td>' +
                '<td>' + r.listing_photos + '</td>' +
                '<td>' + badge + '</td>';
            tbody.appendChild(tr);
        });
    }

    /* ========================================
       14. MARKET SURVEY PROGRESS
       ======================================== */
    function renderMarket() {
        if (!marketData || !marketData.outlets) return;

        var outlets = viewMarketData.outlets;
        var hhProgress = viewMarketData.hh_progress || [];
        var categories = viewMarketData.categories || [];

        var total = hhProgress.length || viewHH.length;
        var completed = hhProgress.filter(function (r) { return r.has_market; }).length;
        var pending = total - completed;

        setText('kpi-mkt-total', total);
        setText('kpi-mkt-completed', completed);
        setText('kpi-mkt-pending', pending);
        setText('kpi-mkt-outlets', outlets.length);

        // By team
        var byTeam = groupBy(hhProgress, 'team_id');
        var teamIds = Object.keys(byTeam).sort();
        var teamLabels = teamIds.map(function (t) { return tName(t); });

        makeChart('chart-mkt-team', {
            type: 'bar',
            data: {
                labels: teamLabels,
                datasets: [
                    { label: 'Completed', data: teamIds.map(function (t) { return byTeam[t].filter(function (r) { return r.has_market; }).length; }), backgroundColor: '#2ecc71' },
                    { label: 'Pending', data: teamIds.map(function (t) { return byTeam[t].filter(function (r) { return !r.has_market; }).length; }), backgroundColor: '#e74c3c' }
                ]
            },
            options: { responsive: true, plugins: { legend: { position: 'bottom' } }, scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true } } }
        });

        // Pie
        makeChart('chart-mkt-pie', {
            type: 'doughnut',
            data: {
                labels: ['Completed', 'Pending'],
                datasets: [{ data: [completed, pending], backgroundColor: ['#2ecc71', '#e74c3c'] }]
            },
            options: { responsive: true, plugins: { legend: { position: 'bottom' } } }
        });

        // Product availability across outlets
        var catLabels = categories.map(function (c) { return c.charAt(0).toUpperCase() + c.slice(1); });
        var catAvail = categories.map(function (cat) {
            return outlets.filter(function (o) { return o.products[cat] && o.products[cat].available; }).length;
        });
        makeChart('chart-mkt-products', {
            type: 'bar',
            data: {
                labels: catLabels,
                datasets: [{ label: 'Outlets Selling', data: catAvail, backgroundColor: CHART_PALETTE.slice(0, categories.length) }]
            },
            options: {
                responsive: true, plugins: {
                    legend: { display: false },
                    tooltip: { callbacks: { label: function (ctx) { return ctx.raw + ' / ' + outlets.length + ' outlets (' + (outlets.length > 0 ? (ctx.raw / outlets.length * 100).toFixed(0) : 0) + '%)'; } } }
                },
                scales: { y: { beginAtZero: true, title: { display: true, text: '# Outlets' } } }
            }
        });

        // By strata
        var byStrataMkt = {};
        hhProgress.forEach(function (r) {
            var s = hhStrataLookup[r.interview_key] || 'Unknown';
            if (!byStrataMkt[s]) byStrataMkt[s] = [];
            byStrataMkt[s].push(r);
        });
        var strataKeysMkt = orderedStrataKeys(byStrataMkt);
        makeChart('chart-mkt-province', {
            type: 'bar',
            data: {
                labels: strataKeysMkt,
                datasets: [
                    { label: 'Completed', data: strataKeysMkt.map(function (p) { return byStrataMkt[p].filter(function (r) { return r.has_market; }).length; }), backgroundColor: '#2ecc71' },
                    { label: 'Pending', data: strataKeysMkt.map(function (p) { return byStrataMkt[p].filter(function (r) { return !r.has_market; }).length; }), backgroundColor: '#e74c3c' }
                ]
            },
            options: { responsive: true, plugins: { legend: { position: 'bottom' } }, scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true } } }
        });

        // Average items per category per outlet
        var avgItems = categories.map(function (cat) {
            var relevant = outlets.filter(function (o) { return o.products[cat] && o.products[cat].available; });
            if (relevant.length === 0) return 0;
            var sum = relevant.reduce(function (s, o) { return s + o.products[cat].items; }, 0);
            return parseFloat((sum / relevant.length).toFixed(1));
        });
        makeChart('chart-mkt-items', {
            type: 'bar',
            data: {
                labels: catLabels,
                datasets: [{ label: 'Avg Items', data: avgItems, backgroundColor: CHART_PALETTE.slice(0, categories.length) }]
            },
            options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, title: { display: true, text: 'Avg Items per Outlet' } } } }
        });

        // Outlets per HH distribution
        var outletDist = {};
        hhProgress.filter(function (r) { return r.has_market; }).forEach(function (r) {
            outletDist[r.outlet_count] = (outletDist[r.outlet_count] || 0) + 1;
        });
        var outletKeys = Object.keys(outletDist).map(Number).sort(function (a, b) { return a - b; });
        makeChart('chart-mkt-outlets-dist', {
            type: 'bar',
            data: {
                labels: outletKeys.map(function (k) { return k + ' outlet' + (k !== 1 ? 's' : ''); }),
                datasets: [{ label: 'Households', data: outletKeys.map(function (k) { return outletDist[k]; }), backgroundColor: '#3498db' }]
            },
            options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
        });

        // Team progress bars
        var progDiv = el('progress-market-teams');
        if (progDiv) {
            var html = '';
            teamIds.forEach(function (t) {
                var rows = byTeam[t];
                var done = rows.filter(function (r) { return r.has_market; }).length;
                var pct = rows.length > 0 ? ((done / rows.length) * 100).toFixed(1) : '0.0';
                var barColor = parseFloat(pct) >= 100 ? '#2ecc71' : parseFloat(pct) >= 25 ? '#f39c12' : '#3498db';
                html += '<div class="progress-row">' +
                    '<div class="progress-label">' + esc(tName(t)) + '</div>' +
                    '<div class="progress-bar-wrap">' +
                    '<div class="progress-bar-fill" style="width:' + pct + '%;background:' + barColor + ';"></div>' +
                    '</div>' +
                    '<div class="progress-stats">' + done + ' / ' + rows.length + ' (' + pct + '%)</div></div>';
            });
            progDiv.innerHTML = html;
        }

        // Outlet detail table
        var tbody = el('table-market').querySelector('tbody');
        tbody.innerHTML = '';
        outlets.forEach(function (o) {
            var tr = document.createElement('tr');
            var cells = '<td>' + esc(tName(o.team_id)) + '</td>' +
                '<td>' + esc(hhStrataLookup[o.interview_key] || o.province) + '</td>' +
                '<td>' + esc(o.outlet_name) + '</td>';
            categories.forEach(function (cat) {
                var p = o.products[cat];
                if (p && p.available) {
                    cells += '<td style="text-align:center;"><span style="color:#2ecc71;font-weight:700;">&#10003;</span> ' + p.items + '</td>';
                } else {
                    cells += '<td style="text-align:center;color:#ccc;">&mdash;</td>';
                }
            });
            tr.innerHTML = cells;
            tbody.appendChild(tr);
        });
    }

    /* ========================================
       15. HOUSEHOLD ASSETS (unreported gap + threshold)
       ======================================== */
    function renderAssets() {
        if (!viewAssetsData || !viewAssetsData.length) {
            setText('kpi-asset-total', '0');
            setText('kpi-asset-max-gap', '—');
            setText('kpi-asset-avg-owned', '—');
            setText('kpi-asset-flagged', '—');
            return;
        }

        const n = viewAssetsData.length;
        const gaps = viewAssetsData.map(a => Number(a.unreported_asset_gap) || 0);
        const maxGap = Math.max(...gaps, 0);
        const sumOwned = viewAssetsData.reduce((s, a) => s + (Number(a.owned_asset_types) || 0), 0);
        const avgOwned = n > 0 ? (sumOwned / n).toFixed(1) : '0';

        setText('kpi-asset-total', n);
        setText('kpi-asset-max-gap', maxGap);
        setText('kpi-asset-avg-owned', avgOwned);

        const binLabels = ['0', '1', '2', '3', '4', '5+'];
        const binCounts = [0, 0, 0, 0, 0, 0];
        gaps.forEach(g => {
            if (g <= 0) binCounts[0]++;
            else if (g === 1) binCounts[1]++;
            else if (g === 2) binCounts[2]++;
            else if (g === 3) binCounts[3]++;
            else if (g === 4) binCounts[4]++;
            else binCounts[5]++;
        });

        makeChart('chart-asset-gap-hist', {
            type: 'bar',
            data: {
                labels: binLabels.map(b => 'Gap ' + b),
                datasets: [{ label: 'Households', data: binCounts, backgroundColor: '#3498db', borderRadius: 4 }]
            },
            options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, title: { display: true, text: 'Households' } } } }
        });

        const atZero = binCounts[0];
        const aboveZero = n - atZero;
        makeChart('chart-asset-gap-pie', {
            type: 'doughnut',
            data: {
                labels: ['Gap = 0', 'Gap ≥ 1'],
                datasets: [{ data: [atZero, aboveZero], backgroundColor: ['#2ecc71', '#e67e22'] }]
            },
            options: { responsive: true, plugins: { legend: { position: 'bottom' } } }
        });

        const inp = el('asset-gap-threshold');
        function refreshAssetTable() {
            let thr = parseInt(inp.value, 10);
            if (isNaN(thr) || thr < 0) thr = 0;
            const flagged = viewAssetsData.filter(a => (Number(a.unreported_asset_gap) || 0) >= thr);
            flagged.sort((a, b) => (Number(b.unreported_asset_gap) || 0) - (Number(a.unreported_asset_gap) || 0));
            setText('kpi-asset-flagged', flagged.length);

            const tbody = el('table-assets').querySelector('tbody');
            tbody.innerHTML = '';
            flagged.forEach(r => {
                const tr = document.createElement('tr');
                const gap = Number(r.unreported_asset_gap) || 0;
                if (gap > 0) tr.style.backgroundColor = '#fff8f0';
                tr.innerHTML = '<td>' + esc(tName(r.team_id)) + '</td>' +
                    '<td>' + esc(hhStrataLookup[r.interview_key] || r.province) + '</td>' +
                    '<td>' + esc(r.ea) + '</td>' +
                    '<td>' + esc(r.interview_key) + '</td>' +
                    '<td>' + (Number(r.owned_asset_types) || 0) + '</td>' +
                    '<td>' + (Number(r.roster_asset_types) || 0) + '</td>' +
                    '<td>' + (Number(r.asset_roster_lines) || 0) + '</td>' +
                    '<td><strong>' + gap + '</strong></td>' +
                    '<td><span class="status-badge status-' + esc(String(r.interview_status)) + '">' + statusLabel(r.interview_status) + '</span></td>';
                tbody.appendChild(tr);
            });
        }
        if (inp && !inp.dataset.wired) {
            inp.dataset.wired = '1';
            inp.addEventListener('input', refreshAssetTable);
            inp.addEventListener('change', refreshAssetTable);
        }
        refreshAssetTable();
    }

    /* ========================================
       16. UNDERREPORTING (assets & food vs regional/HH rules, by interviewer)
       ======================================== */
    function normalizeInterviewerId(raw) {
        const s = String(raw == null ? '' : raw).trim();
        if (!s || s === '-999999999' || s === '(no id)') return 'Unknown';
        return s;
    }

    let urRefLinePluginRegistered = false;
    function registerUnderreportingRefLinePlugin() {
        if (urRefLinePluginRegistered) return;
        urRefLinePluginRegistered = true;
        Chart.register({
            id: 'urRefLine',
            afterDatasetsDraw(chart) {
                const opts = chart.options.plugins && chart.options.plugins.urRefLine;
                if (!opts || opts.xPercent == null) return;
                const xVal = Number(opts.xPercent);
                if (isNaN(xVal) || xVal < 0) return;
                const { ctx, chartArea, scales } = chart;
                const xScale = scales.x;
                if (!xScale) return;
                const x = xScale.getPixelForValue(xVal);
                if (!isFinite(x)) return;
                ctx.save();
                ctx.strokeStyle = opts.color || 'rgba(231, 76, 60, 0.88)';
                ctx.lineWidth = 2;
                ctx.setLineDash([6, 4]);
                ctx.beginPath();
                ctx.moveTo(x, chartArea.top);
                ctx.lineTo(x, chartArea.bottom);
                ctx.stroke();
                ctx.setLineDash([]);
                ctx.fillStyle = opts.color || 'rgba(231, 76, 60, 0.88)';
                ctx.font = '600 11px Segoe UI, system-ui, sans-serif';
                ctx.textAlign = 'left';
                ctx.fillText(String(xVal) + '%', Math.min(x + 4, chartArea.right - 40), chartArea.top + 14);
                ctx.restore();
            }
        });
    }

    function computeUnderreportingFlags() {
        const eaUr = {};
        if (targets && targets.eas) {
            targets.eas.forEach(e => { eaUr[String(e.eahies)] = e.urban_rural; });
        }
        const assetByKey = {};
        (viewAssetsData || []).forEach(a => { assetByKey[a.interview_key] = a; });
        const foodIdsByKey = {};
        viewFoodData.forEach(r => {
            const k = r.interview_key;
            if (!foodIdsByKey[k]) foodIdsByKey[k] = new Set();
            foodIdsByKey[k].add(String(r.food_id));
        });
        const byInt = {};
        let flagA = 0;
        let flagF = 0;
        let n = 0;
        viewHH.forEach(h => {
            const k = h.interview_key;
            const ur = eaUr[String(h.ea)] || 'R';
            const isUrban = ur === 'U';
            const hhSize = (personsByHH[k] || []).length;
            const small = hhSize <= 5;
            const acount = assetByKey[k] ? (Number(assetByKey[k].roster_asset_types) || 0) : 0;
            const assetCut = isUrban ? 6 : 3;
            const fAsset = acount < assetCut;
            /* 7-day recall: unique food_id count; cutoffs by EA urban/rural × HH size (<=5 vs >5). */
            const foodCut = isUrban ? (small ? 25 : 30) : (small ? 20 : 25);
            const nFood = foodIdsByKey[k] ? foodIdsByKey[k].size : 0;
            const fFood = nFood < foodCut;
            if (fAsset) flagA++;
            if (fFood) flagF++;
            n++;
            const intv = normalizeInterviewerId(h.interviewer_id);
            if (!byInt[intv]) byInt[intv] = { n: 0, a: 0, f: 0, team_id: h.team_id };
            byInt[intv].n++;
            if (fAsset) byInt[intv].a++;
            if (fFood) byInt[intv].f++;
            if (h.team_id) byInt[intv].team_id = h.team_id;
        });
        const rows = Object.keys(byInt).map(id => {
            const v = byInt[id];
            const pctA = v.n ? (100 * v.a / v.n) : 0;
            const pctF = v.n ? (100 * v.f / v.n) : 0;
            const avgPct = (pctA + pctF) / 2;
            return {
                interviewer_id: id,
                team_id: v.team_id,
                n: v.n,
                a: v.a,
                f: v.f,
                pct_assets: pctA,
                pct_food: pctF,
                avg_pct: avgPct
            };
        });
        rows.sort((a, b) => {
            if (b.avg_pct !== a.avg_pct) return b.avg_pct - a.avg_pct;
            if (b.n !== a.n) return b.n - a.n;
            return String(a.interviewer_id).localeCompare(String(b.interviewer_id));
        });
        return {
            rows,
            overall: {
                n,
                flagA,
                flagF,
                pctA: n ? (100 * flagA / n) : 0,
                pctF: n ? (100 * flagF / n) : 0,
                interviewerCount: rows.length
            }
        };
    }

    function renderUnderreporting() {
        registerUnderreportingRefLinePlugin();
        const { rows, overall } = computeUnderreportingFlags();
        setText('kpi-ur-assets-pct', overall.n ? (overall.pctA.toFixed(1) + '%') : '—');
        setText('kpi-ur-food-pct', overall.n ? (overall.pctF.toFixed(1) + '%') : '—');
        setText('kpi-ur-interviewers', overall.interviewerCount);

        function drawUrCharts() {
            const { rows: urRows } = computeUnderreportingFlags();
            const topSel = el('ur-chart-topn');
            const refInp = el('ur-ref-line');
            let topN = parseInt(topSel && topSel.value, 10);
            if (isNaN(topN) || topN < 1) topN = 15;
            let refPct = parseFloat(refInp && refInp.value);
            if (isNaN(refPct)) refPct = 50;
            refPct = Math.max(0, Math.min(100, refPct));

            const slice = topN >= 9999 ? urRows : urRows.slice(0, topN);
            const labels = slice.map(r => r.interviewer_id);
            const pctA = slice.map(r => +r.pct_assets.toFixed(1));
            const pctF = slice.map(r => +r.pct_food.toFixed(1));
            const refActive = refInp && refInp.value !== '' && !isNaN(parseFloat(refInp.value));

            const barColor = (vals, hi, lo) => vals.map(v => (refActive && v >= refPct) ? hi : lo);

            function urBarOptions(xTitle, tooltipLabelPrefix) {
                return {
                    indexAxis: 'y',
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false },
                        urRefLine: refActive ? { xPercent: refPct, color: 'rgba(231, 76, 60, 0.88)' } : { xPercent: null },
                        tooltip: {
                            callbacks: {
                                title(tooltipItems) {
                                    const i = tooltipItems[0].dataIndex;
                                    const r = slice[i];
                                    return r ? ('Interviewer ' + r.interviewer_id) : '';
                                },
                                label(ctx) {
                                    return ' ' + tooltipLabelPrefix + ctx.parsed.x + '%';
                                },
                                afterLabel(ctx) {
                                    const r = slice[ctx.dataIndex];
                                    return r ? ('Interviews in scope: ' + r.n) : '';
                                }
                            }
                        }
                    },
                    scales: {
                        x: {
                            min: 0,
                            max: 100,
                            title: { display: true, text: xTitle },
                            ticks: { stepSize: 10, font: { size: 11 } }
                        },
                        y: {
                            ticks: {
                                autoSkip: false,
                                font: { size: 12, weight: '500' },
                                callback(value) {
                                    const s = value == null ? '' : String(value);
                                    return s.length > 16 ? s.slice(0, 14) + '…' : s;
                                }
                            }
                        }
                    }
                };
            }

            makeChart('chart-underreport-assets-intv', {
                type: 'bar',
                data: {
                    labels,
                    datasets: [{
                        label: '% interviews flagged (assets)',
                        data: pctA,
                        backgroundColor: barColor(pctA, '#c0392b', '#e67e22'),
                        borderRadius: 4,
                        maxBarThickness: 26
                    }]
                },
                options: urBarOptions(
                    '% of this interviewer’s interviews flagged (possible underreported assets)',
                    'Possible underreported assets: '
                )
            });

            makeChart('chart-underreport-food-intv', {
                type: 'bar',
                data: {
                    labels,
                    datasets: [{
                        label: '% interviews flagged (consumption)',
                        data: pctF,
                        backgroundColor: barColor(pctF, '#1f6fad', '#3498db'),
                        borderRadius: 4,
                        maxBarThickness: 26
                    }]
                },
                options: urBarOptions(
                    '% of this interviewer’s interviews flagged (possible underreported consumption)',
                    'Possible underreported consumption: '
                )
            });

            const chartH = Math.min(2200, Math.max(280, slice.length * 34));
            ['chart-underreport-assets-intv', 'chart-underreport-food-intv'].forEach(id => {
                const c = el(id);
                if (c && c.parentElement) c.parentElement.style.height = chartH + 'px';
            });
        }

        redrawUnderreportCharts = drawUrCharts;
        drawUrCharts();

        const topSel = el('ur-chart-topn');
        const refInp = el('ur-ref-line');
        if (topSel && !topSel.dataset.wired) {
            topSel.dataset.wired = '1';
            topSel.addEventListener('change', () => redrawUnderreportCharts());
        }
        if (refInp && !refInp.dataset.wired) {
            refInp.dataset.wired = '1';
            refInp.addEventListener('input', () => redrawUnderreportCharts());
            refInp.addEventListener('change', () => redrawUnderreportCharts());
        }

        const tbody = el('table-underreporting').querySelector('tbody');
        tbody.innerHTML = '';
        rows.forEach(r => {
            const tr = document.createElement('tr');
            tr.innerHTML = '<td>' + esc(r.interviewer_id) + '</td>' +
                '<td>' + esc(tName(r.team_id)) + '</td>' +
                '<td>' + r.n + '</td>' +
                '<td><strong>' + r.avg_pct.toFixed(1) + '%</strong></td>' +
                '<td>' + r.a + '</td>' +
                '<td>' + r.pct_assets.toFixed(1) + '%</td>' +
                '<td>' + r.f + '</td>' +
                '<td>' + r.pct_food.toFixed(1) + '%</td>';
            tbody.appendChild(tr);
        });
    }

    /* ---------- XSS protection ---------- */
    function esc(str) {
        if (str == null) return '';
        const d = document.createElement('div');
        d.textContent = String(str);
        return d.innerHTML;
    }

    /* ---------- cover page ---------- */
    const coverPage = el('coverPage');
    const coverBtn = el('coverEnter');
    if (coverPage && coverBtn) {
        coverBtn.addEventListener('click', () => {
            coverPage.classList.add('hidden');
        });
    }

    /* ---------- initial render ---------- */
    renderTab('surveys');

    /* ---------- remove loading overlay if present ---------- */
    const overlay = document.querySelector('.loading-overlay');
    if (overlay) overlay.remove();

})();
