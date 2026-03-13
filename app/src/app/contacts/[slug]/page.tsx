"use client";

import { useParams } from "next/navigation";
import { ContactDetail } from "@/components/contacts/contact-detail";

export default function ContactDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  return <ContactDetail slug={slug} />;
}
