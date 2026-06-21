import { FormEvent, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Loader2, Plane, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import ComparePackages from "@/components/ComparePackages";
import { supabase } from "@/integrations/supabase/client";

type TravelType = "Solo" | "Couple" | "Friends" | "Family" | "";

// Client-side guardrails (server re-validates)
const LOCATION_RE = /^[\p{L}\p{N}\s,.\-'()&/]+$/u;
const DATES_RE = /^[\p{L}\p{N}\s,.\-/:]+$/u;

const Index = () => {
  const [destination, setDestination] = useState("");
  const [dates, setDates] = useState("");
  const [travelType, setTravelType] = useState<TravelType>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [itinerary, setItinerary] = useState<string | null>(null);

  const reset = () => {
    setDestination("");
    setDates("");
    setTravelType("");
    setItinerary(null);
    setError(null);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    const loc = destination.trim();
    const dts = dates.trim();

    if (!loc || !dts || !travelType) {
      setError("Please fill in all fields");
      return;
    }
    if (loc.length > 100 || !LOCATION_RE.test(loc)) {
      setError("Destination contains invalid characters or is too long.");
      return;
    }
    if (dts.length > 50 || !DATES_RE.test(dts)) {
      setError("Dates contain invalid characters or are too long.");
      return;
    }

    setLoading(true);
    try {
      const { data, error: fnError } = await supabase.functions.invoke(
        "travel-itinerary",
        { body: { location: loc, dates: dts, travelType } },
      );
      if (fnError) throw fnError;
      const text =
        (data && typeof data === "object" && (data as any).itinerary) || "";
      setItinerary(text || "No itinerary returned.");
    } catch (err) {
      setError("Sorry, something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen w-full bg-travel-gradient flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-xl space-y-6">
        <section className="bg-white rounded-[20px] shadow-2xl p-8 sm:p-10 animate-fade-in-up">
          <header className="text-center mb-8 space-y-2">
            <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight flex items-center justify-center gap-2">
              <Plane className="h-8 w-8 text-sky-500" aria-hidden />
              AI Travel Planner
            </h1>
            <p className="text-slate-500 text-base sm:text-lg">
              Let AI create your perfect itinerary
            </p>
          </header>

          <form onSubmit={submit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="destination" className="text-slate-700 font-medium">
                Where are you going?
              </Label>
              <Input
                id="destination"
                placeholder="e.g., Tokyo, Japan"
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                disabled={loading}
                className="h-12 rounded-xl"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="dates" className="text-slate-700 font-medium">
                When are you traveling?
              </Label>
              <Input
                id="dates"
                placeholder="e.g., March 10-15, 2025"
                value={dates}
                onChange={(e) => setDates(e.target.value)}
                disabled={loading}
                className="h-12 rounded-xl"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-slate-700 font-medium">
                Who are you traveling with?
              </Label>
              <Select
                value={travelType}
                onValueChange={(v) => setTravelType(v as TravelType)}
                disabled={loading}
              >
                <SelectTrigger className="h-12 rounded-xl">
                  <SelectValue placeholder="Select travel type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Solo">Solo</SelectItem>
                  <SelectItem value="Couple">Couple</SelectItem>
                  <SelectItem value="Friends">Friends</SelectItem>
                  <SelectItem value="Family">Family</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {error && !itinerary && (
              <div className="rounded-xl bg-red-50 border border-red-200 text-red-700 px-4 py-3 text-sm animate-fade-in-up">
                {error}
              </div>
            )}

            <Button
              type="submit"
              disabled={loading}
              className="w-full h-12 rounded-xl text-base font-semibold bg-[#3B82F6] hover:bg-[#2563EB] text-white transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Creating your itinerary...
                </>
              ) : (
                <>Generate My Itinerary ✨</>
              )}
            </Button>

            {error && (
              <Button
                type="button"
                variant="outline"
                onClick={submit}
                disabled={loading}
                className="w-full h-11 rounded-xl"
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                Retry
              </Button>
            )}
          </form>
        </section>

        {itinerary && (
          <section className="bg-[#f9fafb] rounded-[20px] shadow-2xl p-8 sm:p-10 animate-fade-in-up">
            <h2 className="text-2xl font-bold text-slate-900 mb-6">
              Your Personalized Itinerary
            </h2>
            <article className="prose prose-slate max-w-none text-slate-800 text-[16px] leading-[1.8]
              prose-headings:font-bold prose-headings:text-slate-900 prose-headings:mt-6 prose-headings:mb-3
              prose-h1:text-2xl prose-h2:text-xl prose-h3:text-lg
              prose-strong:text-slate-900 prose-strong:font-semibold
              prose-ul:my-3 prose-ul:pl-6 prose-li:my-1 prose-li:marker:text-sky-500
              prose-ol:my-3 prose-ol:pl-6
              prose-p:my-3 prose-hr:my-6">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{itinerary}</ReactMarkdown>
            </article>
            <Button
              onClick={reset}
              className="mt-6 w-full h-12 rounded-xl bg-[#3B82F6] hover:bg-[#2563EB] text-white font-semibold"
            >
              Generate Another
            </Button>
          </section>
        )}

        <ComparePackages />
      </div>
    </main>
  );
};

export default Index;
