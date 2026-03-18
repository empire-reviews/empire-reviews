import { redirect } from "@remix-run/node";
export const loader = async () => {
    // Test a basic redirect to see if Vercel allows it
    return redirect("https://www.google.com");
};
