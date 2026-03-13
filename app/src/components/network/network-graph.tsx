"use client";

import { useEffect, useRef, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import type { GraphSettings } from "./network-content";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface GraphNode {
  id: string;
  slug: string;
  name: string;
  company: string;
  goldScore: number;
  tier: string;
  persona: string;
  cluster: number;
  clusterLabel: string;
  degree: number;
}

interface GraphEdge {
  source: string;
  target: string;
  type: string;
  weight: number;
}

interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  clusters: { id: number; label: string; count: number; goldCount: number; keywords: string[]; hubNames: string[] }[];
  stats: { totalNodes: number; totalEdges: number; density: number };
}

interface NetworkGraphProps {
  data: GraphData;
  settings: GraphSettings;
  selectedCluster: number | null;
}

// ---------------------------------------------------------------------------
// Color palettes
// ---------------------------------------------------------------------------

const TIER_COLORS: Record<string, string> = {
  gold: "#E5A100",
  silver: "#8E9BAE",
  bronze: "#B27A3A",
  watch: "#525252",
};

const CLUSTER_COLORS = [
  "#6366f1",
  "#ec4899",
  "#14b8a6",
  "#f97316",
  "#8b5cf6",
  "#06b6d4",
  "#ef4444",
  "#22c55e",
  "#eab308",
  "#a855f7",
];

const PERSONA_COLORS: Record<string, string> = {
  buyer: "#22c55e",
  "warm-lead": "#f97316",
  advisor: "#6366f1",
  hub: "#ec4899",
  peer: "#06b6d4",
  "network-node": "#525252",
};

// ---------------------------------------------------------------------------
// Convex hull (Andrew's monotone chain)
// ---------------------------------------------------------------------------

function convexHull(points: { x: number; y: number }[]): { x: number; y: number }[] {
  if (points.length < 3) return points;
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o: typeof sorted[0], a: typeof sorted[0], b: typeof sorted[0]) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: typeof sorted = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: typeof sorted = [];
  for (const p of sorted.reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

// ---------------------------------------------------------------------------
// Node sizing and coloring
// ---------------------------------------------------------------------------

interface SimNode extends GraphNode {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
}

type ColorByMode = GraphSettings["colorBy"];
type SizeByMode = GraphSettings["sizeBy"];
type LabelMode = GraphSettings["labelMode"];

function getNodeColor(node: GraphNode, colorBy: ColorByMode): string {
  switch (colorBy) {
    case "tier":
      return TIER_COLORS[node.tier] || "#525252";
    case "cluster":
      return CLUSTER_COLORS[node.cluster % CLUSTER_COLORS.length] || "#6366f1";
    case "persona":
      return PERSONA_COLORS[node.persona] || "#525252";
    case "degree": {
      const d = Math.min(node.degree, 3);
      const t = d / 3;
      const r = Math.round(82 + t * 173);
      const g = Math.round(82 - t * 30);
      const b = Math.round(241 - t * 100);
      return `rgb(${r},${g},${b})`;
    }
    default:
      return "#6366f1";
  }
}

function getNodeRadius(node: GraphNode, sizeBy: SizeByMode, edgeCount?: number): number {
  switch (sizeBy) {
    case "goldScore":
      return 2 + node.goldScore * 10;
    case "connections":
      return 2 + Math.min(edgeCount || 0, 20) * 0.4;
    case "uniform":
      return 4;
    case "tier":
    default:
      if (node.tier === "gold") return 8;
      if (node.tier === "silver") return 5;
      if (node.tier === "bronze") return 3.5;
      return 2.5;
  }
}

function showLabel(labelMode: LabelMode, node: SimNode, hovered: SimNode | null): boolean {
  if (labelMode === "all") return true;
  if (labelMode === "none") return false;
  if (labelMode === "hover") return hovered?.id === node.id;
  // "gold" mode
  return node.tier === "gold" || (hovered?.id === node.id);
}

// ---------------------------------------------------------------------------
// Simple 2D force-directed graph using canvas
// ---------------------------------------------------------------------------

export function NetworkGraph({
  data,
  settings,
  selectedCluster,
}: NetworkGraphProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const nodesRef = useRef<SimNode[]>([]);
  const animRef = useRef<number>(0);
  const iterationRef = useRef(0);
  const router = useRouter();

  // Transform and offset state for pan/zoom
  const transformRef = useRef({ x: 0, y: 0, scale: 1 });
  const dragRef = useRef<{
    dragging: boolean;
    lastX: number;
    lastY: number;
    dragNode: SimNode | null;
  }>({ dragging: false, lastX: 0, lastY: 0, dragNode: null });
  const hoveredRef = useRef<SimNode | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  // Track settings in a ref for use in animation loop without restarting it
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  // Filter edges based on type toggles, weight threshold, and cluster selection
  const filteredEdges = useMemo(() => {
    type EdgeKey = keyof typeof settings.edgeTypes;
    let edges = data.edges.filter(
      (e) =>
        settings.edgeTypes[e.type as EdgeKey] !== false &&
        e.weight >= settings.weightThreshold,
    );

    if (selectedCluster !== null) {
      const clusterNodes = new Set(
        data.nodes
          .filter((n) => n.cluster === selectedCluster)
          .map((n) => n.id),
      );
      edges = edges.filter(
        (e) => clusterNodes.has(e.source) || clusterNodes.has(e.target),
      );
    }

    return edges;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.edges, data.nodes, settings.edgeTypes, settings.weightThreshold, selectedCluster]);

  // Filter nodes for cluster selection
  const filteredNodes = useMemo(() => {
    if (selectedCluster === null) return data.nodes;
    const clusterNodeIds = new Set(
      data.nodes
        .filter((n) => n.cluster === selectedCluster)
        .map((n) => n.id),
    );
    const neighborIds = new Set<string>();
    for (const e of filteredEdges) {
      if (clusterNodeIds.has(e.source)) neighborIds.add(e.target);
      if (clusterNodeIds.has(e.target)) neighborIds.add(e.source);
    }
    return data.nodes.filter(
      (n) => clusterNodeIds.has(n.id) || neighborIds.has(n.id),
    );
  }, [data.nodes, selectedCluster, filteredEdges]);

  // Build edge index for simulation
  const edgeIndex = useMemo(() => {
    const idx = new Map<string, string[]>();
    for (const e of filteredEdges) {
      if (!idx.has(e.source)) idx.set(e.source, []);
      if (!idx.has(e.target)) idx.set(e.target, []);
      idx.get(e.source)!.push(e.target);
      idx.get(e.target)!.push(e.source);
    }
    return idx;
  }, [filteredEdges]);

  // Compute edge counts per node (for "connections" sizing mode)
  const edgeCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of filteredEdges) {
      counts.set(e.source, (counts.get(e.source) || 0) + 1);
      counts.set(e.target, (counts.get(e.target) || 0) + 1);
    }
    return counts;
  }, [filteredEdges]);

  // Initialize simulation nodes when data changes or layout mode changes
  useEffect(() => {
    const w = containerRef.current?.clientWidth || 800;
    const h = containerRef.current?.clientHeight || 600;

    nodesRef.current = filteredNodes.map((n) => ({
      ...n,
      x: w / 2 + (Math.random() - 0.5) * w * 0.6,
      y: h / 2 + (Math.random() - 0.5) * h * 0.6,
      vx: 0,
      vy: 0,
      radius: getNodeRadius(n, settings.sizeBy, edgeCounts.get(n.id)),
      color: getNodeColor(n, settings.colorBy),
    }));

    // Reset iteration so simulation runs again
    iterationRef.current = 0;
    // Reset transform
    transformRef.current = { x: 0, y: 0, scale: 1 };
  }, [filteredNodes, settings.layout]); // eslint-disable-line react-hooks/exhaustive-deps

  // Update colors/radii when appearance settings change (without resetting positions)
  useEffect(() => {
    for (const node of nodesRef.current) {
      node.color = getNodeColor(node, settings.colorBy);
      node.radius = getNodeRadius(node, settings.sizeBy, edgeCounts.get(node.id));
    }
  }, [settings.colorBy, settings.sizeBy, edgeCounts]);

  // When force parameters change, allow simulation to re-run from current positions
  useEffect(() => {
    iterationRef.current = 0;
  }, [settings.repulsion, settings.attraction, settings.gravity]);

  // Animation loop: force simulation + render
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const maxIterations = 300;

    function resize() {
      if (!canvas || !container) return;
      const rect = container.getBoundingClientRect();
      canvas.width = rect.width * window.devicePixelRatio;
      canvas.height = rect.height * window.devicePixelRatio;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
    }
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(container);

    function simulate() {
      const nodes = nodesRef.current;
      const s = settingsRef.current;
      if (nodes.length === 0 || !canvas || !ctx) {
        animRef.current = requestAnimationFrame(simulate);
        return;
      }

      const w = canvas.width / window.devicePixelRatio;
      const h = canvas.height / window.devicePixelRatio;
      const iteration = iterationRef.current;
      const alpha = Math.max(0, 1 - iteration / maxIterations);

      const nodeMap = new Map(nodes.map((n) => [n.id, n]));

      if (iteration < maxIterations) {
        // Repulsion (brute-force for N<=500)
        for (let i = 0; i < nodes.length; i++) {
          for (let j = i + 1; j < nodes.length; j++) {
            const dx = nodes[j].x - nodes[i].x;
            const dy = nodes[j].y - nodes[i].y;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            const repulsion = (s.repulsion * alpha) / (dist * dist);
            const fx = (dx / dist) * repulsion;
            const fy = (dy / dist) * repulsion;
            nodes[i].vx -= fx;
            nodes[i].vy -= fy;
            nodes[j].vx += fx;
            nodes[j].vy += fy;
          }
        }

        // Edge attraction
        for (const e of filteredEdges) {
          const a = nodeMap.get(e.source);
          const b = nodeMap.get(e.target);
          if (!a || !b) continue;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const attraction = dist * s.attraction * alpha * e.weight;
          const fx = (dx / dist) * attraction;
          const fy = (dy / dist) * attraction;
          a.vx += fx; a.vy += fy;
          b.vx -= fx; b.vy -= fy;
        }

        // MODE-SPECIFIC FORCES
        if (s.layout === "cluster-grouped") {
          // Compute cluster centroids
          const clusterCentroids = new Map<number, { x: number; y: number; count: number }>();
          for (const n of nodes) {
            const c = clusterCentroids.get(n.cluster) || { x: 0, y: 0, count: 0 };
            c.x += n.x; c.y += n.y; c.count++;
            clusterCentroids.set(n.cluster, c);
          }
          for (const [, c] of clusterCentroids) {
            c.x /= c.count; c.y /= c.count;
          }

          // Pull nodes toward cluster centroid (strong)
          for (const n of nodes) {
            const c = clusterCentroids.get(n.cluster);
            if (!c) continue;
            const dx = c.x - n.x;
            const dy = c.y - n.y;
            n.vx += dx * 0.03 * alpha;
            n.vy += dy * 0.03 * alpha;
          }

          // Repel cluster centroids from each other
          const centroids = [...clusterCentroids.entries()];
          for (let i = 0; i < centroids.length; i++) {
            for (let j = i + 1; j < centroids.length; j++) {
              const [, ci] = centroids[i];
              const [, cj] = centroids[j];
              const dx = cj.x - ci.x;
              const dy = cj.y - ci.y;
              const dist = Math.sqrt(dx * dx + dy * dy) || 1;
              const repulsion = (20000 * alpha) / (dist * dist);
              const fx = (dx / dist) * repulsion;
              const fy = (dy / dist) * repulsion;
              // Push all nodes in each cluster
              for (const n of nodes) {
                if (n.cluster === centroids[i][0]) { n.vx -= fx * 0.1; n.vy -= fy * 0.1; }
                if (n.cluster === centroids[j][0]) { n.vx += fx * 0.1; n.vy += fy * 0.1; }
              }
            }
          }
        }

        if (s.layout === "gold-centered") {
          // Gold nodes get strong center gravity
          const goldNodes = nodes.filter(n => n.tier === "gold");
          for (const g of goldNodes) {
            g.vx += (w / 2 - g.x) * 0.002 * alpha;
            g.vy += (h / 2 - g.y) * 0.002 * alpha;
          }
          // Non-gold nodes attracted to nearest connected gold
          for (const n of nodes) {
            if (n.tier === "gold") continue;
            const neighbors = edgeIndex.get(n.id) || [];
            const connectedGold = goldNodes.filter(g => neighbors.includes(g.id));
            if (connectedGold.length > 0) {
              const nearest = connectedGold[0];
              const dx = nearest.x - n.x;
              const dy = nearest.y - n.y;
              n.vx += dx * 0.01 * alpha;
              n.vy += dy * 0.01 * alpha;
            }
          }
        }

        if (s.layout === "radial") {
          const tierRadius: Record<string, number> = { gold: 80, silver: 200, bronze: 350, watch: 450 };
          for (const n of nodes) {
            const targetR = tierRadius[n.tier] || 400;
            const dx = n.x - w / 2;
            const dy = n.y - h / 2;
            const currentR = Math.sqrt(dx * dx + dy * dy) || 1;
            const pullStrength = (targetR - currentR) * 0.01 * alpha;
            n.vx += (dx / currentR) * pullStrength;
            n.vy += (dy / currentR) * pullStrength;
          }
        }

        // Center gravity (all modes)
        for (const n of nodes) {
          n.vx += (w / 2 - n.x) * s.gravity * alpha;
          n.vy += (h / 2 - n.y) * s.gravity * alpha;
        }

        // Apply velocity with damping
        for (const n of nodes) {
          if (dragRef.current.dragNode === n) continue;
          n.vx *= 0.6;
          n.vy *= 0.6;
          n.x += n.vx;
          n.y += n.vy;
          n.x = Math.max(20, Math.min(w - 20, n.x));
          n.y = Math.max(20, Math.min(h - 20, n.y));
        }

        iterationRef.current++;
      }

      // =====================================================================
      // RENDER
      // =====================================================================
      const dpr = window.devicePixelRatio;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const t = transformRef.current;
      ctx.save();
      ctx.translate(t.x, t.y);
      ctx.scale(t.scale, t.scale);

      // --- Cluster hulls ---
      const clusterNodesMap = new Map<number, SimNode[]>();
      for (const n of nodes) {
        if (!clusterNodesMap.has(n.cluster)) clusterNodesMap.set(n.cluster, []);
        clusterNodesMap.get(n.cluster)!.push(n);
      }

      if (s.showClusterHulls) {
        for (const [clusterId, cNodes] of clusterNodesMap) {
          if (cNodes.length < 3) continue;
          const hull = convexHull(cNodes.map(n => ({ x: n.x, y: n.y })));
          if (hull.length < 3) continue;
          const color = CLUSTER_COLORS[clusterId % CLUSTER_COLORS.length] || "#6366f1";
          // Compute centroid for expansion
          const cx = hull.reduce((sum, p) => sum + p.x, 0) / hull.length;
          const cy = hull.reduce((sum, p) => sum + p.y, 0) / hull.length;
          const padding = 20;
          const expanded = hull.map(p => {
            const dx = p.x - cx;
            const dy = p.y - cy;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            return {
              x: p.x + (dx / dist) * padding,
              y: p.y + (dy / dist) * padding,
            };
          });

          ctx.globalAlpha = 0.06;
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.moveTo(expanded[0].x, expanded[0].y);
          for (let i = 1; i < expanded.length; i++) ctx.lineTo(expanded[i].x, expanded[i].y);
          ctx.closePath();
          ctx.fill();
          ctx.globalAlpha = 0.15;
          ctx.strokeStyle = color;
          ctx.lineWidth = 1;
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
      }

      // --- Edges ---
      for (const e of filteredEdges) {
        const a = nodeMap.get(e.source);
        const b = nodeMap.get(e.target);
        if (!a || !b) continue;
        const isGoldEdge = a.tier === "gold" && b.tier === "gold";
        ctx.globalAlpha = isGoldEdge ? Math.min(s.edgeOpacity * 2, 1) : s.edgeOpacity;
        ctx.lineWidth = isGoldEdge ? 1.5 : 0.5 + e.weight * 1;
        ctx.strokeStyle = isGoldEdge ? TIER_COLORS.gold : "#666";
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      // --- Nodes ---
      const hovered = hoveredRef.current;
      for (const n of nodes) {
        const isHighlighted =
          selectedCluster !== null && n.cluster === selectedCluster;
        const isDimmed = selectedCluster !== null && !isHighlighted;

        // Gold node glow
        if (n.tier === "gold") {
          ctx.globalAlpha = 0.15;
          ctx.fillStyle = TIER_COLORS.gold;
          ctx.beginPath();
          ctx.arc(n.x, n.y, n.radius * 2.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = isDimmed ? 0.25 : 1;
        }

        ctx.globalAlpha = isDimmed ? 0.25 : 1;
        ctx.fillStyle = n.color;
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.radius, 0, Math.PI * 2);
        ctx.fill();

        // Highlight ring for hovered
        if (hovered && hovered.id === n.id) {
          ctx.strokeStyle = "#fff";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(n.x, n.y, n.radius + 3, 0, Math.PI * 2);
          ctx.stroke();
        }

        // Labels
        if (showLabel(s.labelMode, n, hovered) && t.scale > 0.5) {
          ctx.globalAlpha = isDimmed ? 0.15 : 0.9;
          ctx.fillStyle = "#e4e4e7";
          ctx.font = `${10 / t.scale > 14 ? 14 : Math.round(10 / t.scale)}px sans-serif`;
          ctx.textAlign = "center";
          ctx.fillText(n.name, n.x, n.y - n.radius - 4);
        }
      }

      // --- Cluster labels at centroids ---
      if (s.showClusterLabels) {
        for (const [clusterId, cNodes] of clusterNodesMap) {
          const cx = cNodes.reduce((sum, n) => sum + n.x, 0) / cNodes.length;
          const cy = cNodes.reduce((sum, n) => sum + n.y, 0) / cNodes.length;
          const label = cNodes[0]?.clusterLabel || "";
          if (!label) continue;
          const fontSize = Math.round(12 / t.scale);
          ctx.font = `bold ${fontSize}px sans-serif`;
          ctx.textAlign = "center";
          // Background
          const metrics = ctx.measureText(label);
          const pad = 4;
          ctx.globalAlpha = 0.3;
          ctx.fillStyle = "#18181b";
          ctx.fillRect(cx - metrics.width / 2 - pad, cy - fontSize / 2 - pad, metrics.width + pad * 2, fontSize + pad * 2);
          ctx.globalAlpha = 0.6;
          ctx.fillStyle = CLUSTER_COLORS[clusterId % CLUSTER_COLORS.length] || "#e4e4e7";
          ctx.fillText(label, cx, cy + fontSize / 3);
        }
        ctx.globalAlpha = 1;
      }

      ctx.globalAlpha = 1;
      ctx.restore();

      animRef.current = requestAnimationFrame(simulate);
    }

    animRef.current = requestAnimationFrame(simulate);

    return () => {
      cancelAnimationFrame(animRef.current);
      observer.disconnect();
    };
  }, [filteredEdges, filteredNodes, selectedCluster, edgeIndex]);

  // Mouse interaction handlers
  const findNodeAt = useCallback(
    (clientX: number, clientY: number): SimNode | null => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      const t = transformRef.current;
      const mx = (clientX - rect.left - t.x) / t.scale;
      const my = (clientY - rect.top - t.y) / t.scale;

      for (let i = nodesRef.current.length - 1; i >= 0; i--) {
        const n = nodesRef.current[i];
        const dx = mx - n.x;
        const dy = my - n.y;
        if (dx * dx + dy * dy < (n.radius + 4) * (n.radius + 4)) {
          return n;
        }
      }
      return null;
    },
    [],
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      const node = findNodeAt(e.clientX, e.clientY);
      dragRef.current = {
        dragging: true,
        lastX: e.clientX,
        lastY: e.clientY,
        dragNode: node,
      };
    },
    [findNodeAt],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      const d = dragRef.current;

      if (d.dragging && d.dragNode) {
        const t = transformRef.current;
        const dx = (e.clientX - d.lastX) / t.scale;
        const dy = (e.clientY - d.lastY) / t.scale;
        d.dragNode.x += dx;
        d.dragNode.y += dy;
        d.dragNode.vx = 0;
        d.dragNode.vy = 0;
        d.lastX = e.clientX;
        d.lastY = e.clientY;
        return;
      }

      if (d.dragging) {
        const dx = e.clientX - d.lastX;
        const dy = e.clientY - d.lastY;
        transformRef.current.x += dx;
        transformRef.current.y += dy;
        d.lastX = e.clientX;
        d.lastY = e.clientY;
        return;
      }

      // Hover detection
      const node = findNodeAt(e.clientX, e.clientY);
      hoveredRef.current = node;

      // Update tooltip
      const tooltip = tooltipRef.current;
      if (tooltip) {
        if (node) {
          const rect = containerRef.current?.getBoundingClientRect();
          if (rect) {
            tooltip.style.display = "block";
            tooltip.style.left = `${e.clientX - rect.left + 12}px`;
            tooltip.style.top = `${e.clientY - rect.top + 12}px`;
            tooltip.innerHTML = `<div class="font-medium">${node.name}</div><div class="text-muted-foreground text-[10px]">${node.company}</div><div class="text-[10px] mt-0.5"><span class="text-[hsl(var(--tier-${node.tier}))]">${node.tier}</span> &middot; ${node.persona} &middot; ${(node.goldScore * 100).toFixed(0)}</div>`;
          }
        } else {
          tooltip.style.display = "none";
        }
      }

      // Cursor
      if (canvasRef.current) {
        canvasRef.current.style.cursor = node ? "pointer" : "grab";
      }
    },
    [findNodeAt],
  );

  const handleMouseUp = useCallback(() => {
    dragRef.current = {
      dragging: false,
      lastX: 0,
      lastY: 0,
      dragNode: null,
    };
  }, []);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      const node = findNodeAt(e.clientX, e.clientY);
      if (node) {
        router.push(`/contacts/${node.slug}`);
      }
    },
    [findNodeAt, router],
  );

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const t = transformRef.current;
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const newScale = Math.max(0.2, Math.min(5, t.scale * delta));

    const rect = canvasRef.current?.getBoundingClientRect();
    if (rect) {
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      t.x = mx - ((mx - t.x) / t.scale) * newScale;
      t.y = my - ((my - t.y) / t.scale) * newScale;
    }

    t.scale = newScale;
  }, []);

  return (
    <div ref={containerRef} className="relative w-full h-full">
      <canvas
        ref={canvasRef}
        className="w-full h-full"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onClick={handleClick}
        onWheel={handleWheel}
      />
      {/* Tooltip */}
      <div
        ref={tooltipRef}
        className="absolute hidden pointer-events-none z-20 rounded-md border border-border bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-md"
        style={{ display: "none" }}
      />
    </div>
  );
}
