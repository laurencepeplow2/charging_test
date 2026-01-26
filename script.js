

const API_KEY = "QjDqiYcwNRvCwZLiIDj50O-fvzAyGcadaOG091tD52t0hul3TA1b5ZXLKoNCe2NI";

const VISUALISATION_ID = "27380474";

const CSV_PATH = "./input_data.csv";

// These must match your CSV header exactly:
const COL_PERIOD = "Period";
const COL_COUNTRY = "Country";
const COL_AC = "AC charging points";
const COL_DC = "DC charging points";

let allRows = [];
let vis = null;

const countrySelect = document.getElementById("countrySelect");
const downloadBtn = document.getElementById("downloadBtn");
const timelapseImg = document.getElementById("timelapseImg");
const timelapseHint = document.getElementById("timelapseHint");

function uniq(values) {
  return Array.from(new Set(values)).filter(v => v !== undefined && v !== null && String(v).trim() !== "");
}

function rowsToCsv(rows, columns) {
  const escape = (v) => {
    const s = (v ?? "").toString();
    if (s.includes('"') || s.includes(",") || s.includes("\n")) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const header = columns.map(escape).join(",");
  const lines = rows.map(r => columns.map(c => escape(r[c])).join(","));
  return [header, ...lines].join("\n");
}

function setTimelapse(country) {
  // Convention: ./timelapse/<Country>.gif e.g. ./timelapse/EU.gif
  const src = `./timelapse/${country}.gif`;
  timelapseImg.src = src;

  timelapseHint.textContent = `Showing: timelapse/${country}.gif`;
  timelapseImg.onerror = () => {
    timelapseHint.textContent = `Missing GIF: timelapse/${country}.gif`;
  };
}

async function ensureFlourishVis(filteredRows) {
  // Pull base config so the template styling is preserved
  const configJson = await fetch(
    `https://public.flourish.studio/visualisation/${VISUALISATION_ID}/visualisation.json`
  ).then((res) => res.json());

  // Bind stacked series: AC + DC
  const bindings = {
    data: {
      label: COL_PERIOD,
      value: [COL_AC, COL_DC],
      metadata: []
    }
  };

  // Force stacked bars (and keep the rest from the template)
  const state = {
    ...configJson.state,
    chart_type: "column_stacked",
    aggregation_mode: "none",
    axes: {
      ...(configJson.state.axes || {}),
      stacking_mode: "stacked"
    }
  };

  if (!vis) {
    vis = new Flourish.Live({
      container: "#network_graph",
      api_key: API_KEY,
      base_visualisation_id: VISUALISATION_ID,
      base_visualisation_data_format: "object",
      data: { data: filteredRows },
      bindings,
      state
    });
  } else {
    vis.update({
      data: { data: filteredRows },
      bindings,
      state
    });
  }
}

async function renderForCountry(country) {
  const filtered = allRows.filter(r => String(r[COL_COUNTRY]) === String(country));

  // Update Flourish
  await ensureFlourishVis(filtered);

  // Update GIF
  setTimelapse(country);
}

async function init() {
  // Load CSV
  const csvText = await fetch(CSV_PATH).then(res => res.text());
  allRows = d3.csvParse(csvText);

  // Basic validation
  const cols = allRows.columns || [];
  const required = [COL_PERIOD, COL_COUNTRY, COL_AC, COL_DC];
  const missing = required.filter(c => !cols.includes(c));
  if (missing.length) {
    console.error("Missing required columns:", missing);
    document.getElementById("network_graph").innerHTML =
      `<p style="font-family:sans-serif">CSV is missing columns: ${missing.join(", ")}</p>`;
    return;
  }

  // Populate country filter
  const countries = uniq(allRows.map(r => r[COL_COUNTRY])).sort();
  countrySelect.innerHTML = countries.map(c => `<option value="${c}">${c}</option>`).join("");

  // Default = first country
  const defaultCountry = countries[0] || "EU";
  countrySelect.value = defaultCountry;

  // Hook up filter change (applies to entire dashboard)
  countrySelect.addEventListener("change", async () => {
    await renderForCountry(countrySelect.value);
  });

  // Download button (downloads FILTERED data only; excludes GIF)
  downloadBtn.addEventListener("click", () => {
    const country = countrySelect.value;
    const filtered = allRows.filter(r => String(r[COL_COUNTRY]) === String(country));

    const csvOut = rowsToCsv(filtered, allRows.columns);
    const blob = new Blob([csvOut], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `charging_data_${country}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });

  // First render
  await renderForCountry(defaultCountry);
}

init().catch(err => {
  console.error(err);
  document.getElementById("network_graph").innerHTML =
    "<p style='font-family:sans-serif'>Error loading dashboard. Check console.</p>";
});
