export interface ScriptParam {
  name: string;
  type: "string" | "number" | "select" | "boolean";
  label: string;
  options?: string[];
  default?: string | number | boolean;
  required?: boolean;
}

export interface ScriptDefinition {
  id: string;
  name: string;
  description: string;
  script: string;
  category: "scoring" | "collection" | "pipeline" | "reports" | "gdpr";
  playwright: boolean;
  params: ScriptParam[];
}

export const scriptDefinitions: ScriptDefinition[] = [
  {
    id: "rescore",
    name: "Rescore All",
    description: "Recompute all contact scores using current ICP config",
    script: "pipeline.mjs",
    category: "scoring",
    playwright: false,
    params: [
      {
        name: "mode",
        type: "select",
        label: "Mode",
        options: ["--rescore", "--rebuild", "--full"],
        default: "--rescore",
      },
    ],
  },
  {
    id: "scorer",
    name: "Run Scorer",
    description: "Compute ICP fit + gold scores for all contacts",
    script: "scorer.mjs",
    category: "scoring",
    playwright: false,
    params: [],
  },
  {
    id: "behavioral",
    name: "Behavioral Scorer",
    description: "Compute behavioral scores from connection and activity data",
    script: "behavioral-scorer.mjs",
    category: "scoring",
    playwright: false,
    params: [],
  },
  {
    id: "referral-scorer",
    name: "Referral Scorer",
    description: "Score contacts for referral potential",
    script: "referral-scorer.mjs",
    category: "scoring",
    playwright: false,
    params: [],
  },
  {
    id: "deep-scan",
    name: "Deep Scan",
    description: "Deep scan a specific LinkedIn contact profile",
    script: "deep-scan.mjs",
    category: "collection",
    playwright: true,
    params: [
      {
        name: "url",
        type: "string",
        label: "LinkedIn URL or slug",
        required: true,
      },
    ],
  },
  {
    id: "batch-deep-scan",
    name: "Batch Deep Scan",
    description: "Scan multiple contacts by tier",
    script: "batch-deep-scan.mjs",
    category: "collection",
    playwright: true,
    params: [
      {
        name: "tier",
        type: "select",
        label: "Tier",
        options: ["gold", "silver", "bronze"],
        default: "gold",
      },
      {
        name: "max",
        type: "number",
        label: "Max contacts",
        default: 10,
      },
    ],
  },
  {
    id: "enrich",
    name: "Enrich Contacts",
    description: "Enrich unenriched profiles with full data",
    script: "enrich.mjs",
    category: "collection",
    playwright: true,
    params: [
      {
        name: "url",
        type: "string",
        label: "LinkedIn URL (single contact mode)",
        required: false,
      },
      {
        name: "max",
        type: "number",
        label: "Max contacts",
        default: 20,
      },
    ],
  },
  {
    id: "enrich-graph",
    name: "Enrich Graph",
    description: "Enrich graph with mutual connection data",
    script: "enrich-graph.mjs",
    category: "collection",
    playwright: true,
    params: [
      {
        name: "max",
        type: "number",
        label: "Max contacts",
        default: 20,
      },
    ],
  },
  {
    id: "search",
    name: "Search LinkedIn",
    description: "Search for new contacts matching niche criteria",
    script: "search.mjs",
    category: "collection",
    playwright: true,
    params: [
      {
        name: "niche",
        type: "select",
        label: "Niche",
        options: [
          "dtc",
          "ecommerce",
          "saas",
          "adobe-commerce",
          "shopify",
          "agency",
          "php",
          "retail",
        ],
      },
      {
        name: "max-results",
        type: "number",
        label: "Max results",
        default: 20,
      },
    ],
  },
  {
    id: "activity-scanner",
    name: "Activity Scanner",
    description: "Scan recent LinkedIn activity for contacts",
    script: "activity-scanner.mjs",
    category: "collection",
    playwright: true,
    params: [],
  },
  {
    id: "graph-builder",
    name: "Graph Builder",
    description: "Rebuild the network graph from raw data",
    script: "graph-builder.mjs",
    category: "pipeline",
    playwright: false,
    params: [],
  },
  {
    id: "report",
    name: "Generate Report",
    description: "Generate HTML network analysis report",
    script: "report-generator.mjs",
    category: "reports",
    playwright: false,
    params: [],
  },
  {
    id: "icp-niche-report",
    name: "ICP Niche Report",
    description: "Generate niche-specific ICP analysis report",
    script: "icp-niche-report.mjs",
    category: "reports",
    playwright: false,
    params: [],
  },
  {
    id: "forget",
    name: "GDPR Forget",
    description: "Remove a contact from all data (right to be forgotten)",
    script: "pipeline.mjs",
    category: "gdpr",
    playwright: false,
    params: [
      {
        name: "url",
        type: "string",
        label: "LinkedIn URL to forget",
        required: true,
      },
    ],
  },
];

export const categoryLabels: Record<ScriptDefinition["category"], string> = {
  scoring: "Scoring & Analysis",
  collection: "Data Collection",
  pipeline: "Pipeline",
  reports: "Reports",
  gdpr: "GDPR & Compliance",
};

export const categoryOrder: ScriptDefinition["category"][] = [
  "scoring",
  "collection",
  "pipeline",
  "reports",
  "gdpr",
];

export function getScriptById(id: string): ScriptDefinition | undefined {
  return scriptDefinitions.find((s) => s.id === id);
}

export function getScriptsByCategory(
  category: ScriptDefinition["category"]
): ScriptDefinition[] {
  return scriptDefinitions.filter((s) => s.category === category);
}
