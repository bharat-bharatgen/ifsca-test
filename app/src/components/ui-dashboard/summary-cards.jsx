import { Card, CardContent } from "@/components/ui/card";

export function SummaryCards({ data }) {
  const cards = [
    {
      title: "Total Documents",
      value: data.totalFiles,
      className: "bg-primary/10 text-primary",
    },
    {
      title: "Number of queries raised",
      value: data.pendingFiles,
      className: "bg-primary/10 text-primary",
    },
    {
      title: "Number of queries resolved",
      value: data.approvedFiles,
      className: "bg-primary/10 text-primary",
    },
    {
      title: "Total types of Documents",
      value: data.rejectedFiles,
      className: "bg-primary/10 text-primary",
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 w-full">
      {cards.map((card, index) => (
        <Card key={index} className={`${card.className} shadow-sm`}>
          <CardContent className="p-4 text-center mt-5">
            <div className="text-sm font-medium opacity-90">{card.title}</div>
            <div className="text-3xl font-bold mt-1 tracking-tight">{card.value}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
