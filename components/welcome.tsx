import type { ReactNode } from "react";
import {
  ArrowRight,
  Heart,
  Droplets,
  Clock3,
  Users,
  WifiOff,
  ShieldCheck,
  Check,
  Leaf,
  Sparkles,
  BarChart3,
} from "lucide-react";

export function Welcome({ children }: { children: ReactNode }) {
  return (
    <div className="nest-site" id="top">
      <a href="#account" className="skip-link">
        Skip to sign in
      </a>
      <header className="site-header">
        <a href="#top" className="site-brand">
          <img src="/brand/nest-mark.png" width="38" height="38" alt="" />
          <span>Nest Little Baby</span>
        </a>
        <nav aria-label="About the app">
          <a href="#features">The little details</a>
          <a href="#together">For your family</a>
          <a href="#questions">Questions</a>
        </nav>
        <a className="site-button site-button-dark" href="#account">
          Open your nest <ArrowRight size={16} />
        </a>
      </header>
      <main>
        <section className="site-hero" aria-labelledby="welcome-title">
          <div className="site-hero-copy">
            <span className="site-badge">
              <span /> A calmer way to keep track
            </span>
            <h1 id="welcome-title">
              Little moments.
              <br />
              <em>Beautifully kept.</em>
            </h1>
            <p>
              Feeds, diaper changes, and the day you share. A gentle place to
              remember the details, so you can be here for the moments.
            </p>
            <div className="site-actions">
              <a href="#account" className="site-button site-button-dark">
                Start your little nest <ArrowRight size={18} />
              </a>
              <a href="#features" className="site-button site-button-outline">
                Take a little look <ArrowRight size={17} />
              </a>
            </div>
            <ul className="site-benefits">
              <li>
                <Heart size={17} /> Made for busy hands
              </li>
              <li>
                <WifiOff size={17} /> Keep logging offline
              </li>
              <li>
                <Users size={17} /> Share with your circle
              </li>
            </ul>
          </div>
          <div className="site-hero-visual">
            <div className="floating-note">
              <span>
                <Check size={18} />
              </span>
              <div>
                A little less to remember.
                <small>A little more room to breathe.</small>
              </div>
            </div>
            <div
              className="preview-phone"
              role="img"
              aria-label="Illustrated preview of the feeding timer and daily care summary. Example only."
            >
              <div className="phone-island" />
              <div className="phone-status">
                <span>9:41</span>
                <span>••• ▰</span>
              </div>
              <div className="phone-greeting">
                <div>
                  <small>A little overview</small>
                  <strong>Your baby’s day</strong>
                </div>
                <span className="phone-baby">
                  <Leaf size={22} />
                </span>
              </div>
              <div className="phone-summary">
                <div>
                  <Heart size={16} />
                  <strong>Feeds</strong>
                  <small>All the little moments</small>
                </div>
                <Sparkles size={20} />
              </div>
              <div className="phone-sheet">
                <span className="sheet-handle" />
                <p className="phone-sheet-title">
                  <Heart size={16} /> Nursing
                </p>
                <div className="preview-sides">
                  <span className="chosen">
                    ◉<small>Left</small>
                  </span>
                  <span>
                    ◎<small>Right</small>
                  </span>
                </div>
                <p className="preview-time">
                  00:00<small>Take your time. We’re here.</small>
                </p>
                <div className="preview-note">
                  <Clock3 size={15} />
                  <span>Time kept for you</span>
                  <Check size={15} />
                </div>
                <div className="preview-start">
                  <Heart size={15} /> Ready when you are
                </div>
              </div>
              <div className="phone-bottom">
                <span />
                <span />
                <span />
              </div>
            </div>
            <div className="preview-caption">
              A peek inside your little nest
            </div>
          </div>
        </section>
        <section
          id="features"
          className="site-section"
          aria-labelledby="features-title"
        >
          <div className="site-section-heading">
            <p className="site-kicker">THE LITTLE DETAILS</p>
            <h2 id="features-title">
              Less keeping track.
              <br />
              <em>More being together.</em>
            </h2>
            <p>
              Simple tools for the things you do every day. Clear, comfortable,
              and right where you need them.
            </p>
          </div>
          <div className="site-feature-grid">
            {[
              {
                icon: Heart,
                title: "Settle into a feed.",
                text: "Start a timer, switch sides, and pause when you need to. We’ll keep the time while you keep them close.",
                color: "lavender",
              },
              {
                icon: Droplets,
                title: "One tap. All noted.",
                text: "Log a diaper change in a moment. Add the little details later, when you have a hand free.",
                color: "peach",
              },
              {
                icon: BarChart3,
                title: "See your day gently.",
                text: "A clear care history and simple daily totals help you find your own rhythm, without another spreadsheet.",
                color: "sage",
              },
            ].map(({ icon: Icon, title, text, color }) => (
              <article key={title} className={`site-feature ${color}`}>
                <span className="site-feature-icon">
                  <Icon size={25} />
                </span>
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
        </section>
        <section
          id="together"
          className="site-family"
          aria-labelledby="together-title"
        >
          <div>
            <p className="site-kicker">YOUR CIRCLE OF CARE</p>
            <h2 id="together-title">
              One little baby.
              <br />
              <em>A whole lot of love.</em>
            </h2>
            <p>
              Invite a partner or caregiver to share the same care history.
              Everyone uses their own account, and everyone can pick up where
              the last person left off.
            </p>
            <a href="#account" className="site-text-link">
              Make room for your family <ArrowRight size={18} />
            </a>
          </div>
          <div className="family-illustration">
            <div className="family-orbit">
              <span>
                <Users size={29} />
                <small>Your circle</small>
              </span>
              <span className="family-center">
                <img src="/brand/nest-mark.png" width="95" height="95" alt="" />
                <small>Your little one</small>
              </span>
              <span>
                <Heart size={28} />
                <small>You</small>
              </span>
            </div>
            <div className="family-example">
              <span>ONE SHARED DAY</span>
              <p>
                <span className="example-dot purple" />A feed, remembered.
                <Heart size={16} />
              </p>
              <p>
                <span className="example-dot peach" />A change, taken care of.
                <Droplets size={16} />
              </p>
              <small>An example of the moments you can keep together.</small>
            </div>
          </div>
        </section>
        <section
          id="account"
          className="site-account-section"
          aria-labelledby="start-title"
        >
          <div className="site-account-copy">
            <p className="site-kicker">COME ON IN</p>
            <h2 id="start-title">
              Your little nest
              <br />
              <em>starts here.</em>
            </h2>
            <p>
              Sign in, add your baby, and make a little space for the day.
              Already part of a family? Your saved baby will be waiting for you.
            </p>
            <span className="site-account-reassurance">
              <ShieldCheck size={19} /> Your family’s care, in your hands.
            </span>
          </div>
          <div className="welcome-account">{children}</div>
        </section>
        <section
          id="questions"
          className="site-faq"
          aria-labelledby="questions-title"
        >
          <p className="site-kicker">A FEW LITTLE ANSWERS</p>
          <h2 id="questions-title">
            Wondering about <em>something?</em>
          </h2>
          {[
            [
              "Do I need an account?",
              "Yes. Your account keeps your family’s tracker separate from other accounts on the same device and lets you open your saved baby on another device.",
            ],
            [
              "Can I keep logging when I’m offline?",
              "After signing in and opening the app online, you can keep recording care on that device without a connection. Saved entries sync when the app is open and you’re connected again.",
            ],
            [
              "Can another parent or caregiver help?",
              "Yes. Invite them from Settings. They sign in with their own account and accept your invitation to share your baby’s saved care history.",
            ],
          ].map(([q, a]) => (
            <details key={q}>
              <summary>
                {q}
                <span>+</span>
              </summary>
              <p>{a}</p>
            </details>
          ))}
        </section>
      </main>
      <footer className="site-footer">
        <a href="#top" className="site-brand">
          <img src="/brand/nest-mark.png" width="32" height="32" alt="" />
          <span>Nest Little Baby</span>
        </a>
        <p>A little care, beautifully kept.</p>
        <a href="#account">
          Open your nest <ArrowRight size={15} />
        </a>
      </footer>
    </div>
  );
}
