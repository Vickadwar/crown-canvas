/**
 * @file src/db/seed-runner.ts
 * @description Idempotent seed routine populating Crown Paints East Africa Countries
 * (KE, TZ, UG), Showrooms, 7 Departments, System Layouts, Starter Data Feed, Quick Posts,
 * and Default Showroom Playlist. Shared by CLI (`npm run db:seed`) and CMS 1-click setup.
 */

import { eq } from "drizzle-orm";
import {
  db,
  withDbRetry,
  countries,
  regions,
  branches,
  departments,
  layouts,
  dataFeeds,
  quickPosts,
  playlists,
  playlistItems,
} from "./index";

export async function runDatabaseSeed(): Promise<{
  countriesCount: number;
  branchesCount: number;
  departmentsCount: number;
}> {
  return withDbRetry(async () => {
    // 1. Countries (Kenya, Tanzania, Uganda)
    const countryRows = [
      { code: "KE", name: "Kenya", currencyCode: "KES", timezone: "Africa/Nairobi" },
      {
        code: "TZ",
        name: "Tanzania",
        currencyCode: "TZS",
        timezone: "Africa/Dar_es_Salaam",
      },
      { code: "UG", name: "Uganda", currencyCode: "UGX", timezone: "Africa/Kampala" },
    ];

    for (const c of countryRows) {
      await db
        .insert(countries)
        .values(c)
        .onConflictDoUpdate({
          target: countries.code,
          set: { name: c.name, currencyCode: c.currencyCode, timezone: c.timezone },
        });
    }

    const allCountries = await db.select().from(countries);
    const countryByCode = Object.fromEntries(allCountries.map((c) => [c.code, c]));

    // 2. Regions & Showrooms / Factories
    const sampleBranches = [
      {
        countryCode: "KE",
        code: "KE-NBO-LIK",
        name: "Nairobi Likoni Road HQ & Showroom",
        branchType: "hq" as const,
        city: "Nairobi",
        address: "Likoni Road, Industrial Area, Nairobi",
      },
      {
        countryCode: "KE",
        code: "KE-NBO-WST",
        name: "Westlands Sarit Colour Studio",
        branchType: "showroom" as const,
        city: "Nairobi",
        address: "Westlands, Nairobi",
      },
      {
        countryCode: "KE",
        code: "KE-MSA-NYL",
        name: "Mombasa Nyali Showroom",
        branchType: "showroom" as const,
        city: "Mombasa",
        address: "Links Road, Nyali, Mombasa",
      },
      {
        countryCode: "KE",
        code: "KE-KSM-MIL",
        name: "Kisumu Milimani Showroom",
        branchType: "showroom" as const,
        city: "Kisumu",
        address: "Kisumu CBD",
      },
      {
        countryCode: "KE",
        code: "KE-NKR-CBD",
        name: "Nakuru Kenyatta Ave Showroom",
        branchType: "showroom" as const,
        city: "Nakuru",
        address: "Kenyatta Avenue, Nakuru",
      },
      {
        countryCode: "TZ",
        code: "TZ-DAR-NYE",
        name: "Dar es Salaam Nyerere Rd Showroom",
        branchType: "showroom" as const,
        city: "Dar es Salaam",
        address: "Nyerere Road, Dar es Salaam",
      },
      {
        countryCode: "UG",
        code: "UG-KLA-IND",
        name: "Kampala Industrial Area Showroom",
        branchType: "showroom" as const,
        city: "Kampala",
        address: "6th Street Industrial Area, Kampala",
      },
    ];

    for (const b of sampleBranches) {
      const country = countryByCode[b.countryCode];
      if (!country) continue;
      await db
        .insert(branches)
        .values({
          countryId: country.id,
          code: b.code,
          name: b.name,
          branchType: b.branchType,
          city: b.city,
          address: b.address,
        })
        .onConflictDoUpdate({
          target: branches.code,
          set: {
            name: b.name,
            branchType: b.branchType,
            city: b.city,
            address: b.address,
          },
        });
    }

    for (const code of ["KE", "TZ", "UG"]) {
      const country = countryByCode[code];
      if (!country) continue;
      const existingRegions = await db
        .select()
        .from(regions)
        .where(eq(regions.countryId, country.id));
      if (existingRegions.length === 0) {
        await db.insert(regions).values({
          countryId: country.id,
          name:
            code === "KE"
              ? "Nairobi Metro"
              : code === "TZ"
                ? "Coastal Zone"
                : "Central Region",
        });
      }
    }

    // 3. Crown Paints Departments
    const departmentRows = [
      {
        code: "MARKETING",
        name: "Marketing & Brand",
        description: "Product launches, colour trends, and showroom retail campaigns.",
        accentColor: "#d97706",
        icon: "Megaphone",
      },
      {
        code: "CUSTOMER_SERVICE",
        name: "Customer Service",
        description:
          "Application guides, colour consultation videos, and showroom service tips.",
        accentColor: "#2563eb",
        icon: "Headset",
      },
      {
        code: "SHE",
        name: "SHE (Safety, Health & Env)",
        description:
          "PPE reminders, LTI safety counters, factory & depot compliance.",
        accentColor: "#059669",
        icon: "ShieldCheck",
      },
      {
        code: "ICT",
        name: "ICT & Systems",
        description:
          "System maintenance notices, cybersecurity alerts, and digital adoption.",
        accentColor: "#4f46e5",
        icon: "Cpu",
      },
      {
        code: "SALES",
        name: "Sales & Showrooms",
        description:
          "Monthly showroom targets, dealer promos, and regional sales leaderboards.",
        accentColor: "#0284c7",
        icon: "TrendingUp",
      },
      {
        code: "HR",
        name: "Human Resources",
        description: "Staff recognition, policy updates, and internal announcements.",
        accentColor: "#9333ea",
        icon: "Users",
      },
      {
        code: "PRODUCTION",
        name: "Manufacturing & Plant",
        description: "Factory floor shift metrics, quality KPIs, and batch schedules.",
        accentColor: "#475569",
        icon: "Factory",
      },
      {
        code: "PMG",
        name: "Product Management (PMG)",
        description: "Decorative, Automotive & Industrial product launches, SKU specs, and packaging updates.",
        accentColor: "#ea580c",
        icon: "Package",
      },
    ];

    for (const d of departmentRows) {
      await db
        .insert(departments)
        .values(d)
        .onConflictDoUpdate({
          target: departments.code,
          set: {
            name: d.name,
            description: d.description,
            accentColor: d.accentColor,
            icon: d.icon,
          },
        });
    }

    const allDepts = await db.select().from(departments);
    const deptByCode = Object.fromEntries(allDepts.map((d) => [d.code, d]));

    // 4. Default System Multi-Zone Layouts
    const existingLayouts = await db.select().from(layouts);
    let splitLayoutId = existingLayouts.find((l) =>
      l.name.includes("Split")
    )?.id;

    if (existingLayouts.length === 0) {
      const insertedLayouts = await db
        .insert(layouts)
        .values([
          {
            name: "Full Screen Video / Slide",
            description:
              "100% edge-to-edge customer service video or full-bleed slide.",
            orientation: "landscape",
            isSystem: true,
            zonesConfig: [
              {
                id: "main",
                label: "Full Screen",
                xPercent: 0,
                yPercent: 0,
                wPercent: 100,
                hPercent: 100,
                role: "primary_media",
              },
            ],
          },
          {
            name: "Crown Showroom Split (75/25 + Ticker)",
            description:
              "Main customer service video with sidebar QR/Promo & bottom ticker.",
            orientation: "landscape",
            isSystem: true,
            zonesConfig: [
              {
                id: "main",
                label: "Primary Video",
                xPercent: 0,
                yPercent: 0,
                wPercent: 75,
                hPercent: 88,
                role: "primary_media",
              },
              {
                id: "sidebar",
                label: "Promo & QR Sidebar",
                xPercent: 75,
                yPercent: 0,
                wPercent: 25,
                hPercent: 88,
                role: "qr_promo",
              },
              {
                id: "ticker",
                label: "Bottom Ticker",
                xPercent: 0,
                yPercent: 88,
                wPercent: 100,
                hPercent: 12,
                role: "ticker",
              },
            ],
          },
        ])
        .returning();
      splitLayoutId = insertedLayouts[1]?.id ?? null;
    }

    // 4B. Starter Data Feed for Live Recharts Sales Analytics
    let salesFeedId: string | null = null;
    if (deptByCode.SALES) {
      const existingFeeds = await db
        .select()
        .from(dataFeeds)
        .where(eq(dataFeeds.key, "east-africa-sales-q4"));
      if (existingFeeds.length > 0) {
        salesFeedId = existingFeeds[0].id;
      } else {
        const [feed] = await db
          .insert(dataFeeds)
          .values({
            key: "east-africa-sales-q4",
            name: "East Africa Showroom Sales Feed",
            departmentId: deptByCode.SALES.id,
            sourceType: "push_webhook",
            lastSyncedAt: new Date(),
            payload: {
              kpis: [
                {
                  label: "East Africa YTD",
                  value: "KES 54.6M",
                  delta: "+18.4% YoY",
                },
                {
                  label: "Quota Attainment",
                  value: "105.8%",
                  delta: "Above Plan",
                },
                {
                  label: "Top Showroom",
                  value: "Westlands",
                  delta: "112% Target",
                },
                {
                  label: "Top Finish",
                  value: "Weatherguard",
                  delta: "38% Share",
                },
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
          })
          .returning();
        salesFeedId = feed?.id ?? null;
      }
    }

    // 5. Starter Quick Posts & Default Showroom Playlist
    const existingPosts = await db.select().from(quickPosts);
    if (
      existingPosts.length === 0 &&
      deptByCode.CUSTOMER_SERVICE &&
      deptByCode.SHE &&
      deptByCode.SALES &&
      deptByCode.HR
    ) {
      const insertedPosts = await db
        .insert(quickPosts)
        .values([
          {
            title: "Showroom Colour Consultation Welcome",
            templateType: "customer_service_qr",
            departmentId: deptByCode.CUSTOMER_SERVICE.id,
            durationSeconds: 15,
            slideConfig: {
              badgeText: "CROWN PAINTS COLOUR STUDIO",
              headline: "Explore 1,000+ Designer Shades Today",
              subheadline:
                "Ask our Colour Specialists for precision tinting while you wait.",
              body: "Scan the QR code to preview exterior & interior palettes on your phone.",
              qrUrl: "https://www.crownpaints.co.ke",
              qrLabel: "Scan for Colour Guide",
              backgroundTheme: "crown_navy",
            },
          },
          {
            title: "East Africa Sales Analytics (Recharts)",
            templateType: "kpi_chart",
            departmentId: deptByCode.SALES.id,
            dataFeedId: salesFeedId,
            durationSeconds: 15,
            slideConfig: {
              badgeText: "COMMERCIAL PERFORMANCE • Q4",
              headline: "East Africa Showroom Sales vs. Target",
              subheadline:
                "Kenya, Tanzania & Uganda Retail & Trade Channel Snapshot",
              backgroundTheme: "crown_navy",
            },
          },
          {
            title: "HR People & Culture Spotlight",
            templateType: "hr_spotlight",
            departmentId: deptByCode.HR.id,
            durationSeconds: 12,
            slideConfig: {
              badgeText: "HR • PEOPLE & CULTURE SPOTLIGHT",
              headline: "Showroom Star of the Month",
              subheadline:
                "Celebrating 98.5% Customer Satisfaction & Zero-Error Tinting",
              body: "Thank you for inspiring homeowners and contractors across East Africa.",
              personName: "Grace Achieng",
              personRole: "Lead Colour Advisor",
              personBranch: "Kisumu Milimani Showroom",
              backgroundTheme: "hr_violet",
            },
          },
          {
            title: "SHE Safety First Milestone",
            templateType: "she_safety",
            departmentId: deptByCode.SHE.id,
            durationSeconds: 12,
            slideConfig: {
              badgeText: "SHE SAFETY BRIEFING",
              headline: "Zero Harm Starts With You",
              subheadline:
                "Mandatory PPE in all tinting bays, warehouses & loading zones.",
              metricValue: "148 Days",
              metricLabel: "Lost-Time Injury Free",
              backgroundTheme: "she_emerald",
            },
          },
        ])
        .returning();

      const existingPlaylists = await db.select().from(playlists);
      if (existingPlaylists.length === 0 && insertedPosts.length > 0) {
        const [defaultPlaylist] = await db
          .insert(playlists)
          .values({
            name: "East Africa Showroom Default Loop",
            description:
              "Starter customer service, sales analytics, HR & SHE loop for newly paired screens.",
            departmentId: deptByCode.CUSTOMER_SERVICE.id,
            layoutId: splitLayoutId ?? null,
            defaultDurationSeconds: 15,
            isActive: true,
          })
          .returning();

        if (defaultPlaylist) {
          await db.insert(playlistItems).values(
            insertedPosts.map((post, idx) => ({
              playlistId: defaultPlaylist.id,
              itemKind: "quick_post" as const,
              quickPostId: post.id,
              zoneId: "main",
              sortOrder: idx,
              durationSeconds: post.durationSeconds,
            }))
          );
        }
      }
    }

    const finalBranches = await db.select().from(branches);
    return {
      countriesCount: allCountries.length,
      branchesCount: finalBranches.length,
      departmentsCount: allDepts.length,
    };
  });
}
