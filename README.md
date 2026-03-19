# Vanuatu HIES 2026-2027 Dashboard

Interactive dashboard for the **Vanuatu Household Income & Expenditure Survey (HIES) 2026-2027**, built for deployment on GitHub Pages.

## Live Dashboard

Visit: `https://<your-username>.github.io/HIES/`

## Features

- **Survey Overview** - KPIs, province distribution, interview timeline, household size
- **Demographics** - Population pyramid, sex distribution, age groups by province
- **Expenditure** - Food expenditure by source (purchase/home-produced/gift), by province
- **Food Security (FIES)** - 8 FIES indicators, severity distribution, radar chart
- **Housing & Assets** - Dwelling type, tenure, rooms, financial inclusion
- **Interactive Map** - Leaflet map showing all surveyed household locations

## Technology

- Pure HTML/CSS/JavaScript (no server required)
- [Chart.js](https://www.chartjs.org/) for interactive charts
- [Leaflet](https://leafletjs.com/) for maps
- Responsive design for mobile and desktop

## Data

Data is sourced from Survey Solutions CAPI exports (`.tab` files) and converted to JSON using the included PowerShell script.

### Updating Data

1. Download the latest tabular export from Survey Solutions
2. Run the conversion script:
   ```powershell
   .\convert-data.ps1 -SourceDir "path\to\VUTHIES_2026_1_Tabular_All_..."
   ```
3. Commit and push the updated `data/` folder

## Deploying to GitHub Pages

1. Create a new repository on GitHub (e.g., `HIES`)
2. Push this project:
   ```bash
   git init
   git add .
   git commit -m "HIES 2026 Dashboard"
   git branch -M main
   git remote add origin https://github.com/<username>/HIES.git
   git push -u origin main
   ```
3. Go to **Settings > Pages** in your GitHub repository
4. Set Source to **Deploy from a branch**, select **main** branch, root `/`
5. Your dashboard will be live at `https://<username>.github.io/HIES/`

## Project Structure

```
HIES/
├── index.html          # Main dashboard page
├── css/
│   └── style.css       # Dashboard styles
├── js/
│   └── app.js          # Dashboard logic & charts
├── data/
│   ├── summary.json    # Pre-computed summary statistics
│   ├── households.json # Household-level data
│   ├── persons.json    # Person demographics
│   ├── food.json       # Food expenditure records
│   ├── nonfood.json    # Non-food expenditure
│   ├── livestock.json  # Livestock data
│   ├── enterprises.json# Enterprise data
│   └── energy.json     # Energy source data
├── convert-data.ps1    # Data conversion script
└── README.md
```

## Credits

**Vanuatu Bureau of Statistics (VBoS)**  
HIES 2026-2027 Fieldwork  
*Trusted Official Statistics for Good Governance*
