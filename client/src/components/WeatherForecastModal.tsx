import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Cloud, Droplets, Wind, Thermometer } from "lucide-react";
import { cn } from "@/lib/utils";

interface DayForecast {
  date: string;
  dayLabel: string;
  tempMax: number;
  tempMin: number;
  weatherCode: number;
  precipitationSum: number;
  windSpeedMax: number;
}

interface WeatherForecastModalProps {
  open: boolean;
  onClose: () => void;
  lat: number;
  lon: number;
  locationName: string;
  currentTempC: number;
  currentLabel: string;
  feelsLikeC: number;
}

const WMO_ICONS: [number, string][] = [
  [0, "☀️"], [1, "🌤️"], [3, "☁️"], [45, "🌫️"], [48, "🌫️"],
  [51, "🌦️"], [57, "🌧️"], [61, "🌧️"], [65, "🌧️"], [71, "🌨️"],
  [77, "❄️"], [80, "🌦️"], [82, "⛈️"], [85, "🌨️"], [86, "❄️"],
  [95, "⛈️"], [99, "⛈️"],
];

const WMO_LABELS: [number, string][] = [
  [0, "Clear sky"], [1, "Mainly clear"], [2, "Partly cloudy"], [3, "Overcast"],
  [45, "Foggy"], [48, "Icy fog"], [51, "Light drizzle"], [53, "Drizzle"],
  [55, "Heavy drizzle"], [57, "Freezing drizzle"], [61, "Light rain"],
  [63, "Rain"], [65, "Heavy rain"], [71, "Light snow"], [73, "Snow"],
  [75, "Heavy snow"], [77, "Snow grains"], [80, "Rain showers"],
  [81, "Heavy showers"], [82, "Violent showers"], [85, "Snow showers"],
  [86, "Heavy snow showers"], [95, "Thunderstorm"], [99, "Thunderstorm w/ hail"],
];

function wmoIcon(code: number): string {
  return [...WMO_ICONS].reverse().find(([max]) => code >= max)?.[1] ?? "🌡️";
}

function wmoLabel(code: number): string {
  return WMO_LABELS.find(([c]) => c === code)?.[1]
    ?? [...WMO_LABELS].reverse().find(([max]) => code >= max)?.[1]
    ?? "Unknown";
}

function dayLabel(dateStr: string, index: number): string {
  if (index === 0) return "Today";
  if (index === 1) return "Tomorrow";
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

export function WeatherForecastModal({
  open, onClose, lat, lon, locationName, currentTempC, currentLabel, feelsLikeC,
}: WeatherForecastModalProps) {
  const [days, setDays] = useState<14 | 7>(7);
  const [forecast, setForecast] = useState<DayForecast[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      `&daily=temperature_2m_max,temperature_2m_min,weather_code,precipitation_sum,wind_speed_10m_max` +
      `&timezone=auto&forecast_days=${days}`
    )
      .then(r => r.json())
      .then(data => {
        const d = data.daily;
        const result: DayForecast[] = d.time.map((date: string, i: number) => ({
          date,
          dayLabel: dayLabel(date, i),
          tempMax: Math.round(d.temperature_2m_max[i]),
          tempMin: Math.round(d.temperature_2m_min[i]),
          weatherCode: d.weather_code[i],
          precipitationSum: Math.round(d.precipitation_sum[i] * 10) / 10,
          windSpeedMax: Math.round(d.wind_speed_10m_max[i]),
        }));
        setForecast(result);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open, lat, lon, days]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          {/* Backdrop */}
          <motion.div
            className="absolute inset-0 bg-background/80 backdrop-blur-md"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />

          {/* Modal */}
          <motion.div
            className="relative w-full max-w-lg bg-card border border-border rounded-3xl shadow-2xl overflow-hidden"
            initial={{ opacity: 0, y: 40, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 40, scale: 0.97 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
          >
            {/* Header */}
            <div className="px-6 pt-6 pb-4 border-b border-border">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-1">
                    <Cloud className="inline w-3 h-3 mr-1" />{locationName}
                  </p>
                  <div className="flex items-baseline gap-3">
                    <span className="text-5xl font-bold tracking-tight">{currentTempC}°</span>
                    <div>
                      <p className="text-sm font-semibold capitalize text-foreground">{currentLabel}</p>
                      <p className="text-xs text-muted-foreground">Feels like {feelsLikeC}°</p>
                    </div>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="w-8 h-8 rounded-full border border-border flex items-center justify-center hover:bg-accent/10 transition-colors text-muted-foreground"
                >
                  <X size={14} />
                </button>
              </div>

              {/* Day toggle */}
              <div className="flex gap-2 mt-4">
                {([7, 14] as const).map(d => (
                  <button
                    key={d}
                    onClick={() => setDays(d)}
                    className={cn(
                      "px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider transition-all",
                      days === d
                        ? "bg-primary text-primary-foreground"
                        : "border border-border text-muted-foreground hover:border-primary/40"
                    )}
                  >
                    {d}-Day
                  </button>
                ))}
              </div>
            </div>

            {/* Forecast list */}
            <div className="overflow-y-auto max-h-[60vh] px-4 py-3 space-y-1">
              {loading ? (
                <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
                  Loading forecast…
                </div>
              ) : (
                forecast.map((day, i) => (
                  <motion.div
                    key={day.date}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.04 }}
                    className={cn(
                      "flex items-center gap-3 px-3 py-3 rounded-2xl transition-colors",
                      i === 0 ? "bg-primary/8 border border-primary/20" : "hover:bg-accent/5"
                    )}
                  >
                    {/* Day label */}
                    <div className="w-24 shrink-0">
                      <p className={cn("text-sm font-semibold", i === 0 ? "text-primary" : "text-foreground")}>
                        {day.dayLabel}
                      </p>
                    </div>

                    {/* Icon */}
                    <span className="text-2xl w-8 text-center shrink-0">{wmoIcon(day.weatherCode)}</span>

                    {/* Condition */}
                    <p className="text-xs text-muted-foreground flex-1 hidden sm:block capitalize">
                      {wmoLabel(day.weatherCode)}
                    </p>

                    {/* Stats */}
                    <div className="flex items-center gap-3 ml-auto shrink-0">
                      {day.precipitationSum > 0 && (
                        <span className="flex items-center gap-0.5 text-xs text-blue-400 font-medium">
                          <Droplets size={10} />{day.precipitationSum}mm
                        </span>
                      )}
                      <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
                        <Wind size={10} />{day.windSpeedMax}km/h
                      </span>
                      <div className="flex items-center gap-1 text-sm font-semibold">
                        <span className="text-foreground">{day.tempMax}°</span>
                        <span className="text-muted-foreground text-xs">{day.tempMin}°</span>
                      </div>
                    </div>
                  </motion.div>
                ))
              )}
            </div>

            <div className="px-6 py-3 border-t border-border">
              <p className="text-[10px] text-muted-foreground text-center">
                Powered by <a href="https://open-meteo.com" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">Open-Meteo</a> — free & open weather API
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
