import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { Form, useLoaderData } from "@remix-run/react";

import { login } from "../../shopify.server";

import styles from "./styles.module.css";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return { showForm: Boolean(login) };
};

export default function App() {
  const { showForm } = useLoaderData<typeof loader>();

  return (
    <div className={styles.index}>
      <div className={styles.content}>
        <div className={styles.logoContainer}>
          <img src="/logo.png" alt="Empire Reviews Logo" className={styles.logo} />
        </div>
        <h1 className={styles.heading}>Empire Reviews - Transform Customer Feedback into Revenue</h1>
        <p className={styles.text}>
          Automate review collection with smart email campaigns. Display beautiful photo reviews.
          Increase conversions with powerful social proof.
        </p>
        {showForm && (
          <Form className={styles.form} method="post" action="/auth/login">
            <label className={styles.label}>
              <span>Shop domain</span>
              <input className={styles.input} type="text" name="shop" />
              <span>e.g: my-shop-domain.myshopify.com</span>
            </label>
            <button className={styles.button} type="submit">
              Install Empire Reviews
            </button>
          </Form>
        )}
        <ul className={styles.list}>
          <li>
            <strong>Automated Review Collection</strong>. Psychology-driven email campaigns
            that collect 5x more reviews with photo/video testimonials automatically.
          </li>
          <li>
            <strong>Beautiful Review Widgets</strong>. Stunning, customizable displays with
            star ratings, photo carousels, trust badges, and verified purchase indicators.
          </li>
          <li>
            <strong>AI-Powered Insights</strong>. Understand customer sentiment instantly
            with automated analysis, trend detection, and conversion tracking.
          </li>
        </ul>
      </div>
    </div>
  );
}
