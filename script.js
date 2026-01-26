const VISUALISATION_ID = "27380474";
const API_KEY = "PASTE_YOUR_FLOURISH_API_KEY_HERE";

const CSV_PATH = "./input_data.csv";

// Must match CSV headers exactly:
const COL_PERIOD = "Period";
const COL_COUNTRY = "Country";
const COL_BEV = "BEV fleet";
const COL_AC = "AC charging points";
const COL_DC = "DC charging points";

let allRows = [];
let vis = null;

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

async function renderFlourish(filteredRows) {
  const configJson = await fetch(
    `https://public.flourish.studio/visualisation/${VISUALISATION_ID}/visualisation.json`
  ).then((res) => res.json());

  // IMPORTANT: BEV first (line), then AC/DC (columns), per Flourish combo behavior.
  const bindings = {
    data: {
      label: COL_PERIOD,
      value: [COL_BEV, COL_AC, COL_DC],
      metadata: []
    }
  };

  // Keep the template’s chart_type/etc. (so it stays “combo” if that’s how the template is set up)
  // Only enforce stacking for the column series.
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

async function renderForCountry(country) {
  const filtered = allRows.filter(r => (r[COL_COUNTRY] ?? "").toString() === country);
  await renderFlourish(filtered);
  setTimelapse(country);
}

async function init() {
  const csvText = await fetch(CSV_PATH).then(res => res.text());
  allRows = d3.csvParse(csvText);

  const required = [COL_PERIOD, COL_COUNTRY, COL_BEV, COL_AC, COL_DC];
  const missing = required.filter(c => !(allRows.columns || []).includes(c));
  if (missing.length) {
    document.getElementById("network_graph").innerHTML =
      `<p style="font-family:sans-serif">CSV missing columns: ${missing.join(", ")}</p>`;
    return;
  }

  const countries = uniq(allRows.map(r => r[COL_COUNTRY])).sort();
  countrySelect.innerHTML = countries.map(c => `<option value="${c}">${c}</option>`).join("");

  const defaultCountry = countries[0] || "EU";
  countrySelect.value = defaultCountry;

  countrySelect.addEventListener("change", async () => {
    await renderForCountry(countrySelect.value);
  });

  // Download filtered data only (no GIF)
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

  await renderForCountry(defaultCountry);
}

init().catch(err => {
  console.error(err);
  document.getElementById("network_graph").innerHTML =
    "<p style='font-family:sans-serif'>Error loading dashboard. Check console.</p>";
});
