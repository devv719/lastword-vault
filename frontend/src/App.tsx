import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "react-hot-toast";

function HomePage() {
  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <div className="text-center space-y-6">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-indigo-600/20 mb-2">
          <span className="text-4xl">🔐</span>
        </div>
        <h1 className="text-5xl font-bold text-white tracking-tight">
          LastWord
        </h1>
        <p className="text-lg text-gray-400 max-w-md mx-auto">
          Dead Man&apos;s Switch Vault &mdash; your secure document release
          system.
        </p>
        <div className="flex items-center justify-center gap-3 pt-4">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 text-sm font-medium ring-1 ring-emerald-500/20">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            Frontend Online
          </span>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Toaster
        position="top-right"
        toastOptions={{
          className: "!bg-gray-800 !text-white",
          duration: 4000,
        }}
      />
      <Routes>
        <Route path="/" element={<HomePage />} />
      </Routes>
    </BrowserRouter>
  );
}
