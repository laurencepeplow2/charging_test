
const API_KEY = "QjDqiYcwNRvCwZLiIDj50O-fvzAyGcadaOG091tD52t0hul3TA1b5ZXLKoNCe2NI";

// Chart 1 template (existing)
const VISUALISATION_ID_1 = "27380474";
// Chart 2 template (new)
const VISUALISATION_ID_2 = "27423802";

// ⚠️ Visible in browser if you put it here
const API_KEY = "PASTE_YOUR_FLOURISH_API_KEY_HERE";

const CSV_PATH_1 = "./input_data.csv";
const CSV_PATH_2 = "./power_data.csv";

// CSV 1 headers (time series)
const COL_PERIOD = "Period";
const COL_COUNTRY = "Country";
const COL_BEV = "BEV fleet";
const COL_AC = "AC charging points";
const COL_DC = "DC charging points";

// CSV 2 headers (power vs target)
const COL_COUNTRY_2 = "Country";
const COL_TARGET = "Target 2025";
const COL_POWER = "Total charging power";
const COL_AREA = "Area";

let allRows1 = [];
let allRows2 = [];

let vis1 = null;
let vis2 = null;

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

async function renderChart1(filteredRows) {
  const configJson = await fetch(
    `https://public.flourish.studio/visualisation/${VISUALISATION_ID_1}/visualisation.json`
  ).then(res => res.json());

  // BEV first (line), AC/DC next (stacked columns)
  const bindings = {
    data: { label: COL_PERIOD, value: [COL_BEV, COL_AC, COL_DC], metadata: [] }
  };

  const state = {
    ...configJson.state,
    axes: { ...(configJson.state.axes || {}), stacking_mode: "stacked" }
  };

  if (!vis1) {
    vis1 = new Flourish.Live({
      container: "#network_graph",
      api_key: API_KEY,
      base_visualisation_id: VISUALISATION_ID_1,
      base_visualisation_data_format: "object",
      data: { data: filteredRows },
      bindings,
      state
    });
  } else {
    vis1.update({ data: { data: filteredRows }, bindings, state });
  }
}

async function renderChart2() {
  const configJson = await fetch(
    `https://public.flourish.studio/visualisation/${VISUALISATION_ID_2}/visualisation.json`
  ).then(res => res.json());

  // Country as label, two values (target vs actual power). Area as metadata (kept for tooltip / legend if template uses it)
  const bindings = {
    data: { label: COL_COUNTRY_2, value: [COL_TARGET, COL_POWER], metadata: [COL_AREA] }
  };

  // Mostly keep template state as-is (so the chart behaves like your Flourish design)
  const state = configJson.state;

  if (!vis2) {
    vis2 = new Flourish.Live({
      container: "#power_chart",
      api_key: API_KEY,
      base_visualisation_id: VISUALISATION_ID_2,
      base_visualisation_data_format: "object",
      data: { data: allRows2 },
      bindings,
      state
    });
  } else {
    vis2.update({ data: { data: allRows2 }, bindings, state });
  }
}

async function renderForCountry(country) {
  const filtered1 = allRows1.filter(r => (r[COL_COUNTRY] ?? "").toString() === country);
  await renderChart1(filtered1);
  setTimelapse(country);

  // Chart 2 is an overview table by country, so it does NOT get filtered by the global country selector.
  // (If you later want it filtered by Area or something else, we can add another global filter.)
}

async function init() {
  // Load both CSVs
  const csvText1 = await fetch(CSV_PATH_1).then(res => res.text());
  allRows1 = d3.csvParse(csvText1);

  const csvText2 = await fetch(CSV_PATH_2).then(res => res.text());
  allRows2 = d3.csvParse(csvText2);

  // Validate CSV 1 columns
  const required1 = [COL_PERIOD, COL_COUNTRY, COL_BEV, COL_AC, COL_DC];
  const missing1 = required1.filter(c => !(allRows1.columns || []).includes(c));
  if (missing1.length) {
    document.getElementById("network_graph").innerHTML =
      `<p style="font-family:sans-serif">input_data.csv missing columns: ${missing1.join(", ")}</p>`;
    return;
  }

  // Validate CSV 2 columns
  const required2 = [COL_COUNTRY_2, COL_TARGET, COL_POWER, COL_AREA];
  const missing2 = required2.filter(c => !(allRows2.columns || []).includes(c));
  if (missing2.length) {
    document.getElementById("power_chart").innerHTML =
      `<p style="font-family:sans-serif">power_data.csv missing columns: ${missing2.join(", ")}</p>`;
    return;
  }

  // Populate country selector from CSV 1 (time series)
  const countries = uniq(allRows1.map(r => r[COL_COUNTRY])).sort();
  countrySelect.innerHTML = countries.map(c => `<option value="${c}">${c}</option>`).join("");

  const defaultCountry = countries[0] || "EU";
  countrySelect.value = defaultCountry;

  countrySelect.addEventListener("change", async () => {
    await renderForCountry(countrySelect.value);
  });

  // Render chart 2 once
  await renderChart2();

  // Download ZIP (filtered time-series + full power table; excludes GIF)
  downloadBtn.addEventListener("click", async () => {
    const country = countrySelect.value;
    const filtered1 = allRows1.filter(r => (r[COL_COUNTRY] ?? "").toString() === country);

    const zip = new JSZip();
    zip.file(`charging_timeseries_${country}.csv`, rowsToCsv(filtered1, allRows1.columns));
    zip.file(`charging_power_by_country.csv`, rowsToCsv(allRows2, allRows2.columns));

    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `charging_dashboard_data_${country}.zip`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });

  // First render for default country
  await renderForCountry(defaultCountry);
}

init().catch(err => {
  console.error(err);
  document.getElementById("network_graph").innerHTML =
    "<p style='font-family:sans-serif'>Error loading dashboard. Check console.</p>";
});
