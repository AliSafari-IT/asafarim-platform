import type { ReactNode } from "react";
import { Kicker } from "./Kicker";

export interface HeroProps {
  kicker?: string;
  kickerIndex?: string;
  title: string;
  lede?: string;
  actions?: ReactNode;
}

export function Hero({ kicker, kickerIndex, title, lede, actions }: HeroProps) {
  return (
    <section className="ui-hero">
      {kicker ? <Kicker index={kickerIndex}>{kicker}</Kicker> : null}
      <h1>{title}</h1>
      {lede ? <p className="ui-hero__lede">{lede}</p> : null}
      {actions ? <div className="ui-hero__actions">{actions}</div> : null}
    </section>
  );
}
