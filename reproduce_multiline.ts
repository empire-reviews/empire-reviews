
// Mock of the current parsing logic
function parseCSV(text: string) {
    // FLAW: Splits by newline immediately, breaking quoted multiline fields
    const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);

    const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, '').toLowerCase().replace(/[^a-z0-9]/g, ''));
    console.log("Headers:", headers);

    const result = [];

    for (let i = 1; i < lines.length; i++) {
        const obj: any = {};
        const currentline = lines[i];
        if (!currentline.trim()) continue;

        let matches = [];
        const entries = currentline.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
        matches = entries.map(e => e.trim());

        headers.forEach((header, index) => {
            let value = matches[index] ? matches[index].trim() : '';
            value = value.replace(/^"|"$/g, '').replace(/""/g, '"');

            if (['body', 'reviewbody'].includes(header)) {
                obj['body'] = value;
            }
        });
        result.push(obj);
    }
    return result;
}

// Robust Parser (The FIX)
function parseCSVRobust(text: string) {
    const arr = [];
    let quote = false;  // 'true' means we're inside a quoted field

    // Iterate over each character, keep track of current row and column (of the returned array)
    let row = 0, col = 0, c = 0;
    let data = text.split("");

    arr[row] = [];
    arr[row][col] = "";

    for (c = 0; c < data.length; c++) {
        var cc = data[c], nc = data[c + 1];        // Current character, next character
        arr[row][col] = arr[row][col] || "";   // create a new column (start with empty string) if necessary

        // If the current character is a quotation mark, and we're inside a
        // quoted field, and the next character is also a quotation mark,
        // add a quotation mark to the current column and skip the next character
        if (cc == '"' && quote && nc == '"') { arr[row][col] += cc; ++c; }

        // If it's just one quotation mark, begin/end quoted field
        else if (cc == '"') { quote = !quote; }

        // If it's a comma and we're not in a quoted field, move on to the next column
        else if (cc == ',' && !quote) { ++col; arr[row][col] = ""; }

        // If it's a newline (CRLF) and we're not in a quoted field, skip the next character
        // and move on to the next row and move to column 0 of that new row
        else if (cc == '\r' && nc == '\n' && !quote) { ++row; col = 0; ++c; arr[row] = []; }

        // If it's a newline (LF or CR) and we're not in a quoted field,
        // move on to the next row and move to column 0 of that new row
        else if ((cc == '\n' || cc == '\r') && !quote) { ++row; col = 0; arr[row] = []; }

        // Otherwise, add the current character to the current column
        else { arr[row][col] += cc; }
    }

    // Now map to objects
    const headers = arr[0].map(h => h.trim().toLowerCase().replace(/[^a-z0-9]/g, ''));
    const result = [];
    for (let i = 1; i < arr.length; i++) {
        const row = arr[i];
        if (row.length < 2) continue; // Skip empty rows

        const obj: any = {};
        headers.forEach((h, idx) => {
            if (['body', 'reviewbody'].includes(h)) obj['body'] = row[idx];
        });
        result.push(obj);
    }
    return result;
}

const multilineCSV = `Review Title,Review Body
"Good","This is line 1.
This is line 2."
"Bad","Simple body"`;

console.log("--- TESTING ORIGINAL PARSER ---");
const res1 = parseCSV(multilineCSV);
console.log(JSON.stringify(res1, null, 2));

console.log("\n--- TESTING ROBUST PARSER ---");
const res2 = parseCSVRobust(multilineCSV);
console.log(JSON.stringify(res2, null, 2));
