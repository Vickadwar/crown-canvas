import { connection } from "next/server";
import { fetchEastAfricaWeather } from "@/lib/weather";

export async function GET(request: Request) {
  await connection();
  const { searchParams } = new URL(request.url);
  const city = searchParams.get("city") || "Nairobi";
  const weather = await fetchEastAfricaWeather(city);
  return Response.json(weather);
}
