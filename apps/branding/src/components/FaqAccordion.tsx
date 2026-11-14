import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { ProductFaq } from '../content/products';

interface FaqAccordionProps {
  items: ProductFaq[];
}

export const FaqAccordion: React.FC<FaqAccordionProps> = ({ items }) => {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const toggle = (index: number) => {
    setOpenIndex((prev) => (prev === index ? null : index));
  };

  return (
    <div className="w-full divide-y divide-border border-y border-border">
      {items.map((item, index) => {
        const isOpen = openIndex === index;
        return (
          <div key={index} className="py-4">
            <button
              type="button"
              aria-expanded={isOpen}
              onClick={() => toggle(index)}
              className="w-full flex items-center justify-between text-left gap-4 py-2 text-sm sm:text-base font-semibold text-ink hover:text-accent transition-colors"
            >
              <span>{item.question}</span>
              <ChevronDown
                className={`w-4 h-4 shrink-0 transition-transform duration-200 text-ink-muted ${
                  isOpen ? 'rotate-180 text-accent' : ''
                }`}
              />
            </button>
            {isOpen && (
              <div className="pt-2 pb-3 text-xs sm:text-sm text-ink-secondary leading-relaxed animate-in fade-in duration-150">
                {item.answer}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
