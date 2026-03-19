"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, Pencil, Trash2 } from "lucide-react";
import { NicheBuilderModal } from "./niche-builder-modal";

interface NicheRow {
  id: string;
  name: string;
  description: string | null;
  industry: string | null;
  keywords: string[];
  affordability: number | null;
  fitability: number | null;
  buildability: number | null;
  nicheScore: number | null;
  memberCount: number;
}

function ScoreDots({ value }: { value: number | null }) {
  if (value === null) return <span className="text-xs text-muted-foreground">--</span>;
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <span
          key={n}
          className={`inline-block h-2 w-2 rounded-full ${
            n <= value ? "bg-primary" : "bg-muted"
          }`}
        />
      ))}
    </div>
  );
}

export function NichesTable() {
  const [niches, setNiches] = useState<NicheRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editNiche, setEditNiche] = useState<NicheRow | undefined>(undefined);
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/niches");
      if (res.ok) {
        const json = await res.json();
        setNiches(json.data ?? []);
      }
    } catch {
      // empty state
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function handleNew() {
    setEditNiche(undefined);
    setModalOpen(true);
  }

  function handleEdit(niche: NicheRow) {
    setEditNiche(niche);
    setModalOpen(true);
  }

  async function handleDelete(id: string) {
    setDeleting(id);
    try {
      const res = await fetch(`/api/niches/${id}`, { method: "DELETE" });
      if (res.ok) {
        setNiches((prev) => prev.filter((n) => n.id !== id));
      }
    } finally {
      setDeleting(null);
    }
  }

  function handleSaved() {
    load();
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin mr-2 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Loading niches...</span>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">Niches ({niches.length})</CardTitle>
            <Button size="sm" onClick={handleNew}>
              <Plus className="h-3 w-3 mr-1" />
              New Niche
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {niches.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No niches defined yet. Create your first niche to get started.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground">
                    <th className="text-left py-2 pr-3 font-medium">Name</th>
                    <th className="text-left py-2 pr-3 font-medium">Industry</th>
                    <th className="text-left py-2 pr-3 font-medium">Keywords</th>
                    <th className="text-center py-2 pr-3 font-medium">Afford.</th>
                    <th className="text-center py-2 pr-3 font-medium">Fit</th>
                    <th className="text-center py-2 pr-3 font-medium">Build.</th>
                    <th className="text-center py-2 pr-3 font-medium">Score</th>
                    <th className="text-right py-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {niches.map((niche) => (
                    <tr key={niche.id} className="border-b last:border-0 hover:bg-muted/50">
                      <td className="py-2.5 pr-3">
                        <div>
                          <span className="font-medium">{niche.name}</span>
                          {niche.description && (
                            <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                              {niche.description}
                            </p>
                          )}
                        </div>
                      </td>
                      <td className="py-2.5 pr-3 text-muted-foreground">
                        {niche.industry ?? "--"}
                      </td>
                      <td className="py-2.5 pr-3">
                        <div className="flex flex-wrap gap-1 max-w-[180px]">
                          {(niche.keywords ?? []).slice(0, 3).map((kw) => (
                            <Badge key={kw} variant="secondary" className="text-[10px]">
                              {kw}
                            </Badge>
                          ))}
                          {(niche.keywords ?? []).length > 3 && (
                            <Badge variant="outline" className="text-[10px]">
                              +{niche.keywords.length - 3}
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="py-2.5 pr-3">
                        <div className="flex justify-center">
                          <ScoreDots value={niche.affordability} />
                        </div>
                      </td>
                      <td className="py-2.5 pr-3">
                        <div className="flex justify-center">
                          <ScoreDots value={niche.fitability} />
                        </div>
                      </td>
                      <td className="py-2.5 pr-3">
                        <div className="flex justify-center">
                          <ScoreDots value={niche.buildability} />
                        </div>
                      </td>
                      <td className="py-2.5 pr-3 text-center">
                        {niche.nicheScore != null ? (
                          <span className="font-medium">{niche.nicheScore}</span>
                        ) : (
                          <span className="text-muted-foreground">--</span>
                        )}
                      </td>
                      <td className="py-2.5 text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            onClick={() => handleEdit(niche)}
                          >
                            <Pencil className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                            onClick={() => handleDelete(niche.id)}
                            disabled={deleting === niche.id}
                          >
                            {deleting === niche.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Trash2 className="h-3 w-3" />
                            )}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <NicheBuilderModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSave={handleSaved}
        niche={editNiche}
      />
    </>
  );
}
