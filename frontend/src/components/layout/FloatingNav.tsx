import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowUpRight, Menu, X } from 'lucide-react';
import { LastWordMark } from '../ui/LastWordMark';

export const FloatingNav: React.FC = () => {
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      // Collapse navigation when scrolling past hero
      if (window.scrollY > 380) {
        setIsScrolled(true);
      } else {
        setIsScrolled(false);
      }
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const navLinks = [
    { label: 'How it works', href: '#how-it-works' },
    { label: 'Security', href: '#security' },
    { label: 'FAQ', href: '#faq' },
    { label: 'Log in', href: '/login', isRouter: true },
  ];

  return (
    <header className="fixed top-8 inset-x-0 z-50 pointer-events-none px-4 sm:px-6">
      <div className="max-w-[1180px] mx-auto w-full flex items-center justify-between">
        {/* Left: Floating white pill */}
        <div className="relative pointer-events-auto">
          <motion.div
            layout
            transition={{ type: 'spring', damping: 28, stiffness: 350 }}
            className={`h-[44px] bg-white text-navy border border-black/5 shadow-[0_4px_24px_rgba(11,27,51,0.08)] rounded-full flex items-center transition-all ${
              isScrolled ? 'px-3 gap-2' : 'px-4 gap-4 sm:gap-6'
            }`}
          >
            {/* Mascot mark */}
            <Link
              to="/"
              className="flex items-center gap-2.5 text-navy hover:text-accent transition-colors"
              aria-label="LastWord home"
            >
              <LastWordMark size={22} className="text-navy" />
              {/* Optional brand label if collapsed */}
              <AnimatePresence>
                {isScrolled && (
                  <motion.span
                    initial={{ opacity: 0, width: 0 }}
                    animate={{ opacity: 1, width: 'auto' }}
                    exit={{ opacity: 0, width: 0 }}
                    className="text-xs font-semibold tracking-tight text-navy whitespace-nowrap overflow-hidden hidden sm:inline"
                  >
                    LastWord
                  </motion.span>
                )}
              </AnimatePresence>
            </Link>

            {/* Desktop links when not scrolled past hero */}
            <AnimatePresence mode="wait">
              {!isScrolled ? (
                <motion.nav
                  key="full-links"
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -8 }}
                  transition={{ duration: 0.18 }}
                  className="hidden md:flex items-center gap-5 text-[15px] font-sans font-medium text-navy/90"
                >
                  {navLinks.map((link) =>
                    link.isRouter ? (
                      <Link
                        key={link.label}
                        to={link.href}
                        className="hover:text-navy transition-colors tracking-tight text-navy/75 hover:text-navy"
                      >
                        {link.label}
                      </Link>
                    ) : (
                      <a
                        key={link.label}
                        href={link.href}
                        className="hover:text-navy transition-colors tracking-tight text-navy/75 hover:text-navy"
                      >
                        {link.label}
                      </a>
                    )
                  )}
                </motion.nav>
              ) : null}
            </AnimatePresence>

            {/* Mobile hamburger or scrolled menu toggle button */}
            <button
              type="button"
              onClick={() => setMobileMenuOpen((prev) => !prev)}
              className={`p-1.5 rounded-full hover:bg-surface-2 transition-colors text-navy ${
                isScrolled ? 'flex' : 'flex md:hidden'
              }`}
              aria-label="Toggle navigation menu"
              aria-expanded={mobileMenuOpen}
            >
              {mobileMenuOpen ? (
                <X className="w-4 h-4" />
              ) : (
                <Menu className="w-4 h-4" />
              )}
            </button>
          </motion.div>

          {/* Collapsible Dropdown Panel for mobile / scrolled state */}
          <AnimatePresence>
            {mobileMenuOpen && (
              <motion.div
                initial={{ opacity: 0, y: -8, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8, scale: 0.96 }}
                transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                className="absolute left-0 top-[52px] w-56 bg-white border border-border shadow-[0_12px_36px_rgba(11,27,51,0.12)] rounded-2xl p-2 z-50 flex flex-col gap-1"
              >
                {navLinks.map((link) =>
                  link.isRouter ? (
                    <Link
                      key={link.label}
                      to={link.href}
                      onClick={() => setMobileMenuOpen(false)}
                      className="px-3.5 py-2 text-sm font-medium text-navy hover:bg-surface-2 rounded-xl transition-colors"
                    >
                      {link.label}
                    </Link>
                  ) : (
                    <a
                      key={link.label}
                      href={link.href}
                      onClick={() => setMobileMenuOpen(false)}
                      className="px-3.5 py-2 text-sm font-medium text-navy hover:bg-surface-2 rounded-xl transition-colors"
                    >
                      {link.label}
                    </a>
                  )
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Right: Navy Pill CTA + Separate 44px Circle with Arrow Swap */}
        <div className="pointer-events-auto flex items-center gap-2">
          <Link
            to="/register"
            className="group flex items-center gap-2 focus:outline-none"
            aria-label="Create your vault"
          >
            {/* Primary Navy Pill */}
            <div className="h-[44px] px-5 bg-navy text-white text-sm font-medium rounded-full flex items-center justify-center shadow-[0_4px_20px_rgba(11,27,51,0.15)] group-hover:bg-navy/95 transition-all">
              <span className="whitespace-nowrap tracking-tight font-sans">
                Create your vault
              </span>
            </div>

            {/* Separate 44px Navy Circle with Bidirectional Arrow-Swap */}
            <div
              className="relative w-[44px] h-[44px] bg-navy text-white rounded-full flex items-center justify-center overflow-hidden shadow-[0_4px_20px_rgba(11,27,51,0.15)] group-hover:bg-navy/95 transition-all shrink-0"
              aria-hidden="true"
            >
              {/* Primary Arrow: exits top-right on hover */}
              <ArrowUpRight
                className="w-5 h-5 transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:translate-x-[150%] group-hover:-translate-y-[150%]"
                strokeWidth={2}
              />
              {/* Secondary Arrow: enters from bottom-left on hover */}
              <ArrowUpRight
                className="w-5 h-5 absolute -translate-x-[150%] translate-y-[150%] transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:translate-x-0 group-hover:translate-y-0"
                strokeWidth={2}
              />
            </div>
          </Link>
        </div>
      </div>
    </header>
  );
};
