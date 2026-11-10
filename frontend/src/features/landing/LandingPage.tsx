import React, { useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ShieldCheck,
  KeyRound,
  Clock,
  UserCheck,
  FileText,
  Lock,
  Sparkles,
} from 'lucide-react';
import { LastWordMark } from '../../components/ui/LastWordMark';
import { PillButton } from '../../components/ui/PillButton';
import { PostageStamp } from '../../components/ui/Card';
import { Accordion } from '../../components/ui/Accordion';
import type { AccordionItem } from '../../components/ui/Accordion';
import { Badge, VaultStatusChip, VerificationBadge } from '../../components/ui/Badge';
import { PixelSky } from '../../components/hero/PixelSky';

export const LandingPage: React.FC = () => {
  const headlineBlockRef = useRef<HTMLDivElement | null>(null);

  // Staggered word animation for hero headline
  const headlineLine1 = ['Your', 'last', 'word,'];
  const headlineLine2 = ['delivered', 'with', 'care.'];

  // FAQ Items ("Small talk")
  const faqItems: AccordionItem[] = [
    {
      id: 'faq-1',
      question: 'How does LastWord know if something has actually happened to me?',
      answer:
        'LastWord operates strictly on an authenticated heartbeat schedule. You set a check-in cadence (e.g. every 14 days). If you miss a deadline, the system enters a WARNED state, sending alerts to your private channels. Only after your configurable grace period (e.g. another 14 days) completely expires without your pulse does the release protocol initiate.',
    },
    {
      id: 'faq-2',
      question: 'Can LastWord staff or hosting providers read my vault contents?',
      answer:
        'No. LastWord is engineered around zero-knowledge principles. Notes and files are encrypted client-side in your browser before transmission. Decryption keys are split and sealed; they are only reassembled and transmitted to designated recipients when fail-safe release conditions are met.',
    },
    {
      id: 'faq-3',
      question: 'What happens if I accidentally miss a single check-in while traveling?',
      answer:
        'A single missed check-in never releases your documents. It triggers the WARNED state and begins your grace period window. You will receive quiet reminders via your selected channels. A single tap on any authorized device resets the countdown back to full duration.',
    },
    {
      id: 'faq-4',
      question: 'Must my recipients install an app or create an account beforehand?',
      answer:
        'Recipients do not need an account upfront, but they do undergo an out-of-band identity verification challenge when you assign them. Upon authorized release, each contact receives an ephemeral, single-use cryptographic token that unlocks only their assigned items.',
    },
    {
      id: 'faq-5',
      question: 'Can I test the complete release process without waiting weeks?',
      answer:
        'Yes. LastWord features a built-in Demo Mode. In settings, toggling Demo Mode compresses the check-in interval to 2 minutes and grace period to 60 seconds, enabling full lifecycle testing and presentations in minutes.',
    },
  ];

  // How it works steps
  const [activeStep, setActiveStep] = useState(0);

  const steps = [
    {
      step: '01',
      title: 'Store what matters most',
      description:
        'Encrypt credentials, master seed phrases, legal directives, and personal letters. Assign specific items to verified contacts.',
      tag: 'CLIENT ENCRYPTION',
    },
    {
      step: '02',
      title: 'Check in on your quiet cadence',
      description:
        'Confirm active presence with a single biometric tap, mobile ping, or web check-in every week, month, or custom interval.',
      tag: 'HEARTBEAT MESH',
    },
    {
      step: '03',
      title: 'We release only if you can’t',
      description:
        'If check-ins cease and multi-stage grace periods elapse without word, verified contacts receive their unsealed keys.',
      tag: 'FAIL-SAFE HANDOVER',
    },
  ];

  return (
    <div className="pb-20 space-y-28 overflow-hidden bg-white">
      {/* ── 1. HERO SECTION (MATCHING REFERENCE SCREENSHOT) ─────────── */}
      <section className="relative min-h-[100svh] w-full flex flex-col justify-between items-center text-center px-4 sm:px-6 pt-28 pb-16 overflow-hidden">
        {/* Full-bleed pixelated dithered cloud sky in saturated blue */}
        <PixelSky holeRef={headlineBlockRef} />

        {/* Spacer for top positioning */}
        <div className="w-full h-8" aria-hidden="true" />

        {/* White Cloud Hole Center Content: Headline, Subcopy, CTAs */}
        <div
          ref={headlineBlockRef}
          className="relative z-10 max-w-[880px] mx-auto px-6 sm:px-10 py-8 sm:py-12 flex flex-col items-center"
        >
          {/* Headline: 2 lines in high-contrast Italic Serif with staggered word reveal */}
          <h1
            className="font-serif italic font-normal tracking-[-0.02em] text-navy select-none"
            style={{
              fontSize: 'clamp(56px, 9vw, 132px)',
              lineHeight: 0.95,
            }}
            aria-label="Your last word, delivered with care."
          >
            {/* Line 1 */}
            <span className="block whitespace-nowrap">
              {headlineLine1.map((word, i) => (
                <motion.span
                  key={word}
                  initial={{ opacity: 0, y: 16, filter: 'blur(6px)' }}
                  animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                  transition={{
                    duration: 0.5,
                    delay: 0.1 + i * 0.07,
                    ease: [0.22, 1, 0.36, 1],
                  }}
                  className="inline-block mr-[0.25em] last:mr-0"
                >
                  {word}
                </motion.span>
              ))}
            </span>

            {/* Line 2 */}
            <span className="block whitespace-nowrap mt-1 sm:mt-2">
              {headlineLine2.map((word, i) => (
                <motion.span
                  key={word}
                  initial={{ opacity: 0, y: 16, filter: 'blur(6px)' }}
                  animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                  transition={{
                    duration: 0.5,
                    delay: 0.1 + (i + 3) * 0.07,
                    ease: [0.22, 1, 0.36, 1],
                  }}
                  className="inline-block mr-[0.25em] last:mr-0"
                >
                  {word}
                </motion.span>
              ))}
            </span>
          </h1>

          {/* Subcopy: Inter 18px, max-w-600px, centered, navy 90% */}
          <p className="mt-6 sm:mt-8 text-base sm:text-[18px] text-navy/90 max-w-[600px] mx-auto font-sans font-normal leading-relaxed tracking-tight">
            Store what matters, check in on your schedule, and LastWord releases
            it to the people you trust only if you can’t.
          </p>

          {/* CTAs under subcopy: Primary pill with arrow-swap + quiet text link */}
          <div className="mt-8 sm:mt-10 flex flex-wrap items-center justify-center gap-5">
            <PillButton to="/register" size="lg" variant="primary">
              Create your vault
            </PillButton>
            <Link
              to="/login"
              className="text-sm font-medium text-navy/75 hover:text-navy px-3 py-2 transition-colors tracking-tight"
            >
              Log in →
            </Link>
          </div>
        </div>

        {/* Indicator prompt to scroll */}
        <div className="relative z-10 w-full flex justify-center pb-2 opacity-50 hover:opacity-100 transition-opacity">
          <span className="text-[11px] font-mono tracking-widest uppercase text-navy">
            ↓ Scroll to explore
          </span>
        </div>
      </section>

      {/* ── 2. PRODUCT SHOWCASE LIVE WINDOW CARDS (PEEKING INTO SKY) ─── */}
      <section
        id="product"
        className="relative z-10 max-w-6xl mx-auto px-6 lg:px-8 -mt-16 sm:-mt-24"
      >
        <div className="flex flex-col sm:flex-row items-baseline justify-between mb-8 bg-white/80 backdrop-blur-sm p-4 rounded-2xl">
          <div>
            <span className="text-xs font-mono uppercase tracking-widest text-accent font-medium">
              Product Overview
            </span>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-navy mt-1">
              Calm, dense, <span className="font-serif italic font-normal">precise</span> control.
            </h2>
          </div>
          <p className="text-sm text-muted-text max-w-xs mt-2 sm:mt-0">
            Live interactive modules simulating real vault controls.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Card 1: Live Dashboard Mock */}
          <div className="group bg-surface border border-border rounded-[28px] p-6 shadow-sm hover:shadow-md transition-all duration-300 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-4">
                <span className="text-[11px] font-mono uppercase tracking-widest px-2.5 py-0.5 rounded-full bg-white border border-border text-navy">
                  Heartbeat
                </span>
                <VaultStatusChip status="active" />
              </div>
              <h3 className="text-lg font-semibold text-navy tracking-tight">Active Pulse Monitor</h3>
              <p className="text-xs text-muted-text mt-1 leading-relaxed">
                Live countdown ticking towards scheduled check-in with dynamic status shifts.
              </p>

              {/* Mini UI Window */}
              <div className="mt-5 bg-white border border-border/80 rounded-2xl p-4 shadow-xs space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-text">Next check-in window</span>
                  <span className="text-xs font-mono font-semibold text-accent">09d 04h 12m</span>
                </div>
                <div className="h-1.5 w-full bg-surface-2 rounded-full overflow-hidden">
                  <div className="h-full bg-accent rounded-full w-[65%]" />
                </div>
                <div className="flex items-center justify-between text-[11px] text-muted-text pt-1">
                  <span>Frequency: 14 Days</span>
                  <span className="text-success font-medium">Nominal</span>
                </div>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-border flex items-center justify-between">
              <span className="text-xs font-medium text-navy">Dashboard</span>
              <Link to="/app" className="text-xs text-accent font-medium hover:underline inline-flex items-center gap-1">
                View →
              </Link>
            </div>
          </div>

          {/* Card 2: Vault Inventory Mock */}
          <div className="group bg-surface border border-border rounded-[28px] p-6 shadow-sm hover:shadow-md transition-all duration-300 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-4">
                <span className="text-[11px] font-mono uppercase tracking-widest px-2.5 py-0.5 rounded-full bg-white border border-border text-navy">
                  Encrypted Store
                </span>
                <span className="text-xs text-muted-text font-mono">7 Items</span>
              </div>
              <h3 className="text-lg font-semibold text-navy tracking-tight">Granular Authorization</h3>
              <p className="text-xs text-muted-text mt-1 leading-relaxed">
                Each document requires explicit owner consent and is bound to a verified recipient.
              </p>

              {/* Mini UI Window */}
              <div className="mt-5 bg-white border border-border/80 rounded-2xl p-4 shadow-xs space-y-2.5">
                <div className="flex items-center justify-between text-xs pb-2 border-b border-border/60">
                  <span className="font-medium text-navy truncate max-w-[160px]">
                    Living Will 2026.pdf
                  </span>
                  <Badge variant="success" size="sm">Authorized</Badge>
                </div>
                <div className="flex items-center justify-between text-xs pb-1">
                  <span className="font-medium text-navy truncate max-w-[160px]">
                    Trezor Master Seed
                  </span>
                  <Badge variant="success" size="sm">Authorized</Badge>
                </div>
                <div className="flex items-center justify-between text-[11px] text-muted-text">
                  <span>Recipient: Maya Chen</span>
                  <span className="text-accent font-mono">AES-256</span>
                </div>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-border flex items-center justify-between">
              <span className="text-xs font-medium text-navy">My Vault</span>
              <Link to="/app/vault" className="text-xs text-accent font-medium hover:underline inline-flex items-center gap-1">
                View →
              </Link>
            </div>
          </div>

          {/* Card 3: Trusted Contacts Mock */}
          <div className="group bg-surface border border-border rounded-[28px] p-6 shadow-sm hover:shadow-md transition-all duration-300 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-4">
                <span className="text-[11px] font-mono uppercase tracking-widest px-2.5 py-0.5 rounded-full bg-white border border-border text-navy">
                  Verified Contacts
                </span>
                <span className="text-xs text-success font-medium">3 of 4 Verified</span>
              </div>
              <h3 className="text-lg font-semibold text-navy tracking-tight">Identity Challenges</h3>
              <p className="text-xs text-muted-text mt-1 leading-relaxed">
                Out-of-band identity handshakes ensure no link is dispatched to expired addresses.
              </p>

              {/* Mini UI Window */}
              <div className="mt-5 bg-white border border-border/80 rounded-2xl p-4 shadow-xs space-y-2.5">
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-full bg-accent-soft text-accent text-xs font-medium flex items-center justify-center">
                    MC
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-navy truncate">Maya Chen</p>
                    <p className="text-[10px] text-muted-text">Partner</p>
                  </div>
                  <VerificationBadge status="verified" />
                </div>
                <div className="flex items-center gap-3 pt-2 border-t border-border/60">
                  <div className="w-7 h-7 rounded-full bg-surface-2 text-muted-text text-xs font-medium flex items-center justify-center">
                    ER
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-navy truncate">Elena Rostova</p>
                    <p className="text-[10px] text-muted-text">Family Trustee</p>
                  </div>
                  <VerificationBadge status="pending" />
                </div>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-border flex items-center justify-between">
              <span className="text-xs font-medium text-navy">Contacts Directory</span>
              <Link to="/app/contacts" className="text-xs text-accent font-medium hover:underline inline-flex items-center gap-1">
                View →
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── 3. HOW IT WORKS: STICKY STAGE TRANSITIONS ─────────────── */}
      <section id="how-it-works" className="max-w-6xl mx-auto px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <span className="text-xs font-mono uppercase tracking-widest text-accent font-medium">
            Protocol Sequence
          </span>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-navy mt-1.5">
            How the switch <span className="font-serif italic font-normal">safeguards</span> your legacy
          </h2>
          <p className="text-sm sm:text-base text-muted-text mt-3">
            Designed for zero false-positives. A deliberate three-phase handover protocol.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center bg-surface border border-border rounded-[32px] p-8 lg:p-12">
          {/* Step selection tabs */}
          <div className="lg:col-span-5 space-y-4">
            {steps.map((st, idx) => (
              <button
                key={st.step}
                type="button"
                onClick={() => setActiveStep(idx)}
                className={`w-full text-left p-5 rounded-2xl transition-all duration-200 cursor-pointer border ${
                  activeStep === idx
                    ? 'bg-white border-border shadow-sm'
                    : 'bg-transparent border-transparent hover:bg-white/60'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-mono text-xs font-semibold text-accent">
                    STEP {st.step}
                  </span>
                  <span className="text-[10px] font-mono text-muted-text">{st.tag}</span>
                </div>
                <h4 className="text-base font-semibold text-navy tracking-tight">{st.title}</h4>
                <p className="text-xs text-muted-text mt-1.5 leading-relaxed">{st.description}</p>
              </button>
            ))}
          </div>

          {/* Live Mini Stage Preview with subtle pixel texture backdrop */}
          <div className="lg:col-span-7 flex justify-center">
            <div className="relative w-full max-w-lg bg-white border border-border rounded-2xl p-6 sm:p-8 shadow-sm overflow-hidden">
              {/* Subtle pixel-sky texture at low opacity inside the active step card */}
              <div
                className="absolute inset-0 opacity-10 pointer-events-none"
                style={{
                  backgroundImage:
                    'radial-gradient(#00A8FF 1px, transparent 1px), radial-gradient(#7BCBFF 1px, transparent 1px)',
                  backgroundSize: '12px 12px',
                  backgroundPosition: '0 0, 6px 6px',
                }}
                aria-hidden="true"
              />

              <AnimatePresence mode="wait">
                {activeStep === 0 && (
                  <motion.div
                    key="step-0"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.25 }}
                    className="relative z-10 space-y-4"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Lock className="w-4 h-4 text-accent" />
                        <span className="text-sm font-semibold text-navy">Encrypted Note Seal</span>
                      </div>
                      <Badge variant="success" size="sm">AES-GCM-256</Badge>
                    </div>
                    <div className="bg-surface rounded-xl p-4 font-mono text-xs text-navy border border-border/80">
                      <span className="text-muted-text">Recipient:</span> David Vance (Executor)<br />
                      <span className="text-muted-text">Status:</span> Sealed & Awaiting Heartbeat Expiry<br />
                      <span className="text-muted-text">Ciphertext:</span> e84f2910a99...38bc01
                    </div>
                    <p className="text-xs text-muted-text">
                      Only items marked with explicit authorization are staged for release. Unassigned items remain permanently locked.
                    </p>
                  </motion.div>
                )}

                {activeStep === 1 && (
                  <motion.div
                    key="step-1"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.25 }}
                    className="relative z-10 space-y-5 text-center py-2"
                  >
                    <div className="w-16 h-16 rounded-full bg-accent-soft text-accent border border-accent/20 flex items-center justify-center mx-auto">
                      <Clock className="w-8 h-8" />
                    </div>
                    <div>
                      <span className="text-2xl font-bold font-mono text-navy">13d : 22h : 18m</span>
                      <p className="text-xs text-muted-text mt-1">Remaining until scheduled pulse window</p>
                    </div>
                    <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-surface-2 border border-border text-xs text-navy">
                      <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
                      <span>Cadence: 14 Days • Single-tap biometric reset</span>
                    </div>
                  </motion.div>
                )}

                {activeStep === 2 && (
                  <motion.div
                    key="step-2"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.25 }}
                    className="relative z-10 space-y-4"
                  >
                    <div className="flex items-center justify-between pb-3 border-b border-border">
                      <span className="text-xs font-mono font-semibold text-danger">FAIL-SAFE DISPATCH</span>
                      <Badge variant="danger" size="sm">Grace Window Expired</Badge>
                    </div>
                    <div className="space-y-2">
                      <div className="p-3 bg-surface rounded-xl border border-border flex items-center justify-between text-xs">
                        <div>
                          <p className="font-semibold text-navy">Maya Chen</p>
                          <p className="text-[10px] text-muted-text">3 Authorized Items</p>
                        </div>
                        <span className="text-xs font-mono text-accent">Single-use Key Sent</span>
                      </div>
                      <div className="p-3 bg-surface rounded-xl border border-border flex items-center justify-between text-xs">
                        <div>
                          <p className="font-semibold text-navy">David Vance, Esq.</p>
                          <p className="text-[10px] text-muted-text">3 Authorized Items</p>
                        </div>
                        <span className="text-xs font-mono text-accent">Single-use Key Sent</span>
                      </div>
                    </div>
                    <p className="text-[11px] text-muted-text">
                      Links expire in 72 hours. All downloads are logged cryptographically.
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </section>

      {/* ── 4. SECURITY HIGHLIGHTS (POSTAGE STAMPS LIKE REFERENCE) ─── */}
      <section id="security" className="max-w-6xl mx-auto px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto mb-14">
          <span className="text-xs font-mono uppercase tracking-widest text-accent font-medium">
            Cryptographic Architecture
          </span>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-navy mt-1.5">
            Engineered for <span className="font-serif italic font-normal">zero</span> false alarms
          </h2>
          <p className="text-sm sm:text-base text-muted-text mt-3">
            Precise safeguards and verifiable primitives protect your personal directives.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
          <PostageStamp
            color="emerald"
            number="01"
            tag="AES-256 GCM"
            title="Client-side keys"
            description="Documents are encrypted before leaving your browser. Unassembled raw plaintext never touches backend storage."
            rotation={-1.5}
            icon={<KeyRound className="w-6 h-6" />}
          />

          <PostageStamp
            color="pink"
            number="02"
            tag="TIMED BUFFER"
            title="Grace period buffer"
            description="Missed deadlines trigger warnings. A multi-day secondary buffer prevents any accidental or premature release."
            rotation={1.2}
            icon={<Clock className="w-6 h-6" />}
          />

          <PostageStamp
            color="orange"
            number="03"
            tag="CHALLENGE-RESP"
            title="Identity handshakes"
            description="Contacts undergo pre-registration challenges. Directives are never dispatched to unverified or expired channels."
            rotation={-1.0}
            icon={<UserCheck className="w-6 h-6" />}
          />

          <PostageStamp
            color="sky"
            number="04"
            tag="SECURE LEDGER"
            title="Immutable audit log"
            description="Every status pulse, ping, and configuration change is sealed with verifiable cryptographic timestamps."
            rotation={1.8}
            icon={<FileText className="w-6 h-6" />}
          />

          <PostageStamp
            color="indigo"
            number="05"
            tag="EXPLICIT CONSENT"
            title="Granular consent"
            description="Items require explicit tagging for release. Draft notes and unlinked sensitive assets remain forever locked."
            rotation={-1.4}
            icon={<ShieldCheck className="w-6 h-6" />}
          />

          <PostageStamp
            color="amber"
            number="06"
            tag="LAB TEST HARNESS"
            title="Auditable demo drills"
            description="Compress interval timing into 2 minutes for laboratory grading, end-to-end drills, and live demonstrations."
            rotation={1.0}
            icon={<Sparkles className="w-6 h-6" />}
          />
        </div>
      </section>

      {/* ── 5. ACCORDION FAQ ("SMALL TALK") ───────────────────────── */}
      <section id="faq" className="max-w-4xl mx-auto px-6 lg:px-8">
        <div className="flex flex-col md:flex-row items-baseline justify-between gap-4 mb-8">
          <div>
            <span className="text-xs font-mono uppercase tracking-widest text-accent font-medium">
              Questions & Answers
            </span>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-navy mt-1">
              Small <span className="font-serif italic font-normal">talk</span> about the switch
            </h2>
          </div>
          <p className="text-xs text-muted-text">
            Short, plain-language answers to essential security questions.
          </p>
        </div>

        <Accordion items={faqItems} />
      </section>

      {/* ── 6. FINAL CALL TO ACTION ──────────────────────────────── */}
      <section className="max-w-4xl mx-auto px-6 lg:px-8 text-center">
        <div className="bg-surface border border-border rounded-[32px] p-8 sm:p-14 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-accent-soft/30 rounded-full blur-2xl pointer-events-none" />
          <LastWordMark size={32} className="mx-auto text-accent mb-4" />
          <h2 className="text-2xl sm:text-4xl font-bold text-navy tracking-tight">
            Leave nothing to <span className="font-serif italic font-normal">guesswork</span>.
          </h2>
          <p className="text-sm sm:text-base text-muted-text mt-3 max-w-lg mx-auto leading-relaxed">
            Create your personal vault today. Test the fail-safe flow in Demo Mode or configure your real multi-month heartbeat schedule.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <PillButton to="/register" size="lg">
              Create your vault
            </PillButton>
            <PillButton to="/app" size="lg" variant="secondary" showArrow={false}>
              Open Console UI
            </PillButton>
          </div>
        </div>
      </section>
    </div>
  );
};
