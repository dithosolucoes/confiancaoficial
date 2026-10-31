import React, { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Props {
  companyId: string;
}

interface Kpis {
  completed: number;
  total: number;
  avgRating: number | null;
  ratingsCount: number;
  warranty: number;
  avgDays: number | null;
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

// Indicadores calculados só com dados gravados: serviços atribuídos à empresa, avaliações e datas.
export const CompanyKpiCards: React.FC<Props> = ({ companyId }) => {
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    if (!companyId) { setKpis(null); setLoadState("ready"); return; }
    let active = true;
    setLoadState("loading");
    (async () => {
      const { data: rows, error } = await supabase
        .from("service_requests")
        .select("id, status, created_at, completed_at, is_warranty")
        .eq("assigned_company_id", companyId);
      if (!active) return;
      if (error) { setLoadState("error"); return; }
      const list = rows || [];

      let ratings: { rating: number }[] = [];
      const ids = list.map((r) => r.id);
      if (ids.length > 0) {
        const { data: rdata, error: rerr } = await supabase
          .from("service_ratings")
          .select("rating")
          .in("service_request_id", ids);
        if (!active) return;
        if (rerr) { setLoadState("error"); return; }
        ratings = rdata || [];
      }

      const done = list.filter((r) => r.status === "completed");
      const durations = done
        .filter((r) => r.completed_at)
        .map((r) => (new Date(r.completed_at as string).getTime() - new Date(r.created_at).getTime()) / 86_400_000);

      setKpis({
        completed: done.length,
        total: list.length,
        avgRating: avg(ratings.map((r) => Number(r.rating))),
        ratingsCount: ratings.length,
        warranty: list.filter((r) => r.is_warranty).length,
        avgDays: avg(durations),
      });
      setLoadState("ready");
    })();
    return () => { active = false; };
  }, [companyId]);

  if (loadState === "loading") {
    return <p className="text-sm text-slate-500">A carregar indicadores...</p>;
  }
  if (loadState === "error" || !kpis) {
    return <p className="text-sm text-destructive">Não foi possível carregar os indicadores.</p>;
  }

  const cards = [
    { title: "Serviços concluídos", value: String(kpis.completed), hint: `de ${kpis.total} encaminhados` },
    {
      title: "Avaliação média",
      value: kpis.avgRating === null ? "—" : `${kpis.avgRating.toFixed(1)} / 5`,
      hint: kpis.ratingsCount ? `${kpis.ratingsCount} avaliações` : "Sem avaliações ainda",
    },
    {
      title: "Retrabalho (garantias)",
      value: kpis.total ? `${Math.round((kpis.warranty / kpis.total) * 100)}%` : "—",
      hint: `${kpis.warranty} serviços de garantia`,
    },
    {
      title: "Tempo até conclusão",
      value: kpis.avgDays === null ? "—" : `${kpis.avgDays.toFixed(1)} dias`,
      hint: "Média entre a criação e a conclusão",
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((c) => (
        <Card key={c.title} className="border-slate-200 dark:border-slate-800 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{c.title}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900 dark:text-white">{c.value}</div>
            <p className="text-xs text-slate-500 mt-1">{c.hint}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

export default CompanyKpiCards;
