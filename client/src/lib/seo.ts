import { useEffect } from "react";

type SeoInput = {
  title: string;
  description: string;
  canonicalPath?: string;
  ogType?: "website" | "article";
  jsonLd?: Record<string, unknown>;
};

function upsertMeta(name: string, content: string, useProperty = false) {
  const selector = useProperty ? `meta[property="${name}"]` : `meta[name="${name}"]`;
  let tag = document.head.querySelector(selector) as HTMLMetaElement | null;
  if (!tag) {
    tag = document.createElement("meta");
    if (useProperty) tag.setAttribute("property", name);
    else tag.setAttribute("name", name);
    document.head.appendChild(tag);
  }
  tag.setAttribute("content", content);
}

function upsertCanonical(url: string) {
  let link = document.head.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
  if (!link) {
    link = document.createElement("link");
    link.setAttribute("rel", "canonical");
    document.head.appendChild(link);
  }
  link.setAttribute("href", url);
}

export function useSeoMeta({
  title,
  description,
  canonicalPath = "/",
  ogType = "website",
  jsonLd,
}: SeoInput) {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const origin = window.location.origin || "https://floguru.com";
    const canonical = new URL(canonicalPath, origin).toString();

    document.title = title;
    upsertMeta("description", description);
    upsertCanonical(canonical);

    upsertMeta("og:type", ogType, true);
    upsertMeta("og:title", title, true);
    upsertMeta("og:description", description, true);
    upsertMeta("og:url", canonical, true);

    upsertMeta("twitter:title", title, true);
    upsertMeta("twitter:description", description, true);
    upsertMeta("twitter:url", canonical, true);

    const scriptId = "fg-page-jsonld";
    const existing = document.getElementById(scriptId);
    if (jsonLd) {
      const script = existing || document.createElement("script");
      script.id = scriptId;
      script.setAttribute("type", "application/ld+json");
      script.textContent = JSON.stringify(jsonLd);
      if (!existing) document.head.appendChild(script);
    } else if (existing) {
      existing.remove();
    }
  }, [title, description, canonicalPath, ogType, jsonLd]);
}

