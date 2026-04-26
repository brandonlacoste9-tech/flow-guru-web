import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import LoadingScreen from "./components/LoadingScreen";
import { LanguageProvider } from "./contexts/LanguageContext";

// Lazy load page components to reduce initial bundle size
const Home = lazy(() => import("./pages/Home"));
const Calendar = lazy(() => import("./pages/Calendar"));
const Lists = lazy(() => import("./pages/Lists"));
const Settings = lazy(() => import("./pages/Settings").then(m => ({ default: m.Settings })));
const Blog = lazy(() => import("./pages/Blog"));
const BlogPost = lazy(() => import("./pages/BlogPost"));
const Pricing = lazy(() => import("./pages/LegalPages").then(m => ({ default: m.PricingPage })));
const Terms = lazy(() => import("./pages/LegalPages").then(m => ({ default: m.TermsPage })));
const Privacy = lazy(() => import("./pages/LegalPages").then(m => ({ default: m.PrivacyPage })));

function Router() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <Switch>
        <Route path={"/"} component={Home} />
        <Route path={"/calendar"} component={Calendar} />
        <Route path={"/lists"} component={Lists} />
        <Route path={"/settings"} component={Settings} />
        <Route path="/blog" component={Blog} />
        <Route path="/blog/:slug" component={BlogPost} />
        <Route path="/pricing" component={Pricing} />
        <Route path="/terms" component={Terms} />
        <Route path="/privacy" component={Privacy} />
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <LanguageProvider>
        <ThemeProvider
          defaultTheme="light"
          switchable
        >
          <TooltipProvider>
            <Toaster />
            <Router />
          </TooltipProvider>
        </ThemeProvider>
      </LanguageProvider>
    </ErrorBoundary>
  );
}

export default App;
