import { FormEvent, useState } from "react";
import { Loader2, Plane, Hotel as HotelIcon, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

type Flight = {
  type: "flight";
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

type HotelItem = {
  type: "hotel";
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
  hotel: HotelItem;
  totalPrice: number;
  currency: string;
  withinBudget: boolean | null;
};

const fmt = (n: number, c = "USD") =>
  new Intl.NumberFormat(undefined, { style: "currency", currency: c, maximumFractionDigits: 0 }).format(n);

const ComparePackages = () => {
  const [origin, setOrigin] = useState("JFK");
  const [destination, setDestination] = useState("CDG");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [travelers, setTravelers] = useState(2);
  const [budget, setBudget] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [packages, setPackages] = useState<CombinedPackage[] | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setPackages(null);

    if (!origin || !destination || !startDate || !endDate) {
      setError("Please complete origin, destination, and dates");
      return;
    }

    setLoading(true);
    try {
      const { data, error: fnError } = await supabase.functions.invoke("compare-packages", {
        body: {
          origin: origin.toUpperCase(),
          destination: destination.toUpperCase(),
          startDate,
          endDate,
          travelers,
          ...(budget ? { budget: Number(budget) } : {}),
        },
      });
      if (fnError) throw fnError;
      if (!data?.success) throw new Error(data?.error ?? "Request failed");
      setPackages(data.packages ?? []);
    } catch (err: any) {
      setError(err?.message ?? "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="bg-white rounded-[20px] shadow-2xl p-8 sm:p-10 animate-fade-in-up">
      <header className="mb-6 space-y-1">
        <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <Search className="h-6 w-6 text-sky-500" aria-hidden />
          Compare Flight + Hotel Packages
        </h2>
        <p className="text-slate-500 text-sm">
          Find combined deals within your budget.
        </p>
      </header>

      <form onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="origin">Origin (IATA)</Label>
          <Input id="origin" maxLength={3} value={origin} onChange={(e) => setOrigin(e.target.value.toUpperCase())} disabled={loading} className="h-11 rounded-xl uppercase" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="destination">Destination (IATA)</Label>
          <Input id="destination" maxLength={3} value={destination} onChange={(e) => setDestination(e.target.value.toUpperCase())} disabled={loading} className="h-11 rounded-xl uppercase" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="start">Depart</Label>
          <Input id="start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} disabled={loading} className="h-11 rounded-xl" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="end">Return</Label>
          <Input id="end" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} disabled={loading} className="h-11 rounded-xl" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="travelers">Travelers</Label>
          <Input id="travelers" type="number" min={1} max={9} value={travelers} onChange={(e) => setTravelers(Number(e.target.value) || 1)} disabled={loading} className="h-11 rounded-xl" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="budget">Budget (USD, optional)</Label>
          <Input id="budget" type="number" min={0} placeholder="e.g. 2500" value={budget} onChange={(e) => setBudget(e.target.value)} disabled={loading} className="h-11 rounded-xl" />
        </div>

        <div className="sm:col-span-2">
          <Button type="submit" disabled={loading} className="w-full h-12 rounded-xl bg-[#3B82F6] hover:bg-[#2563EB] text-white font-semibold">
            {loading ? (<><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Searching packages...</>) : (<>Compare Packages</>)}
          </Button>
        </div>
      </form>

      {error && (
        <div className="mt-5 rounded-xl bg-red-50 border border-red-200 text-red-700 px-4 py-3 text-sm">
          {error}
        </div>
      )}

      {packages && (
        <div className="mt-8 space-y-4">
          <h3 className="text-lg font-semibold text-slate-900">
            {packages.length > 0 ? `${packages.length} packages found` : "No packages found"}
          </h3>

          <ul className="space-y-4">
            {packages.map((p) => (
              <li key={p.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-5 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="text-2xl font-bold text-slate-900">
                    {fmt(p.totalPrice, p.currency)}
                    <span className="ml-2 text-sm font-normal text-slate-500">total</span>
                  </div>
                  {p.withinBudget !== null && (
                    <Badge
                      className={
                        p.withinBudget
                          ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-100"
                          : "bg-rose-100 text-rose-800 hover:bg-rose-100"
                      }
                    >
                      {p.withinBudget ? "Within budget" : "Over budget"}
                    </Badge>
                  )}
                </div>

                <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <a
                    href={p.flight.link ?? "#"}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-xl bg-white border border-slate-200 p-4 block hover:border-sky-400 transition-colors"
                  >
                    <div className="flex items-center gap-2 text-slate-500 text-xs uppercase tracking-wide">
                      <Plane className="h-4 w-4" /> Flight
                    </div>
                    <div className="mt-1 font-semibold text-slate-900">
                      {p.flight.origin} → {p.flight.destination}
                      {p.flight.airline ? ` · ${p.flight.airline}` : ""}
                    </div>
                    <div className="text-sm text-slate-600">
                      {p.flight.departDate}
                      {p.flight.returnDate ? ` – ${p.flight.returnDate}` : ""}
                      {typeof p.flight.transfers === "number" ? ` · ${p.flight.transfers === 0 ? "Nonstop" : `${p.flight.transfers} stop${p.flight.transfers > 1 ? "s" : ""}`}` : ""}
                    </div>
                    <div className="mt-2 text-sm text-slate-700">
                      {fmt(p.flight.totalPrice, p.flight.currency)}{" "}
                      <span className="text-slate-500">({fmt(p.flight.pricePerTraveler, p.flight.currency)} / traveler)</span>
                    </div>
                  </a>

                  <a
                    href={p.hotel.link ?? "#"}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-xl bg-white border border-slate-200 p-4 block hover:border-sky-400 transition-colors"
                  >
                    <div className="flex items-center gap-2 text-slate-500 text-xs uppercase tracking-wide">
                      <HotelIcon className="h-4 w-4" /> Hotel
                    </div>
                    <div className="mt-1 font-semibold text-slate-900">
                      {p.hotel.name}
                      {p.hotel.stars ? ` · ${"★".repeat(Math.round(p.hotel.stars))}` : ""}
                    </div>
                    <div className="text-sm text-slate-600">
                      {p.hotel.checkIn} – {p.hotel.checkOut} · {p.hotel.nights} night{p.hotel.nights > 1 ? "s" : ""}
                    </div>
                    <div className="mt-2 text-sm text-slate-700">
                      {fmt(p.hotel.totalPrice, p.hotel.currency)}{" "}
                      <span className="text-slate-500">({fmt(p.hotel.pricePerNight, p.hotel.currency)} / night)</span>
                    </div>
                  </a>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
};

export default ComparePackages;
