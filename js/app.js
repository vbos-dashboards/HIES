/* ===== HIES 2026 Dashboard - Main Application ===== */

(function () {
    'use strict';

    // ===== Province colors =====
    const PROVINCE_COLORS = {
        '1': '#e74c3c', // Torba
        '2': '#3498db', // Sanma
        '3': '#2ecc71', // Penama
        '4': '#f39c12', // Malampa
        '5': '#9b59b6', // Shefa
        '6': '#1abc9c'  // Tafea
    };

    const PROVINCE_NAMES = {
        '1': 'Torba', '2': 'Sanma', '3': 'Penama',
        '4': 'Malampa', '5': 'Shefa', '6': 'Tafea'
    };

    let summaryData = null;
    let householdData = null;
    let personData = null;
    let foodData = null;
    let mapInstance = null;
    const charts = {};

    // ===== Data Loading =====
    async function loadJSON(file) {
        const resp = await fetch('data/' + file);
        if (!resp.ok) throw new Error('Failed to load ' + file);
        return resp.json();
    }

    async function loadAllData() {
        showLoading(true);
        try {
            const [summary, households, persons, food] = await Promise.all([
                loadJSON('summary.json'),
                loadJSON('households.json'),
                loadJSON('persons.json'),
                loadJSON('food.json')
            ]);
            summaryData = summary;
            householdData = households;
            personData = persons;
            foodData = food;

            renderOverview();
            renderDemographics();
            renderExpenditure();
            renderFoodSecurity();
            renderHousing();
        } catch (err) {
            console.error('Data loading error:', err);
            document.getElementById('content').innerHTML =
                '<div style="padding:40px;text-align:center;color:#e74c3c;">' +
                '<h2>Error Loading Data</h2><p>' + err.message + '</p>' +
                '<p>Make sure the data/ folder contains the JSON files.</p></div>';
        } finally {
            showLoading(false);
        }
    }

    function showLoading(show) {
        let overlay = document.getElementById('loading-overlay');
        if (show) {
            if (!overlay) {
                overlay = document.createElement('div');
                overlay.id = 'loading-overlay';
                overlay.className = 'loading-overlay';
                overlay.innerHTML = '<div class="spinner"></div><p>Loading HIES data...</p>';
                document.body.appendChild(overlay);
            }
            overlay.style.display = 'flex';
        } else if (overlay) {
            overlay.style.display = 'none';
        }
    }

    // ===== Formatting =====
    function fmt(n) {
        if (n == null) return '--';
        return Number(n).toLocaleString();
    }

    function pct(n, total) {
        if (!total) return '0%';
        return (n / total * 100).toFixed(1) + '%';
    }

    // ===== Chart defaults =====
    Chart.defaults.font.family = "'Segoe UI', sans-serif";
    Chart.defaults.font.size = 12;
    Chart.defaults.color = '#2c3e50';
    Chart.defaults.plugins.legend.labels.usePointStyle = true;
    Chart.defaults.plugins.legend.labels.padding = 12;

    function makeChart(id, config) {
        const canvas = document.getElementById(id);
        if (!canvas) return null;
        if (charts[id]) { charts[id].destroy(); }
        charts[id] = new Chart(canvas.getContext('2d'), config);
        return charts[id];
    }

    // ===== OVERVIEW =====
    function renderOverview() {
        const s = summaryData;
        document.getElementById('kpi-hh').textContent = fmt(s.total_households);
        document.getElementById('kpi-hh-sub').textContent = 'across ' + s.provinces.length + ' provinces';
        document.getElementById('kpi-persons').textContent = fmt(s.total_persons);
        document.getElementById('kpi-persons-sub').textContent = s.male_count + ' male, ' + s.female_count + ' female';
        document.getElementById('kpi-hhsize').textContent = s.avg_hh_size;
        document.getElementById('kpi-food').textContent = fmt(s.total_food_items);
        document.getElementById('kpi-food-sub').textContent = fmt(s.total_nonfood_items) + ' non-food items';

        // Province households bar
        makeChart('chart-province-hh', {
            type: 'bar',
            data: {
                labels: s.provinces.map(function (p) { return p.name; }),
                datasets: [{
                    label: 'Households',
                    data: s.provinces.map(function (p) { return p.households; }),
                    backgroundColor: s.provinces.map(function (p) { return PROVINCE_COLORS[p.code]; }),
                    borderRadius: 6,
                    barPercentage: 0.7
                }]
            },
            options: {
                responsive: true,
                plugins: { legend: { display: false } },
                scales: {
                    y: { beginAtZero: true, title: { display: true, text: 'Number of Households' } },
                    x: { grid: { display: false } }
                }
            }
        });

        // Province persons doughnut
        makeChart('chart-province-persons', {
            type: 'doughnut',
            data: {
                labels: s.provinces.map(function (p) { return p.name; }),
                datasets: [{
                    data: s.provinces.map(function (p) { return p.persons; }),
                    backgroundColor: s.provinces.map(function (p) { return PROVINCE_COLORS[p.code]; }),
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: { position: 'right' },
                    tooltip: {
                        callbacks: {
                            label: function (ctx) {
                                return ctx.label + ': ' + ctx.raw + ' (' + pct(ctx.raw, s.total_persons) + ')';
                            }
                        }
                    }
                }
            }
        });

        // Timeline
        if (s.interview_timeline && s.interview_timeline.length > 0) {
            makeChart('chart-timeline', {
                type: 'line',
                data: {
                    labels: s.interview_timeline.map(function (t) { return t.date; }),
                    datasets: [{
                        label: 'Interviews',
                        data: s.interview_timeline.map(function (t) { return t.count; }),
                        borderColor: '#3498db',
                        backgroundColor: 'rgba(52,152,219,0.1)',
                        fill: true,
                        tension: 0.3,
                        pointRadius: 5,
                        pointBackgroundColor: '#3498db'
                    }]
                },
                options: {
                    responsive: true,
                    plugins: { legend: { display: false } },
                    scales: {
                        y: { beginAtZero: true, title: { display: true, text: 'Number of Interviews' } },
                        x: { grid: { display: false } }
                    }
                }
            });
        }

        // HH Size distribution
        if (s.hh_size_distribution && s.hh_size_distribution.length > 0) {
            makeChart('chart-hhsize', {
                type: 'bar',
                data: {
                    labels: s.hh_size_distribution.map(function (d) { return d.size + ' person' + (d.size > 1 ? 's' : ''); }),
                    datasets: [{
                        label: 'Households',
                        data: s.hh_size_distribution.map(function (d) { return d.count; }),
                        backgroundColor: '#2b5f8e',
                        borderRadius: 4,
                        barPercentage: 0.8
                    }]
                },
                options: {
                    responsive: true,
                    plugins: { legend: { display: false } },
                    scales: {
                        y: { beginAtZero: true, title: { display: true, text: 'Households' } },
                        x: { grid: { display: false } }
                    }
                }
            });
        }
    }

    // ===== DEMOGRAPHICS =====
    function renderDemographics() {
        const s = summaryData;
        document.getElementById('kpi-male').textContent = fmt(s.male_count);
        document.getElementById('kpi-female').textContent = fmt(s.female_count);
        var ratio = s.female_count > 0 ? (s.male_count / s.female_count * 100).toFixed(0) : '--';
        document.getElementById('kpi-sexratio').textContent = ratio;

        // Median age
        var ages = personData.map(function (p) { return p.age; }).filter(function (a) { return a > 0; }).sort(function (a, b) { return a - b; });
        var median = ages.length > 0 ? ages[Math.floor(ages.length / 2)] : '--';
        document.getElementById('kpi-medianage').textContent = median;

        // Population pyramid
        var pyramidLabels = s.age_pyramid.map(function (g) { return g.group; });
        makeChart('chart-pyramid', {
            type: 'bar',
            data: {
                labels: pyramidLabels,
                datasets: [
                    {
                        label: 'Male',
                        data: s.age_pyramid.map(function (g) { return -g.male; }),
                        backgroundColor: 'rgba(52,152,219,0.8)',
                        borderRadius: 4,
                        barPercentage: 0.95
                    },
                    {
                        label: 'Female',
                        data: s.age_pyramid.map(function (g) { return g.female; }),
                        backgroundColor: 'rgba(233,30,140,0.7)',
                        borderRadius: 4,
                        barPercentage: 0.95
                    }
                ]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                plugins: {
                    tooltip: {
                        callbacks: {
                            label: function (ctx) { return ctx.dataset.label + ': ' + Math.abs(ctx.raw); }
                        }
                    }
                },
                scales: {
                    x: {
                        stacked: false,
                        ticks: { callback: function (v) { return Math.abs(v); } },
                        title: { display: true, text: 'Number of Persons' }
                    },
                    y: { stacked: true }
                }
            }
        });

        // Sex pie
        makeChart('chart-sex-pie', {
            type: 'pie',
            data: {
                labels: ['Male', 'Female'],
                datasets: [{
                    data: [s.male_count, s.female_count],
                    backgroundColor: ['rgba(52,152,219,0.8)', 'rgba(233,30,140,0.7)'],
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: { position: 'bottom' },
                    tooltip: {
                        callbacks: {
                            label: function (ctx) {
                                return ctx.label + ': ' + ctx.raw + ' (' + pct(ctx.raw, s.total_persons) + ')';
                            }
                        }
                    }
                }
            }
        });

        // Age bar chart
        makeChart('chart-age-bar', {
            type: 'bar',
            data: {
                labels: s.age_pyramid.map(function (g) { return g.group; }),
                datasets: [{
                    label: 'Population',
                    data: s.age_pyramid.map(function (g) { return g.male + g.female; }),
                    backgroundColor: '#2b5f8e',
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true,
                plugins: { legend: { display: false } },
                scales: {
                    y: { beginAtZero: true, title: { display: true, text: 'Count' } },
                    x: { title: { display: true, text: 'Age Group' }, grid: { display: false } }
                }
            }
        });

        // Province by sex stacked bar
        var provKeys = {};
        personData.forEach(function (p) {
            var hh = householdData.find(function (h) { return h.interview_key === p.interview_key; });
            if (!hh) return;
            var prov = hh.province;
            if (!provKeys[prov]) provKeys[prov] = { male: 0, female: 0 };
            if (p.sex === '1' || p.sex === 1) provKeys[prov].male++;
            else provKeys[prov].female++;
        });

        var provLabels = Object.keys(provKeys).sort().map(function (k) { return PROVINCE_NAMES[k] || k; });
        var provMale = Object.keys(provKeys).sort().map(function (k) { return provKeys[k].male; });
        var provFemale = Object.keys(provKeys).sort().map(function (k) { return provKeys[k].female; });

        makeChart('chart-province-sex', {
            type: 'bar',
            data: {
                labels: provLabels,
                datasets: [
                    { label: 'Male', data: provMale, backgroundColor: 'rgba(52,152,219,0.8)', borderRadius: 4 },
                    { label: 'Female', data: provFemale, backgroundColor: 'rgba(233,30,140,0.7)', borderRadius: 4 }
                ]
            },
            options: {
                responsive: true,
                plugins: { legend: { position: 'top' } },
                scales: {
                    x: { stacked: true, grid: { display: false } },
                    y: { stacked: true, beginAtZero: true, title: { display: true, text: 'Persons' } }
                }
            }
        });
    }

    // ===== EXPENDITURE =====
    function renderExpenditure() {
        var s = summaryData;
        document.getElementById('kpi-totalfood').textContent = fmt(s.total_food_purchase);
        document.getElementById('kpi-homeprod').textContent = fmt(s.total_home_production);
        var avgFoodHH = s.total_households > 0 ? Math.round(s.total_food_purchase / s.total_households) : 0;
        document.getElementById('kpi-avgfoodhh').textContent = fmt(avgFoodHH);
        document.getElementById('kpi-nonfood').textContent = fmt(s.total_nonfood_items);

        // Calculate totals by source
        var totalPurchase = 0, totalHomeProd = 0, totalGift = 0;
        foodData.forEach(function (f) {
            totalPurchase += f.purchase_amount || 0;
            totalHomeProd += f.home_prod_amount || 0;
            totalGift += f.gift_amount || 0;
        });

        // Food source bar
        makeChart('chart-food-source', {
            type: 'bar',
            data: {
                labels: ['Cash Purchase', 'Home Production', 'Gifts/Free'],
                datasets: [{
                    label: 'Value (VT)',
                    data: [Math.round(totalPurchase), Math.round(totalHomeProd), Math.round(totalGift)],
                    backgroundColor: ['#27ae60', '#3498db', '#e67e22'],
                    borderRadius: 6,
                    barPercentage: 0.5
                }]
            },
            options: {
                responsive: true,
                plugins: { legend: { display: false } },
                scales: {
                    y: { beginAtZero: true, title: { display: true, text: 'Value (VT)' } },
                    x: { grid: { display: false } }
                }
            }
        });

        // Food pie
        makeChart('chart-food-pie', {
            type: 'doughnut',
            data: {
                labels: ['Purchase', 'Home Produced', 'Gift'],
                datasets: [{
                    data: [Math.round(totalPurchase), Math.round(totalHomeProd), Math.round(totalGift)],
                    backgroundColor: ['#27ae60', '#3498db', '#e67e22'],
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                plugins: { legend: { position: 'bottom' } }
            }
        });

        // Food by province
        var provFood = {};
        var provHHCount = {};
        householdData.forEach(function (h) {
            var prov = h.province;
            if (!provFood[prov]) { provFood[prov] = 0; provHHCount[prov] = 0; }
            provHHCount[prov]++;
        });
        foodData.forEach(function (f) {
            var hh = householdData.find(function (h) { return h.interview_key === f.interview_key; });
            if (!hh) return;
            provFood[hh.province] += (f.purchase_amount || 0) + (f.home_prod_amount || 0) + (f.gift_amount || 0);
        });

        var sortedProvs = Object.keys(provFood).sort();
        makeChart('chart-food-province', {
            type: 'bar',
            data: {
                labels: sortedProvs.map(function (k) { return PROVINCE_NAMES[k]; }),
                datasets: [{
                    label: 'Total Food Value (VT)',
                    data: sortedProvs.map(function (k) { return Math.round(provFood[k]); }),
                    backgroundColor: sortedProvs.map(function (k) { return PROVINCE_COLORS[k]; }),
                    borderRadius: 6
                }]
            },
            options: {
                responsive: true,
                plugins: { legend: { display: false } },
                scales: {
                    y: { beginAtZero: true, title: { display: true, text: 'Value (VT)' } },
                    x: { grid: { display: false } }
                }
            }
        });

        // Average per HH
        makeChart('chart-food-avg-province', {
            type: 'bar',
            data: {
                labels: sortedProvs.map(function (k) { return PROVINCE_NAMES[k]; }),
                datasets: [{
                    label: 'Avg Food Value/HH (VT)',
                    data: sortedProvs.map(function (k) {
                        return provHHCount[k] > 0 ? Math.round(provFood[k] / provHHCount[k]) : 0;
                    }),
                    backgroundColor: sortedProvs.map(function (k) { return PROVINCE_COLORS[k]; }),
                    borderRadius: 6
                }]
            },
            options: {
                responsive: true,
                plugins: { legend: { display: false } },
                scales: {
                    y: { beginAtZero: true, title: { display: true, text: 'VT per Household' } },
                    x: { grid: { display: false } }
                }
            }
        });
    }

    // ===== FOOD SECURITY =====
    function renderFoodSecurity() {
        var s = summaryData;
        var fies = s.fies;
        if (!fies || fies.length === 0) return;

        document.getElementById('kpi-fies-worried').textContent = pct(fies[0].yes, s.total_households);
        document.getElementById('kpi-fies-unhealthy').textContent = pct(fies[1].yes, s.total_households);
        document.getElementById('kpi-fies-hungry').textContent = fies.length > 6 ? pct(fies[6].yes, s.total_households) : '--';
        document.getElementById('kpi-fies-noeat').textContent = fies.length > 7 ? pct(fies[7].yes, s.total_households) : '--';

        // FIES horizontal bar
        makeChart('chart-fies-bar', {
            type: 'bar',
            data: {
                labels: fies.map(function (f) { return f.item; }),
                datasets: [
                    {
                        label: 'Yes',
                        data: fies.map(function (f) { return f.yes; }),
                        backgroundColor: '#e74c3c',
                        borderRadius: 4,
                        barPercentage: 0.7
                    },
                    {
                        label: 'No',
                        data: fies.map(function (f) { return f.no; }),
                        backgroundColor: '#27ae60',
                        borderRadius: 4,
                        barPercentage: 0.7
                    }
                ]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                plugins: { legend: { position: 'top' } },
                scales: {
                    x: { stacked: true, title: { display: true, text: 'Number of Households' } },
                    y: { stacked: true }
                }
            }
        });

        // FIES severity - count how many FIES items each HH answered yes
        var severityCounts = { '0': 0, '1-2': 0, '3-4': 0, '5-6': 0, '7-8': 0 };
        var fiesFields = ['fies_1', 'fies_2', 'fies_3', 'fies_4', 'fies_5', 'fies_7', 'fies_8', 'fies_9'];
        householdData.forEach(function (hh) {
            var score = 0;
            fiesFields.forEach(function (field) {
                if (String(hh[field]) === '1') score++;
            });
            if (score === 0) severityCounts['0']++;
            else if (score <= 2) severityCounts['1-2']++;
            else if (score <= 4) severityCounts['3-4']++;
            else if (score <= 6) severityCounts['5-6']++;
            else severityCounts['7-8']++;
        });

        makeChart('chart-fies-severity', {
            type: 'doughnut',
            data: {
                labels: ['Food Secure (0)', 'Mild (1-2)', 'Moderate (3-4)', 'Severe (5-6)', 'Very Severe (7-8)'],
                datasets: [{
                    data: [severityCounts['0'], severityCounts['1-2'], severityCounts['3-4'],
                    severityCounts['5-6'], severityCounts['7-8']],
                    backgroundColor: ['#27ae60', '#f1c40f', '#e67e22', '#e74c3c', '#8e44ad'],
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                plugins: { legend: { position: 'right' } }
            }
        });

        // FIES radar
        makeChart('chart-fies-radar', {
            type: 'radar',
            data: {
                labels: fies.map(function (f) {
                    var words = f.item.split(' ');
                    return words.length > 3 ? words.slice(0, 3).join(' ') + '...' : f.item;
                }),
                datasets: [{
                    label: '% Yes',
                    data: fies.map(function (f) { return f.pct; }),
                    backgroundColor: 'rgba(231,76,60,0.2)',
                    borderColor: '#e74c3c',
                    pointBackgroundColor: '#e74c3c',
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                scales: {
                    r: { beginAtZero: true, max: 100, ticks: { stepSize: 20 } }
                },
                plugins: { legend: { position: 'top' } }
            }
        });
    }

    // ===== HOUSING & ASSETS =====
    function renderHousing() {
        var s = summaryData;
        document.getElementById('kpi-livestock').textContent = fmt(s.total_livestock);
        document.getElementById('kpi-enterprises').textContent = fmt(s.total_enterprises);

        // Land access
        var landYes = householdData.filter(function (h) { return String(h.ind_land_access) === '1'; }).length;
        document.getElementById('kpi-landaccess').textContent = landYes + ' (' + pct(landYes, s.total_households) + ')';

        // Bank account
        var bankYes = householdData.filter(function (h) { return String(h.bank_account) === '1'; }).length;
        document.getElementById('kpi-bank').textContent = bankYes + ' (' + pct(bankYes, s.total_households) + ')';

        // Dwelling type
        var dwellingMap = { '1': 'Separate house', '2': 'Semi-detached', '3': 'Flat/Unit', '4': 'Traditional', '97': 'Other' };
        var dwellingCounts = {};
        householdData.forEach(function (h) {
            var t = h.type_living_quarter;
            if (!t || t === '' || t === '-999999999') return;
            var label = dwellingMap[String(t)] || ('Type ' + t);
            dwellingCounts[label] = (dwellingCounts[label] || 0) + 1;
        });

        makeChart('chart-dwelling', {
            type: 'pie',
            data: {
                labels: Object.keys(dwellingCounts),
                datasets: [{
                    data: Object.values(dwellingCounts),
                    backgroundColor: ['#3498db', '#2ecc71', '#e67e22', '#9b59b6', '#95a5a6'],
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                plugins: { legend: { position: 'bottom' } }
            }
        });

        // Housing tenure
        var tenureMap = { '1': 'Owned', '2': 'Rented', '3': 'Rent-free', '4': 'Customary', '97': 'Other' };
        var tenureCounts = {};
        householdData.forEach(function (h) {
            var t = h.housing_tenure;
            if (!t || t === '' || t === '-999999999' || t === '0') return;
            var label = tenureMap[String(t)] || ('Tenure ' + t);
            tenureCounts[label] = (tenureCounts[label] || 0) + 1;
        });

        makeChart('chart-tenure', {
            type: 'doughnut',
            data: {
                labels: Object.keys(tenureCounts),
                datasets: [{
                    data: Object.values(tenureCounts),
                    backgroundColor: ['#1abc9c', '#3498db', '#f39c12', '#e74c3c', '#95a5a6'],
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                plugins: { legend: { position: 'bottom' } }
            }
        });

        // Number of rooms
        var roomCounts = {};
        householdData.forEach(function (h) {
            var r = h.no_rooms;
            if (!r || r === '' || r === '-999999999' || r === '0') return;
            var rooms = parseInt(r, 10);
            if (rooms > 10) rooms = '10+';
            roomCounts[rooms] = (roomCounts[rooms] || 0) + 1;
        });
        var roomLabels = Object.keys(roomCounts).sort(function (a, b) { return parseInt(a) - parseInt(b); });

        makeChart('chart-rooms', {
            type: 'bar',
            data: {
                labels: roomLabels.map(function (r) { return r + ' room' + (r > 1 ? 's' : ''); }),
                datasets: [{
                    label: 'Households',
                    data: roomLabels.map(function (r) { return roomCounts[r]; }),
                    backgroundColor: '#2b5f8e',
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true,
                plugins: { legend: { display: false } },
                scales: {
                    y: { beginAtZero: true, title: { display: true, text: 'Households' } },
                    x: { grid: { display: false } }
                }
            }
        });

        // Financial inclusion
        var savingsYes = householdData.filter(function (h) { return String(h.hhld_saving) === '1'; }).length;
        makeChart('chart-financial', {
            type: 'bar',
            data: {
                labels: ['Bank Account', 'Savings', 'Land Access'],
                datasets: [{
                    label: 'Yes',
                    data: [bankYes, savingsYes, landYes],
                    backgroundColor: '#27ae60',
                    borderRadius: 4
                }, {
                    label: 'No',
                    data: [
                        s.total_households - bankYes,
                        s.total_households - savingsYes,
                        s.total_households - landYes
                    ],
                    backgroundColor: '#e74c3c',
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true,
                plugins: { legend: { position: 'top' } },
                scales: {
                    x: { stacked: true, grid: { display: false } },
                    y: { stacked: true, beginAtZero: true, title: { display: true, text: 'Households' } }
                }
            }
        });
    }

    // ===== MAP =====
    function renderMap() {
        if (mapInstance) return; // already initialized

        var container = document.getElementById('survey-map');
        if (!container || !householdData) return;

        // Center on Vanuatu
        mapInstance = L.map('survey-map').setView([-16.5, 168.0], 7);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; OpenStreetMap contributors',
            maxZoom: 18
        }).addTo(mapInstance);

        householdData.forEach(function (hh) {
            var lat = parseFloat(hh.latitude);
            var lng = parseFloat(hh.longitude);
            if (isNaN(lat) || isNaN(lng) || lat === 0 || lng === 0) return;

            var color = PROVINCE_COLORS[hh.province] || '#333';
            var marker = L.circleMarker([lat, lng], {
                radius: 7,
                fillColor: color,
                color: '#fff',
                weight: 2,
                fillOpacity: 0.85
            }).addTo(mapInstance);

            marker.bindPopup(
                '<strong>' + (hh.province_name || 'Province ' + hh.province) + '</strong><br>' +
                'HH: ' + hh.hh_serial + '<br>' +
                'EA: ' + hh.ea + '<br>' +
                'Date: ' + (hh.interview_date || 'N/A') + '<br>' +
                'Lat: ' + lat.toFixed(4) + ', Lng: ' + lng.toFixed(4)
            );
        });

        // Fit bounds to markers
        var validCoords = householdData
            .filter(function (h) { return h.latitude && h.longitude && parseFloat(h.latitude) !== 0; })
            .map(function (h) { return [parseFloat(h.latitude), parseFloat(h.longitude)]; });
        if (validCoords.length > 0) {
            mapInstance.fitBounds(validCoords, { padding: [30, 30] });
        }
    }

    // ===== TAB NAVIGATION =====
    function setupNavigation() {
        var pageTitles = {
            overview: 'Survey Overview',
            demographics: 'Demographics',
            expenditure: 'Income & Expenditure',
            foodsecurity: 'Food Security (FIES)',
            housing: 'Housing & Assets',
            map: 'Survey Map'
        };

        document.querySelectorAll('.nav-item').forEach(function (item) {
            item.addEventListener('click', function () {
                var tab = this.getAttribute('data-tab');

                // Update active nav
                document.querySelectorAll('.nav-item').forEach(function (n) { n.classList.remove('active'); });
                this.classList.add('active');

                // Update active tab
                document.querySelectorAll('.tab-content').forEach(function (t) { t.classList.remove('active'); });
                var tabEl = document.getElementById('tab-' + tab);
                if (tabEl) tabEl.classList.add('active');

                // Update title
                document.getElementById('pageTitle').textContent = pageTitles[tab] || tab;

                // Initialize map on first visit
                if (tab === 'map') {
                    setTimeout(function () {
                        renderMap();
                        if (mapInstance) mapInstance.invalidateSize();
                    }, 100);
                }

                // Close sidebar on mobile
                document.getElementById('sidebar').classList.remove('open');
            });
        });

        // Mobile menu toggle
        document.getElementById('menuToggle').addEventListener('click', function () {
            document.getElementById('sidebar').classList.toggle('open');
        });
    }

    // ===== INIT =====
    document.addEventListener('DOMContentLoaded', function () {
        setupNavigation();
        loadAllData();
    });

})();
