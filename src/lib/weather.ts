/**
 * @file src/lib/weather.ts
 * @description Fetches and caches (15-min TTL) free Open-Meteo weather forecasts for
 * Crown Paints East Africa cities (Nairobi, Mombasa, Kisumu, Nakuru, Eldoret, Dar, Kampala).
 */

export interface EastAfricaWeather {
  city: string;
  temperatureC: number;
  condition: string;
  windKmh: number;
  humidityPercent?: number;
  updatedAt: string;
  isFallback?: boolean;
}

const CITY_COORDS: Record<string, { lat: number; lon: number }> = {
  nairobi: { lat: -1.2921, lon: 36.8219 },
  mombasa: { lat: -4.0435, lon: 39.6682 },
  kisumu: { lat: -0.0917, lon: 34.768 },
  nakuru: { lat: -0.3031, lon: 36.08 },
  eldoret: { lat: 0.5143, lon: 35.2698 },
  "dar es salaam": { lat: -6.7924, lon: 39.2083 },
  arusha: { lat: -3.3869, lon: 36.683 },
  kampala: { lat: 0.3476, lon: 32.5825 },
  entebbe: { lat: 0.0512, lon: 32.4637 },
};

function mapWmoCode(code: number): string {
  if (code === 0) return "Clear Sky";
  if (code <= 3) return "Partly Cloudy";
  if (code <= 48) return "Misty";
  if (code <= 67) return "Light Rain";
  if (code <= 82) return "Showers";
  return "Thunderstorms";
}

const memoryCache = new Map<
  string,
  { expiresAt: number; data: EastAfricaWeather }
>();

export async function fetchEastAfricaWeather(
  cityInput?: string
): Promise<EastAfricaWeather> {
  const city = (cityInput || "Nairobi").trim();
  const key = city.toLowerCase();
  const cached = memoryCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  const coords = CITY_COORDS[key] ?? CITY_COORDS.nairobi;

  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${coords.lat}&longitude=${coords.lon}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&timezone=auto`;
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as {
      current?: {
        temperature_2m?: number;
        relative_humidity_2m?: number;
        weather_code?: number;
        wind_speed_10m?: number;
      };
    };

    const data: EastAfricaWeather = {
      city,
      temperatureC: Math.round(json.current?.temperature_2m ?? 24),
      condition: mapWmoCode(json.current?.weather_code ?? 1),
      windKmh: Math.round(json.current?.wind_speed_10m ?? 12),
      humidityPercent: Math.round(json.current?.relative_humidity_2m ?? 60),
      updatedAt: new Date().toISOString(),
    };

    memoryCache.set(key, { expiresAt: Date.now() + 15 * 60 * 1000, data });
    return data;
  } catch {
    return (
      cached?.data ?? {
        city,
        temperatureC: 24,
        condition: "Partly Cloudy",
        windKmh: 12,
        humidityPercent: 58,
        updatedAt: new Date().toISOString(),
        isFallback: true,
      }
    );
  }
}
