import React from 'react';
import { motion } from 'framer-motion';
import { ChevronRight, Calendar, User } from 'lucide-react';
import { Link } from 'wouter';
import Waitlist from '@/components/Waitlist';
import { useSeoMeta } from '@/lib/seo';

export const BLOG_POSTS = [
  {
    slug: 'why-privacy-matters-in-the-age-of-ai',
    title: 'Why Privacy Matters in the Age of AI',
    description: 'Explore how Flow Guru keeps your personal data secure while providing state-of-the-art AI assistance.',
    date: '2026-04-26',
    author: 'Flow Guru Team',
    readTime: '5 min read',
    category: 'Privacy'
  },
  {
    slug: 'orchestrating-your-life-with-autonomous-companions',
    title: 'Orchestrating Your Life with Autonomous Companions',
    description: 'Learn how to leverage Flow Guru to streamline your daily routines and maximize productivity.',
    date: '2026-04-20',
    author: 'Flow Guru Team',
    readTime: '8 min read',
    category: 'Productivity'
  }
];

const Blog = () => {
  useSeoMeta({
    title: 'AI Productivity Blog | Flow Guru Insights',
    description: 'Read Flow Guru insights on AI privacy, productivity, reminders, and autonomous planning workflows.',
    canonicalPath: '/blog',
    ogType: 'website',
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'Blog',
      name: 'Flow Guru Insights',
      url: 'https://floguru.com/blog',
    },
  });

  return (
    <div className="min-h-screen bg-background text-foreground font-['Outfit'] selection:bg-primary/30">
      {/* Hero Section */}
      <section className="pt-24 pb-12 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <motion.h1 
            className="text-4xl sm:text-6xl font-extrabold tracking-tight mb-6 bg-gradient-to-br from-foreground to-foreground/60 bg-clip-text text-transparent"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            Insights & Updates
          </motion.h1>
          <motion.p 
            className="text-lg text-muted-foreground max-w-2xl mx-auto"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            Stay informed on the latest in AI privacy, autonomous assistance, and lifestyle orchestration.
          </motion.p>
        </div>
      </section>

      {/* Blog Grid */}
      <section className="pb-24 px-6">
        <div className="max-w-4xl mx-auto grid gap-8">
          {BLOG_POSTS.map((post, index) => (
            <motion.div
              key={post.slug}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 * index }}
            >
              <Link href={`/blog/${post.slug}`}>
                <div className="group cursor-pointer p-6 sm:p-8 rounded-3xl border border-border bg-card hover:bg-accent/5 transition-all duration-500 relative overflow-hidden leather-glow">
                  <div className="flex flex-col gap-4">
                    <div className="flex items-center gap-4 text-xs font-semibold uppercase tracking-widest text-primary">
                      <span>{post.category}</span>
                      <span className="w-1 h-1 rounded-full bg-border" />
                      <span>{post.readTime}</span>
                    </div>
                    
                    <h2 className="text-2xl sm:text-3xl font-bold group-hover:text-primary transition-colors">
                      {post.title}
                    </h2>
                    
                    <p className="text-muted-foreground line-clamp-2">
                      {post.description}
                    </p>
                    
                    <div className="flex items-center justify-between pt-4 mt-4 border-t border-border/50">
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <div className="flex items-center gap-1.5">
                          <Calendar size={14} />
                          <span>{post.date}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <User size={14} />
                          <span>{post.author}</span>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-1 text-primary font-bold group-hover:gap-2 transition-all">
                        <span>Read More</span>
                        <ChevronRight size={16} />
                      </div>
                    </div>
                  </div>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Footer Nudge */}
      <section className="pb-24 px-6 text-center">
        <div className="max-w-2xl mx-auto p-8 sm:p-12 rounded-[3rem] bg-primary/5 border border-primary/20 backdrop-blur-xl">
          <h2 className="text-3xl font-bold mb-4">Experience the future today</h2>
          <p className="text-muted-foreground mb-8">Join the thousands of users orchestrating their lives with Flow Guru.</p>
          <Waitlist />
        </div>
      </section>
    </div>
  );
};

export default Blog;
