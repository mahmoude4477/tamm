"use client";
import Link from "next/link";
import { Check } from "lucide-react";
import { LocalePicker, useMessages } from "./locale-provider";
export function AuthHeader() {
  const en = useMessages();
  return (
    <header className="auth-header">
      <nav aria-label={en.common.menu}>
        <Link className="brand" href="/">
          <span className="brand-mark">
            <Check size={22} />
          </span>
          {en.brand.name}
          <span className="arabic" lang="ar">
            {en.brand.arabic}
          </span>
        </Link>
        <LocalePicker />
      </nav>
    </header>
  );
}
