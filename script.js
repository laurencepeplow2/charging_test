
const API_KEY = "QjDqiYcwNRvCwZLiIDj50O-fvzAyGcadaOG091tD52t0hul3TA1b5ZXLKoNCe2NI";

// ----- Chart 1 (filtered) -----
const VISUALISATION_ID = "27380474";

// ----- Chart 2 (AFIR, unfiltered) -----
const AFIR_VISUALISATION_ID = "27423802";

const CSV_PATH = "./input_data.csv";
const AFIR_CSV_PATH = "./AFIR_compliance.csv";

// Must match input_data.csv headers exactly:
const COL_PERIOD = "Period";
const COL_COUNTRY = "Country";
const COL_BEV = "BEV fleet";
const COL_AC = "AC charging points";
const COL_DC = "DC charging points";

// Must match AFIR_compliance.csv headers exactly:
const AFIR_COL_COUNTRY = "Country";
const AFIR_COL_TARGET = "Target 2025";
const AFIR_COL_TOTAL = "Total charging power";
const AFIR_COL_AREA = "Area";

let allRows = [];
let afirRows = [];

let vis = null;        // filtered chart
let afirVis = null;    // AFIR chart

const countrySelect = document.getElementById("countrySelect");
const downloadBtn = document.getElementById("downloadBtn");
const timelapseImg = document.getElementById("timelapseImg");
const timelapseHint = document.getElementById("timelapseHint");

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
  const src = `./timelapse/${country}.gif`;
  timelapseImg.src = src;
  timelapseHint.textContent = `Showing: timelapse/${country}.gif`;

  timelapseImg.onerror = () => {
    timelapseHint.textContent = `Missing GIF: timelapse/${country}.gif`;
  };
}

async function renderFilteredFlourish(filteredRows) {
  const configJson = await fetch(
    `https://public.flourish.studio/visualisation/${VISUALISATION_ID}/visualisation.json`
  ).then((res) => res.json());

  // BEV first (line), then AC/DC (stacked columns)
  const bindings = {
    data: {
      label: COL_PERIOD,
      value: [COL_BEV, COL_AC, COL_DC],
      metadata: []
    }
  };

  const state = {
    ...configJson.state,
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

async function renderAfirChart() {
  const configJson = await fetch(
    `https://public.flourish.studio/visualisation/${AFIR_VISUALISATION_ID}/visualisation.json`
  ).then((res) => res.json());

  // Basic binding: Country on axis, 2 measures as series; keep Area as metadata for tooltips/colouring if template uses it
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

async function renderForCountry(country) {
  const filtered = allRows.filter(r => (r[COL_COUNTRY] ?? "").toString() === country);
  await renderFilteredFlourish(filtered);
  setTimelapse(country);
}

async function init() {
  // Load main CSV (filtered chart + gif)
  const csvText = await fetch(CSV_PATH).then(res => res.text());
  allRows = d3.csvParse(csvText);

  const required = [COL_PERIOD, COL_COUNTRY, COL_BEV, COL_AC, COL_DC];
  const missing = required.filter(c => !(allRows.columns || []).includes(c));
  if (missing.length) {
    document.getElementById("network_graph").innerHTML =
      `<p style="font-family:sans-serif">input_data.csv missing columns: ${missing.join(", ")}</p>`;
    return;
  }

  // Populate global country filter
  const countries = uniq(allRows.map(r => r[COL_COUNTRY])).sort();
  countrySelect.innerHTML = countries.map(c => `<option value="${c}">${c}</option>`).join("");
  const defaultCountry = countries[0] || "EU";
  countrySelect.value = defaultCountry;

  countrySelect.addEventListener("change", async () => {
    await renderForCountry(countrySelect.value);
  });

  // Download filtered main data only (no GIF, no AFIR)
  downloadBtn.addEventListener("click", () => {
    const country = countrySelect.value;
    const filtered = allRows.filter(r => (r[COL_COUNTRY] ?? "").toString() === country);

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

  // Load AFIR CSV (unfiltered)
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

  // First render of filtered row
  await renderForCountry(defaultCountry);
}

init().catch(err => {
  console.error(err);
  document.getElementById("network_graph").innerHTML =
    "<p style='font-family:sans-serif'>Error loading dashboard. Check console.</p>";
});
