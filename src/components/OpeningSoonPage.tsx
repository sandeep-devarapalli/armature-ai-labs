import type { PropsWithChildren } from "react";
import { ArrowRight, RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";
import { PageHeader, Section } from "./Primitives";

export function OpeningSoonPage() {
  return (
    <>
      <PageHeader
        meta="Public launch · operations staged"
        title="Operational access is opening soon."
        description="The public Armature AI Labs site is available now. Accounts, reservations, check-in, equipment checkout, and verified component requests will open after their production services complete final validation."
        actions={(
          <>
            <Link className="button button-primary" to="/projects">
              Explore projects <ArrowRight aria-hidden="true" />
            </Link>
            <Link className="button button-quiet" to="/components">
              Browse components
            </Link>
          </>
        )}
      />
      <Section
        number="01"
        title="The public floor stays open"
        lede="Projects, services, the component catalog, Maker Desk information, and the Bengaluru ecosystem remain available while operational systems are staged."
      />
    </>
  );
}

export function RouteFailurePage() {
  return (
    <PageHeader
      meta="Page load interrupted"
      title="This page did not load."
      description="A new site version may have arrived while this tab was open. Reload to use the current release."
      actions={(
        <>
          <button className="button button-primary" type="button" onClick={() => window.location.reload()}>
            <RefreshCw aria-hidden="true" /> Reload page
          </button>
          <Link className="button button-quiet" to="/">
            Return to the lab
          </Link>
        </>
      )}
    />
  );
}

export function ReleaseGate({
  enabled,
  children
}: PropsWithChildren<{ enabled: boolean }>) {
  return enabled ? children : <OpeningSoonPage />;
}
