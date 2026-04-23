import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Newspaper, ExternalLink, Clock } from "lucide-react";
import { trpc } from "@/lib/trpc-client";
import { cn } from "@/lib/utils";

interface NewsModalProps {
  open: boolean;
  onClose: () => void;
}

function timeAgo(iso: string): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function NewsModal({ open, onClose }: NewsModalProps) {
  const news = trpc.news.topHeadlines.useQuery(
    { limit: 12 },
    { enabled: open, staleTime: 5 * 60 * 1000 }
  );

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
            <div className="px-6 pt-6 pb-4 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Newspaper className="w-4 h-4 text-primary" />
                <h2 className="text-sm font-bold uppercase tracking-widest text-foreground">Top Headlines</h2>
              </div>
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-full border border-border flex items-center justify-center hover:bg-accent/10 transition-colors text-muted-foreground"
              >
                <X size={14} />
              </button>
            </div>

            {/* Articles */}
            <div className="overflow-y-auto max-h-[65vh] divide-y divide-border">
              {news.isLoading && (
                <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
                  Loading headlines…
                </div>
              )}
              {news.isError && (
                <div className="flex items-center justify-center py-12 text-destructive text-sm">
                  Failed to load news. Please try again.
                </div>
              )}
              {news.data?.articles.map((article, i) => (
                <motion.a
                  key={article.uuid}
                  href={article.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.04 }}
                  className="flex gap-3 px-5 py-4 hover:bg-accent/5 transition-colors group"
                >
                  {/* Thumbnail */}
                  {article.imageUrl ? (
                    <img
                      src={article.imageUrl}
                      alt=""
                      className="w-16 h-16 rounded-xl object-cover shrink-0 border border-border"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-xl bg-primary/5 border border-border shrink-0 flex items-center justify-center">
                      <Newspaper size={20} className="text-primary/40" />
                    </div>
                  )}

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground leading-snug line-clamp-2 group-hover:text-primary transition-colors">
                      {article.title}
                    </p>
                    <div className="flex items-center gap-2 mt-1.5">
                      {article.source && (
                        <span className="text-[10px] font-bold uppercase tracking-wider text-primary/70">
                          {article.source}
                        </span>
                      )}
                      {article.publishedAt && (
                        <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                          <Clock size={9} />{timeAgo(article.publishedAt)}
                        </span>
                      )}
                      <ExternalLink size={9} className="text-muted-foreground ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                    {article.description && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2 leading-relaxed">
                        {article.description}
                      </p>
                    )}
                  </div>
                </motion.a>
              ))}
            </div>

            <div className="px-6 py-3 border-t border-border">
              <p className="text-[10px] text-muted-foreground text-center">
                Powered by <a href="https://www.thenewsapi.com" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">TheNewsAPI</a>
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
