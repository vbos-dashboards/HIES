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
    let summary, households, persons, lookup;
    try {
        async function loadJSON(path) {
            const r = await fetch(path);
            if (!r.ok) throw new Error(path + ' → HTTP ' + r.status);
            return r.json();
        }
        [summary, households, persons, lookup] = await Promise.all([
            loadJSON('data/summary.json'),
            loadJSON('data/households.json'),
            loadJSON('data/persons.json'),
            loadJSON('data/lookup.json')
        ]);
    } catch (err) {
        showError('Could not load dashboard data.', String(err));
        return;
    }

    /* ---------- enrich households from lookup ---------- */
    const eaLookup = (lookup && lookup.ea) || {};
    const villageLookup = (lookup && lookup.village) || {};
    const acLookup = (lookup && lookup.area_council) || {};

    households.forEach(h => {
        h.interview_status = String(h.interview_status);
        const info = eaLookup[h.ea] || {};
        h.island_name = info.island || '';
        h.ac_name = info.ac_name || acLookup[h.area_council] || '';
        h.team_name = info.team_name || '';
        h.village_name = villageLookup[h.village] || '';
    });
    const hhByStatus = groupBy(households, 'interview_status');
    const hhByTeam = groupBy(households, 'team_id');
    const hhByInterviewer = groupBy(households, 'interviewer_id');
    const hhByProvince = groupBy(households, 'province_name');
    const hhByDate = groupBy(households, 'interview_date');
    const dates = Object.keys(hhByDate).sort();
    const personsByHH = groupBy(persons, 'interview_key');

    const statusCodes = Object.keys(hhByStatus).sort();

    /* ---------- chart registry (for cleanup) ---------- */
    const charts = {};
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
        statistics: 'Survey Statistics'
    };

    const navItems = document.querySelectorAll('.nav-item');
    const tabs = document.querySelectorAll('.tab-content');
    const rendered = {};

    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const tab = item.dataset.tab;
            navItems.forEach(n => n.classList.remove('active'));
            item.classList.add('active');
            tabs.forEach(t => t.classList.remove('active'));
            const target = el('tab-' + tab);
            if (target) target.classList.add('active');
            setText('pageTitle', TAB_TITLES[tab] || tab);
            renderTab(tab);
            // close mobile sidebar
            el('sidebar').classList.remove('open');
        });
    });

    el('menuToggle').addEventListener('click', () => {
        el('sidebar').classList.toggle('open');
    });

    /* ---------- render dispatcher ---------- */
    function renderTab(tab) {
        if (rendered[tab]) return;
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
        }
    }

    /* ========================================
       1. SURVEYS AND STATUSES
       ======================================== */
    function renderSurveys() {
        setText('kpi-total-interviews', households.length);
        setText('kpi-completed', (hhByStatus['100'] || []).length);
        setText('kpi-approved-sv', (hhByStatus['120'] || []).length);
        setText('kpi-approved-hq', (hhByStatus['130'] || []).length);

        // bar chart
        makeChart('chart-status-bar', {
            type: 'bar',
            data: {
                labels: statusCodes.map(statusLabel),
                datasets: [{
                    label: 'Interviews',
                    data: statusCodes.map(c => (hhByStatus[c] || []).length),
                    backgroundColor: statusCodes.map(c => STATUS_COLORS[c] || '#95a5a6')
                }]
            },
            options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
        });

        // pie chart
        makeChart('chart-status-pie', {
            type: 'doughnut',
            data: {
                labels: statusCodes.map(statusLabel),
                datasets: [{
                    data: statusCodes.map(c => (hhByStatus[c] || []).length),
                    backgroundColor: statusCodes.map(c => STATUS_COLORS[c] || '#95a5a6')
                }]
            },
            options: { responsive: true, plugins: { legend: { position: 'bottom' } } }
        });

        // table
        const tbody = el('table-surveys').querySelector('tbody');
        households.forEach(h => {
            const tr = document.createElement('tr');
            tr.innerHTML = `<td>${esc(h.interview_key)}</td><td>${esc(h.province_name)}</td><td>${esc(h.island_name)}</td>` +
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
        const teamIds = Object.keys(hhByTeam).sort();
        const numTeams = teamIds.length;
        const avgPerTeam = (households.length / numTeams).toFixed(1);
        const topTeam = sortedEntries(Object.fromEntries(teamIds.map(t => [t, hhByTeam[t].length])))[0];
        const rejectedCount = ((hhByStatus['65'] || []).length) + ((hhByStatus['125'] || []).length);

        // Build team name lookup from enriched data
        function tName(id) { return teamNameMap[id] || ('Team ' + id); }

        setText('kpi-num-teams', numTeams);
        setText('kpi-avg-per-team', avgPerTeam);
        setText('kpi-top-team', tName(topTeam[0]));
        setText('kpi-rejected-count', rejectedCount);

        // stacked bar: teams × status
        makeChart('chart-team-status', {
            type: 'bar',
            data: {
                labels: teamIds.map(tName),
                datasets: statusCodes.map(sc => ({
                    label: statusLabel(sc),
                    data: teamIds.map(t => (hhByTeam[t] || []).filter(h => h.interview_status === sc).length),
                    backgroundColor: STATUS_COLORS[sc] || '#95a5a6'
                }))
            },
            options: { responsive: true, scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true } }, plugins: { legend: { position: 'bottom' } } }
        });

        // pie team size
        makeChart('chart-team-size', {
            type: 'pie',
            data: {
                labels: teamIds.map(tName),
                datasets: [{
                    data: teamIds.map(t => hhByTeam[t].length),
                    backgroundColor: CHART_PALETTE
                }]
            },
            options: { responsive: true, plugins: { legend: { position: 'bottom' } } }
        });

        // table
        const tbody = el('table-teams').querySelector('tbody');
        teamIds.forEach(t => {
            const rows = hhByTeam[t];
            const intvs = [...new Set(rows.map(r => r.interviewer_id))].length;
            const tr = document.createElement('tr');
            tr.innerHTML = `<td>${esc(tName(t))}</td><td>${intvs}</td><td>${rows.length}</td>` +
                `<td>${rows.filter(r => r.interview_status === '100').length}</td>` +
                `<td>${rows.filter(r => r.interview_status === '120').length}</td>` +
                `<td>${rows.filter(r => r.interview_status === '130').length}</td>` +
                `<td>${rows.filter(r => r.interview_status === '65' || r.interview_status === '125').length}</td>`;
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
        const approvalRate = ((approvedTotal / households.length) * 100).toFixed(1) + '%';
        const rejRate = ((rejTotal / households.length) * 100).toFixed(1) + '%';
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
            { label: 'Total', val: households.length },
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
        const avgPerIntv = (households.length / numIntv).toFixed(1);
        const topIntv = sortedEntries(Object.fromEntries(intvIds.map(i => [i, hhByInterviewer[i].length])))[0];
        const provsCovered = [...new Set(households.map(h => h.province_name))].length;

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
        intvIds.forEach(i => {
            const rows = hhByInterviewer[i];
            const team = rows[0].team_id;
            const provs = [...new Set(rows.map(r => r.province_name))].join(', ');
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
    function renderMap() {
        const withGPS = households.filter(h => h.latitude && h.longitude && h.latitude !== '' && h.longitude !== '');
        const eas = [...new Set(households.map(h => h.ea))].length;
        const provs = [...new Set(households.map(h => h.province_name))].length;

        setText('kpi-map-hh', withGPS.length);
        setText('kpi-map-eas', eas);
        setText('kpi-map-provinces', provs);
        setText('kpi-map-gps', withGPS.length);

        // Leaflet map
        const map = L.map('survey-map').setView([-16.5, 168], 6);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors', maxZoom: 18
        }).addTo(map);

        withGPS.forEach(h => {
            const lat = parseFloat(h.latitude);
            const lng = parseFloat(h.longitude);
            if (isNaN(lat) || isNaN(lng)) return;
            const color = PROV_COLORS[h.province_name] || '#95a5a6';
            const marker = L.circleMarker([lat, lng], {
                radius: 6, fillColor: color, color: '#fff', weight: 1, fillOpacity: 0.8
            }).addTo(map);
            marker.bindPopup(`<b>${esc(h.interview_key)}</b><br>Province: ${esc(h.province_name)}<br>Island: ${esc(h.island_name)}<br>AC: ${esc(h.ac_name)}<br>Village: ${esc(h.village_name)}<br>EA: ${esc(h.ea)}<br>Team: ${esc(h.team_name || h.team_id)}<br>Date: ${esc(h.interview_date)}<br>Status: ${statusLabel(h.interview_status)}`);
        });

        // fit bounds
        if (withGPS.length) {
            const coords = withGPS.map(h => [parseFloat(h.latitude), parseFloat(h.longitude)]).filter(c => !isNaN(c[0]) && !isNaN(c[1]));
            if (coords.length) map.fitBounds(coords, { padding: [30, 30] });
        }
    }

    /* ========================================
       6. CUMULATIVE INTERVIEW CHART
       ======================================== */
    function renderCumulative() {
        const total = households.length;
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

        // cumulative by province
        const provNames = Object.keys(hhByProvince).sort();
        makeChart('chart-cumulative-province', {
            type: 'line',
            data: {
                labels: dates,
                datasets: provNames.map((p, i) => {
                    let cum = 0;
                    return {
                        label: p,
                        data: dates.map(d => { cum += (hhByDate[d] || []).filter(h => h.province_name === p).length; return cum; }),
                        borderColor: PROV_COLORS[p] || CHART_PALETTE[i],
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
        const totalPersons = summary.total_persons;
        const avgHH = summary.avg_hh_size;
        const peakDay = dates.reduce((mx, d) => Math.max(mx, (hhByDate[d] || []).length), 0);

        setText('kpi-qty-total', households.length);
        setText('kpi-qty-persons', totalPersons);
        setText('kpi-qty-avg-hh', avgHH);
        setText('kpi-qty-peak', peakDay);

        // by province
        const provNames = Object.keys(hhByProvince).sort();
        makeChart('chart-qty-province', {
            type: 'bar',
            data: {
                labels: provNames,
                datasets: [{
                    label: 'Interviews',
                    data: provNames.map(p => hhByProvince[p].length),
                    backgroundColor: provNames.map(p => PROV_COLORS[p] || '#95a5a6')
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

        // persons by province
        makeChart('chart-qty-persons-prov', {
            type: 'doughnut',
            data: {
                labels: summary.provinces.map(p => p.name),
                datasets: [{
                    data: summary.provinces.map(p => p.persons),
                    backgroundColor: summary.provinces.map(p => PROV_COLORS[p.name] || '#95a5a6')
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
        const dailyAvg = (households.length / numDays).toFixed(1);
        const teamDayAvg = (households.length / numDays / teamIds.length).toFixed(2);
        const intvDayAvg = (households.length / numDays / intvIds.length).toFixed(2);
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

        // province speed
        const provNames = Object.keys(hhByProvince).sort();
        makeChart('chart-speed-province', {
            type: 'bar',
            data: {
                labels: provNames,
                datasets: [{
                    label: 'Interviews / Active Day',
                    data: provNames.map(p => {
                        const provDates = [...new Set(hhByProvince[p].map(h => h.interview_date))].length || 1;
                        return (hhByProvince[p].length / provDates).toFixed(1);
                    }),
                    backgroundColor: provNames.map(p => PROV_COLORS[p] || '#95a5a6')
                }]
            },
            options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
        });
    }

    /* ========================================
       9. SURVEY STATISTICS
       ======================================== */
    function renderStatistics() {
        const totalHH = summary.total_households;
        const totalP = summary.total_persons;
        const avgHS = summary.avg_hh_size;
        const maleC = summary.male_count;
        const femaleC = summary.female_count;
        const sexRatio = femaleC > 0 ? ((maleC / femaleC) * 100).toFixed(0) : '-';

        setText('kpi-stat-hh', totalHH);
        setText('kpi-stat-hh-sub', `${summary.provinces.length} provinces`);
        setText('kpi-stat-persons', totalP);
        setText('kpi-stat-persons-sub', `${maleC} male, ${femaleC} female`);
        setText('kpi-stat-hhsize', avgHS);
        setText('kpi-stat-sexratio', sexRatio);

        // population pyramid (horizontal stacked bar)
        const ageGroups = summary.age_pyramid.map(a => a.group);
        makeChart('chart-stat-pyramid', {
            type: 'bar',
            data: {
                labels: ageGroups,
                datasets: [
                    {
                        label: 'Male',
                        data: summary.age_pyramid.map(a => -a.male),
                        backgroundColor: '#3498db'
                    },
                    {
                        label: 'Female',
                        data: summary.age_pyramid.map(a => a.female),
                        backgroundColor: '#e91e8c'
                    }
                ]
            },
            options: {
                indexAxis: 'y', responsive: true,
                scales: {
                    x: {
                        ticks: { callback: v => Math.abs(v) },
                        title: { display: true, text: 'Population' }
                    },
                    y: { stacked: true }
                },
                plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: ctx => ctx.dataset.label + ': ' + Math.abs(ctx.raw) } } }
            }
        });

        // sex distribution pie
        makeChart('chart-stat-sex', {
            type: 'doughnut',
            data: {
                labels: ['Male', 'Female'],
                datasets: [{
                    data: [maleC, femaleC],
                    backgroundColor: ['#3498db', '#e91e8c']
                }]
            },
            options: { responsive: true, plugins: { legend: { position: 'bottom' } } }
        });

        // households by province
        makeChart('chart-stat-province', {
            type: 'bar',
            data: {
                labels: summary.provinces.map(p => p.name),
                datasets: [{
                    label: 'Households',
                    data: summary.provinces.map(p => p.households),
                    backgroundColor: summary.provinces.map(p => PROV_COLORS[p.name] || '#95a5a6')
                }]
            },
            options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
        });

        // household size distribution
        makeChart('chart-stat-hhsize', {
            type: 'bar',
            data: {
                labels: summary.hh_size_distribution.map(h => h.size + ' persons'),
                datasets: [{
                    label: 'Households',
                    data: summary.hh_size_distribution.map(h => h.count),
                    backgroundColor: '#2ecc71'
                }]
            },
            options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
        });

        // province summary table
        const tbody = el('table-province-summary').querySelector('tbody');
        // build lookup: interview_key -> province_name
        const hhProvLookup = {};
        households.forEach(h => { hhProvLookup[h.interview_key] = h.province_name; });
        // assign province to each person via interview_key
        const personsWithProv = persons.map(p => ({ ...p, province_name: hhProvLookup[p.interview_key] || '' }));
        const personsByProv = groupBy(personsWithProv, 'province_name');
        summary.provinces.forEach(p => {
            const provPersons = personsByProv[p.name] || [];
            const male = provPersons.filter(r => String(r.sex) === '1').length;
            const female = provPersons.filter(r => String(r.sex) === '2').length;
            const sr = female > 0 ? ((male / female) * 100).toFixed(0) : '-';
            const avgSize = p.households > 0 ? (p.persons / p.households).toFixed(1) : '-';
            const tr = document.createElement('tr');
            tr.innerHTML = `<td>${esc(p.name)}</td><td>${p.households}</td><td>${p.persons}</td>` +
                `<td>${avgSize}</td><td>${male}</td><td>${female}</td><td>${sr}</td>`;
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
