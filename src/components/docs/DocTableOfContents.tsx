import React, { useEffect, useState } from 'react';
import { DocHeading } from './DocEditor';

interface DocTableOfContentsProps {
  headings: DocHeading[];
  /** The scrollable element the document renders inside. */
  scrollRef: React.RefObject<HTMLElement | null>;
}

/**
 * Outline rail with scroll-spy.
 *
 * Hand-rolled rather than using TipTap's table-of-contents extension, which is
 * Pro-licensed. Headings come from the editor's document, and the DOM nodes are matched
 * by order rather than by id — TipTap does not write ids into rendered headings, and
 * adding a custom heading extension just to carry one is more moving parts than this.
 */
export const DocTableOfContents: React.FC<DocTableOfContentsProps> = ({ headings, scrollRef }) => {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller || headings.length === 0) return;

    const onScroll = () => {
      const nodes = scroller.querySelectorAll('h1, h2, h3');
      const top = scroller.getBoundingClientRect().top;

      let current = 0;
      nodes.forEach((node, i) => {
        // 80px of slack so a heading counts as "reached" slightly before it pins.
        if (node.getBoundingClientRect().top - top <= 80) current = i;
      });
      setActiveIndex(current);
    };

    onScroll();
    scroller.addEventListener('scroll', onScroll, { passive: true });
    return () => scroller.removeEventListener('scroll', onScroll);
  }, [scrollRef, headings]);

  if (headings.length === 0) return null;

  const jumpTo = (index: number) => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    const node = scroller.querySelectorAll('h1, h2, h3')[index];
    node?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <nav className="hidden xl:block w-56 shrink-0 pl-6 pt-8">
      <div className="sticky top-8 space-y-1">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-text-tertiary mb-2">
          On this page
        </p>
        {headings.map((heading, index) => (
          <button
            key={`${heading.id}-${index}`}
            type="button"
            onClick={() => jumpTo(index)}
            style={{ paddingLeft: `${(heading.level - 1) * 10}px` }}
            className={`block w-full text-left text-[11px] leading-snug py-1 border-l-2 pl-2 transition-colors focus:outline-none ${
              index === activeIndex
                ? 'border-accent-primary text-text-primary'
                : 'border-transparent text-text-tertiary hover:text-text-secondary'
            }`}
          >
            <span className="line-clamp-2">{heading.text}</span>
          </button>
        ))}
      </div>
    </nav>
  );
};
