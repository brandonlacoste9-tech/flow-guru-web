import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  ChevronLeft, ChevronRight, Plus, X, MapPin, Clock, Trash2,
  ArrowLeft, Calendar as CalendarIcon, AlignLeft, Search, RefreshCw, Bell, Pencil, Check, Palette
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc-client";
import { toast } from "sonner";
import { useLocation } from "wouter";

const WEEKDAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEKDAYS_FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const MONTHS_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

// ─── Calendar Theme Palettes ──────────────────────────────────────────────────
// Each theme defines CSS variables injected on the calendar root.
// light/dark variants are applied based on the .dark class on <html>.
export type CalendarThemeId =
  | "default"
  | "dark-leather"
  | "ocean"
  | "forest"
  | "rose"
  | "slate"
  | "lavender"
  | "amber"
  | "midnight";

export type CalendarTheme = {
  id: CalendarThemeId;
  label: string;
  swatch: string; // Tailwind bg class for the preview dot
  // CSS vars injected on the calendar container
  vars: {
    "--cal-bg": string;
    "--cal-header-bg": string;
    "--cal-cell-bg": string;
    "--cal-cell-other": string;
    "--cal-cell-today": string;
    "--cal-cell-selected": string;
    "--cal-border": string;
    "--cal-text": string;
    "--cal-text-muted": string;
    "--cal-accent": string;
    "--cal-accent-fg": string;
    "--cal-sidebar-bg": string;
  };
};

export const CALENDAR_THEMES: CalendarTheme[] = [
  {
    id: "default",
    label: "Parchment",
    swatch: "bg-amber-100",
    vars: {
      "--cal-bg":           "light-dark(#f5f0e8, #1a1a1f)",
      "--cal-header-bg":    "light-dark(rgba(245,240,232,0.97), rgba(26,26,31,0.97))",
      "--cal-cell-bg":      "light-dark(#faf6ee, #1e1e24)",
      "--cal-cell-other":   "light-dark(#ede8de, #17171c)",
      "--cal-cell-today":   "light-dark(#e8dcc8, #2a2535)",
      "--cal-cell-selected":"light-dark(#ddd0b8, #2d2840)",
      "--cal-border":       "light-dark(rgba(160,130,90,0.30), rgba(255,255,255,0.08))",
      "--cal-text":         "light-dark(#0d0804, #f0ece4)",
      "--cal-text-muted":   "light-dark(#3d2810, #7a7060)",
      "--cal-accent":       "light-dark(#7a5c2e, #c4a06a)",
      "--cal-accent-fg":    "#ffffff",
      "--cal-sidebar-bg":   "light-dark(rgba(240,234,222,0.85), rgba(20,20,25,0.85))",
    },
  },
  {
    id: "dark-leather",
    label: "Dark Leather",
    swatch: "bg-amber-900",
    vars: {
      "--cal-bg":           "#1a1208",
      "--cal-header-bg":    "rgba(20,14,6,0.97)",
      "--cal-cell-bg":      "#1e160a",
      "--cal-cell-other":   "#160f05",
      "--cal-cell-today":   "#2e2010",
      "--cal-cell-selected":"#3a2818",
      "--cal-border":       "rgba(180,130,60,0.20)",
      "--cal-text":         "#f0e4cc",
      "--cal-text-muted":   "#9a7a50",
      "--cal-accent":       "#c4903a",
      "--cal-accent-fg":    "#1a1208",
      "--cal-sidebar-bg":   "rgba(16,10,2,0.90)",
    },
  },
  {
    id: "ocean",
    label: "Ocean",
    swatch: "bg-sky-400",
    vars: {
      "--cal-bg":           "light-dark(#e8f4fd, #0d1b2a)",
      "--cal-header-bg":    "light-dark(rgba(232,244,253,0.97), rgba(13,27,42,0.97))",
      "--cal-cell-bg":      "light-dark(#f0f8ff, #0f1f30)",
      "--cal-cell-other":   "light-dark(#daeef8, #0a1520)",
      "--cal-cell-today":   "light-dark(#c8e4f5, #1a3a55)",
      "--cal-cell-selected":"light-dark(#b0d4ee, #1e4060)",
      "--cal-border":       "light-dark(rgba(60,140,200,0.25), rgba(100,180,240,0.12))",
      "--cal-text":         "light-dark(#051525, #d0eaff)",
      "--cal-text-muted":   "light-dark(#1a5070, #5a8aaa)",
      "--cal-accent":       "light-dark(#0284c7, #38bdf8)",
      "--cal-accent-fg":    "#ffffff",
      "--cal-sidebar-bg":   "light-dark(rgba(224,240,252,0.90), rgba(13,27,42,0.90))",
    },
  },
  {
    id: "forest",
    label: "Forest",
    swatch: "bg-emerald-500",
    vars: {
      "--cal-bg":           "light-dark(#e4f5eb, #0d1f14)",
      "--cal-header-bg":    "light-dark(rgba(228,245,235,0.97), rgba(13,31,20,0.97))",
      "--cal-cell-bg":      "light-dark(#edf8f1, #0f2218)",
      "--cal-cell-other":   "light-dark(#d8eedf, #0a1a10)",
      "--cal-cell-today":   "light-dark(#c0e4cc, #1a3d28)",
      "--cal-cell-selected":"light-dark(#a8d8b8, #1e4530)",
      "--cal-border":       "light-dark(rgba(30,140,70,0.25), rgba(60,180,100,0.12))",
      "--cal-text":         "light-dark(#03140a, #c8f0d8)",
      "--cal-text-muted":   "light-dark(#144d28, #4a8060)",
      "--cal-accent":       "light-dark(#059669, #34d399)",
      "--cal-accent-fg":    "#ffffff",
      "--cal-sidebar-bg":   "light-dark(rgba(218,240,226,0.90), rgba(13,31,20,0.90))",
    },
  },
  {
    id: "rose",
    label: "Rose",
    swatch: "bg-rose-400",
    vars: {
      "--cal-bg":           "light-dark(#fce8ec, #1f0d10)",
      "--cal-header-bg":    "light-dark(rgba(252,232,236,0.97), rgba(31,13,16,0.97))",
      "--cal-cell-bg":      "light-dark(#fef0f3, #221015)",
      "--cal-cell-other":   "light-dark(#f5d8de, #180a0d)",
      "--cal-cell-today":   "light-dark(#f8c0ca, #3d1a20)",
      "--cal-cell-selected":"light-dark(#f4a8b5, #451e25)",
      "--cal-border":       "light-dark(rgba(200,50,75,0.25), rgba(240,80,100,0.12))",
      "--cal-text":         "light-dark(#1e0208, #ffd0d8)",
      "--cal-text-muted":   "light-dark(#5c1020, #905060)",
      "--cal-accent":       "light-dark(#e11d48, #fb7185)",
      "--cal-accent-fg":    "#ffffff",
      "--cal-sidebar-bg":   "light-dark(rgba(245,220,228,0.90), rgba(31,13,16,0.90))",
    },
  },
  {
    id: "slate",
    label: "Slate",
    swatch: "bg-slate-400",
    vars: {
      "--cal-bg":           "light-dark(#e8ecf0, #0f1117)",
      "--cal-header-bg":    "light-dark(rgba(232,236,240,0.97), rgba(15,17,23,0.97))",
      "--cal-cell-bg":      "light-dark(#f0f3f6, #111318)",
      "--cal-cell-other":   "light-dark(#dde2e8, #0c0e13)",
      "--cal-cell-today":   "light-dark(#c8d2de, #1e2330)",
      "--cal-cell-selected":"light-dark(#b8c4d4, #222838)",
      "--cal-border":       "light-dark(rgba(80,100,140,0.25), rgba(100,120,160,0.12))",
      "--cal-text":         "light-dark(#050a12, #e2e8f0)",
      "--cal-text-muted":   "light-dark(#1e3048, #4a5568)",
      "--cal-accent":       "light-dark(#334e68, #94a3b8)",
      "--cal-accent-fg":    "#ffffff",
      "--cal-sidebar-bg":   "light-dark(rgba(222,228,236,0.90), rgba(15,17,23,0.90))",
    },
  },
  {
    id: "lavender",
    label: "Lavender",
    swatch: "bg-violet-400",
    vars: {
      "--cal-bg":           "light-dark(#ece6ff, #120d1f)",
      "--cal-header-bg":    "light-dark(rgba(236,230,255,0.97), rgba(18,13,31,0.97))",
      "--cal-cell-bg":      "light-dark(#f2eeff, #151020)",
      "--cal-cell-other":   "light-dark(#e0d8f8, #0e0a18)",
      "--cal-cell-today":   "light-dark(#cfc0f5, #2a1f45)",
      "--cal-cell-selected":"light-dark(#bfaaf0, #301e50)",
      "--cal-border":       "light-dark(rgba(110,60,210,0.25), rgba(140,80,240,0.12))",
      "--cal-text":         "light-dark(#0d0220, #e8d8ff)",
      "--cal-text-muted":   "light-dark(#3a1a70, #6050a0)",
      "--cal-accent":       "light-dark(#6d28d9, #a78bfa)",
      "--cal-accent-fg":    "#ffffff",
      "--cal-sidebar-bg":   "light-dark(rgba(226,218,252,0.90), rgba(18,13,31,0.90))",
    },
  },
  {
    id: "amber",
    label: "Amber",
    swatch: "bg-amber-400",
    vars: {
      "--cal-bg":           "light-dark(#f5e8c0, #1f1800)",
      "--cal-header-bg":    "light-dark(rgba(245,232,192,0.97), rgba(31,24,0,0.97))",
      "--cal-cell-bg":      "light-dark(#faf0cc, #221a00)",
      "--cal-cell-other":   "light-dark(#ecdda8, #180f00)",
      "--cal-cell-today":   "light-dark(#e0cc88, #3d2e00)",
      "--cal-cell-selected":"light-dark(#d4c070, #453400)",
      "--cal-border":       "light-dark(rgba(160,110,0,0.28), rgba(220,160,0,0.12))",
      "--cal-text":         "light-dark(#140c00, #ffe8a0)",
      "--cal-text-muted":   "light-dark(#4a2e00, #806020)",
      "--cal-accent":       "light-dark(#b45309, #fbbf24)",
      "--cal-accent-fg":    "#ffffff",
      "--cal-sidebar-bg":   "light-dark(rgba(236,220,180,0.90), rgba(31,24,0,0.90))",
    },
  },
  {
    id: "midnight",
    label: "Midnight",
    swatch: "bg-indigo-900",
    vars: {
      "--cal-bg":           "light-dark(#dde0ff, #08091a)",
      "--cal-header-bg":    "light-dark(rgba(221,224,255,0.97), rgba(8,9,26,0.97))",
      "--cal-cell-bg":      "light-dark(#e8eaff, #0a0b1e)",
      "--cal-cell-other":   "light-dark(#d0d4f8, #060710)",
      "--cal-cell-today":   "light-dark(#b8bcf0, #1a1e40)",
      "--cal-cell-selected":"light-dark(#a8aee8, #1e2248)",
      "--cal-border":       "light-dark(rgba(40,50,190,0.25), rgba(60,80,220,0.12))",
      "--cal-text":         "light-dark(#020415, #d0d4ff)",
      "--cal-text-muted":   "light-dark(#141a60, #303880)",
      "--cal-accent":       "light-dark(#3730a3, #6366f1)",
      "--cal-accent-fg":    "#ffffff",
      "--cal-sidebar-bg":   "light-dark(rgba(210,214,252,0.90), rgba(8,9,26,0.90))",
    },
  },
];

const THEME_STORAGE_KEY = "fg_calendar_theme";

function useCalendarTheme() {
  const [themeId, setThemeId] = useState<CalendarThemeId>(() => {
    try { return (localStorage.getItem(THEME_STORAGE_KEY) as CalendarThemeId) || "default"; }
    catch { return "default"; }
  });

  const theme = CALENDAR_THEMES.find(t => t.id === themeId) ?? CALENDAR_THEMES[0];

  const applyTheme = (id: CalendarThemeId) => {
    setThemeId(id);
    try { localStorage.setItem(THEME_STORAGE_KEY, id); } catch {}
  };

  return { theme, themeId, applyTheme };
}

// ─── Event Colors ─────────────────────────────────────────────────────────────
const EVENT_COLORS = [
  { id: "blue",   label: "Blueberry",  bg: "bg-blue-500",    text: "text-white",       dot: "bg-blue-500",    lightBg: "#eff6ff", lightText: "#1d4ed8", lightBorder: "#bfdbfe", darkBg: "rgba(30,58,138,0.4)", darkText: "#93c5fd", darkBorder: "rgba(59,130,246,0.3)" },
  { id: "green",  label: "Sage",       bg: "bg-emerald-500", text: "text-white",       dot: "bg-emerald-500", lightBg: "#ecfdf5", lightText: "#065f46", lightBorder: "#a7f3d0", darkBg: "rgba(6,78,59,0.4)",  darkText: "#6ee7b7", darkBorder: "rgba(16,185,129,0.3)" },
  { id: "red",    label: "Tomato",     bg: "bg-red-500",     text: "text-white",       dot: "bg-red-500",     lightBg: "#fef2f2", lightText: "#991b1b", lightBorder: "#fecaca", darkBg: "rgba(127,29,29,0.4)", darkText: "#fca5a5", darkBorder: "rgba(239,68,68,0.3)" },
  { id: "yellow", label: "Banana",     bg: "bg-amber-400",   text: "text-gray-900",    dot: "bg-amber-400",   lightBg: "#fffbeb", lightText: "#92400e", lightBorder: "#fde68a", darkBg: "rgba(120,53,15,0.4)", darkText: "#fcd34d", darkBorder: "rgba(245,158,11,0.3)" },
  { id: "purple", label: "Grape",      bg: "bg-purple-500",  text: "text-white",       dot: "bg-purple-500",  lightBg: "#faf5ff", lightText: "#6b21a8", lightBorder: "#e9d5ff", darkBg: "rgba(88,28,135,0.4)", darkText: "#d8b4fe", darkBorder: "rgba(168,85,247,0.3)" },
  { id: "pink",   label: "Flamingo",   bg: "bg-pink-400",    text: "text-white",       dot: "bg-pink-400",    lightBg: "#fdf2f8", lightText: "#9d174d", lightBorder: "#fbcfe8", darkBg: "rgba(131,24,67,0.4)", darkText: "#f9a8d4", darkBorder: "rgba(236,72,153,0.3)" },
  { id: "orange", label: "Tangerine",  bg: "bg-orange-400",  text: "text-white",       dot: "bg-orange-400",  lightBg: "#fff7ed", lightText: "#9a3412", lightBorder: "#fed7aa", darkBg: "rgba(124,45,18,0.4)", darkText: "#fdba74", darkBorder: "rgba(249,115,22,0.3)" },
  { id: "teal",   label: "Peacock",    bg: "bg-teal-500",    text: "text-white",       dot: "bg-teal-500",    lightBg: "#f0fdfa", lightText: "#134e4a", lightBorder: "#99f6e4", darkBg: "rgba(19,78,74,0.4)",  darkText: "#5eead4", darkBorder: "rgba(20,184,166,0.3)" },
];

function getColor(colorId?: string | null) {
  return EVENT_COLORS.find(c => c.id === colorId) ?? EVENT_COLORS[0];
}

// Render an event chip with inline styles so it works in any theme
function EventChip({ event, onClick }: { event: any; onClick?: (e: React.MouseEvent) => void }) {
  const color = getColor(event.color);
  const isDark = document.documentElement.classList.contains("dark");
  return (
    <div
      onClick={onClick}
      style={{
        backgroundColor: isDark ? color.darkBg : color.lightBg,
        color: isDark ? color.darkText : color.lightText,
        borderColor: isDark ? color.darkBorder : color.lightBorder,
        borderWidth: "1px",
        borderStyle: "solid",
      }}
      className="text-xs leading-tight truncate px-1.5 py-0.5 rounded-md font-semibold cursor-pointer hover:opacity-80 transition-opacity"
    >
      {!event.allDay && <span className="opacity-70 mr-1">{formatTime(new Date(event.startAt)).replace(":00","")}</span>}
      {event.title}
    </div>
  );
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function formatTime(d: Date) {
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}

function formatDatetimeLocal(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

type ViewMode = "month" | "week" | "day";
type RecurrenceType = 'none' | 'daily' | 'weekdays' | 'weekly' | 'monthly' | 'yearly';

type EventForm = {
  title: string;
  description: string;
  startAt: string;
  endAt: string;
  location: string;
  allDay: boolean;
  color: string;
  recurrence: RecurrenceType;
  reminderMinutes: string;
};

const blankForm = (day: Date): EventForm => {
  const start = new Date(day);
  start.setHours(9, 0, 0, 0);
  const end = new Date(start);
  end.setHours(10, 0, 0, 0);
  return { title: "", description: "", startAt: formatDatetimeLocal(start), endAt: formatDatetimeLocal(end), location: "", allDay: false, color: "blue", recurrence: "none", reminderMinutes: "30,15,5" };
};

// ─── Theme Palette Picker ─────────────────────────────────────────────────────
function ThemePicker({ themeId, onSelect }: { themeId: CalendarThemeId; onSelect: (id: CalendarThemeId) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const current = CALENDAR_THEMES.find(t => t.id === themeId) ?? CALENDAR_THEMES[0];

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        title="Calendar theme"
        className="w-9 h-9 rounded-full hover:bg-[var(--cal-cell-today)] flex items-center justify-center transition-colors text-[var(--cal-text-muted)] hover:text-[var(--cal-text)]"
      >
        <Palette size={16}/>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: -6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: -6 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-11 z-50 rounded-2xl shadow-2xl border p-3 min-w-[200px]"
            style={{
              background: "var(--cal-header-bg)",
              borderColor: "var(--cal-border)",
              backdropFilter: "blur(16px)",
            }}
          >
            <p className="text-xs font-bold uppercase tracking-widest mb-2.5 px-1" style={{ color: "var(--cal-text-muted)" }}>
              Calendar Theme
            </p>
            <div className="grid grid-cols-4 gap-1.5">
              {CALENDAR_THEMES.map(t => (
                <button
                  key={t.id}
                  onClick={() => { onSelect(t.id); setOpen(false); }}
                  title={t.label}
                  className={cn(
                    "flex flex-col items-center gap-1 p-1.5 rounded-xl transition-all",
                    themeId === t.id
                      ? "ring-2 ring-offset-1 ring-[var(--cal-accent)] bg-[var(--cal-cell-today)]"
                      : "hover:bg-[var(--cal-cell-today)]"
                  )}
                >
                  <span className={cn("w-6 h-6 rounded-full shadow-sm", t.swatch)}/>
                  <span className="text-[11px] font-semibold leading-tight text-center" style={{ color: "var(--cal-text-muted)" }}>
                    {t.label}
                  </span>
                </button>
              ))}
            </div>
            <div className="mt-2 pt-2 border-t" style={{ borderColor: "var(--cal-border)" }}>
              <p className="text-xs text-center" style={{ color: "var(--cal-text-muted)" }}>
                Current: <span className="font-semibold" style={{ color: "var(--cal-text)" }}>{current.label}</span>
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Mini Calendar (sidebar) ──────────────────────────────────────────────────
function MiniCalendar({ viewDate, selectedDay, onSelectDay, onChangeMonth, events }: {
  viewDate: Date; selectedDay: Date; onSelectDay: (d: Date) => void;
  onChangeMonth: (d: Date) => void; events: any[];
}) {
  const today = new Date();
  const monthStart = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1);
  const monthEnd = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 0);
  const days: Date[] = [];
  const firstWeekday = monthStart.getDay();
  for (let i = firstWeekday - 1; i >= 0; i--) {
    const d = new Date(monthStart); d.setDate(d.getDate() - i - 1); days.push(d);
  }
  for (let i = 1; i <= monthEnd.getDate(); i++) days.push(new Date(viewDate.getFullYear(), viewDate.getMonth(), i));
  const rem = 7 - (days.length % 7);
  if (rem < 7) for (let i = 1; i <= rem; i++) { const d = new Date(monthEnd); d.setDate(d.getDate() + i); days.push(d); }

  const hasEvent = (d: Date) => events.some(e => isSameDay(new Date(e.startAt), d));

  return (
    <div className="p-3 select-none">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-semibold" style={{ color: "var(--cal-text)" }}>{MONTHS_SHORT[viewDate.getMonth()]} {viewDate.getFullYear()}</span>
        <div className="flex gap-1">
          <button onClick={() => onChangeMonth(new Date(viewDate.getFullYear(), viewDate.getMonth()-1,1))}
            className="w-6 h-6 flex items-center justify-center rounded transition-colors hover:bg-[var(--cal-cell-today)]"
            style={{ color: "var(--cal-text-muted)" }}>
            <ChevronLeft size={12}/>
          </button>
          <button onClick={() => onChangeMonth(new Date(viewDate.getFullYear(), viewDate.getMonth()+1,1))}
            className="w-6 h-6 flex items-center justify-center rounded transition-colors hover:bg-[var(--cal-cell-today)]"
            style={{ color: "var(--cal-text-muted)" }}>
            <ChevronRight size={12}/>
          </button>
        </div>
      </div>
      <div className="grid grid-cols-7 mb-1">
        {WEEKDAYS_SHORT.map(d => (
          <div key={d} className="text-center text-xs font-bold py-0.5" style={{ color: "var(--cal-text-muted)" }}>{d[0]}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-px">
        {days.map((day, i) => {
          const isCurrentMonth = day.getMonth() === viewDate.getMonth();
          const isToday = isSameDay(day, today);
          const isSelected = isSameDay(day, selectedDay);
          const hasDot = hasEvent(day);
          return (
            <button key={i} onClick={() => onSelectDay(day)}
              style={{
                backgroundColor: isSelected ? "var(--cal-accent)" : isToday ? "var(--cal-cell-today)" : "transparent",
                color: isSelected ? "var(--cal-accent-fg)" : isToday ? "var(--cal-accent)" : isCurrentMonth ? "var(--cal-text)" : "var(--cal-text-muted)",
              }}
              className="relative w-7 h-7 mx-auto flex items-center justify-center rounded-full text-[11px] font-medium transition-colors hover:opacity-80">
              {day.getDate()}
              {hasDot && !isSelected && (
                <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full" style={{ backgroundColor: "var(--cal-accent)" }}/>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Event Detail Popover (with inline editing) ───────────────────────────────
function EventPopover({ event, onClose, onDelete, onUpdated }: {
  event: any;
  onClose: () => void;
  onDelete: (id: number) => void;
  onUpdated: () => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(event.title ?? "");
  const [editStartAt, setEditStartAt] = useState(formatDatetimeLocal(new Date(event.startAt)));
  const [editEndAt, setEditEndAt] = useState(formatDatetimeLocal(new Date(event.endAt)));
  const [editLocation, setEditLocation] = useState(event.location ?? "");
  const [editDescription, setEditDescription] = useState(event.description ?? "");
  const [editColor, setEditColor] = useState(event.color ?? "blue");
  const [editAllDay, setEditAllDay] = useState(!!event.allDay);

  const updateMutation = trpc.calendar.update.useMutation({
    onSuccess: () => { toast.success("Event updated"); onUpdated(); onClose(); },
    onError: () => toast.error("Couldn't update event"),
  });

  const color = getColor(isEditing ? editColor : event.color);
  const isDark = document.documentElement.classList.contains("dark");

  const handleSave = () => {
    if (!editTitle.trim()) { toast.error("Title is required"); return; }
    updateMutation.mutate({
      id: event.id,
      title: editTitle.trim(),
      description: editDescription || undefined,
      startAt: new Date(editStartAt).toISOString(),
      endAt: new Date(editEndAt).toISOString(),
      location: editLocation || undefined,
      allDay: editAllDay,
      color: editColor,
    });
  };

  return (
    <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" />
      <div
        className="relative rounded-2xl shadow-2xl w-full max-w-sm p-0 overflow-hidden"
        style={{ background: "var(--cal-cell-bg)", border: "1px solid var(--cal-border)" }}
        onClick={e => e.stopPropagation()}
      >
        {/* Color accent bar */}
        <div className={cn("h-1.5 w-full", color.bg)} />

        <div className="p-5">
          {/* Header row */}
          <div className="flex items-start justify-between gap-3 mb-4">
            {isEditing ? (
              <input
                value={editTitle}
                onChange={e => setEditTitle(e.target.value)}
                autoFocus
                className="flex-1 text-lg font-bold bg-transparent border-0 border-b-2 outline-none pb-1 placeholder:opacity-40"
                style={{ borderColor: "var(--cal-accent)", color: "var(--cal-text)" }}
                placeholder="Event title"
              />
            ) : (
              <h3 className="text-lg font-bold leading-tight flex-1" style={{ color: "var(--cal-text)" }}>{event.title}</h3>
            )}
            <div className="flex gap-1 shrink-0">
              {isEditing ? (
                <>
                  <button onClick={handleSave} disabled={updateMutation.isPending}
                    className="w-8 h-8 rounded-full flex items-center justify-center transition-colors disabled:opacity-50 hover:opacity-80"
                    style={{ color: "#10b981", backgroundColor: isDark ? "rgba(16,185,129,0.15)" : "#ecfdf5" }}>
                    <Check size={14}/>
                  </button>
                  <button onClick={() => setIsEditing(false)}
                    className="w-8 h-8 rounded-full flex items-center justify-center transition-colors hover:bg-[var(--cal-cell-today)]"
                    style={{ color: "var(--cal-text-muted)" }}>
                    <X size={14}/>
                  </button>
                </>
              ) : (
                <>
                  <button onClick={() => setIsEditing(true)}
                    className="w-8 h-8 rounded-full flex items-center justify-center transition-colors hover:bg-[var(--cal-cell-today)]"
                    style={{ color: "var(--cal-text-muted)" }} title="Edit event">
                    <Pencil size={13}/>
                  </button>
                  <button onClick={() => { onDelete(event.id); onClose(); }}
                    className="w-8 h-8 rounded-full flex items-center justify-center transition-colors"
                    style={{ color: "var(--cal-text-muted)" }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "#ef4444"; (e.currentTarget as HTMLElement).style.backgroundColor = isDark ? "rgba(239,68,68,0.15)" : "#fef2f2"; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "var(--cal-text-muted)"; (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"; }}>
                    <Trash2 size={14}/>
                  </button>
                  <button onClick={onClose}
                    className="w-8 h-8 rounded-full flex items-center justify-center transition-colors hover:bg-[var(--cal-cell-today)]"
                    style={{ color: "var(--cal-text-muted)" }}>
                    <X size={14}/>
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Body — read mode */}
          {!isEditing && (
            <div className="space-y-2.5">
              {!event.allDay && (
                <div className="flex items-center gap-3 text-sm" style={{ color: "var(--cal-text-muted)" }}>
                  <Clock size={14} className="shrink-0" style={{ color: "var(--cal-accent)" }}/>
                  <span>{new Date(event.startAt).toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric"})} · {formatTime(new Date(event.startAt))} – {formatTime(new Date(event.endAt))}</span>
                </div>
              )}
              {event.allDay === 1 && (
                <div className="flex items-center gap-3 text-sm" style={{ color: "var(--cal-text-muted)" }}>
                  <CalendarIcon size={14} className="shrink-0" style={{ color: "var(--cal-accent)" }}/>
                  <span>{new Date(event.startAt).toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric"})} · All day</span>
                </div>
              )}
              {event.location && (
                <div className="flex items-center gap-3 text-sm" style={{ color: "var(--cal-text-muted)" }}>
                  <MapPin size={14} className="shrink-0" style={{ color: "var(--cal-accent)" }}/>
                  <span>{event.location}</span>
                </div>
              )}
              {event.description && (
                <div className="flex items-start gap-3 text-sm" style={{ color: "var(--cal-text-muted)" }}>
                  <AlignLeft size={14} className="shrink-0 mt-0.5" style={{ color: "var(--cal-accent)" }}/>
                  <span className="leading-relaxed">{event.description}</span>
                </div>
              )}
            </div>
          )}

          {/* Body — edit mode */}
          {isEditing && (
            <div className="space-y-3">
              {/* All day toggle */}
              <div className="flex items-center gap-3">
                <button type="button" onClick={() => setEditAllDay(v => !v)}
                  className="relative w-9 h-5 rounded-full transition-colors shrink-0"
                  style={{ backgroundColor: editAllDay ? "var(--cal-accent)" : "var(--cal-cell-today)" }}>
                  <span className={cn("absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all", editAllDay ? "left-4" : "left-0.5")}/>
                </button>
                <span className="text-sm" style={{ color: "var(--cal-text-muted)" }}>All day</span>
              </div>

              {/* Date/time */}
              {!editAllDay ? (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs font-semibold mb-1 block uppercase tracking-wide" style={{ color: "var(--cal-text-muted)" }}>Start</label>
                    <input type="datetime-local" value={editStartAt} onChange={e => setEditStartAt(e.target.value)}
                      className="w-full rounded-lg px-2.5 py-1.5 text-xs outline-none focus:ring-2"
                      style={{ background: "var(--cal-cell-today)", border: "1px solid var(--cal-border)", color: "var(--cal-text)" }}/>
                  </div>
                  <div>
                    <label className="text-xs font-semibold mb-1 block uppercase tracking-wide" style={{ color: "var(--cal-text-muted)" }}>End</label>
                    <input type="datetime-local" value={editEndAt} onChange={e => setEditEndAt(e.target.value)}
                      className="w-full rounded-lg px-2.5 py-1.5 text-xs outline-none focus:ring-2"
                      style={{ background: "var(--cal-cell-today)", border: "1px solid var(--cal-border)", color: "var(--cal-text)" }}/>
                  </div>
                </div>
              ) : (
                <div>
                  <label className="text-xs font-semibold mb-1 block uppercase tracking-wide" style={{ color: "var(--cal-text-muted)" }}>Date</label>
                  <input type="date" value={editStartAt.split("T")[0]} onChange={e => { setEditStartAt(e.target.value+"T09:00"); setEditEndAt(e.target.value+"T10:00"); }}
                    className="w-full rounded-lg px-2.5 py-1.5 text-xs outline-none"
                    style={{ background: "var(--cal-cell-today)", border: "1px solid var(--cal-border)", color: "var(--cal-text)" }}/>
                </div>
              )}

              {/* Location */}
              <div className="flex items-center gap-2 rounded-lg px-3 py-2"
                style={{ background: "var(--cal-cell-today)", border: "1px solid var(--cal-border)" }}>
                <MapPin size={13} style={{ color: "var(--cal-text-muted)" }} className="shrink-0"/>
                <input value={editLocation} onChange={e => setEditLocation(e.target.value)}
                  placeholder="Add location"
                  className="flex-1 bg-transparent text-sm outline-none placeholder:opacity-40"
                  style={{ color: "var(--cal-text)" }}/>
              </div>

              {/* Description */}
              <div className="flex items-start gap-2 rounded-lg px-3 py-2"
                style={{ background: "var(--cal-cell-today)", border: "1px solid var(--cal-border)" }}>
                <AlignLeft size={13} style={{ color: "var(--cal-text-muted)" }} className="shrink-0 mt-0.5"/>
                <textarea value={editDescription} onChange={e => setEditDescription(e.target.value)}
                  placeholder="Add description" rows={2}
                  className="flex-1 bg-transparent text-sm outline-none resize-none placeholder:opacity-40"
                  style={{ color: "var(--cal-text)" }}/>
              </div>

              {/* Color picker */}
              <div>
                <label className="text-xs font-semibold mb-2 block uppercase tracking-wide" style={{ color: "var(--cal-text-muted)" }}>Color</label>
                <div className="flex gap-2 flex-wrap">
                  {EVENT_COLORS.map(c => (
                    <button key={c.id} type="button" onClick={() => setEditColor(c.id)}
                      className={cn("w-6 h-6 rounded-full transition-all", c.bg,
                        editColor === c.id ? "ring-2 ring-offset-2 ring-offset-[var(--cal-cell-bg)] ring-white scale-110" : "hover:scale-110 opacity-70 hover:opacity-100")}>
                    </button>
                  ))}
                </div>
              </div>

              {/* Save / Cancel */}
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setIsEditing(false)}
                  className="flex-1 py-2 rounded-xl text-sm font-semibold transition-colors hover:opacity-80"
                  style={{ border: "1px solid var(--cal-border)", color: "var(--cal-text)", background: "transparent" }}>
                  Cancel
                </button>
                <button type="button" onClick={handleSave} disabled={updateMutation.isPending}
                  className="flex-1 py-2 rounded-xl text-sm font-semibold transition-opacity disabled:opacity-50 hover:opacity-90"
                  style={{ background: "var(--cal-accent)", color: "var(--cal-accent-fg)" }}>
                  {updateMutation.isPending ? "Saving…" : "Save changes"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ─── New Event Modal ──────────────────────────────────────────────────────────
function NewEventModal({ form, setForm, onSubmit, onClose, isPending }: {
  form: EventForm; setForm: (f: EventForm) => void;
  onSubmit: (e: React.FormEvent) => void; onClose: () => void; isPending: boolean;
}) {
  const titleRef = useRef<HTMLInputElement>(null);
  useEffect(() => { setTimeout(() => titleRef.current?.focus(), 50); }, []);
  const color = getColor(form.color);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
      <motion.div initial={{ opacity: 0, y: 20, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10, scale: 0.97 }}
        className="relative rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
        style={{ background: "var(--cal-cell-bg)", border: "1px solid var(--cal-border)" }}
        onClick={e => e.stopPropagation()}>
        {/* Color bar */}
        <div className={cn("h-1.5 w-full transition-colors", color.bg)} />
        <div className="p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-bold" style={{ color: "var(--cal-text)" }}>New event</h2>
            <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center transition-colors hover:bg-[var(--cal-cell-today)]"
              style={{ color: "var(--cal-text-muted)" }}><X size={15}/></button>
          </div>

          <form onSubmit={onSubmit} className="space-y-4">
            {/* Title */}
            <input ref={titleRef} value={form.title} onChange={e => setForm({...form, title: e.target.value})}
              placeholder="Add title" required
              className="w-full text-xl font-semibold bg-transparent border-0 border-b-2 outline-none pb-2 placeholder:opacity-40 transition-colors"
              style={{ borderColor: "var(--cal-border)", color: "var(--cal-text)" }}
              onFocus={e => (e.target as HTMLElement).style.borderColor = "var(--cal-accent)"}
              onBlur={e => (e.target as HTMLElement).style.borderColor = "var(--cal-border)"}/>

            {/* All day toggle */}
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => setForm({...form, allDay: !form.allDay})}
                className="relative w-10 h-5 rounded-full transition-colors"
                style={{ backgroundColor: form.allDay ? "var(--cal-accent)" : "var(--cal-cell-today)" }}>
                <span className={cn("absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all", form.allDay ? "left-5" : "left-0.5")}/>
              </button>
              <span className="text-sm" style={{ color: "var(--cal-text-muted)" }}>All day</span>
            </div>

            {/* Date/time */}
            {!form.allDay ? (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs mb-1 block" style={{ color: "var(--cal-text-muted)" }}>Start</label>
                  <input type="datetime-local" value={form.startAt} onChange={e => setForm({...form, startAt: e.target.value})}
                    className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                    style={{ background: "var(--cal-cell-today)", border: "1px solid var(--cal-border)", color: "var(--cal-text)" }}/>
                </div>
                <div>
                  <label className="text-xs mb-1 block" style={{ color: "var(--cal-text-muted)" }}>End</label>
                  <input type="datetime-local" value={form.endAt} onChange={e => setForm({...form, endAt: e.target.value})}
                    className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                    style={{ background: "var(--cal-cell-today)", border: "1px solid var(--cal-border)", color: "var(--cal-text)" }}/>
                </div>
              </div>
            ) : (
              <div>
                <label className="text-xs mb-1 block" style={{ color: "var(--cal-text-muted)" }}>Date</label>
                <input type="date" value={form.startAt.split("T")[0]} onChange={e => setForm({...form, startAt: e.target.value+"T09:00", endAt: e.target.value+"T10:00"})}
                  className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                  style={{ background: "var(--cal-cell-today)", border: "1px solid var(--cal-border)", color: "var(--cal-text)" }}/>
              </div>
            )}

            {/* Location */}
            <div className="flex items-center gap-2 rounded-lg px-3 py-2"
              style={{ background: "var(--cal-cell-today)", border: "1px solid var(--cal-border)" }}>
              <MapPin size={14} style={{ color: "var(--cal-text-muted)" }} className="shrink-0"/>
              <input value={form.location} onChange={e => setForm({...form, location: e.target.value})}
                placeholder="Add location" className="flex-1 bg-transparent text-sm outline-none placeholder:opacity-40"
                style={{ color: "var(--cal-text)" }}/>
            </div>

            {/* Description */}
            <div className="flex items-start gap-2 rounded-lg px-3 py-2"
              style={{ background: "var(--cal-cell-today)", border: "1px solid var(--cal-border)" }}>
              <AlignLeft size={14} style={{ color: "var(--cal-text-muted)" }} className="shrink-0 mt-0.5"/>
              <textarea value={form.description} onChange={e => setForm({...form, description: e.target.value})}
                placeholder="Add description" rows={2}
                className="flex-1 bg-transparent text-sm outline-none resize-none placeholder:opacity-40"
                style={{ color: "var(--cal-text)" }}/>
            </div>

            {/* Recurrence */}
            <div className="flex items-center gap-2 rounded-lg px-3 py-2"
              style={{ background: "var(--cal-cell-today)", border: "1px solid var(--cal-border)" }}>
              <RefreshCw size={14} style={{ color: "var(--cal-text-muted)" }} className="shrink-0"/>
              <select value={form.recurrence} onChange={e => setForm({...form, recurrence: e.target.value as RecurrenceType})}
                className="flex-1 bg-transparent text-sm outline-none" style={{ color: "var(--cal-text)" }}>
                <option value="none">Does not repeat</option>
                <option value="daily">Every day</option>
                <option value="weekdays">Every weekday (Mon–Fri)</option>
                <option value="weekly">Every week</option>
                <option value="monthly">Every month</option>
                <option value="yearly">Every year</option>
              </select>
            </div>

            {/* Reminder */}
            <div className="flex items-center gap-2 rounded-lg px-3 py-2"
              style={{ background: "var(--cal-cell-today)", border: "1px solid var(--cal-border)" }}>
              <Bell size={14} style={{ color: "var(--cal-text-muted)" }} className="shrink-0"/>
              <select value={form.reminderMinutes} onChange={e => setForm({...form, reminderMinutes: e.target.value})}
                className="flex-1 bg-transparent text-sm outline-none" style={{ color: "var(--cal-text)" }}>
                <option value="">No reminder</option>
                <option value="5">5 minutes before</option>
                <option value="10">10 minutes before</option>
                <option value="15">15 minutes before</option>
                <option value="30">30 minutes before</option>
                <option value="30,15">30 and 15 minutes before</option>
                <option value="30,15,5">30, 15, and 5 minutes before</option>
                <option value="60">1 hour before</option>
                <option value="60,30">1 hour and 30 minutes before</option>
                <option value="60,30,15,5">1 hour, 30, 15, and 5 min before</option>
                <option value="1440">1 day before</option>
              </select>
            </div>

            {/* Color picker */}
            <div>
              <label className="text-xs mb-2 block" style={{ color: "var(--cal-text-muted)" }}>Color</label>
              <div className="flex gap-2 flex-wrap">
                {EVENT_COLORS.map(c => (
                  <button key={c.id} type="button" onClick={() => setForm({...form, color: c.id})}
                    className={cn("w-6 h-6 rounded-full transition-all", c.bg,
                      form.color === c.id ? "ring-2 ring-offset-2 ring-offset-[var(--cal-cell-bg)] ring-white scale-110" : "hover:scale-110 opacity-70 hover:opacity-100")}>
                  </button>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-1">
              <button type="button" onClick={onClose}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors hover:opacity-80"
                style={{ border: "1px solid var(--cal-border)", color: "var(--cal-text)" }}>
                Cancel
              </button>
              <button type="submit" disabled={isPending}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-opacity disabled:opacity-50 hover:opacity-90"
                style={{ background: "var(--cal-accent)", color: "var(--cal-accent-fg)" }}>
                {isPending ? "Saving…" : "Save"}
              </button>
            </div>
          </form>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── Month View ───────────────────────────────────────────────────────────────
function MonthView({ viewDate, selectedDay, events, onDayClick, onEventClick }: {
  viewDate: Date; selectedDay: Date; events: any[];
  onDayClick: (d: Date) => void; onEventClick: (e: any) => void;
}) {
  const today = new Date();
  const monthStart = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1);
  const monthEnd = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 0);
  const days: Date[] = [];
  const firstWeekday = monthStart.getDay();
  for (let i = firstWeekday - 1; i >= 0; i--) { const d = new Date(monthStart); d.setDate(d.getDate() - i - 1); days.push(d); }
  for (let i = 1; i <= monthEnd.getDate(); i++) days.push(new Date(viewDate.getFullYear(), viewDate.getMonth(), i));
  const rem = 7 - (days.length % 7);
  if (rem < 7) for (let i = 1; i <= rem; i++) { const d = new Date(monthEnd); d.setDate(d.getDate() + i); days.push(d); }

  const eventsOnDay = (d: Date) => events.filter(e => isSameDay(new Date(e.startAt), d));

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Weekday headers */}
      <div className="grid grid-cols-7" style={{ borderBottom: "1px solid var(--cal-border)", background: "var(--cal-header-bg)" }}>
        {WEEKDAYS_SHORT.map(d => (
          <div key={d} className="py-2.5 text-center text-sm font-bold uppercase tracking-wider"
            style={{ color: "var(--cal-text-muted)" }}>
            {d}
          </div>
        ))}
      </div>
      {/* Grid */}
      <div className="flex-1 grid grid-cols-7 grid-rows-6 overflow-hidden">
        {days.map((day, i) => {
          const isCurrentMonth = day.getMonth() === viewDate.getMonth();
          const isToday = isSameDay(day, today);
          const isSelected = isSameDay(day, selectedDay);
          const dayEvents = eventsOnDay(day);
          const hasEvents = dayEvents.length > 0 && isCurrentMonth;
          return (
            <div key={i} onClick={() => onDayClick(day)}
              className="p-1.5 cursor-pointer transition-colors overflow-hidden"
              style={{
                borderBottom: "1px solid var(--cal-border)",
                borderRight: "1px solid var(--cal-border)",
                background: isSelected
                  ? "var(--cal-cell-selected)"
                  : isToday
                  ? "var(--cal-cell-today)"
                  : isCurrentMonth
                  ? "var(--cal-cell-bg)"
                  : "var(--cal-cell-other)",
              }}
              onMouseEnter={e => { if (!isSelected && !isToday) (e.currentTarget as HTMLElement).style.filter = "brightness(0.96)"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.filter = ""; }}>
              <div className="flex justify-center mb-1">
                <span
                  className="flex items-center justify-center rounded-full font-medium transition-all"
                  style={{
                    width: hasEvents ? "2.25rem" : "2rem",
                    height: hasEvents ? "2.25rem" : "2rem",
                    fontSize: "1rem",
                    fontWeight: isToday || isSelected || hasEvents ? 700 : 400,
                    backgroundColor: isToday ? "var(--cal-accent)" : "transparent",
                    color: isToday
                      ? "var(--cal-accent-fg)"
                      : isSelected
                      ? "var(--cal-accent)"
                      : isCurrentMonth
                      ? "var(--cal-text)"
                      : "var(--cal-text-muted)",
                  }}>
                  {day.getDate()}
                </span>
              </div>
              <div className="space-y-0.5">
                {dayEvents.slice(0, 3).map(e => (
                  <EventChip key={e.id} event={e} onClick={ev => { ev.stopPropagation(); onEventClick(e); }}/>
                ))}
                {dayEvents.length > 3 && (
                  <div className="text-xs pl-1 font-semibold" style={{ color: "var(--cal-text-muted)" }}>
                    +{dayEvents.length - 3} more
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Week View ────────────────────────────────────────────────────────────────
function WeekView({ viewDate, events, onEventClick, onSlotClick }: {
  viewDate: Date; events: any[]; onEventClick: (e: any) => void; onSlotClick: (d: Date) => void;
}) {
  const today = new Date();
  const startOfWeek = new Date(viewDate);
  startOfWeek.setDate(viewDate.getDate() - viewDate.getDay());
  const weekDays = Array.from({length: 7}, (_, i) => { const d = new Date(startOfWeek); d.setDate(d.getDate() + i); return d; });
  const hours = Array.from({length: 24}, (_, i) => i);

  const eventsOnDay = (d: Date) => events.filter(e => !e.allDay && isSameDay(new Date(e.startAt), d));

  const getEventStyle = (event: any) => {
    const start = new Date(event.startAt);
    const end = new Date(event.endAt);
    const startMins = start.getHours() * 60 + start.getMinutes();
    const endMins = end.getHours() * 60 + end.getMinutes();
    return { top: `${(startMins / 60) * 56}px`, height: `${Math.max(((endMins - startMins) / 60) * 56, 20)}px` };
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="grid" style={{ gridTemplateColumns: "56px repeat(7, 1fr)", borderBottom: "1px solid var(--cal-border)", background: "var(--cal-header-bg)" }}>
        <div className="py-2"/>
        {weekDays.map((d, i) => {
          const isToday = isSameDay(d, today);
          return (
            <div key={i} className="py-2 text-center">
              <div className="text-sm font-bold uppercase" style={{ color: "var(--cal-text-muted)" }}>{WEEKDAYS_SHORT[d.getDay()]}</div>
              <div className="w-9 h-9 mx-auto mt-0.5 flex items-center justify-center rounded-full text-base font-bold"
                style={{
                  backgroundColor: isToday ? "var(--cal-accent)" : "transparent",
                  color: isToday ? "var(--cal-accent-fg)" : "var(--cal-text)",
                }}>
                {d.getDate()}
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="relative grid" style={{ gridTemplateColumns: "56px repeat(7, 1fr)" }}>
          <div className="col-start-1">
            {hours.map(h => (
              <div key={h} className="h-14 flex items-start justify-end pr-2 pt-0.5">
                {h > 0 && <span className="text-xs" style={{ color: "var(--cal-text-muted)" }}>{h === 12 ? "12 PM" : h < 12 ? `${h} AM` : `${h-12} PM`}</span>}
              </div>
            ))}
          </div>
          {weekDays.map((day, di) => (
            <div key={di} className="relative" style={{ borderLeft: "1px solid var(--cal-border)" }}>
              {hours.map(h => (
                <div key={h} onClick={() => { const d = new Date(day); d.setHours(h,0,0,0); onSlotClick(d); }}
                  className="h-14 cursor-pointer transition-colors"
                  style={{ borderBottom: "1px solid var(--cal-border)", opacity: 0.5 }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.backgroundColor = "var(--cal-cell-today)"; (e.currentTarget as HTMLElement).style.opacity = "1"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = ""; (e.currentTarget as HTMLElement).style.opacity = "0.5"; }}/>
              ))}
              {eventsOnDay(day).map(e => {
                const color = getColor(e.color);
                return (
                  <div key={e.id} onClick={ev => { ev.stopPropagation(); onEventClick(e); }}
                    style={getEventStyle(e)}
                    className={cn("absolute left-0.5 right-0.5 rounded-lg px-1.5 py-0.5 text-xs font-semibold cursor-pointer hover:opacity-90 transition-opacity overflow-hidden z-10 shadow-sm", color.bg, color.text)}>
                    {e.title}
                    <div className="text-[11px] opacity-80">{formatTime(new Date(e.startAt))}</div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Day View ─────────────────────────────────────────────────────────────────
function DayView({ viewDate, events, onEventClick, onSlotClick }: {
  viewDate: Date; events: any[]; onEventClick: (e: any) => void; onSlotClick: (d: Date) => void;
}) {
  const today = new Date();
  const isToday = isSameDay(viewDate, today);
  const hours = Array.from({length: 24}, (_, i) => i);
  const dayEvents = events.filter(e => !e.allDay && isSameDay(new Date(e.startAt), viewDate));

  const getEventStyle = (event: any) => {
    const start = new Date(event.startAt);
    const end = new Date(event.endAt);
    const startMins = start.getHours() * 60 + start.getMinutes();
    const endMins = end.getHours() * 60 + end.getMinutes();
    return { top: `${(startMins / 60) * 64}px`, height: `${Math.max(((endMins - startMins) / 60) * 64, 24)}px` };
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="py-3 px-4 flex items-center gap-3" style={{ borderBottom: "1px solid var(--cal-border)", background: "var(--cal-header-bg)" }}>
        <div className="w-10 h-10 rounded-full flex items-center justify-center text-lg font-bold shadow-sm"
          style={{
            backgroundColor: isToday ? "var(--cal-accent)" : "var(--cal-cell-today)",
            color: isToday ? "var(--cal-accent-fg)" : "var(--cal-text)",
          }}>
          {viewDate.getDate()}
        </div>
        <div>
          <div className="font-semibold" style={{ color: "var(--cal-text)" }}>{WEEKDAYS_FULL[viewDate.getDay()]}</div>
          <div className="text-xs" style={{ color: "var(--cal-text-muted)" }}>{MONTHS[viewDate.getMonth()]} {viewDate.getFullYear()}</div>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="relative" style={{ display: "grid", gridTemplateColumns: "64px 1fr" }}>
          <div>
            {hours.map(h => (
              <div key={h} className="h-16 flex items-start justify-end pr-3 pt-0.5">
                {h > 0 && <span className="text-xs" style={{ color: "var(--cal-text-muted)" }}>{h === 12 ? "12 PM" : h < 12 ? `${h} AM` : `${h-12} PM`}</span>}
              </div>
            ))}
          </div>
          <div className="relative" style={{ borderLeft: "1px solid var(--cal-border)" }}>
            {hours.map(h => (
              <div key={h} onClick={() => { const d = new Date(viewDate); d.setHours(h,0,0,0); onSlotClick(d); }}
                className="h-16 cursor-pointer transition-colors"
                style={{ borderBottom: "1px solid var(--cal-border)" }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.backgroundColor = "var(--cal-cell-today)"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = ""; }}/>
            ))}
            {dayEvents.map(e => {
              const color = getColor(e.color);
              return (
                <div key={e.id} onClick={ev => { ev.stopPropagation(); onEventClick(e); }}
                  style={getEventStyle(e)}
                  className={cn("absolute left-1 right-1 rounded-xl px-3 py-1.5 cursor-pointer hover:opacity-90 transition-opacity overflow-hidden z-10 shadow-sm", color.bg, color.text)}>
                  <div className="font-semibold text-sm leading-tight">{e.title}</div>
                  <div className="text-xs opacity-80 mt-0.5">{formatTime(new Date(e.startAt))} – {formatTime(new Date(e.endAt))}</div>
                  {e.location && <div className="text-xs opacity-70 mt-0.5 flex items-center gap-1"><MapPin size={10}/>{e.location}</div>}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Calendar Component ──────────────────────────────────────────────────
export default function Calendar() {
  const [, navigate] = useLocation();
  const today = new Date();
  const [viewDate, setViewDate] = useState(new Date(today.getFullYear(), today.getMonth(), today.getDate()));
  const [selectedDay, setSelectedDay] = useState<Date>(today);
  const [viewMode, setViewMode] = useState<ViewMode>("month");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<EventForm>(blankForm(today));
  const [selectedEvent, setSelectedEvent] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const { theme, themeId, applyTheme } = useCalendarTheme();

  const queryStart = useMemo(() => {
    const d = new Date(viewDate);
    if (viewMode === "month") { d.setDate(1); d.setDate(d.getDate() - 7); }
    else if (viewMode === "week") { d.setDate(d.getDate() - d.getDay() - 1); }
    else { d.setDate(d.getDate() - 1); }
    return d;
  }, [viewDate, viewMode]);

  const queryEnd = useMemo(() => {
    const d = new Date(viewDate);
    if (viewMode === "month") { d.setMonth(d.getMonth() + 1); d.setDate(d.getDate() + 7); }
    else if (viewMode === "week") { d.setDate(d.getDate() - d.getDay() + 8); }
    else { d.setDate(d.getDate() + 2); }
    return d;
  }, [viewDate, viewMode]);

  const eventsQuery = trpc.calendar.list.useQuery(
    { startAt: queryStart.toISOString(), endAt: queryEnd.toISOString() },
    { refetchOnWindowFocus: false }
  );

  const createMutation = trpc.calendar.create.useMutation({
    onSuccess: () => { eventsQuery.refetch(); setShowForm(false); toast.success("Event saved"); },
    onError: () => toast.error("Couldn't save event"),
  });

  const deleteMutation = trpc.calendar.delete.useMutation({
    onSuccess: () => { eventsQuery.refetch(); toast.success("Event deleted"); },
    onError: () => toast.error("Couldn't delete event"),
  });

  const events = eventsQuery.data ?? [];

  const filteredEvents = useMemo(() => {
    if (!searchQuery.trim()) return events;
    const q = searchQuery.toLowerCase();
    return events.filter(e => e.title.toLowerCase().includes(q) || e.description?.toLowerCase().includes(q));
  }, [events, searchQuery]);

  const navigate_prev = () => {
    setViewDate(d => {
      const n = new Date(d);
      if (viewMode === "month") n.setMonth(n.getMonth() - 1);
      else if (viewMode === "week") n.setDate(n.getDate() - 7);
      else n.setDate(n.getDate() - 1);
      return n;
    });
  };

  const navigate_next = () => {
    setViewDate(d => {
      const n = new Date(d);
      if (viewMode === "month") n.setMonth(n.getMonth() + 1);
      else if (viewMode === "week") n.setDate(n.getDate() + 7);
      else n.setDate(n.getDate() + 1);
      return n;
    });
  };

  const goToToday = () => { setViewDate(new Date()); setSelectedDay(new Date()); };

  const handleDayClick = (day: Date) => {
    setSelectedDay(day);
    if (viewMode === "month") setViewDate(new Date(day.getFullYear(), day.getMonth(), day.getDate()));
  };

  const handleSlotClick = (d: Date) => { setForm(blankForm(d)); setShowForm(true); };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) { toast.error("Title is required"); return; }

    const baseStart = new Date(form.startAt);
    const baseEnd = new Date(form.endAt);
    const durationMs = baseEnd.getTime() - baseStart.getTime();
    const dates: Date[] = [baseStart];

    if (form.recurrence !== 'none') {
      const MAX = 52;
      for (let i = 1; i < MAX; i++) {
        const next = new Date(baseStart);
        if (form.recurrence === 'daily') next.setDate(next.getDate() + i);
        else if (form.recurrence === 'weekdays') {
          let added = 0; let offset = 0;
          while (added < i) { offset++; const d = new Date(baseStart); d.setDate(d.getDate() + offset); if (d.getDay() !== 0 && d.getDay() !== 6) added++; }
          next.setDate(baseStart.getDate() + offset);
        }
        else if (form.recurrence === 'weekly') next.setDate(next.getDate() + i * 7);
        else if (form.recurrence === 'monthly') next.setMonth(next.getMonth() + i);
        else if (form.recurrence === 'yearly') { next.setFullYear(next.getFullYear() + i); break; }
        dates.push(next);
      }
    }

    const createAll = async () => {
      for (const startDate of dates) {
        const endDate = new Date(startDate.getTime() + durationMs);
        await createMutation.mutateAsync({
          title: form.title.trim(),
          description: form.description || undefined,
          startAt: startDate.toISOString(),
          endAt: endDate.toISOString(),
          location: form.location || undefined,
          allDay: form.allDay,
          color: form.color,
          reminderMinutes: form.reminderMinutes || undefined,
        });
      }
      eventsQuery.refetch();
      setShowForm(false);
      toast.success(dates.length > 1 ? `${dates.length} recurring events saved` : 'Event saved');
    };
    createAll().catch(() => toast.error("Couldn't save event"));
  };

  const headerTitle = useMemo(() => {
    if (viewMode === "month") return `${MONTHS[viewDate.getMonth()]} ${viewDate.getFullYear()}`;
    if (viewMode === "week") {
      const start = new Date(viewDate); start.setDate(viewDate.getDate() - viewDate.getDay());
      const end = new Date(start); end.setDate(end.getDate() + 6);
      if (start.getMonth() === end.getMonth()) return `${MONTHS[start.getMonth()]} ${start.getFullYear()}`;
      return `${MONTHS_SHORT[start.getMonth()]} – ${MONTHS_SHORT[end.getMonth()]} ${end.getFullYear()}`;
    }
    return `${WEEKDAYS_FULL[viewDate.getDay()]}, ${MONTHS[viewDate.getMonth()]} ${viewDate.getDate()}`;
  }, [viewDate, viewMode]);

  // Inject theme CSS variables on the calendar root
  const themeStyle = theme.vars as React.CSSProperties;

  return (
    <div
      className="h-screen text-foreground flex flex-col font-['Outfit'] overflow-hidden"
      style={{ ...themeStyle, background: "var(--cal-bg)", color: "var(--cal-text)" }}
    >
      {/* ── Top Header ── */}
      <header className="px-4 py-2 flex items-center gap-2 z-30 shrink-0 backdrop-blur-md"
        style={{ borderBottom: "1px solid var(--cal-border)", background: "var(--cal-header-bg)" }}>
        {/* Back */}
        <button onClick={() => navigate("/")}
          className="w-9 h-9 rounded-full flex items-center justify-center transition-colors hover:bg-[var(--cal-cell-today)] shrink-0"
          style={{ color: "var(--cal-text-muted)" }}>
          <ArrowLeft size={16}/>
        </button>

        {/* Logo */}
        <div className="flex items-center gap-2 mr-2">
          <CalendarIcon size={20} style={{ color: "var(--cal-accent)" }}/>
          <span className="font-bold text-base hidden sm:block" style={{ color: "var(--cal-text)" }}>Calendar</span>
        </div>

        {/* Today button */}
        <button onClick={goToToday}
          className="px-3 py-1.5 rounded-lg text-sm font-medium transition-colors hover:bg-[var(--cal-cell-today)] shrink-0"
          style={{ border: "1px solid var(--cal-border)", color: "var(--cal-text)" }}>
          Today
        </button>

        {/* Prev / Next */}
        <div className="flex gap-0.5">
          <button onClick={navigate_prev} className="w-8 h-8 rounded-full flex items-center justify-center transition-colors hover:bg-[var(--cal-cell-today)]"
            style={{ color: "var(--cal-text)" }}><ChevronLeft size={16}/></button>
          <button onClick={navigate_next} className="w-8 h-8 rounded-full flex items-center justify-center transition-colors hover:bg-[var(--cal-cell-today)]"
            style={{ color: "var(--cal-text)" }}><ChevronRight size={16}/></button>
        </div>

        {/* Title */}
        <h1 className="text-base font-semibold flex-1 truncate" style={{ color: "var(--cal-text)" }}>{headerTitle}</h1>

        {/* Search */}
        <div className="flex items-center gap-1">
          {showSearch && (
            <motion.input initial={{ width: 0, opacity: 0 }} animate={{ width: 180, opacity: 1 }}
              value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search events…" autoFocus
              className="rounded-lg px-3 py-1.5 text-sm outline-none"
              style={{ background: "var(--cal-cell-today)", border: "1px solid var(--cal-border)", color: "var(--cal-text)" }}/>
          )}
          <button onClick={() => { setShowSearch(s => !s); setSearchQuery(""); }}
            className="w-9 h-9 rounded-full flex items-center justify-center transition-colors hover:bg-[var(--cal-cell-today)]"
            style={{ color: "var(--cal-text-muted)" }}>
            <Search size={16}/>
          </button>
        </div>

        {/* Theme picker */}
        <ThemePicker themeId={themeId} onSelect={applyTheme}/>

        {/* View mode toggle */}
        <div className="flex rounded-lg p-0.5 shrink-0" style={{ background: "var(--cal-cell-today)", border: "1px solid var(--cal-border)" }}>
          {(["month","week","day"] as ViewMode[]).map(v => (
            <button key={v} onClick={() => setViewMode(v)}
              className="px-3 py-1 rounded-md text-xs font-semibold capitalize transition-all"
              style={{
                background: viewMode === v ? "var(--cal-cell-bg)" : "transparent",
                color: viewMode === v ? "var(--cal-text)" : "var(--cal-text-muted)",
                boxShadow: viewMode === v ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
              }}>
              {v}
            </button>
          ))}
        </div>

        {/* Add event */}
        <button onClick={() => { setForm(blankForm(selectedDay)); setShowForm(true); }}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-full text-sm font-semibold transition-opacity hover:opacity-90 shrink-0 shadow-sm"
          style={{ background: "var(--cal-accent)", color: "var(--cal-accent-fg)" }}>
          <Plus size={14}/><span className="hidden sm:inline">New</span>
        </button>
      </header>

      {/* ── Main Body ── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-52 flex flex-col shrink-0 overflow-y-auto hidden md:flex"
          style={{ borderRight: "1px solid var(--cal-border)", background: "var(--cal-sidebar-bg)" }}>
          <MiniCalendar
            viewDate={viewMode === "month" ? viewDate : new Date(viewDate.getFullYear(), viewDate.getMonth(), 1)}
            selectedDay={selectedDay}
            onSelectDay={d => { handleDayClick(d); if (viewMode !== "month") setViewMode("day"); }}
            onChangeMonth={d => setViewDate(d)}
            events={events}
          />
          {/* Upcoming events */}
          <div className="px-3 pb-3 mt-2">
            <p className="text-xs font-bold uppercase tracking-widest mb-2 px-1" style={{ color: "var(--cal-text-muted)" }}>Upcoming</p>
            {events
              .filter(e => new Date(e.startAt) >= new Date())
              .sort((a,b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime())
              .slice(0, 5)
              .map(e => {
                const color = getColor(e.color);
                return (
                  <button key={e.id} onClick={() => setSelectedEvent(e)}
                    className="w-full text-left flex items-start gap-2 py-1.5 px-1 rounded-lg transition-colors hover:bg-[var(--cal-cell-today)]">
                    <span className={cn("w-2 h-2 rounded-full mt-1.5 shrink-0", color.dot)}/>
                    <div className="min-w-0">
                      <p className="text-xs font-medium truncate" style={{ color: "var(--cal-text)" }}>{e.title}</p>
                      <p className="text-xs" style={{ color: "var(--cal-text-muted)" }}>{new Date(e.startAt).toLocaleDateString("en-US",{month:"short",day:"numeric"})}</p>
                    </div>
                  </button>
                );
              })}
            {events.filter(e => new Date(e.startAt) >= new Date()).length === 0 && (
              <p className="text-xs px-1" style={{ color: "var(--cal-text-muted)" }}>No upcoming events</p>
            )}
          </div>
        </aside>

        {/* Calendar view */}
        <main className="flex-1 flex flex-col overflow-hidden">
          <AnimatePresence mode="wait">
            <motion.div key={`${viewMode}-${viewDate.toDateString()}`} className="flex-1 flex flex-col overflow-hidden"
              initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.15 }}>
              {viewMode === "month" && (
                <MonthView viewDate={viewDate} selectedDay={selectedDay} events={filteredEvents}
                  onDayClick={handleDayClick} onEventClick={setSelectedEvent}/>
              )}
              {viewMode === "week" && (
                <WeekView viewDate={viewDate} events={filteredEvents}
                  onEventClick={setSelectedEvent} onSlotClick={handleSlotClick}/>
              )}
              {viewMode === "day" && (
                <DayView viewDate={viewDate} events={filteredEvents}
                  onEventClick={setSelectedEvent} onSlotClick={handleSlotClick}/>
              )}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      {/* ── Modals ── */}
      <AnimatePresence>
        {showForm && (
          <NewEventModal form={form} setForm={setForm} onSubmit={handleSubmit}
            onClose={() => setShowForm(false)} isPending={createMutation.isPending}/>
        )}
        {selectedEvent && (
          <EventPopover
            event={selectedEvent}
            onClose={() => setSelectedEvent(null)}
            onDelete={id => deleteMutation.mutate({ id })}
            onUpdated={() => eventsQuery.refetch()}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
