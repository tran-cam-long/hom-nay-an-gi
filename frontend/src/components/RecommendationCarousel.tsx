import {
  MdChevronLeft,
  MdChevronRight,
  MdFirstPage,
  MdLastPage,
} from "react-icons/md";
import useDishCarousel from "../hooks/useDishCarousel";
import type { RecommendationItem } from "../types/recommendation";

type RecommendationCarouselProps = {
  title: string;
  emptyMessage: string;
  items: RecommendationItem[];
  isMobile: boolean;
  armedDishId: number | null;
  isChoosingEnabled: boolean;
  isSubmittingChoice: boolean;
  onChooseClick: (dishId: number) => Promise<void> | void;
  setItemRef: (dishId: number, element: HTMLElement | null) => void;
};

function formatLastChosen(isoDate: string | null): string {
  if (!isoDate) return "Never";

  const parsed = new Date(isoDate);

  if (Number.isNaN(parsed.getTime())) return "Unknown";

  return parsed.toLocaleString();
}

export default function RecommendationCarousel({
  title,
  emptyMessage,
  items,
  isMobile,
  armedDishId,
  isChoosingEnabled,
  isSubmittingChoice,
  onChooseClick,
  setItemRef,
}: RecommendationCarouselProps) {
  const itemsPerView: 1 | 2 = isMobile ? 1 : 2;
  const { containerRef, goFirst, goBackOne, goNextOne, goLast, startIndex, maxStartIndex } =
    useDishCarousel({
      itemCount: items.length,
      itemsPerView,
    });

  const canGoBack = startIndex > 0;
  const canGoNext = startIndex < maxStartIndex;

  return (
    <section className="recommendation-section">
      <div className="recommendation-section__header">
        <div className="recommendation-title-row">
          <h3 className="section-title">{title}</h3>
          {!isMobile && items.length > 0 && (
            <div className="recommendation-nav">
              <button
                type="button"
                className="recommendation-nav__btn"
                onClick={goFirst}
                disabled={!canGoBack}
                aria-label="First items"
                title="First items"
              >
                <MdFirstPage aria-hidden />
              </button>
              <button
                type="button"
                className="recommendation-nav__btn"
                onClick={goBackOne}
                disabled={!canGoBack}
                aria-label="Back one item"
                title="Back one item"
              >
                <MdChevronLeft aria-hidden />
              </button>
              <button
                type="button"
                className="recommendation-nav__btn"
                onClick={goNextOne}
                disabled={!canGoNext}
                aria-label="Next item"
                title="Next item"
              >
                <MdChevronRight aria-hidden />
              </button>
              <button
                type="button"
                className="recommendation-nav__btn"
                onClick={goLast}
                disabled={!canGoNext}
                aria-label="Last items"
                title="Last items"
              >
                <MdLastPage aria-hidden />
              </button>
            </div>
          )}
        </div>
      </div>

      {items.length === 0 ? (
        <p className="recommendation-empty">{emptyMessage}</p>
      ) : (
        <div className="recommendation-track" ref={containerRef}>
          {items.map((item) => (
            <article
              key={item.dish.id}
              className="recommendation-card"
              data-carousel-item="true"
              ref={(element) => setItemRef(item.dish.id, element)}
            >
              <div className="recommendation-card__image-wrap">
                <img
                  src={item.dish.imageUrl}
                  alt={item.dish.name}
                  onError={(event) => {
                    event.currentTarget.style.visibility = "hidden";
                  }}
                />
                {isChoosingEnabled && (
                  <button
                    type="button"
                    className={`choose-btn choose-btn--overlay choose-btn--carousel ${armedDishId === item.dish.id ? "choose-btn--confirm" : ""}`}
                    onClick={() => {
                      void onChooseClick(item.dish.id);
                    }}
                    disabled={isSubmittingChoice}
                  >
                    {armedDishId === item.dish.id ? (
                      <>
                        <span className="choose-btn__icon" aria-hidden>
                          ✓
                        </span>
                        Confirm?
                      </>
                    ) : (
                      "Choose"
                    )}
                  </button>
                )}

                <div
                  className={`choose-popover choose-popover--carousel ${armedDishId === item.dish.id ? "choose-popover--open" : ""}`}
                  role="dialog"
                  aria-hidden={armedDishId !== item.dish.id}
                >
                  By choosing this dish the system will record it and use it for recommendations.
                </div>
              </div>
              <div className="recommendation-card__body">
                <div className="recommendation-card__name">{item.dish.name}</div>
                <div className="recommendation-card__meta">Chosen: {item.timesChosen}</div>
                <div className="recommendation-card__meta">
                  Last chosen: {formatLastChosen(item.lastChosenTime)}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
