


const VISUALISATION_ID = "27380474";

// ⚠️ If you put a real key here, it will be visible to anyone who loads the page.
const API_KEY = "QjDqiYcwNRvCwZLiIDj50O-fvzAyGcadaOG091tD52t0hul3TA1b5ZXLKoNCe2NI";

let vis = null;

async function loadAndRender() {
  // 1) Load your local CSV (must be named exactly input_data.csv)
  const csvText = await fetch("./input_data.csv").then((res) => res.text());
  const dataRows = d3.csvParse(csvText);

  if (!dataRows.length) throw new Error("input_data.csv is empty.");

  // 2) Pick columns (simple assumption):
  //    - first column = x/label (e.g., Year)
  //    - second column = y/value (e.g., Emissions)
  const columns = dataRows.columns;
  if (columns.length < 2) {
    throw new Error("CSV needs at least 2 columns (x and y).");
  }
  const labelCol = columns[0];
  const valueCol = columns[1];

  // 3) Fetch the base template state (keeps template styling/settings)
  const configJson = await fetch(
    `https://public.flourish.studio/visualisation/${VISUALISATION_ID}/visualisation.json`
  ).then((res) => res.json());

  const bindings = {
    data: {
      label: labelCol,
      value: [valueCol],
      metadata: []
    }
  };

  // 4) Create the chart (static)
  vis = new Flourish.Live({
    container: "#chart",
    api_key: API_KEY,
    base_visualisation_id: VISUALISATION_ID,
    base_visualisation_data_format: "object",
    data: { data: dataRows },
    bindings,
    state: configJson.state
  });
}

loadAndRender().catch((err) => {
  console.error(err);
  document.getElementById("chart").innerHTML =
    "<p style='font-family:sans-serif'>Error loading chart. Check console.</p>";
});




