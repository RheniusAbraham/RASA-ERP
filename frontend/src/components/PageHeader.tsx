export default function PageHeader({ title }: { title: string }) {
  return (
    <div className="bento-card page-header">
      <h1 className="page-title">{title}</h1>
    </div>
  );
}
