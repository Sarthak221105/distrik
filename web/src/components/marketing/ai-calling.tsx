import { Bot, Check, CheckCheck, FileText, MessageCircle, Phone, PhoneCall, ShieldCheck, Sparkles, UserCheck } from "lucide-react";
import { Container } from "./section-heading";
import { Reveal } from "./reveal";

export function AiCallingSection() {
  return (
    <section id="multichannel" aria-labelledby="multichannel-title" className="scroll-mt-20 py-20 sm:py-28 lg:py-36">
      <Container>
        <Reveal>
          <div className="mx-auto max-w-6xl 2xl:max-w-7xl text-center">
            <span className="inline-flex items-center gap-2.5 rounded-full border border-border bg-surface px-5 py-2 text-xs sm:text-base font-semibold text-foreground shadow-2xs transition-all duration-300 hover:border-accent/40">
              <span className="size-2.5 rounded-full bg-accent animate-pulse-dot" />
              Multichannel Automation
            </span>
            <h2 id="multichannel-title" className="mt-6 text-[38px] sm:text-[58px] md:text-[72px] lg:text-[84px] xl:text-[94px] font-bold tracking-tight text-foreground leading-[1.03] text-balance">
              From First Contact{" "}
              <span className="font-editorial-serif italic font-normal text-accent block sm:inline">
                to Final Order.
              </span>
            </h2>
            <p className="mt-8 text-xl text-muted-foreground sm:text-2xl lg:text-[28px] leading-relaxed text-pretty max-w-5xl mx-auto">
              Find potential dealers, reach out through WhatsApp and AI-powered calls, qualify their interest, handle
              routine sales conversations, and move promising prospects toward an order.
            </p>
          </div>
        </Reveal>

        <div className="mt-16 sm:mt-24 grid items-center gap-10 lg:grid-cols-12 lg:gap-14">
          {/* 3 Capabilities Column */}
          <div className="space-y-6 lg:col-span-6">
            <Reveal delay={60}>
              <div className="card-hover-effect group rounded-3xl border border-border/80 bg-surface p-8 sm:p-9 shadow-xs hover:border-accent/50 hover:shadow-xl transition-all duration-300">
                <div className="flex items-start gap-4 sm:gap-6">
                  <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-accent-soft text-accent shadow-2xs transition-all duration-300 group-hover:scale-110 group-hover:bg-accent group-hover:text-white">
                    <PhoneCall className="size-7" aria-hidden />
                  </div>
                  <div>
                    <h3 className="text-2xl sm:text-[26px] font-bold text-foreground tracking-tight">AI Voice Calling</h3>
                    <p className="mt-3 text-base sm:text-lg leading-relaxed text-muted-foreground">
                      Contact prospective distributors, introduce your product lines, assess store capacity,
                      and qualify distributor interest before WhatsApp follow-ups.
                    </p>
                  </div>
                </div>
              </div>
            </Reveal>

            <Reveal delay={120}>
              <div className="card-hover-effect group rounded-3xl border border-border/80 bg-surface p-8 sm:p-9 shadow-xs hover:border-accent/50 hover:shadow-xl transition-all duration-300">
                <div className="flex items-start gap-4 sm:gap-6">
                  <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-surface-muted text-foreground shadow-2xs transition-all duration-300 group-hover:scale-110 group-hover:bg-primary group-hover:text-primary-foreground">
                    <MessageCircle className="size-7" aria-hidden />
                  </div>
                  <div>
                    <h3 className="text-2xl sm:text-[26px] font-bold text-foreground tracking-tight">WhatsApp Conversations</h3>
                    <p className="mt-3 text-base sm:text-lg leading-relaxed text-muted-foreground">
                      Answer dealer questions, share PDF catalogues, discuss tiered pricing in English, Hindi, or Hinglish,
                      and handle consistent follow-ups within WhatsApp guidelines.
                    </p>
                  </div>
                </div>
              </div>
            </Reveal>

            <Reveal delay={180}>
              <div className="card-hover-effect group rounded-3xl border border-border/80 bg-surface p-8 sm:p-9 shadow-xs hover:border-accent/50 hover:shadow-xl transition-all duration-300">
                <div className="flex items-start gap-4 sm:gap-6">
                  <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-accent-soft text-accent shadow-2xs transition-all duration-300 group-hover:scale-110 group-hover:bg-accent group-hover:text-white">
                    <FileText className="size-7" aria-hidden />
                  </div>
                  <div>
                    <h3 className="text-2xl sm:text-[26px] font-bold text-foreground tracking-tight">Order Conversion</h3>
                    <p className="mt-3 text-base sm:text-lg leading-relaxed text-muted-foreground">
                      Instantly generate GST-compliant quotations, collect purchase orders, and route margin discount
                      requests or custom exceptions directly to your human sales head.
                    </p>
                  </div>
                </div>
              </div>
            </Reveal>
          </div>

          {/* Compact Combined Visual Mockup with Live Equalizer Animation */}
          <div className="lg:col-span-6">
            <Reveal delay={100}>
              <div
                role="img"
                aria-label="Illustration of Distrik voice call qualification and WhatsApp conversation interface"
                className="overflow-hidden rounded-3xl border border-border/80 bg-surface shadow-xl transition-all duration-300 hover:shadow-2xl"
              >
                {/* Voice Call Active Banner with animated sound wave bars */}
                <div className="flex items-center justify-between border-b border-border/80 bg-surface-muted/40 px-6 py-4.5">
                  <div className="flex items-center gap-3.5">
                    {/* Animated sound wave bars */}
                    <div className="flex items-center gap-1 h-6">
                      <span className="sound-bar" style={{ animationDelay: "0ms" }} />
                      <span className="sound-bar" style={{ animationDelay: "220ms" }} />
                      <span className="sound-bar" style={{ animationDelay: "440ms" }} />
                      <span className="sound-bar" style={{ animationDelay: "150ms" }} />
                      <span className="sound-bar" style={{ animationDelay: "320ms" }} />
                      <span className="sound-bar" style={{ animationDelay: "100ms" }} />
                      <span className="sound-bar" style={{ animationDelay: "280ms" }} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-foreground">AI Voice Call Active</span>
                        <span className="rounded-full bg-accent-soft px-2.5 py-0.5 text-[10px] font-semibold text-accent">
                          Live Qualification
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">Shree Balaji Traders (Bhopal) · FMCG Stockist</p>
                    </div>
                  </div>
                  <PhoneCall className="size-5 text-accent animate-pulse" aria-hidden />
                </div>

                {/* WhatsApp Chat Thread */}
                <div className="space-y-3.5 bg-[#FAF8F5] p-6 text-[13px] leading-snug sm:text-sm">
                  {/* AI WhatsApp Message */}
                  <div className="flex justify-start">
                    <div className="max-w-[85%] rounded-3xl rounded-tl-xs bg-surface p-4 shadow-2xs border border-border/70">
                      <p className="font-semibold text-xs text-accent mb-1.5 flex items-center gap-1">
                        <Bot className="size-3.5" /> Distrik AI Agent
                      </p>
                      <p className="text-foreground">
                        Namaste Ramesh ji! As discussed on our call, here is the product catalogue for premium packaged snacks.
                        MOQ for Bhopal territory is 50 cases.
                      </p>
                      <div className="mt-3 flex items-center gap-2.5 rounded-xl bg-surface-muted/60 p-2.5 text-xs">
                        <FileText className="size-4 text-accent" />
                        <span className="font-medium text-foreground">Catalogue_Q3_Bhopal.pdf</span>
                        <span className="ml-auto text-[10px] text-muted-foreground">2.4 MB</span>
                      </div>
                      <span className="mt-1.5 block text-right text-[10px] text-muted-foreground">10:32 AM</span>
                    </div>
                  </div>

                  {/* Dealer Response */}
                  <div className="flex justify-end">
                    <div className="max-w-[85%] rounded-3xl rounded-tr-xs bg-primary text-primary-foreground p-4 shadow-2xs">
                      <p>Hum 75 cases lene ko tayyar hain. Agar 75 cases lein toh per jar rate kya padega?</p>
                      <span className="mt-1.5 flex items-center justify-end gap-1 text-[10px] text-primary-foreground/70">
                        10:35 AM <CheckCheck className="size-3" />
                      </span>
                    </div>
                  </div>

                  {/* AI Response with Rule-Guarded Quotation */}
                  <div className="flex justify-start">
                    <div className="max-w-[85%] rounded-3xl rounded-tl-xs bg-surface p-4 shadow-2xs border border-border/70">
                      <p className="text-foreground">
                        75 cases ke liye aapko ₹558 per jar + 12% GST offer kar sakte hain (approved tier price).
                        Main quotation PDF bhej raha hoon.
                      </p>
                      <div className="mt-3 flex items-center justify-between rounded-xl border border-accent/20 bg-accent-soft/40 px-3.5 py-2 text-xs">
                        <span className="font-medium text-accent">GST Quotation #QT-8421</span>
                        <span className="rounded-full bg-accent px-2.5 py-0.5 text-[10px] font-semibold text-white">
                          Verified by Price Rules
                        </span>
                      </div>
                      <span className="mt-1.5 block text-right text-[10px] text-muted-foreground">10:36 AM</span>
                    </div>
                  </div>
                </div>

                {/* Footer status bar */}
                <div className="flex items-center justify-between border-t border-border/70 bg-surface px-5 py-3 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
                    <ShieldCheck className="size-4 text-accent" /> Guardrail verified: Price strictly above floor
                  </span>
                  <span className="text-[11px]">Human handoff ready</span>
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </Container>
    </section>
  );
}
