import { Navigate, useLocation } from "react-router-dom";

import { Spinner } from "../shared/ui";
import { tokenStore } from "../shared/api/client";
import { useCurrentUser } from "../modules/auth";

/** Пускает дальше только с действующей сессией, иначе — на вход. */
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const hasToken = tokenStore.get() !== null;
  const { data: user, isLoading, isError } = useCurrentUser();

  if (!hasToken || isError) {
    return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}${location.hash}` }} />;
  }
  if (isLoading || !user) {
    return (
      <div style={{ display: "grid", placeItems: "center", minHeight: "100vh" }}>
        <Spinner />
      </div>
    );
  }
  return <>{children}</>;
}
