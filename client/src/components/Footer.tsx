import React from "react";
import { useLocation } from "wouter";
import { Github, Twitter, Shield, FileText } from "lucide-react";

export function Footer() {
  const [, navigate] = useLocation();
  const currentYear = new Date().getFullYear();

  return (
    <footer className="mt-20 pb-12 px-6 border-t border-border/40">
      <div className="max-w-4xl mx-auto flex flex-col md:flex-row justify-between items-center gap-8 pt-12">
        <div className="flex flex-col items-center md:items-start gap-4">
          <div className="flex items-center gap-2">
            <img src="/floguru-logo.png" alt="Flow Guru" className="w-6 h-6 rounded-full" />
            <span className="text-sm font-bold uppercase tracking-tighter">Flow Guru</span>
          </div>
          <p className="text-xs text-muted-foreground text-center md:text-left max-w-[240px] leading-relaxed">
            Your autonomous AI lifestyle companion for planning, memory, and automation.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-x-12 gap-y-4">
          <div className="space-y-3">
            <h4 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Legal</h4>
            <div className="flex flex-col gap-2">
              <button onClick={() => navigate("/privacy")} className="text-xs text-muted-foreground hover:text-primary transition-colors flex items-center gap-2">
                <Shield size={12} /> Privacy Policy
              </button>
              <button onClick={() => navigate("/terms")} className="text-xs text-muted-foreground hover:text-primary transition-colors flex items-center gap-2">
                <FileText size={12} /> Terms of Service
              </button>
            </div>
          </div>
          <div className="space-y-3">
            <h4 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Social</h4>
            <div className="flex flex-col gap-2">
              <a href="https://x.com/floguru" target="_blank" rel="noreferrer" className="text-xs text-muted-foreground hover:text-primary transition-colors flex items-center gap-2">
                <Twitter size={12} /> Twitter / X
              </a>
              <a href="https://github.com/brandonlacoste9-tech/flow-guru-web" target="_blank" rel="noreferrer" className="text-xs text-muted-foreground hover:text-primary transition-colors flex items-center gap-2">
                <Github size={12} /> GitHub
              </a>
            </div>
          </div>
        </div>
      </div>
      <div className="mt-12 text-center">
        <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-[0.2em]">
          © {currentYear} Flow Guru AI. Built with Soul & Intelligence.
        </p>
      </div>
    </footer>
  );
}
