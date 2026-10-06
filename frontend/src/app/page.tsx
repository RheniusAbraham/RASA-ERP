import PageHeader from "@/components/PageHeader";

const tiles = [
  { label: "Projects", className: "col-span-2 row-span-2" },
  { label: "Customers", className: "" },
  { label: "Drivers", className: "" },
  { label: "Fleet", className: "col-span-2" },
];

export default function Page() {
  return (
    <>
      <PageHeader title="Dashboard" />
      <div className="bento-grid">
        {tiles.map((t, i) => (
          <div
            key={t.label}
            className={`bento-card ${t.className}`}
            style={{ "--i": i + 1 } as React.CSSProperties}
          >
            <span className="bento-label">{t.label}</span>
          </div>
        ))}
      </div>
    </>
  );
}
