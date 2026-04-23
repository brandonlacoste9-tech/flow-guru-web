import React, { useState, useMemo } from "react";
import { ChevronLeft, ChevronRight, Plus, X, MapPin, Clock, Trash2, ArrowLeft } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc-client";
import { toast } from "sonner";
import { useLocation } from "wouter";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

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

type EventForm = {
  title: string;
  description: string;
  startAt: string;
  endAt: string;
  location: string;
  allDay: boolean;
};

const blankForm = (day: Date): EventForm => {
  const start = new Date(day);
  start.setHours(9, 0, 0, 0);
  const end = new Date(start);
  end.setHours(10, 0, 0, 0);
  return {
    title: "",
    description: "",
    startAt: formatDatetimeLocal(start),
    endAt: formatDatetimeLocal(end),
    location: "",
    allDay: false,
  };
};

export default function Calendar() {
  const [, navigate] = useLocation();
  const today = new Date();
  const [viewDate, setViewDate] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDay, setSelectedDay] = useState<Date>(today);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<EventForm>(blankForm(today));

  const monthStart = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1);
  const monthEnd = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 0);
  // Extend range slightly to cover edge days shown from prev/next month
  const queryStart = new Date(monthStart);
  queryStart.setDate(queryStart.getDate() - 7);
  const queryEnd = new Date(monthEnd);
  queryEnd.setDate(queryEnd.getDate() + 7);

  const eventsQuery = trpc.calendar.list.useQuery(
    { startAt: queryStart.toISOString(), endAt: queryEnd.toISOString() },
    { refetchOnWindowFocus: false }
  );

  const createMutation = trpc.calendar.create.useMutation({
    onSuccess: () => { eventsQuery.refetch(); setShowForm(false); toast.success("Event added"); },
    onError: () => toast.error("Couldn't save event"),
  });

  const deleteMutation = trpc.calendar.delete.useMutation({
    onSuccess: () => { eventsQuery.refetch(); toast.success("Event deleted"); },
    onError: () => toast.error("Couldn't delete event"),
  });

  const events = eventsQuery.data ?? [];

  // Build calendar grid
  const gridDays = useMemo(() => {
    const days: Date[] = [];
    const firstWeekday = monthStart.getDay(); // 0=Sun
    for (let i = firstWeekday - 1; i >= 0; i--) {
      const d = new Date(monthStart);
      d.setDate(d.getDate() - i - 1);
      days.push(d);
    }
    const daysInMonth = monthEnd.getDate();
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(new Date(viewDate.getFullYear(), viewDate.getMonth(), i));
    }
    const remaining = 7 - (days.length % 7);
    if (remaining < 7) {
      for (let i = 1; i <= remaining; i++) {
        const d = new Date(monthEnd);
        d.setDate(d.getDate() + i);
        days.push(d);
      }
    }
    return days;
  }, [viewDate]);

  const eventsOnDay = (day: Date) =>
    events.filter(e => isSameDay(new Date(e.startAt), day));

  const selectedEvents = eventsOnDay(selectedDay);

  const prevMonth = () => setViewDate(d => new Date(d.getFullYear(), d.getMonth() - 1, 1));
  const nextMonth = () => setViewDate(d => new Date(d.getFullYear(), d.getMonth() + 1, 1));

  const handleDayClick = (day: Date) => {
    setSelectedDay(day);
    setForm(blankForm(day));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) { toast.error("Title is required"); return; }
    createMutation.mutate({
      title: form.title.trim(),
      description: form.description || undefined,
      startAt: new Date(form.startAt).toISOString(),
      endAt: new Date(form.endAt).toISOString(),
      location: form.location || undefined,
      allDay: form.allDay,
    });
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col font-['Outfit']">
      {/* Header */}
      <header className="px-5 pt-5 pb-3 flex items-center gap-3 border-b border-border">
        <button
          onClick={() => navigate("/")}
          className="w-9 h-9 rounded-full border border-border flex items-center justify-center hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft size={16} />
        </button>
        <div className="flex items-center gap-3 flex-1">
          <button onClick={prevMonth} className="w-8 h-8 rounded-full hover:bg-accent flex items-center justify-center transition-colors">
            <ChevronLeft size={16} />
          </button>
          <h1 className="text-lg font-bold tracking-tight min-w-[180px] text-center">
            {MONTHS[viewDate.getMonth()]} {viewDate.getFullYear()}
          </h1>
          <button onClick={nextMonth} className="w-8 h-8 rounded-full hover:bg-accent flex items-center justify-center transition-colors">
            <ChevronRight size={16} />
          </button>
        </div>
        <button
          onClick={() => { setForm(blankForm(selectedDay)); setShowForm(true); }}
          className="flex items-center gap-1.5 px-3.5 py-2 bg-primary text-primary-foreground rounded-full text-sm font-semibold hover:opacity-90 transition-opacity"
        >
          <Plus size={14} />
          Add event
        </button>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Calendar grid */}
        <div className="flex-1 overflow-y-auto p-4">
          {/* Weekday headers */}
          <div className="grid grid-cols-7 mb-2">
            {WEEKDAYS.map(d => (
              <div key={d} className="text-center text-[11px] font-semibold text-muted-foreground py-1">
                {d}
              </div>
            ))}
          </div>

          {/* Day cells */}
          <div className="grid grid-cols-7 gap-px bg-border rounded-xl overflow-hidden">
            {gridDays.map((day, i) => {
              const isCurrentMonth = day.getMonth() === viewDate.getMonth();
              const isToday = isSameDay(day, today);
              const isSelected = isSameDay(day, selectedDay);
              const dayEvents = eventsOnDay(day);

              return (
                <button
                  key={i}
                  onClick={() => handleDayClick(day)}
                  className={cn(
                    "bg-background min-h-[72px] p-2 text-left transition-colors hover:bg-accent",
                    !isCurrentMonth && "opacity-35",
                    isSelected && "bg-primary/8 ring-1 ring-inset ring-primary/30",
                  )}
                >
                  <div className={cn(
                    "w-7 h-7 rounded-full flex items-center justify-center text-sm font-semibold mb-1",
                    isToday && "bg-primary text-primary-foreground",
                    isSelected && !isToday && "text-primary font-bold",
                    !isToday && !isSelected && "text-foreground"
                  )}>
                    {day.getDate()}
                  </div>
                  <div className="space-y-0.5">
                    {dayEvents.slice(0, 3).map(e => (
                      <div
                        key={e.id}
                        className="text-[10px] leading-tight truncate bg-primary/15 text-primary px-1.5 py-0.5 rounded font-medium"
                      >
                        {e.title}
                      </div>
                    ))}
                    {dayEvents.length > 3 && (
                      <div className="text-[10px] text-muted-foreground pl-1">+{dayEvents.length - 3} more</div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Day detail panel */}
        <div className="w-72 border-l border-border flex flex-col overflow-hidden shrink-0">
          <div className="px-4 py-3 border-b border-border">
            <p className="font-semibold text-[15px]">
              {selectedDay.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {selectedEvents.length === 0 ? "No events" : `${selectedEvents.length} event${selectedEvents.length > 1 ? "s" : ""}`}
            </p>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            <AnimatePresence initial={false}>
              {selectedEvents.map(event => (
                <motion.div
                  key={event.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  className="bg-card border border-border rounded-xl p-3 group"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold text-[14px] leading-tight flex-1">{event.title}</p>
                    <button
                      onClick={() => deleteMutation.mutate({ id: event.id })}
                      className="w-6 h-6 rounded-full opacity-0 group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive flex items-center justify-center transition-all shrink-0"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                  {event.description && (
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{event.description}</p>
                  )}
                  <div className="flex flex-col gap-0.5 mt-2">
                    {!event.allDay && (
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Clock size={10} />
                        <span>{formatTime(new Date(event.startAt))} – {formatTime(new Date(event.endAt))}</span>
                      </div>
                    )}
                    {event.allDay === 1 && (
                      <div className="text-xs text-muted-foreground">All day</div>
                    )}
                    {event.location && (
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <MapPin size={10} />
                        <span className="truncate">{event.location}</span>
                      </div>
                    )}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>

            {selectedEvents.length === 0 && (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <p className="text-sm text-muted-foreground">Nothing here</p>
                <button
                  onClick={() => { setForm(blankForm(selectedDay)); setShowForm(true); }}
                  className="mt-3 text-xs text-primary hover:underline font-medium"
                >
                  + Add an event
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Add event modal */}
      <AnimatePresence>
        {showForm && (
          <>
            <motion.div
              className="fixed inset-0 bg-black/50 z-40"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowForm(false)}
            />
            <motion.div
              className="fixed inset-x-4 bottom-0 sm:inset-auto sm:left-1/2 sm:-translate-x-1/2 sm:top-1/2 sm:-translate-y-1/2 sm:w-[420px] bg-card border border-border rounded-t-3xl sm:rounded-3xl z-50 shadow-2xl overflow-hidden"
              initial={{ y: "100%", opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: "100%", opacity: 0 }}
              transition={{ type: "spring", damping: 30, stiffness: 400 }}
            >
              <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-border">
                <h2 className="font-bold text-[16px]">New Event</h2>
                <button onClick={() => setShowForm(false)} className="w-8 h-8 rounded-full hover:bg-accent flex items-center justify-center transition-colors">
                  <X size={16} />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="p-5 space-y-4">
                <div>
                  <input
                    autoFocus
                    type="text"
                    placeholder="Event title"
                    value={form.title}
                    onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                    className="w-full bg-background border border-border rounded-xl px-4 py-3 text-[15px] focus:outline-none focus:ring-2 focus:ring-primary/50 placeholder:text-muted-foreground"
                  />
                </div>

                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.allDay}
                      onChange={e => setForm(f => ({ ...f, allDay: e.target.checked }))}
                      className="rounded"
                    />
                    All day
                  </label>
                </div>

                {!form.allDay && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-muted-foreground font-medium block mb-1">Start</label>
                      <input
                        type="datetime-local"
                        value={form.startAt}
                        onChange={e => setForm(f => ({ ...f, startAt: e.target.value }))}
                        className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground font-medium block mb-1">End</label>
                      <input
                        type="datetime-local"
                        value={form.endAt}
                        onChange={e => setForm(f => ({ ...f, endAt: e.target.value }))}
                        className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                      />
                    </div>
                  </div>
                )}

                <div>
                  <input
                    type="text"
                    placeholder="Location (optional)"
                    value={form.location}
                    onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
                    className="w-full bg-background border border-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 placeholder:text-muted-foreground"
                  />
                </div>

                <div>
                  <textarea
                    placeholder="Notes (optional)"
                    value={form.description}
                    onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                    rows={2}
                    className="w-full bg-background border border-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 placeholder:text-muted-foreground resize-none"
                  />
                </div>

                <button
                  type="submit"
                  disabled={createMutation.isPending}
                  className="w-full bg-primary text-primary-foreground rounded-xl py-3 font-semibold text-[15px] hover:opacity-90 transition-opacity disabled:opacity-60"
                >
                  {createMutation.isPending ? "Saving…" : "Add Event"}
                </button>
              </form>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
