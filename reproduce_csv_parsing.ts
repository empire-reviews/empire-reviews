
// Mock of the parsing logic from app.import.tsx

function parseCSV(text: string) {
    const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
    // Parse headers first
    const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, '').toLowerCase().replace(/[\s_]+/g, ''));

    console.log("Normalized Headers:", headers);

    const result = [];

    for (let i = 1; i < lines.length; i++) {
        const obj: any = {};
        const currentline = lines[i];
        if (!currentline.trim()) continue;

        let matches = [];
        try {
            // Logic from app.import.tsx
            const entries = currentline.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
            matches = entries.map(e => e.trim());
        } catch (e) {
            matches = currentline.split(',');
        }

        console.log(`Row ${i} matches:`, matches);

        headers.forEach((header, index) => {
            let value = matches[index] ? matches[index].trim() : '';
            value = value.replace(/^"|"$/g, '').replace(/""/g, '"');

            // Log mapping attempts for Review Body
            if (header.includes('body')) {
                console.log(`Checking header matched '${header}' at index ${index}. Value: "${value}"`);
            }

            // Map common variations to standard keys
            if (['rating', 'stars', 'star'].includes(header)) obj['rating'] = value;
            else if (['body', 'content', 'review', 'comment', 'text', 'reviewtext', 'reviewcontent', 'reviewbody'].includes(header)) {
                console.log(`MATCHED BODY! Header: ${header}, Value: ${value}`);
                obj['body'] = value;
            }
            // ... other mappings ...
        });

        // Fallback logic check
        if (!obj['body']) {
            console.log("Fallback check for row", i);
            headers.forEach((header, index) => {
                let value = matches[index] ? matches[index].trim() : '';
                value = value.replace(/^"|"$/g, '').replace(/""/g, '"');
                if (value.length > 20 && !obj['body']) {
                    console.log(`Fallback MATCH! Header: ${header}, Value: ${value}`);
                    obj['body'] = value;
                }
            })
        }

        result.push(obj);
    }
    return result;
}

// Mock CSV Data based on user screenshot
const csvContent = `Product Name,Customer,Email,Stars,Review Title,Review Body,Review Date,Verified Purchase
The Collect,Liam S.,liam.s@em,5,Amazing G,Absolutely love the design! It glides like a dream on,03-01-2026,Yes
The Collect,Sarah J.,sj89@ema,3,Scratches,Decent board for the price but the top sheet scratch,27-12-2025,Yes
`;

console.log("Starting Test...");
const result = parseCSV(csvContent);
console.log("Result:", JSON.stringify(result, null, 2));
