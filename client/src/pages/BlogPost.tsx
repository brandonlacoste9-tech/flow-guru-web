import React from 'react';
import { motion } from 'framer-motion';
import { useRoute, Link } from 'wouter';
import { ArrowLeft, Calendar, User, Share2 } from 'lucide-react';
import { BLOG_POSTS } from './Blog';
import Waitlist from '@/components/Waitlist';
import { useSeoMeta } from '@/lib/seo';

const BlogPost = () => {
  const [, params] = useRoute('/blog/:slug');
  const post = BLOG_POSTS.find(p => p.slug === params?.slug);

  useSeoMeta({
    title: post ? `${post.title} | Flow Guru` : 'Post not found | Flow Guru Blog',
    description: post
      ? post.description
      : 'The article you are looking for could not be found in Flow Guru Insights.',
    canonicalPath: post ? `/blog/${post.slug}` : '/blog',
    ogType: post ? 'article' : 'website',
    jsonLd: post
      ? {
          '@context': 'https://schema.org',
          '@type': 'BlogPosting',
          headline: post.title,
          description: post.description,
          author: {
            '@type': 'Organization',
            name: post.author,
          },
          datePublished: post.date,
          mainEntityOfPage: `https://floguru.com/blog/${post.slug}`,
          publisher: {
            '@type': 'Organization',
            name: 'Flow Guru',
          },
        }
      : undefined,
  });

  if (!post) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-4xl font-bold mb-4">Post not found</h1>
          <Link href="/blog" className="text-primary hover:underline">Back to Blog</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground font-['Outfit'] selection:bg-primary/30">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 px-6 py-4 bg-background/80 backdrop-blur-md border-b border-border/50">
        <div className="max-w-4xl mx-auto flex justify-between items-center">
          <Link href="/blog">
            <button className="flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors group">
              <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
              Back to Blog
            </button>
          </Link>
          <button className="w-9 h-9 rounded-full border border-border flex items-center justify-center hover:bg-accent/10 transition-colors">
            <Share2 size={16} />
          </button>
        </div>
      </nav>

      {/* Hero */}
      <header className="pt-32 pb-12 px-6">
        <div className="max-w-3xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-4 text-xs font-semibold uppercase tracking-widest text-primary mb-6"
          >
            <span>{post.category}</span>
            <span className="w-1 h-1 rounded-full bg-border" />
            <span>{post.readTime}</span>
          </motion.div>
          
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-4xl sm:text-5xl font-extrabold tracking-tight mb-8 leading-[1.1]"
          >
            {post.title}
          </motion.h1>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="flex items-center gap-6 text-sm text-muted-foreground pb-12 border-b border-border/50"
          >
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary">
                <User size={14} />
              </div>
              <span className="font-semibold text-foreground">{post.author}</span>
            </div>
            <div className="flex items-center gap-2">
              <Calendar size={14} />
              <span>{post.date}</span>
            </div>
          </motion.div>
        </div>
      </header>

      {/* Content Area */}
      <article className="pb-24 px-6">
        <div className="max-w-3xl mx-auto prose prose-invert prose-primary lg:prose-xl">
          {/* 
              In a real app, we'd render MDX or Markdown here. 
              For now, we'll use a high-quality placeholder structure 
          */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="space-y-8 text-lg leading-relaxed text-foreground/80"
          >
            <p className="text-xl text-foreground font-medium italic border-l-4 border-primary pl-6 py-2 bg-primary/5 rounded-r-xl">
              {post.description}
            </p>
            
            <h2 className="text-2xl font-bold text-foreground pt-8">The Evolution of AI Privacy</h2>
            <p>
              In recent years, the rapid advancement of Large Language Models has brought unprecedented convenience to our daily lives. From drafting emails to organizing complex projects, AI is becoming an indispensable tool. However, this convenience often comes at a cost: your personal data.
            </p>
            
            <p>
              At Flow Guru, we believe that your digital companion should work for you, not for the data brokers. Our architecture is built from the ground up with a "Privacy First" mindset, ensuring that your intimate details, schedule, and preferences remain solely your own.
            </p>

            <div className="bg-card border border-border p-8 rounded-[2rem] my-12 relative overflow-hidden">
               <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 blur-3xl -z-10" />
               <h3 className="text-xl font-bold mb-4">Key Privacy Pillars:</h3>
               <ul className="space-y-4 list-none pl-0">
                  <li className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <div className="w-2 h-2 rounded-full bg-primary" />
                    </div>
                    <span><strong>End-to-End Control:</strong> You own your encryption keys and your database.</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <div className="w-2 h-2 rounded-full bg-primary" />
                    </div>
                    <span><strong>Zero-Knowledge Sync:</strong> We can't see what you save.</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <div className="w-2 h-2 rounded-full bg-primary" />
                    </div>
                    <span><strong>Local Intelligence:</strong> Critical processing happens on your terms.</span>
                  </li>
               </ul>
            </div>

            <h2 className="text-2xl font-bold text-foreground pt-8">Conclusion</h2>
            <p>
              The future of AI is not just about intelligence; it's about trust. As we continue to build Flow Guru, we remain committed to transparency and user sovereignty. Thank you for being part of this journey toward a more private, more autonomous digital life.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="mt-16 pt-16 border-t border-border/50"
          >
            <div className="bg-primary/5 border border-primary/20 rounded-[3rem] p-8 sm:p-12 text-center">
              <h3 className="text-2xl font-bold mb-4">Start your private AI journey</h3>
              <p className="text-muted-foreground mb-8">Join the thousands of users orchestrating their lives with Flow Guru.</p>
              <Waitlist />
            </div>
          </motion.div>
        </div>
      </article>

      {/* Footer Navigation */}
      <footer className="py-12 px-6 border-t border-border/50 bg-accent/5">
        <div className="max-w-4xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-8">
          <Link href="/blog">
            <button className="px-6 py-3 rounded-full border border-border hover:bg-background transition-colors font-semibold">
              Explore More Insights
            </button>
          </Link>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">Share this article:</span>
            <div className="flex gap-2">
              <button className="w-10 h-10 rounded-full bg-foreground/5 flex items-center justify-center hover:bg-primary hover:text-white transition-all">
                <Share2 size={16} />
              </button>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default BlogPost;
