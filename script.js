
const API_KEY = "QjDqiYcwNRvCwZLiIDj50O-fvzAyGcadaOG091tD52t0hul3TA1b5ZXLKoNCe2NI";

// ----- Flourish templates -----
const FILTERED_VISUALISATION_ID = "27380474"; // combo chart template (BEV line + bars)
const AFIR_VISUALISATION_ID = "27423802";     // AFIR chart template
const TENT_VISUALISATION_ID = "27424153";     // TEN-T chart template


// ----- CSV files (in repo root) -----
const MAIN_CSV_PATH = "./input_data.csv";
const AFIR_CSV_PATH = "./AFIR_compliance.csv";
const TENT_CSV_PATH = "./TenT_historic.csv";

// ----- input_data.csv columns -----
const COL_PERIOD = "Period";
const COL_COUNTRY = "Country";
const COL_BEV = "BEV fleet";
const COL_AC = "AC charging points";
const COL_DC = "DC charging points";

// ----- AFIR_compliance.csv columns -----
const AFIR_COL_COUNTRY = "Country";
const AFIR_COL_TARGET = "Target 2025";
const AFIR_COL_TOTAL = "Total charging power";
const AFIR_COL_AREA = "Area";

// DOM
const countrySelect = document.getElementById("countrySelect");
const downloadBtn = document.getElementById("downloadBtn");
const timelapseImg = document.getElementById("timelapseImg");
const timelapseHint = document.getElementById("timelapseHint");

// Data
let mainRows = [];
let afirRows = [];
let tentRows = [];

// Flourish Live instances
let filteredVis = null;
let afirVis = null;
let tentVis = null;

function uniq(values) {
  return Array.from(new Set(values))
    .map(v => (v ?? "").toString().trim())
    .filter(v => v !== "");
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
  // Convention: timelapse/<Country>.gif (e.g. timelapse/EU.gif)
  const src = `./timelapse/${country}.gif`;
  timelapseImg.src = src;
  timelapseHint.textContent = `Showing: timelapse/${country}.gif`;

  timelapseImg.onerror = () => {
    timelapseHint.textContent = `Missing GIF: timelapse/${country}.gif`;
  };
}

async function renderFilteredChart(filteredRows) {
  const configJson = await fetch(
    `https://public.flourish.studio/visualisation/${FILTERED_VISUALISATION_ID}/visualisation.json`
  ).then(res => res.json());

  // IMPORTANT ORDER:
  // BEV first (line), then AC/DC (stacked columns) — relies on your template being a combo chart.
  const bindings = {
    data: {
      label: COL_PERIOD,
      value: [COL_BEV, COL_AC, COL_DC],
      metadata: []
    }
  };

  // Keep template settings; just enforce stacking for column series.
  const state = {
    ...configJson.state,
    axes: {
      ...(configJson.state.axes || {}),
      stacking_mode: "stacked"
    }
  };

  if (!filteredVis) {
    filteredVis = new Flourish.Live({
      container: "#network_graph",
      api_key: API_KEY,
      base_visualisation_id: FILTERED_VISUALISATION_ID,
      base_visualisation_data_format: "object",
      data: { data: filteredRows },
      bindings,
      state
    });
  } else {
    filteredVis.update({
      data: { data: filteredRows },
      bindings,
      state
    });
  }
}

async function renderAfirChart() {
  const configJson = await fetch(
    `https://public.flourish.studio/visualisation/${AFIR_VISUALISATION_ID}/visualisation.json`
  ).then(res => res.json());

  const bindings = {
    data: {
      label: AFIR_COL_COUNTRY,
      value: [AFIR_COL_TARGET, AFIR_COL_TOTAL],
      metadata: [AFIR_COL_AREA]
    }
  };

  if (!afirVis) {
    afirVis = new Flourish.Live({
      container: "#afir_chart",
      api_key: API_KEY,
      base_visualisation_id: AFIR_VISUALISATION_ID,
      base_visualisation_data_format: "object",
      data: { data: afirRows },
      bindings,
      state: configJson.state
    });
  } else {
    afirVis.update({
      data: { data: afirRows },
      bindings,
      state: configJson.state
    });
  }
}

function normaliseTentLabelColumn(rows) {
  // If the first header is blank, d3.csvParse will use "" as the column name.
  // We'll copy it to a safe name "__label" and bind to that instead.
  const cols = rows.columns || [];
  if (!cols.length) return { rows, labelCol: null, valueCols: [] };

  const first = cols[0];
  let labelCol = first;

  if (first === "") {
    labelCol = "__label";
    rows.forEach(r => {
      r[labelCol] = r[""];
    });
    // Keep original "" column as-is; just bind to __label.
  }

  const valueCols = cols.slice(1);
  return { rows, labelCol, valueCols };
}

async function renderTentChart() {
  const configJson = await fetch(
    `https://public.flourish.studio/visualisation/${TENT_VISUALISATION_ID}/visualisation.json`
  ).then(res => res.json());

  const { rows, labelCol, valueCols } = normaliseTentLabelColumn(tentRows);

  if (!labelCol || valueCols.length < 1) {
    document.getElementById("tent_chart").innerHTML =
      "<p style='font-family:sans-serif'>TenT_historic.csv needs a label column and at least one series column.</p>";
    return;
  }

  const bindings = {
    data: {
      label: labelCol,
      value: valueCols,
      metadata: []
    }
  };

  if (!tentVis) {
    tentVis = new Flourish.Live({
      container: "#tent_chart",
      api_key: API_KEY,
      base_visualisation_id: TENT_VISUALISATION_ID,
      base_visualisation_data_format: "object",
      data: { data: rows },
      bindings,
      state: configJson.state
    });
  } else {
    tentVis.update({
      data: { data: rows },
      bindings,
      state: configJson.state
    });
  }
}

async function renderForCountry(country) {
  const filtered = mainRows.filter(r => (r[COL_COUNTRY] ?? "").toString() === country);
  await renderFilteredChart(filtered);
  setTimelapse(country);
}

async function init() {
  // ---- Load main CSV (filtered chart + gif) ----
  const mainText = await fetch(MAIN_CSV_PATH).then(res => res.text());
  mainRows = d3.csvParse(mainText);

  const mainRequired = [COL_PERIOD, COL_COUNTRY, COL_BEV, COL_AC, COL_DC];
  const mainMissing = mainRequired.filter(c => !(mainRows.columns || []).includes(c));
  if (mainMissing.length) {
    document.getElementById("network_graph").innerHTML =
      `<p style="font-family:sans-serif">input_data.csv missing columns: ${mainMissing.join(", ")}</p>`;
    return;
  }

  const countries = uniq(mainRows.map(r => r[COL_COUNTRY])).sort();
  countrySelect.innerHTML = countries.map(c => `<option value="${c}">${c}</option>`).join("");
  const defaultCountry = countries[0] || "EU";
  countrySelect.value = defaultCountry;

  countrySelect.addEventListener("change", async () => {
    await renderForCountry(countrySelect.value);
  });

  downloadBtn.addEventListener("click", () => {
    const country = countrySelect.value;
    const filtered = mainRows.filter(r => (r[COL_COUNTRY] ?? "").toString() === country);

    const csvOut = rowsToCsv(filtered, mainRows.columns);
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

  // ---- Load AFIR CSV (unfiltered) ----
  const afirText = await fetch(AFIR_CSV_PATH).then(res => res.text());
  afirRows = d3.csvParse(afirText);

  const afirRequired = [AFIR_COL_COUNTRY, AFIR_COL_TARGET, AFIR_COL_TOTAL, AFIR_COL_AREA];
  const afirMissing = afirRequired.filter(c => !(afirRows.columns || []).includes(c));
  if (afirMissing.length) {
    document.getElementById("afir_chart").innerHTML =
      `<p style="font-family:sans-serif">AFIR_compliance.csv missing columns: ${afirMissing.join(", ")}</p>`;
  } else {
    await renderAfirChart();
  }

  // ---- Load TEN-T CSV (unfiltered) ----
  const tentText = await fetch(TENT_CSV_PATH).then(res => res.text());
  tentRows = d3.csvParse(tentText);

  if (!(tentRows.columns || []).length) {
    document.getElementById("tent_chart").innerHTML =
      "<p style='font-family:sans-serif'>TenT_historic.csv could not be parsed.</p>";
  } else {
    await renderTentChart();
  }

  // ---- First render for filtered components ----
  await renderForCountry(defaultCountry);
}

init().catch(err => {
  console.error(err);
  document.getElementById("network_graph").innerHTML =
    "<p style='font-family:sans-serif'>Error loading dashboard. Check console.</p>";
});
