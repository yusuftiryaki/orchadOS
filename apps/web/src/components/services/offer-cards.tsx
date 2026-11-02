import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { servicesText as S } from "@/lib/i18n/messages/services";
import { offerCards, type ServiceOffer } from "@/lib/services/offers";
import { serviceHref } from "@/lib/services/urls";
import { RobotBadge } from "./robot-badge";
import styles from "./services.module.css";

// The service cards of the portal (IP15, docs/MVP.md Module 6): one card per
// owned parcel and service, in the state public.service_offers gives
// (recommended, available, pre_request, open), with the robot that does the
// job (the open request's model, else the default one). Nothing when there is no row:
// the switch is off, the reader is a co-owner, or no area is known. A demo
// visitor sees the cards; the form they lead to writes nothing.
export function ServiceOffers({
  offers,
  today,
  showParcel = false,
  headingLevel = 2,
  id,
}: {
  offers: ServiceOffer[];
  today: string;
  // On the portal home every garden's card names its garden.
  showParcel?: boolean;
  headingLevel?: 2 | 3;
  id?: string;
}) {
  const cards = offerCards(offers, today);
  if (cards.length === 0) return null;
  return (
    <Panel
      title={S.card.title}
      description={S.card.lead}
      headingLevel={headingLevel}
      id={id}
      testId="service-offers"
      actions={<Link href={serviceHref.list()}>{S.card.allRequests}</Link>}
    >
      <ul className={styles.cards}>
        {cards.map((card) => (
          <li
            key={`${card.parcelId}:${card.serviceTypeId}`}
            className={
              card.state === "recommended" ? `${styles.card} ${styles.recommended}` : styles.card
            }
            data-testid="service-offer"
            data-state={card.state}
            data-offer-parcel-id={card.parcelId}
          >
            <div className={styles.cardBody}>
              {showParcel && <p className={styles.parcel}>{card.parcelName}</p>}
              {card.lines.map((line) => (
                <p key={line}>{line}</p>
              ))}
              {card.robot && (
                <div className={styles.robot}>
                  <RobotBadge robot={card.robot} />
                </div>
              )}
              {card.price && (
                <p
                  className={styles.price}
                  data-testid="service-offer-price"
                  data-priced={card.price.priced}
                >
                  {card.price.text}
                  {card.price.note && <span className={styles.priceNote}>{card.price.note}</span>}
                </p>
              )}
            </div>
            <ButtonLink
              variant={card.state === "open" ? "quiet" : "secondary"}
              href={card.action.href}
              data-testid="service-offer-action"
            >
              {card.action.label}
            </ButtonLink>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
