import { Outlet } from "react-router-dom";
import { Header } from "./Header";

export function PublicLayout() {
  return (
    <div className="min-h-dvh flex flex-col">
      <Header />
      <main className="flex-1 flex flex-col">
        <Outlet />
      </main>
    </div>
  );
}
