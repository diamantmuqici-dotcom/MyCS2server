import { useEffect, useState } from 'react';
import { RULES, RULES_UPDATED_AT, RULES_VERSION } from '@dardania/shared';
import { formatDate } from '../lib/format.js';
import { Icon } from '../components/Icon.js';

type Language = 'en' | 'sq';

export function Rules() {
  const [language, setLanguage] = useState<Language>('en');
  useEffect(() => {
    const stored = window.localStorage.getItem('de-rules-language');
    if (stored === 'en' || stored === 'sq') setLanguage(stored);
  }, []);
  const change = (next: Language) => {
    setLanguage(next);
    window.localStorage.setItem('de-rules-language', next);
  };

  return (
    <section className="section">
      <div className="container stack-lg">
        <div className="row-between" style={{ alignItems: 'flex-end' }}>
          <div className="section-head" style={{ marginBottom: 0 }}>
            <span className="eyebrow">Rulebook · v{RULES_VERSION}</span>
            <h1 className="h1" style={{ fontSize: 'clamp(2rem, 4vw, 2.9rem)' }}>
              Community rules
            </h1>
            <p className="lead">
              The same text is published in Discord by the bot. Last reviewed{' '}
              {formatDate(RULES_UPDATED_AT)}. Where the two languages differ, the English text is the
              reference.
            </p>
          </div>
          <div className="rule-lang" role="group" aria-label="Rule language">
            <button
              type="button"
              className={language === 'en' ? 'active' : undefined}
              onClick={() => change('en')}
              aria-pressed={language === 'en'}
            >
              English
            </button>
            <button
              type="button"
              className={language === 'sq' ? 'active' : undefined}
              onClick={() => change('sq')}
              aria-pressed={language === 'sq'}
            >
              Shqip
            </button>
          </div>
        </div>

        <div className="callout">
          <Icon name="info" size={15} /> Every punishment carries a case reference. If you believe a
          decision is wrong, open an appeal with that reference — staff cannot review a case without it.
        </div>

        <div className="grid grid-2">
          {RULES.map((section, index) => (
            <article
              className="card rule-card"
              key={section.id}
              id={section.id}
              aria-labelledby={`rule-${section.id}`}
            >
              <h2 className="h3" id={`rule-${section.id}`}>
                <span className="rule-index">{String(index + 1).padStart(2, '0')}</span>
                {section.title[language]}
              </h2>
              <ul className="prose" style={{ marginTop: '0.7rem' }}>
                {section.items.map((item, itemIndex) => (
                  <li key={itemIndex}>{item[language]}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>

        <div className="card">
          <h2 className="h3" style={{ marginBottom: '0.6rem' }}>
            Enforcement and appeals
          </h2>
          <div className="prose">
            <p>
              Punishments are issued through the Discord moderation bot and recorded as cases with a
              reference such as <span className="mono">DE-000123</span>. Each record preserves the
              Discord username, display name and Steam name observed at the time of the action.
            </p>
            <p>
              Unbanning a member lifts the restriction but never deletes the original record. The case
              remains in the history with the unban linked to it, so the timeline stays accurate.
            </p>
            <p>
              Dashboard access is limited to an explicit allowlist of Owner and Co-Owner Discord user
              IDs. Discord roles alone never grant access to moderation history.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
