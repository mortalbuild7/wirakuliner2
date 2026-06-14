export default function EmbedLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-[100dvh] w-full overflow-hidden bg-white" data-embed-map-root>
      {children}
    </div>
  );
}
