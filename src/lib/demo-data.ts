/**
 * @file src/lib/demo-data.ts
 * @description Built-in Crown Paints East Africa preview dataset (KE/TZ/UG showrooms,
 * 7 departments, and 6-screen Showcase Loop) used before Supabase keys are configured.
 */

import type { QuickPostSlideConfig } from "@/db/schema";

export interface DemoCountry {
  id: string;
  code: string;
  name: string;
  currencyCode: string;
  timezone: string;
}

export interface DemoBranch {
  id: string;
  countryId: string;
  countryCode: string;
  code: string;
  name: string;
  branchType: "showroom" | "depot" | "factory" | "hq";
  city: string;
  openingTime: string;
  closingTime: string;
}

export interface DemoDepartment {
  id: string;
  code: string;
  name: string;
  description: string;
  accentColor: string;
  icon: string;
}

export interface DemoQuickPost {
  id: string;
  title: string;
  templateType:
    | "she_safety"
    | "ict_notice"
    | "marketing_promo"
    | "customer_service_qr"
    | "kpi_chart"
    | "hr_spotlight"
    | "general_announcement";
  departmentCode: string;
  departmentName: string;
  accentColor: string;
  durationSeconds: number;
  slideConfig: QuickPostSlideConfig;
}

export const DEMO_COUNTRIES: DemoCountry[] = [
  { id: "ke", code: "KE", name: "Kenya", currencyCode: "KES", timezone: "Africa/Nairobi" },
  { id: "tz", code: "TZ", name: "Tanzania", currencyCode: "TZS", timezone: "Africa/Dar_es_Salaam" },
  { id: "ug", code: "UG", name: "Uganda", currencyCode: "UGX", timezone: "Africa/Kampala" },
];

export const DEMO_BRANCHES: DemoBranch[] = [
  {
    id: "br-ke-lik",
    countryId: "ke",
    countryCode: "KE",
    code: "KE-NBO-LIK",
    name: "Nairobi Likoni Rd HQ & Showroom",
    branchType: "hq",
    city: "Nairobi",
    openingTime: "08:00",
    closingTime: "17:30",
  },
  {
    id: "br-ke-wst",
    countryId: "ke",
    countryCode: "KE",
    code: "KE-NBO-WST",
    name: "Westlands Sarit Colour Studio",
    branchType: "showroom",
    city: "Nairobi",
    openingTime: "08:30",
    closingTime: "19:00",
  },
  {
    id: "br-ke-msa",
    countryId: "ke",
    countryCode: "KE",
    code: "KE-MSA-NYL",
    name: "Mombasa Nyali Showroom",
    branchType: "showroom",
    city: "Mombasa",
    openingTime: "08:00",
    closingTime: "17:30",
  },
  {
    id: "br-ke-ksm",
    countryId: "ke",
    countryCode: "KE",
    code: "KE-KSM-MIL",
    name: "Kisumu Milimani Showroom",
    branchType: "showroom",
    city: "Kisumu",
    openingTime: "08:00",
    closingTime: "17:30",
  },
  {
    id: "br-tz-dar",
    countryId: "tz",
    countryCode: "TZ",
    code: "TZ-DAR-NYE",
    name: "Dar es Salaam Nyerere Rd Showroom",
    branchType: "showroom",
    city: "Dar es Salaam",
    openingTime: "08:00",
    closingTime: "17:30",
  },
  {
    id: "br-ug-kla",
    countryId: "ug",
    countryCode: "UG",
    code: "UG-KLA-IND",
    name: "Kampala Industrial Area Showroom",
    branchType: "showroom",
    city: "Kampala",
    openingTime: "08:00",
    closingTime: "17:30",
  },
];

export const DEMO_DEPARTMENTS: DemoDepartment[] = [
  {
    id: "dept-mkt",
    code: "MARKETING",
    name: "Marketing & Brand",
    description: "Product launches, colour trends, and showroom retail campaigns.",
    accentColor: "#d97706",
    icon: "Megaphone",
  },
  {
    id: "dept-cs",
    code: "CUSTOMER_SERVICE",
    name: "Customer Service",
    description: "Application guides, colour consultation videos, and service tips.",
    accentColor: "#2563eb",
    icon: "Headset",
  },
  {
    id: "dept-she",
    code: "SHE",
    name: "SHE (Safety, Health & Env)",
    description: "PPE reminders, LTI safety counters, factory & depot compliance.",
    accentColor: "#059669",
    icon: "ShieldCheck",
  },
  {
    id: "dept-ict",
    code: "ICT",
    name: "ICT & Systems",
    description: "System maintenance notices, cybersecurity alerts, and IT updates.",
    accentColor: "#4f46e5",
    icon: "Cpu",
  },
  {
    id: "dept-sales",
    code: "SALES",
    name: "Sales & Showrooms",
    description: "Monthly showroom targets, dealer promos, and regional sales KPIs.",
    accentColor: "#0284c7",
    icon: "TrendingUp",
  },
  {
    id: "dept-hr",
    code: "HR",
    name: "Human Resources",
    description: "Staff recognition, policy updates, and internal announcements.",
    accentColor: "#9333ea",
    icon: "Users",
  },
  {
    id: "dept-prod",
    code: "PRODUCTION",
    name: "Manufacturing & Plant",
    description: "Factory floor shift metrics, quality KPIs, and batch schedules.",
    accentColor: "#475569",
    icon: "Factory",
  },
  {
    id: "dept-pmg",
    code: "PMG",
    name: "Product Management (PMG)",
    description: "Decorative, Automotive & Industrial product launches, SKU specs, and packaging.",
    accentColor: "#ea580c",
    icon: "Package",
  },
];

export const DEMO_QUICK_POSTS: DemoQuickPost[] = [
  {
    id: "qp-demo-1",
    title: "Showroom Colour Consultation",
    templateType: "customer_service_qr",
    departmentCode: "CUSTOMER_SERVICE",
    departmentName: "Customer Service",
    accentColor: "#2563eb",
    durationSeconds: 12,
    slideConfig: {
      badgeText: "CROWN PAINTS COLOUR STUDIO",
      headline: "Explore 1,000+ Designer Shades Today",
      subheadline: "Ask our Colour Specialists for precision tinting while you wait.",
      body: "Scan the QR code to preview exterior & interior palettes on your phone or chat with a showroom advisor.",
      qrUrl: "https://www.crownpaints.co.ke",
      qrLabel: "Scan for Colour Guide",
      backgroundTheme: "crown_navy",
      swatchColors: [
        { name: "Savannah Ochre", hex: "#D97706" },
        { name: "Kilimanjaro Slate", hex: "#334155" },
        { name: "Coastal Teal", hex: "#0D9488" },
        { name: "Serengeti Sand", hex: "#EAB308" },
        { name: "Crown Crimson", hex: "#DC2626" },
      ],
    },
  },
  {
    id: "qp-demo-2",
    title: "East Africa Sales Analytics (Recharts)",
    templateType: "kpi_chart",
    departmentCode: "SALES",
    departmentName: "Sales & Showrooms",
    accentColor: "#0284c7",
    durationSeconds: 15,
    slideConfig: {
      badgeText: "COMMERCIAL PERFORMANCE • Q4",
      headline: "East Africa Showroom Sales vs. Target",
      subheadline: "Kenya, Tanzania & Uganda Retail & Trade Channel Snapshot",
      backgroundTheme: "crown_navy",
      kpis: [
        { label: "East Africa YTD", value: "KES 54.6M", delta: "+18.4% YoY" },
        { label: "Quota Attainment", value: "105.8%", delta: "Above Plan" },
        { label: "Top Showroom", value: "Westlands", delta: "112% Target" },
        { label: "Top Finish", value: "Weatherguard", delta: "38% Share" },
      ],
      chartData: [
        { label: "Nairobi HQ", value: 14.2, target: 13.0 },
        { label: "Westlands", value: 11.8, target: 10.5 },
        { label: "Mombasa", value: 8.6, target: 8.2 },
        { label: "Kisumu", value: 5.4, target: 5.8 },
        { label: "Dar es Salaam", value: 7.9, target: 7.5 },
        { label: "Kampala", value: 6.7, target: 6.5 },
      ],
      categoryMix: [
        { name: "Weatherguard Ext.", value: 38, color: "#f59e0b" },
        { name: "Crown Silk Vinyl", value: 29, color: "#38bdf8" },
        { name: "Permacote Emulsion", value: 21, color: "#34d399" },
        { name: "Industrial Epoxies", value: 12, color: "#a78bfa" },
      ],
    },
  },
  {
    id: "qp-demo-3",
    title: "HR People & Culture Spotlight",
    templateType: "hr_spotlight",
    departmentCode: "HR",
    departmentName: "Human Resources",
    accentColor: "#9333ea",
    durationSeconds: 12,
    slideConfig: {
      badgeText: "HR • PEOPLE & CULTURE SPOTLIGHT",
      headline: "Showroom Star of the Month",
      subheadline: "Celebrating 98.5% Customer Satisfaction & Zero-Error Tinting",
      body: "Thank you for inspiring homeowners and contractors across Nyanza & Western Kenya. Nominations for next month are open via the HR portal.",
      personName: "Grace Achieng",
      personRole: "Lead Colour Advisor",
      personBranch: "Kisumu Milimani Showroom",
      qrUrl: "https://www.crownpaints.co.ke",
      qrLabel: "Nominate a Colleague",
      backgroundTheme: "hr_violet",
    },
  },
  {
    id: "qp-demo-4",
    title: "Weatherguard Exterior Promo",
    templateType: "marketing_promo",
    departmentCode: "MARKETING",
    departmentName: "Marketing & Brand",
    accentColor: "#d97706",
    durationSeconds: 12,
    slideConfig: {
      badgeText: "SEASONAL CAMPAIGN • KENYA",
      headline: "Crown Weatherguard Silicone",
      subheadline: "10-Year UV & Tropical Rain Protection for Exterior Walls.",
      currency: "KES",
      price: "4,850 / 4L",
      metricLabel: "Recommended Retail",
      body: "Available in 240+ weather-resistant shades across all Kenya showrooms.",
      backgroundTheme: "crown_gold",
    },
  },
  {
    id: "qp-demo-5",
    title: "SHE Safety Milestone",
    templateType: "she_safety",
    departmentCode: "SHE",
    departmentName: "SHE (Safety, Health & Env)",
    accentColor: "#059669",
    durationSeconds: 10,
    slideConfig: {
      badgeText: "SHE SAFETY BRIEFING",
      headline: "Zero Harm Starts With You",
      subheadline: "Mandatory PPE in all tinting bays, warehouses & loading zones.",
      metricValue: "148 Days",
      metricLabel: "Lost-Time Injury Free",
      backgroundTheme: "she_emerald",
    },
  },
  {
    id: "qp-demo-6",
    title: "ICT Systems & Security Notice",
    templateType: "ict_notice",
    departmentCode: "ICT",
    departmentName: "ICT & Systems",
    accentColor: "#4f46e5",
    durationSeconds: 10,
    slideConfig: {
      badgeText: "ICT SERVICE BULLETIN",
      headline: "99.96% Showroom POS & ERP Uptime",
      subheadline: "Verify all supplier invoices & MFA prompts before approving.",
      body: "Need showroom IT support? Contact ICT Service Desk on Ext. 4400 or scan to log a ticket.",
      metricValue: "0 Incidents",
      metricLabel: "Security Status: Green",
      backgroundTheme: "ict_slate",
    },
  },
];
