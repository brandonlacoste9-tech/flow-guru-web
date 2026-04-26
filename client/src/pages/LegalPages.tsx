import React from 'react';
import { motion } from 'framer-motion';
import { Link } from 'wouter';
import { ArrowLeft, Shield, FileText, CreditCard } from 'lucide-react';
import PricingCard from '@/components/PricingCard';

const Layout = ({ children, title, icon: Icon }: { children: React.ReactNode; title: string; icon: any }) => (
  <div className="min-h-screen bg-background text-foreground font-['Outfit'] selection:bg-primary/30">
    <nav className="fixed top-0 left-0 right-0 z-50 px-6 py-4 bg-background/80 backdrop-blur-md border-b border-border/50">
      <div className="max-w-4xl mx-auto flex items-center gap-4">
        <Link href="/">
          <button className="w-9 h-9 rounded-full border border-border flex items-center justify-center hover:bg-accent/10 transition-colors text-muted-foreground hover:text-foreground">
            <ArrowLeft size={16} />
          </button>
        </Link>
        <div className="flex items-center gap-2">
          <Icon size={18} className="text-primary" />
          <h1 className="text-lg font-bold tracking-tight">{title}</h1>
        </div>
      </div>
    </nav>
    <main className="pt-32 pb-24 px-6">
      <div className="max-w-3xl mx-auto">
        {children}
      </div>
    </main>
  </div>
);

export const PricingPage = () => (
  <Layout title="Pricing" icon={CreditCard}>
    <div className="text-center mb-12">
      <motion.h2 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-4xl sm:text-5xl font-extrabold tracking-tight mb-4"
      >
        Simple, Transparent Pricing
      </motion.h2>
      <motion.p 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="text-muted-foreground text-lg"
      >
        Everything you need to orchestrate your digital life for one flat fee.
      </motion.p>
    </div>
    <PricingCard />
    <div className="mt-16 grid gap-8 sm:grid-cols-2">
      <div className="p-6 rounded-3xl border border-border bg-card">
        <h3 className="font-bold mb-2">Can I cancel anytime?</h3>
        <p className="text-sm text-muted-foreground">Yes, your subscription can be cancelled at any time through your settings panel via Stripe Customer Portal.</p>
      </div>
      <div className="p-6 rounded-3xl border border-border bg-card">
        <h3 className="font-bold mb-2">What's included?</h3>
        <p className="text-sm text-muted-foreground">Full autonomous orchestration, unlimited calendar sync, and priority access to new AI models.</p>
      </div>
    </div>
  </Layout>
);

export const TermsPage = () => (
  <Layout title="Terms of Service" icon={FileText}>
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="prose prose-invert prose-primary max-w-none"
    >
      <h2 className="text-3xl font-bold mb-6">1. Acceptance of Terms</h2>
      <p>By accessing and using Flow Guru, you agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use the service.</p>
      
      <h2 className="text-2xl font-bold mt-8 mb-4">2. Description of Service</h2>
      <p>Flow Guru provides an AI-powered personal assistant service. We reserve the right to modify or discontinue the service at any time.</p>
      
      <h2 className="text-2xl font-bold mt-8 mb-4">3. Subscriptions</h2>
      <p>Subscriptions are billed monthly at $5.00 USD. You can manage your subscription through the Stripe Customer Portal in your settings.</p>
      
      <h2 className="text-2xl font-bold mt-8 mb-4">4. User Conduct</h2>
      <p>You agree not to use Flow Guru for any unlawful purpose or in any way that could damage, disable, or impair the service.</p>
      
      <h2 className="text-2xl font-bold mt-8 mb-4">5. Limitation of Liability</h2>
      <p>Flow Guru is provided "as is" without any warranties. We are not liable for any damages arising from your use of the service.</p>
    </motion.div>
  </Layout>
);

export const PrivacyPage = () => (
  <Layout title="Privacy Policy" icon={Shield}>
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="prose prose-invert prose-primary max-w-none"
    >
      <h2 className="text-3xl font-bold mb-6">Your Privacy is Our Priority</h2>
      <p>At Flow Guru, we believe privacy is a fundamental human right. Our service is designed to minimize data collection and maximize user control.</p>
      
      <h2 className="text-2xl font-bold mt-8 mb-4">Data Collection</h2>
      <p>We collect only the data necessary to provide our service, such as your email for authentication and any information you explicitly share with your assistant.</p>
      
      <h2 className="text-2xl font-bold mt-8 mb-4">Data Usage</h2>
      <p>Your data is used solely to improve your assistant's responses and manage your calendar/lists. We never sell your personal information to third parties.</p>
      
      <h2 className="text-2xl font-bold mt-8 mb-4">Your Rights</h2>
      <p>You have the right to access, export, or delete your data at any time through the Memory Manager in your settings.</p>
      
      <h2 className="text-2xl font-bold mt-8 mb-4">Security</h2>
      <p>We use industry-standard encryption to protect your data both in transit and at rest.</p>
    </motion.div>
  </Layout>
);
