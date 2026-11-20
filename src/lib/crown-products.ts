/**
 * @file src/lib/crown-products.ts
 * @description Official Crown Paints branding constants and 17 transparent PNG product
 * packshots from `public/media/products` for the Split-Screen sidebar showcase carousel
 * and Crown Studio media toolbox.
 */

export const CROWN_OFFICIAL_LOGO_URL = "/media/logo/CrownLogo.png";

export const CROWN_DECORATIVE_QR_URL =
  "https://www.crownpaints.co.ke/product-category/decorative";

export interface CrownProductItem {
  id: string;
  name: string;
  category: string;
  tagline: string;
  imageUrl: string;
}

export const CROWN_PRODUCT_SHOWCASE: CrownProductItem[] = [
  {
    id: "silk-vinyl-emulsion",
    name: "Silk Vinyl Emulsion",
    category: "Decorative • Interior",
    tagline: "Washable satin sheen with zero harsh odour",
    imageUrl: "/media/products/silk-vinyl-emulsion.png",
  },
  {
    id: "ultra-guard-silicone",
    name: "Ultra Guard Silicone",
    category: "Decorative • Exterior",
    tagline: "10-year UV, monsoon rain & anti-algae shield",
    imageUrl: "/media/products/ultra-guard-silicone.png",
  },
  {
    id: "luxury-vinylmatt",
    name: "Luxury Vinyl Matt",
    category: "Decorative • Interior",
    tagline: "Rich velvety flat finish for refined rooms",
    imageUrl: "/media/products/luxury-vinylmatt.png",
  },
  {
    id: "covermatt",
    name: "Crown Covermatt",
    category: "Decorative • Interior",
    tagline: "High-opacity smooth matt emulsion coverage",
    imageUrl: "/media/products/covermatt.png",
  },
  {
    id: "rain-protek",
    name: "Rain Protek",
    category: "Waterproofing • Exterior",
    tagline: "Flexible elastomeric barrier against heavy rain",
    imageUrl: "/media/products/rain-protek.png",
  },
  {
    id: "damp-protek",
    name: "Damp Protek",
    category: "Waterproofing • Interior",
    tagline: "Blocks rising damp, blistering & efflorescence",
    imageUrl: "/media/products/damp-protek.png",
  },
  {
    id: "fire-shield-1",
    name: "Crown Fire Shield",
    category: "Protective • Safety",
    tagline: "Flame-retardant architectural wall protection",
    imageUrl: "/media/products/fire-shield-1.png",
  },
  {
    id: "primer-wb-1",
    name: "Water-Based Primer",
    category: "Surface Prep • Undercoat",
    tagline: "Superior alkali resistance & topcoat adhesion",
    imageUrl: "/media/products/primer-wb-1.png",
  },
  {
    id: "crownplast-wall-skimcoat",
    name: "CrownPlast Wall Skimcoat",
    category: "Surface Prep • Skimming",
    tagline: "Glass-smooth plaster levelling before painting",
    imageUrl: "/media/products/crownplast-wall-skimcoat.png",
  },
  {
    id: "crown-skimming-putty",
    name: "Crown Skimming Putty",
    category: "Surface Prep • Putty",
    tagline: "Fine-grain interior crack & pore filler",
    imageUrl: "/media/products/crown-skimming-putty.png",
  },
  {
    id: "crown-gypsum-filler",
    name: "Crown Gypsum Filler",
    category: "Surface Prep • Gypsum",
    tagline: "Seamless ceiling & drywall joint compound",
    imageUrl: "/media/products/crown-gypsum-filler.png",
  },
  {
    id: "skim-coat-final",
    name: "Crown Skim Coat",
    category: "Surface Prep • Final Coat",
    tagline: "Ready-to-paint ultra-fine wall finish",
    imageUrl: "/media/products/skim-coat-final.png",
  },
  {
    id: "polyurethane-woodseal",
    name: "Polyurethane Woodseal",
    category: "Woodcare • Clear Varnish",
    tagline: "Tough scratch-resistant gloss & satin seal",
    imageUrl: "/media/products/polyurethane-woodseal-clear-varnish.png",
  },
  {
    id: "timber-stain-1",
    name: "Crown Timber Stain",
    category: "Woodcare • Stain",
    tagline: "Enriches natural grain with deep UV pigments",
    imageUrl: "/media/products/timber-stain-1.png",
  },
  {
    id: "woodmaster-anteak-oil",
    name: "Woodmaster Anteak Oil",
    category: "Woodcare • Hardwood Oil",
    tagline: "Penetrating nourishment for teak & decks",
    imageUrl: "/media/products/woodmaster-anteak-oil-updated.png",
  },
  {
    id: "fevicol-marine-plus",
    name: "Fevicol Marine Plus",
    category: "Adhesives • Marine Grade",
    tagline: "Waterproof structural wood & laminate bond",
    imageUrl: "/media/products/fevicol-marine-plus.png",
  },
  {
    id: "economy",
    name: "Crown Economy Emulsion",
    category: "Decorative • Everyday",
    tagline: "Dependable smooth coverage for large projects",
    imageUrl: "/media/products/economy.png",
  },
];

export interface CrownBannerItem {
  id: string;
  name: string;
  category: string;
  imageUrl: string;
}

export const CROWN_CAMPAIGN_BANNERS: CrownBannerItem[] = [
  {
    id: "banner-aqua-glow",
    name: "Aqua Glow Campaign",
    category: "Decorative",
    imageUrl: "/media/banners/aqua-glow.png",
  },
  {
    id: "banner-brush-beyond",
    name: "Brush Beyond",
    category: "Decorative",
    imageUrl: "/media/banners/brush-beyond.png",
  },
  {
    id: "banner-color-visualizer",
    name: "Colour Visualizer",
    category: "Colour Studio",
    imageUrl: "/media/banners/color-visualizer.png",
  },
  {
    id: "banner-crown-automotive",
    name: "Crown Automotive 2K",
    category: "Automotive",
    imageUrl: "/media/banners/crown-automotive.jpg",
  },
  {
    id: "banner-floortrek",
    name: "Floortrek Industrial",
    category: "Industrial",
    imageUrl: "/media/banners/floortrekartboard.jpg",
  },
  {
    id: "banner-teamkubwa",
    name: "Team Kubwa Promo",
    category: "Marketing",
    imageUrl: "/media/banners/teamkubwa.jpg",
  },
  {
    id: "banner-wood-finish",
    name: "Crown Wood Finish",
    category: "Woodcare",
    imageUrl: "/media/banners/wood-finish.jpg",
  },
];
