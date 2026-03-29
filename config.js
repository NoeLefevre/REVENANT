const config = {
  // REQUIRED
  appName: "REVENANT",
  // REQUIRED: a short description of your app for SEO tags (can be overwritten)
  appDescription:
    "Protect your SaaS MRR from failed payments. REVENANT automatically recovers failed invoices, prevents card expiry surprises, and shields you from chargebacks.",
  // REQUIRED (no https://, not trailing slash at the end, just the naked domain)
  domainName: "revenant.so",
  crisp: {
    // Crisp website ID. IF YOU DON'T USE CRISP: just remove this => Then add a support email in this config file (resend.supportEmail) otherwise customer support won't work.
    id: "",
    onlyShowOnRoutes: ["/"],
  },
  stripe: {
    // REVENANT pricing — 3 MRR-based tiers
    // Set the actual Stripe priceIds in your .env.local:
    //   STRIPE_PRICE_UNDER_30K, STRIPE_PRICE_30K_80K, STRIPE_PRICE_OVER_80K
    plans: [
      {
        priceId:
          process.env.NODE_ENV === "development"
            ? "price_dev_under30k"
            : process.env.STRIPE_PRICE_UNDER_30K ?? "price_under_30k",
        name: "Starter",
        description: "For growing SaaS under $30K MRR",
        price: 49,
        priceAnchor: 99,
        features: [
          { name: "Automated dunning sequences" },
          { name: "DIE Decline classification" },
          { name: "Card expiry alerts (J-30/14/7)" },
          { name: "Recovery score per customer" },
          { name: "Up to $30K MRR protected" },
        ],
      },
      {
        isFeatured: true,
        priceId:
          process.env.NODE_ENV === "development"
            ? "price_dev_30k_80k"
            : process.env.STRIPE_PRICE_30K_80K ?? "price_30k_80k",
        name: "Growth",
        description: "For scaling SaaS between $30K–$80K MRR",
        price: 99,
        priceAnchor: 199,
        features: [
          { name: "Everything in Starter" },
          { name: "Chargeback Shield pre-debit emails" },
          { name: "Payday-aware retry scheduling" },
          { name: "Revenue Safety Score™ card" },
          { name: "Up to $80K MRR protected" },
        ],
      },
      {
        priceId:
          process.env.NODE_ENV === "development"
            ? "price_dev_over80k"
            : process.env.STRIPE_PRICE_OVER_80K ?? "price_over_80k",
        name: "Scale",
        description: "For established SaaS over $80K MRR",
        price: 249,
        priceAnchor: 499,
        features: [
          { name: "Everything in Growth" },
          { name: "Priority support" },
          { name: "Custom dunning sequence timing" },
          { name: "Slack recovery alerts" },
          { name: "Unlimited MRR protected" },
        ],
      },
    ],
  },
  aws: {
    bucket: "bucket-name",
    bucketUrl: `https://bucket-name.s3.amazonaws.com/`,
    cdn: "https://cdn-id.cloudfront.net/",
  },
  resend: {
    fromNoReply: `REVENANT <noreply@revenant.so>`,
    fromAdmin: `REVENANT <hello@revenant.so>`,
    supportEmail: "hello@revenant.so",
  },
  colors: {
    theme: "light",
    main: "#6C63FF",
  },
  auth: {
    loginUrl: "/signin",
    callbackUrl: "/overview",
  },
};

export default config;
