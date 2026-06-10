import { EyeOff, LockKeyhole, Shield, ShieldCheck } from "lucide-preact";

const ITEMS = [
  { icon: Shield, label: "Local only", tone: "default" },
  { icon: LockKeyhole, label: "No telemetry", tone: "default" },
  { icon: EyeOff, label: "Private", tone: "private" },
  { icon: ShieldCheck, label: "Secure", tone: "default" }
] as const;

export function PrivacyTrustStrip() {
  return (
    <section className="trust-strip" aria-label="Privacy and security guarantees">
      {ITEMS.map((item) => {
        const Icon = item.icon;

        return (
          <div
            className={
              item.tone === "private"
                ? "trust-strip__item trust-strip__item--private"
                : "trust-strip__item"
            }
            key={item.label}
          >
            <Icon size={18} strokeWidth={2.3} />
            <span>{item.label}</span>
          </div>
        );
      })}
    </section>
  );
}
