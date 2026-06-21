import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { z } from 'npm:zod@3.23.8';

const BodySchema = z.object({
  origin: z.string().trim().min(3).max(3).toUpperCase(),
  destination: z.string().trim().min(3).max(3).toUpperCase(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  travelers: z.number().int().min(1).max(9).default(1),
  budget: z.number().positive().optional(),
});

const TP_TOKEN = Deno.env.get('TRAVELPAYOUTS_API_TOKEN')!;
const MARKER = Deno.env.get('TRAVELPAYOUTS_MARKER') ?? '';

type Flight = {
  type: 'flight';
  id: string;
  origin: string;
  destination: string;
  departDate: string;
  returnDate?: string;
  airline?: string;
  flightNumber?: string;
  transfers?: number;
  price: number;
  currency: string;
  pricePerTraveler: number;
  totalPrice: number;
  link?: string;
};

type Hotel = {
  type: 'hotel';
  id: string;
  name: string;
  location: string;
  checkIn: string;
  checkOut: string;
  stars?: number;
  nights: number;
  pricePerNight: number;
  currency: string;
  totalPrice: number;
  link?: string;
};

type CombinedPackage = {
  id: string;
  flight: Flight;
  hotel: Hotel;
  totalPrice: number;
  currency: string;
  withinBudget: boolean | null;
};

function nightsBetween(a: string, b: string): number {
  const d1 = new Date(a).getTime();
  const d2 = new Date(b).getTime();
  return Math.max(1, Math.round((d2 - d1) / (1000 * 60 * 60 * 24)));
}

async function fetchFlights(params: z.infer<typeof BodySchema>): Promise<Flight[]> {
  const url = new URL('https://api.travelpayouts.com/aviasales/v3/prices_for_dates');
  url.searchParams.set('origin', params.origin);
  url.searchParams.set('destination', params.destination);
  url.searchParams.set('departure_at', params.startDate);
  url.searchParams.set('return_at', params.endDate);
  url.searchParams.set('unique', 'false');
  url.searchParams.set('sorting', 'price');
  url.searchParams.set('direct', 'false');
  url.searchParams.set('currency', 'usd');
  url.searchParams.set('limit', '10');
  url.searchParams.set('token', TP_TOKEN);

  const res = await fetch(url.toString());
  if (!res.ok) {
    console.error('Flights API error', res.status, await res.text());
    return [];
  }
  const json = await res.json();
  const items = Array.isArray(json?.data) ? json.data : [];
  return items.map((f: any, i: number): Flight => {
    const price = Number(f.price) || 0;
    return {
      type: 'flight',
      id: `fl_${i}_${f.flight_number ?? ''}`,
      origin: f.origin ?? params.origin,
      destination: f.destination ?? params.destination,
      departDate: (f.departure_at ?? params.startDate).slice(0, 10),
      returnDate: f.return_at ? f.return_at.slice(0, 10) : params.endDate,
      airline: f.airline,
      flightNumber: f.flight_number,
      transfers: f.transfers,
      price,
      currency: 'USD',
      pricePerTraveler: price,
      totalPrice: price * params.travelers,
      link: f.link ? `https://www.aviasales.com${f.link}${MARKER ? `?marker=${MARKER}` : ''}` : undefined,
    };
  });
}

async function fetchHotels(params: z.infer<typeof BodySchema>): Promise<Hotel[]> {
  const url = new URL('https://engine.hotellook.com/api/v2/cache.json');
  url.searchParams.set('location', params.destination);
  url.searchParams.set('checkIn', params.startDate);
  url.searchParams.set('checkOut', params.endDate);
  url.searchParams.set('currency', 'usd');
  url.searchParams.set('limit', '10');
  url.searchParams.set('token', TP_TOKEN);

  const res = await fetch(url.toString());
  if (!res.ok) {
    console.error('Hotels API error', res.status, await res.text());
    return [];
  }
  const json = await res.json();
  const items = Array.isArray(json) ? json : [];
  const nights = nightsBetween(params.startDate, params.endDate);

  return items.map((h: any, i: number): Hotel => {
    const total = Number(h.priceFrom ?? h.priceAvg ?? 0);
    const perNight = total > 0 ? total / nights : 0;
    return {
      type: 'hotel',
      id: `ht_${h.hotelId ?? i}`,
      name: h.hotelName ?? `Hotel ${i + 1}`,
      location: h.location?.name ?? params.destination,
      checkIn: params.startDate,
      checkOut: params.endDate,
      stars: h.stars,
      nights,
      pricePerNight: Math.round(perNight * 100) / 100,
      currency: 'USD',
      totalPrice: Math.round(total * 100) / 100,
      link: `https://search.hotellook.com/hotels?destination=${encodeURIComponent(params.destination)}&checkIn=${params.startDate}&checkOut=${params.endDate}&adults=${params.travelers}${MARKER ? `&marker=${MARKER}` : ''}`,
    };
  });
}

function combine(flights: Flight[], hotels: Hotel[], budget?: number): CombinedPackage[] {
  const top = Math.min(5, flights.length, hotels.length);
  const packages: CombinedPackage[] = [];
  for (let i = 0; i < top; i++) {
    const f = flights[i];
    const h = hotels[i];
    const total = f.totalPrice + h.totalPrice;
    packages.push({
      id: `pkg_${i}`,
      flight: f,
      hotel: h,
      totalPrice: Math.round(total * 100) / 100,
      currency: 'USD',
      withinBudget: typeof budget === 'number' ? total <= budget : null,
    });
  }
  return packages.sort((a, b) => a.totalPrice - b.totalPrice);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!TP_TOKEN) {
      return new Response(JSON.stringify({ error: 'TRAVELPAYOUTS_API_TOKEN not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json().catch(() => null);
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: 'Invalid input', details: parsed.error.flatten().fieldErrors }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const params = parsed.data;
    if (new Date(params.endDate) <= new Date(params.startDate)) {
      return new Response(
        JSON.stringify({ error: 'endDate must be after startDate' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const [flights, hotels] = await Promise.all([fetchFlights(params), fetchHotels(params)]);
    const packages = combine(flights, hotels, params.budget);

    return new Response(
      JSON.stringify({
        success: true,
        query: params,
        counts: { flights: flights.length, hotels: hotels.length, packages: packages.length },
        flights,
        hotels,
        packages,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('compare-packages error', err);
    return new Response(
      JSON.stringify({ error: (err as Error).message ?? 'Internal error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
