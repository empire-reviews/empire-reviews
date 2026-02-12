import { ActionFunction, LoaderFunction } from "@remix-run/node";

export const loader: LoaderFunction = async () => {
    const csvContent = [
        "product_url,rating,review_text,customer_name,email,picture_urls,reply,date",
        "https://yourstore.com/products/black-t-shirt,5,I love this quality!,John Doe,john@example.com,https://link-to-image.jpg,Thanks John!,2023-10-25",
        ",5,Great shop overall!,Jane Smith,jane@example.com,,,2023-10-26"
    ].join("\n");

    return new Response(csvContent, {
        headers: {
            "Content-Type": "text/csv",
            "Content-Disposition": "attachment; filename=empire_reviews_template.csv",
        },
    });
};
