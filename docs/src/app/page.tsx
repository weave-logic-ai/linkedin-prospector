import Link from 'next/link';

const features = [
  {
    icon: '\u{1F50D}',
    title: 'Discover & Import',
    description:
      'Import your LinkedIn network, discover ICPs, and segment contacts into niches automatically.',
    href: '/docs/guides/importing-contacts',
  },
  {
    icon: '\u{2728}',
    title: 'Enrich',
    description:
      'Fill missing data with a waterfall enrichment pipeline across Apollo, PDL, Lusha, and more.',
    href: '/docs/guides/enrichment',
  },
  {
    icon: '\u{1F3AF}',
    title: 'Score & Classify',
    description:
      'Nine-dimension composite scoring with persona classification and tier assignment.',
    href: '/docs/scoring',
  },
  {
    icon: '\u{1F4E8}',
    title: 'Outreach',
    description:
      'AI-powered message personalization with multi-channel cadence management.',
    href: '/docs/guides/outreach',
  },
  {
    icon: '\u{1F9E9}',
    title: 'Browser Extension',
    description:
      'Capture LinkedIn profiles, run tasks, and use message templates from the sidebar.',
    href: '/docs/browser-extension',
  },
  {
    icon: '\u{1F4CA}',
    title: 'Goals & Game Loop',
    description:
      'Track networking goals, earn points for actions, and maintain momentum with gamification.',
    href: '/docs/guides/game-loop',
  },
];

const techStack = [
  'Next.js 15',
  'React 19',
  'PostgreSQL',
  'Claude AI',
  'Chrome Extension (MV3)',
  'Tailwind CSS',
  'Docker',
];

export default function HomePage() {
  return (
    <main className="flex flex-1 flex-col items-center px-4 py-16">
      <div className="max-w-4xl text-center">
        <h1 className="mb-4 text-4xl font-bold tracking-tight md:text-5xl">
          NetworkNav
        </h1>
        <p className="mb-10 max-w-2xl mx-auto text-lg text-fd-muted-foreground">
          LinkedIn Network Intelligence Platform &mdash; find, enrich, score, and engage
          your professional network with AI-powered insights.
        </p>
        <div className="flex flex-wrap gap-4 justify-center mb-16">
          <Link
            href="/docs"
            className="rounded-lg bg-fd-primary px-6 py-3 text-sm font-medium text-fd-primary-foreground shadow hover:bg-fd-primary/90"
          >
            Read the Docs
          </Link>
          <Link
            href="/docs/guides/quickstart"
            className="rounded-lg border border-fd-border px-6 py-3 text-sm font-medium hover:bg-fd-accent"
          >
            Quick Start
          </Link>
          <Link
            href="/docs/api-reference"
            className="rounded-lg border border-fd-border px-6 py-3 text-sm font-medium hover:bg-fd-accent"
          >
            API Reference
          </Link>
        </div>
      </div>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 max-w-5xl w-full mb-16">
        {features.map((feature) => (
          <Link
            key={feature.title}
            href={feature.href}
            className="group rounded-xl border border-fd-border p-6 transition-colors hover:border-fd-primary/50 hover:bg-fd-accent/50"
          >
            <div className="mb-3 text-2xl">{feature.icon}</div>
            <h3 className="mb-2 text-base font-semibold group-hover:text-fd-primary">
              {feature.title}
            </h3>
            <p className="text-sm text-fd-muted-foreground leading-relaxed">
              {feature.description}
            </p>
          </Link>
        ))}
      </div>

      <div className="text-center">
        <h2 className="mb-4 text-sm font-medium uppercase tracking-widest text-fd-muted-foreground">
          Built with
        </h2>
        <div className="flex flex-wrap gap-3 justify-center">
          {techStack.map((tech) => (
            <span
              key={tech}
              className="rounded-full border border-fd-border px-4 py-1.5 text-xs font-medium text-fd-muted-foreground"
            >
              {tech}
            </span>
          ))}
        </div>
      </div>
    </main>
  );
}
