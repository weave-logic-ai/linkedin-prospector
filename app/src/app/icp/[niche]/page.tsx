import { NicheDetail } from "@/components/icp/niche-detail";

interface NichePageProps {
  params: Promise<{ niche: string }>;
}

export default async function NichePage({ params }: NichePageProps) {
  const { niche } = await params;
  return <NicheDetail nicheSlug={niche} />;
}
