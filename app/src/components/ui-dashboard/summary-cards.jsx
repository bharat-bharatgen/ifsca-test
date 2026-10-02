export function SummaryCards({ data }) {
  const metrics = [["Documents", data.totalFiles], ["Questions", data.pendingFiles], ["Resolved", data.approvedFiles], ["Document types", data.rejectedFiles]];
  return <div className="grid grid-cols-2 gap-6 border-y py-5 sm:grid-cols-4">{metrics.map(([label,value]) => <div key={label}><p className="text-xs text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-medium tabular-nums">{value}</p></div>)}</div>;
}
