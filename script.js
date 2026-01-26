

const API_KEY = "QjDqiYcwNRvCwZLiIDj50O-fvzAyGcadaOG091tD52t0hul3TA1b5ZXLKoNCe2NI";

const VISUALISATION_ID = "27380474";


let vis = null;

async function loadAndRender() {
  // Load local CSV
  const csvText = await fetch("./input_data.csv").then((res) => res.text());
  const dataRows = d3.csvParse(csvText);

  if (!dataRows.length) throw new Error("input_data.csv is empty.");

  // Assume: first column = x/label, second column = y/value
  const columns = dataRows.columns;
  if (columns.length < 2) throw new Error("CSV needs at least 2 columns.");

  const labelCol = columns[0];
  const valueCol = columns[1];

  // Fetch base template state
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

  // Render into #network_graph (renamed container)
  vis = new Flourish.Live({
    container: "#network_graph",
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
  document.getElementById("network_graph").innerHTML =
    "<p>Error loading chart. Check console.</p>";
});


