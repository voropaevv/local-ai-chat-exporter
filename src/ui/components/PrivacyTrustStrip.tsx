import { EyeOff, LockKeyhole, Shield } from "lucide-preact";

const ITEMS = [
  { icon: Shield, label: "Local only" },
  { icon: LockKeyhole, label: "No telemetry" },
  { icon: EyeOff, label: "Private" }
] as const;

export function PrivacyTrustStrip() {
  return (
    <section className="trust-strip" aria-label="Privacy and security guarantees">
      {ITEMS.map((item) => {
        const Icon = item.icon;

        return (
          <div className="trust-strip__item" key={item.label}>
            <Icon size={15} strokeWidth={2.3} />
            <span>{item.label}</span>
          </div>
        );
      })}
    </section>
  );
}
