// api/sheet.js
// Vercel serverless function to fetch a CSV of a Google Sheet.
// It expects two environment variables:
//   GOOGLE_SHEET_ID: The ID of the Google Sheet document
//   GOOGLE_SHEET_NAME: The name of the sheet/tab to export (case sensitive)
//
// The function builds a URL to the Google Visualization API which returns
// the sheet contents as CSV. The response is proxied back to the client
// with CORS headers so that it can be fetched from the browser. If there
// are any errors (missing environment variables, network failure, etc.)
// the function responds with a 500 status and an error message.

export default async function handler(req, res) {
  const sheetId = process.env.GOOGLE_SHEET_ID;
  const sheetName = process.env.GOOGLE_SHEET_NAME;

  if (!sheetId || !sheetName) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(500).send('Missing GOOGLE_SHEET_ID or GOOGLE_SHEET_NAME environment variables');
    return;
  }

  // Build URL for the Google Visualization API. Using gviz/tq with
  // tqx=out:csv returns the sheet as CSV. This endpoint works for
  // published and publicly shared sheets. If the sheet is private or
  // restricted the request will fail.
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch sheet: ${response.status} ${response.statusText}`);
    }
    const csv = await response.text();
    // Set CORS header so the browser can fetch this endpoint from any origin
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(200).send(csv);
  } catch (err) {
    console.error(err);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(500).send(err.message || 'Error fetching sheet');
  }
}
