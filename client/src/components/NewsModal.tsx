import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Newspaper, ExternalLink, Clock, MapPin, RefreshCw } from "lucide-react";
import { trpc } from "@/lib/trpc-client";
import { cn } from "@/lib/utils";

interface NewsModalProps {
  open: boolean;
  onClose: () => void;
  locale?: string;
  locationName?: string;
}

const CATEGORIES = [
  { id: "general,technology,business", label: "Top Stories" },
  { id: "general", label: "General" },
  { id: "technology", label: "Tech" },
  { id: "business", label: "Business" },
  { id: "science", label: "Science" },
  { id: "health", label: "Health" },
  { id: "sports", label: "Sports" },
  { id: "entertainment", label: "Entertainment" },
];

function timeAgo(iso: string): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function NewsModal({ open, onClose, locale = "us", locationName }: NewsModalProps) {
  const [category, setCategory] = useState("general,technology,business");

  const news = trpc.news.topHeadlines.useQuery(
    { limit: 15, locale, categories: category },
    { enabled: open, staleTime: 5 * 60 * 1000 }
  );

  const articles = news.data?.articles ?? [];
  const [featured, ...rest] = articles;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-2 sm:p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          {/* Backdrop */}
          <motion.div
            className="absolute inset-0 bg-background/85 backdrop-blur-md"
            onClick={onClose}
          />

          {/* Modal — full height on mobile, large on desktop */}
          <motion.div
            className="relative w-full max-w-2xl bg-card border border-border rounded-3xl shadow-2xl overflow-hidden flex flex-col"
            style={{ maxHeight: "90vh" }}
            initial={{ opacity: 0, y: 50, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 50, scale: 0.97 }}
            transition={{ type: "spring", damping: 25, stiffness: 280 }}
          >
            {/* Header */}
            <div className="px-6 pt-5 pb-4 border-b border-border shrink-0">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Newspaper className="w-4 h-4 text-primary" />
                  <h2 className="text-sm font-bold uppercase tracking-widest text-foreground">News</h2>
                  {locationName && (
                    <span className="flex items-center gap-1 text-[10px] font-semibold text-muted-foreground bg-secondary px-2 py-0.5 rounded-full">
                      <MapPin size={8} />{locationName}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => news.refetch()}
                    className="w-7 h-7 rounded-full border border-border flex items-center justify-center hover:bg-accent/10 transition-colors text-muted-foreground"
                    title="Refresh"
                  >
                    <RefreshCw size={12} className={news.isFetching ? "animate-spin" : ""} />
                  </button>
                  <button
                    onClick={onClose}
                    className="w-7 h-7 rounded-full border border-border flex items-center justify-center hover:bg-accent/10 transition-colors text-muted-foreground"
                  >
                    <X size={12} />
                  </button>
                </div>
              </div>

              {/* Category tabs */}
              <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
                {CATEGORIES.map(cat => (
                  <button
                    key={cat.id}
                    onClick={() => setCategory(cat.id)}
                    className={cn(
                      "px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider whitespace-nowrap transition-all shrink-0",
                      category === cat.id
                        ? "bg-primary text-primary-foreground"
                        : "border border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
                    )}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Content */}
            <div className="overflow-y-auto flex-1">
              {news.isLoading && (
                <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">
                  Loading headlines…
                </div>
              )}
              {news.isError && (
                <div className="flex items-center justify-center py-16 text-destructive text-sm">
                  Failed to load news. Please try again.
                </div>
              )}

              {!news.isLoading && articles.length === 0 && !news.isError && (
                <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">
                  No stories found for this category.
                </div>
              )}

              {featured && (
                <motion.a
                  href={featured.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="block mx-4 mt-4 rounded-2xl overflow-hidden border border-border hover:border-primary/40 transition-colors group"
                >
                  {featured.imageUrl && (
                    <div className="relative h-44 overflow-hidden">
                      <img
                        src={featured.imageUrl}
                        alt=""
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        onError={(e) => { (e.target as HTMLImageElement).parentElement!.style.display = "none"; }}
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
                      <div className="absolute bottom-3 left-3 right-3">
                        {featured.categories?.[0] && (
                          <span className="text-[9px] font-bold uppercase tracking-widest text-white/80 bg-primary/80 px-2 py-0.5 rounded-full">
                            {featured.categories[0]}
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                  <div className="p-4">
                    <p className="text-base font-bold text-foreground leading-snug group-hover:text-primary transition-colors">
                      {featured.title}
                    </p>
                    {featured.description && (
                      <p className="text-sm text-muted-foreground mt-1.5 line-clamp-2 leading-relaxed">
                        {featured.description}
                      </p>
                    )}
                    <div className="flex items-center gap-2 mt-2">
                      {featured.source && (
                        <span className="text-[10px] font-bold uppercase tracking-wider text-primary/80">{featured.source}</span>
                      )}
                      {featured.publishedAt && (
                        <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                          <Clock size={9} />{timeAgo(featured.publishedAt)}
                        </span>
                      )}
                      <ExternalLink size={10} className="text-muted-foreground ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </div>
                </motion.a>
              )}

              {/* Remaining articles */}
              <div className="divide-y divide-border mx-4 mb-4 mt-2 border border-border rounded-2xl overflow-hidden">
                {rest.map((article: any, i: number) => (
                  <motion.a
                    key={article.uuid}
                    href={article.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.03 }}
                    className="flex gap-3 px-4 py-3.5 hover:bg-accent/5 transition-colors group"
                  >
                    {article.imageUrl ? (
                      <img
                        src={article.imageUrl}
                        alt=""
                        className="w-14 h-14 rounded-xl object-cover shrink-0 border border-border"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                      />
                    ) : (
                      <div className="w-14 h-14 rounded-xl bg-primary/5 border border-border shrink-0 flex items-center justify-center">
                        <Newspaper size={16} className="text-primary/30" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground leading-snug line-clamp-2 group-hover:text-primary transition-colors">
                        {article.title}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        {article.source && (
                          <span className="text-[10px] font-bold uppercase tracking-wider text-primary/70">{article.source}</span>
                        )}
                        {article.publishedAt && (
                          <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                            <Clock size={8} />{timeAgo(article.publishedAt)}
                          </span>
                        )}
                        <ExternalLink size={9} className="text-muted-foreground ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                    </div>
                  </motion.a>
                ))}
              </div>
            </div>

            <div className="px-6 py-3 border-t border-border shrink-0">
              <p className="text-[10px] text-muted-foreground text-center">
                Powered by <a href="https://www.thenewsapi.com" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">TheNewsAPI</a> · Stories from {locationName ?? "your region"}
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
