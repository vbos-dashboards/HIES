# convert-data.ps1 - Convert HIES .tab files to JSON for the dashboard
# Usage: .\convert-data.ps1 -SourceDir "path\to\VUTHIES_2026_1_Tabular_All_..."

param(
    [string]$SourceDir = "c:\Users\jyaruel\Downloads\VUTHIES_2026_1_Tabular_All_20260324T2110Z"
)

$OutDir = Join-Path $PSScriptRoot "data"
if (!(Test-Path $OutDir)) { New-Item -ItemType Directory -Path $OutDir | Out-Null }

function Read-TabFile {
    param([string]$FilePath)
    if (!(Test-Path $FilePath)) { return @() }
    $lines = Get-Content $FilePath -Encoding UTF8
    if ($lines.Count -lt 2) { return @() }
    $headers = $lines[0] -split "`t"
    $rows = @()
    for ($i = 1; $i -lt $lines.Count; $i++) {
        if ([string]::IsNullOrWhiteSpace($lines[$i])) { continue }
        $cols = $lines[$i] -split "`t"
        $obj = @{}
        for ($j = 0; $j -lt $headers.Count; $j++) {
            $val = if ($j -lt $cols.Count) { $cols[$j] } else { "" }
            $obj[$headers[$j]] = $val
        }
        $rows += [PSCustomObject]$obj
    }
    return $rows
}

Write-Host "Reading source data from: $SourceDir"

# --- 1. Households (VUTHIES_2026.tab) ---
Write-Host "Processing households..."
$hhData = Read-TabFile (Join-Path $SourceDir "VUTHIES_2026.tab")
$provinceMap = @{ "1" = "Torba"; "2" = "Sanma"; "3" = "Penama"; "4" = "Malampa"; "5" = "Shefa"; "6" = "Tafea" }

$households = $hhData | ForEach-Object {
    [PSCustomObject]@{
        interview_key       = $_.interview__key
        province            = $_.province
        province_name       = $provinceMap[$_.province]
        area_council        = $_.area_council
        ea                  = $_.enumeration_area
        village             = $_.village
        household_serial    = $_.household_serial_no
        hh_serial           = $_.household_serial_no
        phone1              = $_.h1901
        phone2              = $_.h1902
        latitude            = $_.gps__Latitude
        longitude           = $_.gps__Longitude
        interview_date      = if ($_.datetime_interview) { ($_.datetime_interview -split "T")[0] } else { "" }
        int_avail           = $_.int_avail
        sample              = $_.sample
        round               = $_.round
        team_id             = $_.team_id
        interviewer_id      = $_.interviewer_id
        type_living_quarter = $_.type_living_quarter
        type_tenure         = $_.type_tenure
        main_roof           = $_.main_roof_material
        main_wall           = $_.main_wall_material
        main_floor          = $_.main_floor_material
        no_rooms            = $_.no_rooms_dwelling
        year_dwelling       = $_.year_dwelling
        location_cooking    = $_.location_hh_cooking
        housing_tenure      = $_.housing_tenure
        rent_amount         = $_.last_rent_amount
        fies_1              = $_.fies_1
        fies_2              = $_.fies_2
        fies_3              = $_.fies_3
        fies_4              = $_.fies_4
        fies_5              = $_.fies_5
        fies_7              = $_.fies_7
        fies_8              = $_.fies_8
        fies_9              = $_.fies_9
        bank_account        = $_.bank_account
        hhld_saving         = $_.hhld_saving
        ind_land_access     = $_.ind_land_access
        interview_status    = $_.interview__status
    }
}
$households | ConvertTo-Json -Depth 3 | Out-File (Join-Path $OutDir "households.json") -Encoding UTF8
Write-Host "  -> $($households.Count) households"

# --- 2. Persons (hm_basic.tab) ---
Write-Host "Processing persons..."
$personData = Read-TabFile (Join-Path $SourceDir "hm_basic.tab")

$persons = $personData | ForEach-Object {
    $ageVal = 0
    if ($_.age -and $_.age -ne "" -and $_.age -ne "-999999999") {
        try { $ageVal = [int]$_.age } catch { $ageVal = 0 }
    }
    [PSCustomObject]@{
        interview_key       = $_.interview__key
        person_id           = $_.hm_basic__id
        name                = $_.name
        sex                 = $_.sex
        age                 = $ageVal
        relat               = $_.relat
        marital             = $_.maritalStat
        ethnicity           = $_.ethnicity
        ever_school         = $_.ever_attend_school
        current_school      = $_.current_school
        highest_grade       = $_.highest_grade_com
        sick_30             = $_.sick_30_days
        difficulty_vision   = $_.difficulty_vision
        difficulty_hearing  = $_.difficulty_hearing
        difficulty_mobility = $_.diffculty_mobilty
        difficulty_memory   = $_.difficulty_memory
        life_satisfaction   = $_.overall_life_sat
        happy               = $_.happy_yesterday
        worried             = $_.worried_yesterday
        safe_walking        = $_.safe_walking
        mobile_use          = $_.mobile_use
        mobile_own          = $_.mobile_ownership
        access_internet     = $_.access_internet
        atw_pay             = $_.ATW_PAY
        atw_pft             = $_.ATW_PFT
        employment_rel      = $_.MJJ_EMP_REL
        occupation          = $_.MJJ_OCC_TLE
        industry            = $_.MJJ_IND_MAC
        wage                = $_.WIN_WAGE1
    }
}
$persons | ConvertTo-Json -Depth 3 | Out-File (Join-Path $OutDir "persons.json") -Encoding UTF8
Write-Host "  -> $($persons.Count) persons"

# --- 3. Food expenditure (food_recall_details.tab) ---
Write-Host "Processing food expenditure..."
$foodData = Read-TabFile (Join-Path $SourceDir "food_recall_details.tab")

$food = $foodData | ForEach-Object {
    $purchaseAmt = 0; $homeProdAmt = 0; $giftAmt = 0
    if ($_.amount_food_purchase -and $_.amount_food_purchase -ne "") { try { $purchaseAmt = [double]$_.amount_food_purchase } catch {} }
    if ($_.amount_homeProd_purchase -and $_.amount_homeProd_purchase -ne "") { try { $homeProdAmt = [double]$_.amount_homeProd_purchase } catch {} }
    if ($_.est_cost_quantity_gift -and $_.est_cost_quantity_gift -ne "") { try { $giftAmt = [double]$_.est_cost_quantity_gift } catch {} }

    [PSCustomObject]@{
        interview_key     = $_.interview__key
        food_id           = $_.food_recall_details__id
        consumption_days  = $_.consumption_7Days
        quantity          = $_.quantity_consume
        purchase_cash     = $_.any_food_purchase_cash
        purchase_amount   = $purchaseAmt
        purchase_location = $_.location_food_purchase
        home_produced     = $_.consume_homeProd
        home_prod_amount  = $homeProdAmt
        gift              = $_.homeProd_cons_gift
        gift_amount       = $giftAmt
    }
}
$food | ConvertTo-Json -Depth 3 | Out-File (Join-Path $OutDir "food.json") -Encoding UTF8
Write-Host "  -> $($food.Count) food items"

# --- 4. Non-food expenditure ---
Write-Host "Processing non-food expenditure..."
$nonfoodData = Read-TabFile (Join-Path $SourceDir "nonfood_recall_details.tab")
$nonfood = $nonfoodData | ForEach-Object {
    $amt = 0
    if ($_.exp_persHygiene -and $_.exp_persHygiene -ne "") { try { $amt = [double]$_.exp_persHygiene } catch {} }
    [PSCustomObject]@{
        interview_key = $_.interview__key
        item_id       = $_.nonfood_recall_details__id
        amount        = $amt
    }
}
$nonfood | ConvertTo-Json -Depth 3 | Out-File (Join-Path $OutDir "nonfood.json") -Encoding UTF8
Write-Host "  -> $($nonfood.Count) non-food items"

# --- 5. Livestock ---
Write-Host "Processing livestock..."
$livestockData = Read-TabFile (Join-Path $SourceDir "livestock_roster.tab")
$livestock = $livestockData | ForEach-Object {
    [PSCustomObject]@{
        interview_key = $_.interview__key
        type_id       = $_.livestock_roster__id
    }
}
$livestock | ConvertTo-Json -Depth 3 | Out-File (Join-Path $OutDir "livestock.json") -Encoding UTF8
Write-Host "  -> $($livestock.Count) livestock entries"

# --- 6. Enterprise ---
Write-Host "Processing enterprises..."
$entData = Read-TabFile (Join-Path $SourceDir "enterprise_roster.tab")
$enterprises = $entData | ForEach-Object {
    [PSCustomObject]@{
        interview_key = $_.interview__key
        type_id       = $_.enterprise_roster__id
    }
}
$enterprises | ConvertTo-Json -Depth 3 | Out-File (Join-Path $OutDir "enterprises.json") -Encoding UTF8
Write-Host "  -> $($enterprises.Count) enterprises"

# --- 7. Energy sources ---
Write-Host "Processing energy sources..."
$energyData = Read-TabFile (Join-Path $SourceDir "energy_source_roster.tab")
$energy = $energyData | ForEach-Object {
    $amt = 0
    if ($_.amount_last_energyPmt -and $_.amount_last_energyPmt -ne "") { try { $amt = [double]$_.amount_last_energyPmt } catch {} }
    [PSCustomObject]@{
        interview_key = $_.interview__key
        source_id     = $_.energy_source_roster__id
        amount        = $amt
    }
}
$energy | ConvertTo-Json -Depth 3 | Out-File (Join-Path $OutDir "energy.json") -Encoding UTF8
Write-Host "  -> $($energy.Count) energy entries"

# --- Summary stats JSON for quick loading ---
Write-Host "Generating summary stats..."

$totalHH = $households.Count
$totalPersons = $persons.Count
$avgHHSize = [math]::Round($totalPersons / [math]::Max($totalHH, 1), 1)
$maleCount = ($persons | Where-Object { $_.sex -eq "1" }).Count
$femaleCount = ($persons | Where-Object { $_.sex -eq "2" }).Count
$totalFoodExpend = ($food | Measure-Object -Property purchase_amount -Sum).Sum
$totalHomeProd = ($food | Measure-Object -Property home_prod_amount -Sum).Sum

# Province breakdown
$provBreakdown = @()
foreach ($p in ($provinceMap.GetEnumerator() | Sort-Object Name)) {
    $hhCount = ($households | Where-Object { $_.province -eq $p.Name }).Count
    $keys = ($households | Where-Object { $_.province -eq $p.Name }).interview_key
    $pCount = ($persons | Where-Object { $keys -contains $_.interview_key }).Count
    $provBreakdown += [PSCustomObject]@{
        code       = $p.Name
        name       = $p.Value
        households = $hhCount
        persons    = $pCount
    }
}

# Age groups
$ageGroups = @("0-4", "5-9", "10-14", "15-19", "20-24", "25-29", "30-34", "35-39", "40-44", "45-49", "50-54", "55-59", "60-64", "65+")
$pyramid = @()
foreach ($ag in $ageGroups) {
    if ($ag -eq "65+") { $lo = 65; $hi = 200 }
    else { $parts = $ag -split "-"; $lo = [int]$parts[0]; $hi = [int]$parts[1] }
    $maleInGroup = ($persons | Where-Object { $_.sex -eq "1" -and $_.age -ge $lo -and $_.age -le $hi }).Count
    $femaleInGroup = ($persons | Where-Object { $_.sex -eq "2" -and $_.age -ge $lo -and $_.age -le $hi }).Count
    $pyramid += [PSCustomObject]@{
        group  = $ag
        male   = $maleInGroup
        female = $femaleInGroup
    }
}

# FIES (Food Insecurity Experience Scale) summary
$fiesItems = @("fies_1", "fies_2", "fies_3", "fies_4", "fies_5", "fies_7", "fies_8", "fies_9")
$fiesSummary = @()
$fiesLabels = @("Worried about food", "Unable to eat healthy", "Ate only few kinds", "Skipped a meal", "Ate less than should", "Ran out of food", "Hungry but did not eat", "Went without eating all day")
for ($i = 0; $i -lt $fiesItems.Count; $i++) {
    $item = $fiesItems[$i]
    $yesCount = ($households | Where-Object { $_.$item -eq "1" }).Count
    $fiesSummary += [PSCustomObject]@{
        item = $fiesLabels[$i]
        yes  = $yesCount
        no   = $totalHH - $yesCount
        pct  = [math]::Round(($yesCount / [math]::Max($totalHH, 1)) * 100, 1)
    }
}

# Interview dates timeline
$dateCounts = $households | Where-Object { $_.interview_date -ne "" } | Group-Object interview_date | Sort-Object Name | ForEach-Object {
    [PSCustomObject]@{ date = $_.Name; count = $_.Count }
}

# HH Size distribution
$hhSizes = @{}
$persons | Group-Object interview_key | ForEach-Object {
    $size = $_.Count
    if ($hhSizes.ContainsKey($size)) { $hhSizes[$size]++ } else { $hhSizes[$size] = 1 }
}
$hhSizeDist = $hhSizes.GetEnumerator() | Sort-Object Name | ForEach-Object {
    [PSCustomObject]@{ size = [int]$_.Name; count = $_.Value }
}

$summary = [PSCustomObject]@{
    total_households      = $totalHH
    total_persons         = $totalPersons
    avg_hh_size           = $avgHHSize
    male_count            = $maleCount
    female_count          = $femaleCount
    total_food_purchase   = [math]::Round($totalFoodExpend, 0)
    total_home_production = [math]::Round($totalHomeProd, 0)
    total_food_items      = $food.Count
    total_nonfood_items   = $nonfood.Count
    total_livestock       = $livestock.Count
    total_enterprises     = $enterprises.Count
    provinces             = $provBreakdown
    age_pyramid           = $pyramid
    fies                  = $fiesSummary
    interview_timeline    = $dateCounts
    hh_size_distribution  = $hhSizeDist
}
$summary | ConvertTo-Json -Depth 4 | Out-File (Join-Path $OutDir "summary.json") -Encoding UTF8

# --- 8. Household Listing (listing_roster.tab) ---
Write-Host "Processing household listing..."
$listingData = Read-TabFile (Join-Path $SourceDir "listing_roster.tab")

# Count pages and photos per household from listing roster
$listingByHH = @{}
foreach ($row in $listingData) {
    $key = $row.interview__key
    if (!$listingByHH.ContainsKey($key)) {
        $listingByHH[$key] = @{ pages = 0; photos = 0 }
    }
    $listingByHH[$key].pages++
    if ($row.hh_listing_photo1 -and $row.hh_listing_photo1 -ne "") {
        $listingByHH[$key].photos++
    }
}

# Build listing record for every household
$listing = $households | ForEach-Object {
    $key = $_.interview_key
    $pages = if ($listingByHH.ContainsKey($key)) { $listingByHH[$key].pages } else { 0 }
    $photos = if ($listingByHH.ContainsKey($key)) { $listingByHH[$key].photos } else { 0 }
    [PSCustomObject]@{
        interview_key  = $key
        province       = $_.province_name
        ea             = $_.ea
        team_id        = $_.team_id
        listing_pages  = $pages
        listing_photos = $photos
        has_listing    = if ($pages -gt 0) { 1 } else { 0 }
    }
}
$listing | ConvertTo-Json -Depth 3 | Out-File (Join-Path $OutDir "listing.json") -Encoding UTF8
$listWithData = ($listing | Where-Object { $_.has_listing -eq 1 }).Count
Write-Host "  -> $($listing.Count) records ($listWithData with listing data)"

# --- 9. Market Survey (marketlist_roster.tab) ---
Write-Host "Processing market survey..."
$marketData = Read-TabFile (Join-Path $SourceDir "marketlist_roster.tab")

$categories = @("bread", "meat", "fish", "dairy", "fruit", "nuts", "veges", "crop", "spice", "takeaway")
$headers = if (Test-Path (Join-Path $SourceDir "marketlist_roster.tab")) {
    (Get-Content (Join-Path $SourceDir "marketlist_roster.tab") -TotalCount 1) -split "`t"
}
else { @() }

# Build outlet records
$outlets = @()
foreach ($row in $marketData) {
    $key = $row.interview__key
    $hh = $households | Where-Object { $_.interview_key -eq $key } | Select-Object -First 1
    $products = @{}
    foreach ($cat in $categories) {
        $prodCol = "${cat}_prod"
        $avail = if ($row.$prodCol -eq "1") { 1 } else { 0 }
        $itemCount = 0
        if ($avail -eq 1) {
            foreach ($h in $headers) {
                if ($h -match "^${cat}_type__" -and $row.$h -eq "1") {
                    $itemCount++
                }
            }
        }
        $products[$cat] = [PSCustomObject]@{ available = $avail; items = $itemCount }
    }
    $outlets += [PSCustomObject]@{
        interview_key = $key
        outlet_id     = $row.marketlist_roster__id
        outlet_name   = $row.outlet_list
        products      = $products
        province      = if ($hh) { $hh.province_name } else { "" }
        ea            = if ($hh) { $hh.ea } else { "" }
        team_id       = if ($hh) { $hh.team_id } else { "" }
    }
}

# Build HH progress for market
$marketByHH = @{}
foreach ($o in $outlets) {
    $key = $o.interview_key
    if (!$marketByHH.ContainsKey($key)) { $marketByHH[$key] = 0 }
    $marketByHH[$key]++
}

$hhProgress = $households | ForEach-Object {
    $key = $_.interview_key
    $count = if ($marketByHH.ContainsKey($key)) { $marketByHH[$key] } else { 0 }
    [PSCustomObject]@{
        interview_key = $key
        province      = $_.province_name
        ea            = $_.ea
        team_id       = $_.team_id
        has_market    = if ($count -gt 0) { 1 } else { 0 }
        outlet_count  = $count
    }
}

$marketJson = [PSCustomObject]@{
    outlets     = $outlets
    hh_progress = $hhProgress
    categories  = $categories
}
$marketJson | ConvertTo-Json -Depth 5 | Out-File (Join-Path $OutDir "market.json") -Encoding UTF8
$mktWithData = ($hhProgress | Where-Object { $_.has_market -eq 1 }).Count
Write-Host "  -> $($outlets.Count) outlets from $mktWithData households"

# --- 10. Generate CSV Files ---
Write-Host "Generating CSV extracts..."

# Build household head lookup
$hhHeadLookup = @{}
foreach ($person in $persons) {
    if ($person.relat -eq '1') {
        $hhHeadLookup[$person.interview_key] = $person.name
    }
}

# Generate CSV records
$csvRecords = $households | ForEach-Object {
    $hhHead = if ($hhHeadLookup.ContainsKey($_.interview_key)) { $hhHeadLookup[$_.interview_key] } else { "" }
    $date1 = if ($_.interview_date) { $_.interview_date } else { "" }
    $date2 = if ($_.interview_date -and $_.interview_date -match '^\d{4}-\d{2}-\d{2}$') {
        $parts = $_.interview_date -split '-'
        "$($parts[2])/$($parts[1])/$($parts[0])"
    }
    else { $_.interview_date }
    
    [PSCustomObject]@{
        team_id            = $_.team_id
        province_name      = $_.province_name
        ea                 = $_.ea
        area_council       = $_.area_council
        village            = $_.village
        interview_key      = $_.interview_key
        household_serial   = $_.household_serial
        household_head     = $hhHead
        phone1             = $_.phone1
        phone2             = $_.phone2
        interview_status   = $_.interview_status
        interview_date_iso = $date1
        interview_date_dmy = $date2
    }
}

# Write CSV with household serial ID
$csv1 = [System.Collections.Generic.List[string]]::new()
$csv1.Add('Team ID,Province,EA,Area Council,Village,Interview Key,Household Serial ID,Household Head,Phone 1,Phone 2,Interview Status,Interview Date')
foreach ($rec in $csvRecords) {
    $csv1.Add(('{0},{1},{2},{3},{4},{5},{6},"{7}",{8},{9},{10},{11}' -f `
                $rec.team_id, $rec.province_name, $rec.ea, $rec.area_council, $rec.village, `
                $rec.interview_key, $rec.household_serial, $rec.household_head, `
                $rec.phone1, $rec.phone2, $rec.interview_status, $rec.interview_date_iso))
}
[System.IO.File]::WriteAllLines((Join-Path $PSScriptRoot "round1_households.new.csv"), $csv1, [System.Text.UTF8Encoding]::new($false))

# Write CSV without household serial ID (DD/MM/YYYY date format)
$csv2 = [System.Collections.Generic.List[string]]::new()
$csv2.Add('Team ID,Province,EA,Area Council,Village,Interview Key,Household Head,Phone 1,Phone 2,Interview Status,Interview Date')
foreach ($rec in $csvRecords) {
    $csv2.Add(('{0},{1},{2},{3},{4},{5},"{6}",{7},{8},{9},{10}' -f `
                $rec.team_id, $rec.province_name, $rec.ea, $rec.area_council, $rec.village, `
                $rec.interview_key, $rec.household_head, `
                $rec.phone1, $rec.phone2, $rec.interview_status, $rec.interview_date_dmy))
}
[System.IO.File]::WriteAllLines((Join-Path $PSScriptRoot "round1_households_id.new.csv"), $csv2, [System.Text.UTF8Encoding]::new($false))

Write-Host "  -> round1_households.csv: $($csvRecords.Count) records"
Write-Host "  -> round1_households_id.csv: $($csvRecords.Count) records"

Write-Host "`nDone! JSON files written to: $OutDir"
Write-Host "Files created:"
Get-ChildItem $OutDir -Filter "*.json" | ForEach-Object { Write-Host "  $($_.Name) ($([math]::Round($_.Length/1024, 1)) KB)" }
