export function DemoBanner({ label }: { label: string }) {
  return (
    <div className="bg-amber-400 text-amber-950 text-center text-sm font-medium py-1.5 px-4 sticky top-0 z-50">
      {label}
    </div>
  );
}
