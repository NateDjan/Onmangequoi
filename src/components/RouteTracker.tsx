import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { trackPageView } from "../lib/analytics";

/**
 * Sends a GA4 page_view on every SPA route change.
 * Mount once near the top of the component tree, inside <BrowserRouter>.
 */
export function RouteTracker() {
  const location = useLocation();

  useEffect(() => {
    trackPageView(window.location.origin + location.pathname + location.search);
  }, [location.pathname, location.search]);

  return null;
}
